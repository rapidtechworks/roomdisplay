import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { CachedEvent, Theme } from '@roomdisplay/shared';
import { useRoomSocket } from './hooks/useRoomSocket.ts';
import { useClock } from './hooks/useClock.ts';
import { StatusPanel } from './components/StatusPanel.tsx';
import { AgendaPanel } from './components/AgendaPanel.tsx';
import { BookingSheet } from './components/BookingSheet.tsx';
import { Screensaver } from './components/Screensaver.tsx';
import { useCameraMotion } from './hooks/useCameraMotion.ts';

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
  const [showBooking,     setShowBooking]     = useState(false);
  const [shortId,         setShortId]         = useState<string | null>(null);
  const [showScreensaver, setShowScreensaver] = useState(false);

  // ── Screensaver: stable refs so timer callbacks don't capture stale closures ─
  const idleTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const derivedRef    = useRef<DerivedState | null>(null);
  const themeRef      = useRef<Theme | null>(null);

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

  // Keep refs current on every render (safe — refs don't trigger re-renders)
  derivedRef.current = derived;
  themeRef.current   = state?.theme ?? null;

  // ── Screensaver idle timer ──────────────────────────────────────────────────

  const scheduleScreensaver = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    const theme = themeRef.current;
    if (!theme?.screensaverEnabled) return;

    idleTimerRef.current = setTimeout(() => {
      // Only activate when the room is available — never during a live meeting
      if (derivedRef.current?.status === 'available') {
        setShowScreensaver(true);
      }
    }, theme.screensaverIdleMinutes * 60_000);
  }, []); // stable — reads from refs internally

  const wakeUp = useCallback(() => {
    setShowScreensaver(false);
    scheduleScreensaver(); // restart the idle clock after waking
  }, [scheduleScreensaver]);

  // Listen for any user interaction to reset the idle timer
  useEffect(() => {
    function onInteraction() {
      setShowScreensaver(false);
      scheduleScreensaver();
    }
    const events = ['touchstart', 'mousedown', 'keydown'] as const;
    events.forEach((e) => window.addEventListener(e, onInteraction, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, onInteraction));
  }, [scheduleScreensaver]);

  // (Re)start the idle timer when status or screensaver settings change
  useEffect(() => {
    if (!state?.theme.screensaverEnabled) {
      setShowScreensaver(false);
      return;
    }
    scheduleScreensaver();
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [derived?.status, state?.theme.screensaverEnabled, state?.theme.screensaverIdleMinutes, scheduleScreensaver]);

  // Auto-dismiss if a meeting starts while screensaver is showing
  useEffect(() => {
    if (derived?.status !== 'available') setShowScreensaver(false);
  }, [derived?.status]);

  // Camera motion detection — only active while screensaver is visible
  useCameraMotion({
    enabled: (state?.theme.screensaverUseCameraMotion ?? false) && showScreensaver,
    onMotion: wakeUp,
  });

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

  // ── Scrim overlay ────────────────────────────────────────────────────────────
  // Convert hex scrimColor + scrimOpacity into a CSS rgba background.
  // Falls back gracefully if the stored colour isn't a plain hex.
  function hexToRgb(hex: string): string {
    const clean = hex.replace('#', '');
    const full  = clean.length === 3
      ? clean.split('').map((c) => c + c).join('')
      : clean;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return isNaN(r) ? '0,0,0' : `${r},${g},${b}`;
  }
  const scrimCss = `rgba(${hexToRgb(theme.scrimColor)},${theme.scrimOpacity})`;

  // ── Logo ─────────────────────────────────────────────────────────────────────
  const logoSrc = theme.logoImageUrl ?? theme.logoImagePath ?? null;
  const CORNER_CLASSES: Record<string, string> = {
    'top-left':     'top-0 left-0 p-6',
    'top-right':    'top-0 right-0 p-6',
    'bottom-left':  'bottom-0 left-0 p-6',
    'bottom-right': 'bottom-0 right-0 p-6',
  };
  const cornerClass = theme.logoPosition !== 'none' && theme.logoPosition !== 'beside-book-now'
    ? CORNER_CLASSES[theme.logoPosition]
    : null;

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

      {/* Scrim overlay */}
      <div className="absolute inset-0 -z-10" style={{ backgroundColor: scrimCss }} />

      {/* Corner logo */}
      {logoSrc && cornerClass && (
        <div className={`absolute z-30 ${cornerClass}`}>
          <img
            src={logoSrc}
            alt="Logo"
            style={{ maxHeight: theme.logoMaxHeight, objectFit: 'contain' }}
          />
        </div>
      )}

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
              logo={theme.logoPosition === 'beside-book-now' && logoSrc
                ? { src: logoSrc, maxHeight: theme.logoMaxHeight }
                : null}
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

      {/* Screensaver — above everything else */}
      <AnimatePresence>
        {showScreensaver && (
          <Screensaver
            key="screensaver"
            roomName={state.roomName}
            now={now}
            timeZone={state.timeZone}
            theme={theme}
            onWake={wakeUp}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
