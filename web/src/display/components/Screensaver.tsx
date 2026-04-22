/**
 * Screensaver — burn-in protection overlay.
 *
 * The room name and clock drift continuously across the screen using a
 * Lissajous-figure path (two sine waves at irrational frequency ratios).
 * This ensures the content never traces the same pixel path twice within a
 * practical time window, which is the requirement for burn-in prevention.
 *
 * Touch / click anywhere (or camera motion, handled in the parent) dismisses
 * the screensaver by calling `onWake`.
 */
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { Theme } from '@roomdisplay/shared';

interface Props {
  roomName: string;
  now:      Date;
  timeZone: string;
  theme:    Theme;
  onWake:   () => void;
}

function fmtClock(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour:   'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function Screensaver({ roomName, now, timeZone, theme, onWake }: Props) {
  // ── Drifting position (percentage of viewport) ────────────────────────────
  // x = 50 + 35·sin(t · 0.050)   → range 15 % – 85 %   period ≈ 125 s
  // y = 50 + 30·cos(t · 0.037)   → range 20 % – 80 %   period ≈ 170 s
  // The two frequencies are irrational multiples so the path never repeats.
  const [pos, setPos] = useState({ x: 50, y: 50 });

  useEffect(() => {
    const origin = Date.now();

    const id = setInterval(() => {
      const t = (Date.now() - origin) / 1000;
      setPos({
        x: 50 + 35 * Math.sin(t * 0.05),
        y: 50 + 30 * Math.cos(t * 0.037),
      });
    }, 100); // 10 fps is plenty for slow drift

    return () => clearInterval(id);
  }, []);

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
          left:      `${pos.x}%`,
          top:       `${pos.y}%`,
          transform: 'translate(-50%, -50%)',
          // Smooth the 100 ms jumps so movement looks continuous
          transition: 'left 0.12s linear, top 0.12s linear',
        }}
      >
        <p
          style={{
            fontFamily: theme.roomNameFontFamily,
            fontSize:   'clamp(40px, 7vw, 88px)',
            fontWeight: theme.roomNameFontWeight,
            color:      theme.screensaverTextColor,
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
          }}
        >
          {roomName}
        </p>

        <p
          style={{
            fontFamily: theme.clockFontFamily,
            fontSize:   'clamp(18px, 2.5vw, 36px)',
            fontWeight: 300,
            color:      theme.screensaverTextColor,
            opacity:    0.65,
            marginTop:  '0.4em',
          }}
        >
          {fmtClock(now, timeZone)}
        </p>
      </div>

      {/* Tap-to-wake hint — fixed at bottom so it drifts less noticeably */}
      <p
        className="absolute inset-x-0 bottom-8 select-none text-center text-sm tracking-widest uppercase"
        style={{ color: theme.screensaverTextColor, opacity: 0.25 }}
      >
        Touch to wake
      </p>
    </motion.div>
  );
}
