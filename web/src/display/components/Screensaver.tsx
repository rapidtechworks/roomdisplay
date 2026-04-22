/**
 * Screensaver — burn-in protection overlay.
 *
 * Displays the room name, current status, and clock drifting on a Lissajous
 * path (two sine waves at irrational frequency ratios) so no pixel is ever
 * held static for long.
 *
 * Runs during any room status — shows "Available", "In Use", or "Ending Soon"
 * so a glance at the screen is always informative even while the screensaver
 * is active.
 */
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { CachedEvent, Theme } from '@roomdisplay/shared';
import type { RoomStatus } from '../RoomDisplay.tsx';

interface Props {
  roomName:     string;
  now:          Date;
  timeZone:     string;
  theme:        Theme;
  status:       RoomStatus;
  currentEvent: CachedEvent | null;
  onWake:       () => void;
}

function fmtClock(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour:   'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

function statusLabel(status: RoomStatus): string {
  if (status === 'available')   return 'Available';
  if (status === 'occupied')    return 'In Use';
  return 'Ending Soon';
}

function statusColor(status: RoomStatus, theme: Theme): string {
  if (status === 'available')   return theme.accentColorAvailable;
  if (status === 'occupied')    return theme.accentColorBusy;
  return theme.accentColorEndingSoon;
}

export function Screensaver({ roomName, now, timeZone, theme, status, currentEvent, onWake }: Props) {
  // ── Lissajous drift ───────────────────────────────────────────────────────
  // x = 50 + 35·sin(t · 0.050)   → range 15 %–85 %   period ≈ 125 s
  // y = 50 + 30·cos(t · 0.037)   → range 20 %–80 %   period ≈ 170 s
  // Irrational ratio ensures the path never repeats within a practical window.
  const [pos, setPos] = useState({ x: 50, y: 50 });

  useEffect(() => {
    const origin = Date.now();
    const id = setInterval(() => {
      const t = (Date.now() - origin) / 1000;
      setPos({
        x: 50 + 35 * Math.sin(t * 0.05),
        y: 50 + 30 * Math.cos(t * 0.037),
      });
    }, 100);
    return () => clearInterval(id);
  }, []);

  const color = statusColor(status, theme);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.5, ease: 'easeInOut' }}
      className="fixed inset-0"
      style={{ zIndex: 60, background: 'rgba(0, 0, 0, 0.93)', cursor: 'none' }}
      onClick={onWake}
    >
      {/* Drifting content block */}
      <div
        className="pointer-events-none absolute select-none text-center"
        style={{
          left:       `${pos.x}%`,
          top:        `${pos.y}%`,
          transform:  'translate(-50%, -50%)',
          transition: 'left 0.12s linear, top 0.12s linear',
        }}
      >
        {/* Room name */}
        <p
          style={{
            fontFamily: theme.roomNameFontFamily,
            fontSize:   'clamp(32px, 5vw, 72px)',
            fontWeight: theme.roomNameFontWeight,
            color:      theme.screensaverTextColor,
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
          }}
        >
          {roomName}
        </p>

        {/* Status word — uses actual accent colour at half opacity for burn-in safety */}
        <p
          style={{
            fontFamily: theme.roomNameFontFamily,
            fontSize:   'clamp(24px, 3.5vw, 52px)',
            fontWeight: theme.statusFontWeight,
            color,
            opacity:    0.55,
            lineHeight: 1.1,
            marginTop:  '0.25em',
            whiteSpace: 'nowrap',
          }}
        >
          {statusLabel(status)}
        </p>

        {/* Current event title (occupied / ending-soon only) */}
        {currentEvent && status !== 'available' && (
          <p
            style={{
              fontFamily: theme.eventFontFamily,
              fontSize:   'clamp(14px, 2vw, 28px)',
              fontWeight: 400,
              color:      theme.screensaverTextColor,
              opacity:    0.6,
              marginTop:  '0.3em',
              whiteSpace: 'nowrap',
            }}
          >
            {currentEvent.title}
          </p>
        )}

        {/* Clock */}
        <p
          style={{
            fontFamily: theme.clockFontFamily,
            fontSize:   'clamp(16px, 2vw, 30px)',
            fontWeight: 300,
            color:      theme.screensaverTextColor,
            opacity:    0.5,
            marginTop:  '0.5em',
          }}
        >
          {fmtClock(now, timeZone)}
        </p>
      </div>

      {/* Touch hint */}
      <p
        className="absolute inset-x-0 bottom-8 select-none text-center text-sm uppercase tracking-widest"
        style={{ color: theme.screensaverTextColor, opacity: 0.2 }}
      >
        Touch to wake
      </p>
    </motion.div>
  );
}
