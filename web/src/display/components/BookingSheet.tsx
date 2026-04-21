import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Theme } from '@roomdisplay/shared';

interface BookingSlot {
  minutes: number;
  endsAt:  string;
}

interface DurationsResponse {
  now:            string;
  availableSlots: BookingSlot[];
  nextEvent:      { title: string; startsAt: string } | null;
}

interface Props {
  visible:  boolean;
  slug:     string;
  timeZone: string;
  theme:    Theme;
  onClose:  () => void;
}

type Stage = 'loading' | 'picking' | 'none' | 'submitting' | 'success' | 'error';

function fmtDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}hr` : `${h}hr ${m}m`;
}

function fmtTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
}

export function BookingSheet({ visible, slug, timeZone, theme, onClose }: Props) {
  const [durations,  setDurations]  = useState<DurationsResponse | null>(null);
  const [stage,      setStage]      = useState<Stage>('loading');
  const [title,      setTitle]      = useState('');
  const [errorMsg,   setErrorMsg]   = useState('');
  const [fetchKey,   setFetchKey]   = useState(0);

  useEffect(() => {
    if (!visible) {
      // Reset after exit animation finishes
      const t = setTimeout(() => {
        setDurations(null); setStage('loading');
        setTitle('');       setErrorMsg('');
      }, 350);
      return () => clearTimeout(t);
    }

    setStage('loading');
    fetch(`/api/rooms/${slug}/available-durations`)
      .then((r) => r.json() as Promise<DurationsResponse>)
      .then((d) => {
        setDurations(d);
        setStage(d.availableSlots.length > 0 ? 'picking' : 'none');
      })
      .catch(() => { setStage('error'); setErrorMsg('Could not check availability.'); });
  }, [visible, slug, fetchKey]);

  const book = async (endsAt: string) => {
    setStage('submitting');
    try {
      const body: Record<string, unknown> = { endsAt };
      if (title.trim()) body['title'] = title.trim();

      const res = await fetch(`/api/rooms/${slug}/bookings`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json() as { message?: string };
        throw new Error(err.message ?? 'Booking failed');
      }
      setStage('success');
      setTimeout(onClose, 1_500);
    } catch (err) {
      setStage('error');
      setErrorMsg(err instanceof Error ? err.message : 'Booking failed. Please try again.');
    }
  };

  const panelStyle: React.CSSProperties = {
    background:           'rgba(10, 15, 30, 0.94)',
    backdropFilter:       `blur(${theme.glassPanelBlur}px)`,
    WebkitBackdropFilter: `blur(${theme.glassPanelBlur}px)`,
    borderColor:          theme.glassPanelBorderColor,
    boxShadow:            theme.glassPanelShadow,
  };

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop */}
          <motion.div
            key="bd"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            key="sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl border-t px-8 py-8"
            style={panelStyle}
          >
            <div className="mx-auto max-w-lg">
              {/* Header */}
              <div className="mb-6 flex items-center justify-between">
                <h2
                  style={{
                    color: theme.roomNameColor, fontFamily: theme.roomNameFontFamily,
                    fontSize: '28px', fontWeight: 600,
                  }}
                >
                  Book This Room
                </h2>
                <button
                  onClick={onClose}
                  style={{ color: theme.agendaMutedColor, fontSize: '24px', lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>

              {stage === 'loading' && (
                <p style={{ color: theme.agendaMutedColor, fontSize: '18px' }}>Checking availability…</p>
              )}

              {stage === 'none' && (
                <p style={{ color: theme.accentColorBusy, fontSize: '20px' }}>
                  Room is currently unavailable.
                  {durations?.nextEvent && (
                    <span style={{ color: theme.agendaMutedColor, fontSize: '16px', display: 'block', marginTop: '8px' }}>
                      Next event: {durations.nextEvent.title} at {fmtTime(durations.nextEvent.startsAt, timeZone)}
                    </span>
                  )}
                </p>
              )}

              {stage === 'picking' && durations && (
                <>
                  <div className="mb-6">
                    <label style={{ color: theme.agendaMutedColor, fontSize: '15px', display: 'block', marginBottom: '8px' }}>
                      Meeting name (optional)
                    </label>
                    <input
                      type="text"
                      placeholder="Walk-up Booking"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      maxLength={100}
                      style={{
                        width: '100%', borderRadius: '12px',
                        border: `1px solid ${theme.glassPanelBorderColor}`,
                        background: 'rgba(255,255,255,0.1)',
                        color: theme.roomNameColor, fontSize: '18px',
                        padding: '12px 16px', outline: 'none',
                      }}
                    />
                  </div>

                  <p style={{ color: theme.agendaMutedColor, fontSize: '15px', marginBottom: '12px' }}>
                    How long do you need?
                    {durations.nextEvent && ` (next event at ${fmtTime(durations.nextEvent.startsAt, timeZone)})`}
                  </p>

                  <div className="grid grid-cols-3 gap-3">
                    {durations.availableSlots.map((slot) => (
                      <button
                        key={slot.endsAt}
                        onClick={() => void book(slot.endsAt)}
                        style={{
                          borderRadius:    theme.buttonBorderRadius,
                          backgroundColor: theme.accentColorBookButton,
                          color:           theme.bookButtonTextColor,
                          fontFamily:      theme.roomNameFontFamily,
                          padding:         '16px 12px',
                          border:          'none', cursor: 'pointer',
                          display:         'flex', flexDirection: 'column',
                          alignItems:      'center', gap: '4px',
                        }}
                      >
                        <span style={{ fontSize: '22px', fontWeight: 600 }}>
                          {fmtDuration(slot.minutes)}
                        </span>
                        <span style={{ fontSize: '12px', fontWeight: 400, opacity: 0.7 }}>
                          ends {fmtTime(slot.endsAt, timeZone)}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {stage === 'submitting' && (
                <p style={{ color: theme.agendaEventColor, fontSize: '22px' }}>Booking room…</p>
              )}

              {stage === 'success' && (
                <p style={{ color: theme.accentColorAvailable, fontSize: '26px', fontWeight: 600 }}>
                  ✓ Room booked successfully!
                </p>
              )}

              {stage === 'error' && (
                <div>
                  <p style={{ color: theme.accentColorBusy, fontSize: '18px', marginBottom: '16px' }}>{errorMsg}</p>
                  <button
                    onClick={() => setFetchKey((k) => k + 1)}
                    style={{
                      backgroundColor: theme.accentColorBookButton, color: theme.bookButtonTextColor,
                      borderRadius: theme.buttonBorderRadius, padding: '12px 28px',
                      fontSize: '18px', border: 'none', cursor: 'pointer',
                    }}
                  >
                    Try Again
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
