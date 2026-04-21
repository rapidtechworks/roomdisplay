import { useState, useMemo, useEffect } from 'react';
import type { CachedEvent, Theme } from '@roomdisplay/shared';
import { useRoomSocket } from './hooks/useRoomSocket.ts';
import { useClock } from './hooks/useClock.ts';
import { StatusPanel } from './components/StatusPanel.tsx';
import { AgendaPanel } from './components/AgendaPanel.tsx';
import { BookingSheet } from './components/BookingSheet.tsx';

// ─── Status types ─────────────────────────────────────────────────────────────

export type RoomStatus = 'available' | 'occupied' | 'ending-soon';

export interface DerivedState {
  status:           RoomStatus;
  currentEvent:     CachedEvent | null;
  nextEvent:        CachedEvent | null;
  availableUntil:   string | null; // formatted time, today only
  minutesRemaining: number | null; // when ending-soon
}

// ─── State derivation ─────────────────────────────────────────────────────────

function deriveState(events: CachedEvent[], now: Date, timeZone: string): DerivedState {
  const nowMs = now.getTime();

  const currentEvent = events.find(
    (e) => new Date(e.startsAt).getTime() <= nowMs && new Date(e.endsAt).getTime() > nowMs,
  ) ?? null;

  const nextEvent = events.find((e) => new Date(e.startsAt).getTime() > nowMs) ?? null;

  let status: RoomStatus         = 'available';
  let minutesRemaining: number | null = null;

  if (currentEvent) {
    minutesRemaining = Math.ceil((new Date(currentEvent.endsAt).getTime() - nowMs) / 60_000);
    status = minutesRemaining <= 15 ? 'ending-soon' : 'occupied';
  }

  // "Available until X" — only if next event is today in the room's timezone
  let availableUntil: string | null = null;
  if (!currentEvent && nextEvent) {
    const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' });
    if (dateFmt.format(now) === dateFmt.format(new Date(nextEvent.startsAt))) {
      availableUntil = new Intl.DateTimeFormat('en-US', {
        timeZone, hour: 'numeric', minute: '2-digit', hour12: true,
      }).format(new Date(nextEvent.startsAt));
    }
  }

  return { status, currentEvent, nextEvent, availableUntil, minutesRemaining };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props { slug: string }

export function RoomDisplay({ slug }: Props) {
  const { state, connected } = useRoomSocket(slug);
  const now                  = useClock();
  const [showBooking, setShowBooking] = useState(false);
  const [shortId, setShortId] = useState<string | null>(null);

  // Read the tablet's UUID from localStorage and show the first 8 chars in the
  // corner so admins can identify which tablet is which without relying on IP.
  useEffect(() => {
    const uuid = localStorage.getItem('roomdisplay_tablet_uuid');
    if (uuid) setShortId(uuid.slice(0, 8));
  }, []);

  const derived = useMemo(
    () => state ? deriveState(state.events, now, state.timeZone) : null,
    [state, now],
  );

  // ── Loading / not-found screen ──────────────────────────────────────────────
  if (!state) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <div className="text-center">
          <p className="text-2xl text-white opacity-50">Connecting…</p>
          <p className="mt-2 text-sm text-gray-600 font-mono">{slug}</p>
        </div>
      </div>
    );
  }

  const { theme }: { theme: Theme } = state;

  return (
    <div className="relative h-screen w-screen overflow-hidden">

      {/* Solid colour base — always rendered, sits below everything */}
      <div
        className="absolute inset-0 -z-30"
        style={{ backgroundColor: theme.backgroundColor }}
      />

      {/* Background image — URL takes priority over server-stored path */}
      {(theme.backgroundImageUrl || theme.defaultBackgroundImagePath) && (
        <div
          className="absolute inset-0 -z-20 bg-cover bg-center"
          style={{
            backgroundImage: `url(${theme.backgroundImageUrl ?? theme.defaultBackgroundImagePath})`,
          }}
        />
      )}

      {/* Gradient overlay */}
      <div
        className="absolute inset-0 -z-10"
        style={{ background: theme.backgroundOverlayGradient }}
      />

      {/* Tablet ID badge — bottom-right corner, for admin identification */}
      {shortId && (
        <div className="absolute bottom-2 right-3 z-40 font-mono text-[10px] text-white/20 select-none">
          {shortId}
        </div>
      )}

      {/* Offline banner */}
      {!connected && (
        <div
          className="absolute inset-x-0 top-0 z-50 py-1.5 text-center text-sm font-medium"
          style={{
            background: theme.offlineBannerBackground,
            color:      theme.offlineBannerTextColor,
          }}
        >
          Reconnecting… displaying last known state
        </div>
      )}

      {/* Main layout */}
      <div className={`flex h-full gap-6 p-8 ${!connected ? 'pt-10' : ''}`}>

        {/* Status panel — left */}
        <div className="flex min-w-0 flex-1">
          {derived && (
            <StatusPanel
              roomName={state.roomName}
              timeZone={state.timeZone}
              now={now}
              status={derived.status}
              currentEvent={derived.currentEvent}
              availableUntil={derived.availableUntil}
              minutesRemaining={derived.minutesRemaining}
              theme={theme}
              onBook={() => setShowBooking(true)}
            />
          )}
        </div>

        {/* Agenda panel — right */}
        <AgendaPanel
          events={state.events}
          timeZone={state.timeZone}
          now={now}
          theme={theme}
        />
      </div>

      {/* Walk-up booking sheet */}
      <BookingSheet
        visible={showBooking}
        slug={slug}
        timeZone={state.timeZone}
        theme={theme}
        onClose={() => setShowBooking(false)}
      />
    </div>
  );
}
