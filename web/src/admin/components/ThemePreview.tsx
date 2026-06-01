/**
 * ThemePreview — static 1280×720 mock of the tablet display.
 * Rendered at full size and scaled by the parent via CSS transform.
 * All values come from the live theme draft so changes are instant.
 */
import type { Theme } from '@roomdisplay/shared';

// ─── Static fake data ─────────────────────────────────────────────────────────

const NOW   = new Date();
const add   = (h: number) => new Date(NOW.getTime() + h * 3_600_000);
const fmtT  = (d: Date)   => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(d);

const CLOCK            = fmtT(NOW);
const AVAILABLE_UNTIL  = fmtT(add(1));

const FAKE_EVENTS = [
  { title: 'Staff Meeting', time: `${fmtT(add(1))} – ${fmtT(add(2))}`,     day: 'Today'    },
  { title: 'Budget Review', time: `${fmtT(add(3))} – ${fmtT(add(4.5))}`,   day: 'Today'    },
  { title: 'All Hands',     time: `${fmtT(add(26))} – ${fmtT(add(27.5))}`, day: 'Tomorrow' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

export function ThemePreview({ theme }: { theme: Theme }) {
  const bgImage  = theme.backgroundImageUrl || theme.defaultBackgroundImagePath || null;
  const scrimCss = `rgba(${hexToRgb(theme.scrimColor)},${theme.scrimOpacity})`;
  const logoSrc  = theme.logoImageUrl ?? theme.logoImagePath ?? null;

  const CORNER_STYLE: Record<string, React.CSSProperties> = {
    'top-left':     { position: 'absolute', top: 0,    left: 0,  padding: 24, zIndex: 30 },
    'top-right':    { position: 'absolute', top: 0,    right: 0, padding: 24, zIndex: 30 },
    'bottom-left':  { position: 'absolute', bottom: 0, left: 0,  padding: 24, zIndex: 30 },
    'bottom-right': { position: 'absolute', bottom: 0, right: 0, padding: 24, zIndex: 30 },
  };
  const cornerStyle = logoSrc && theme.logoPosition !== 'none' && theme.logoPosition !== 'beside-book-now'
    ? CORNER_STYLE[theme.logoPosition] ?? null
    : null;

  return (
    <div style={{ width: 1280, height: 720, position: 'relative', overflow: 'hidden', backgroundColor: theme.backgroundColor }}>

      {/* Background image */}
      {bgImage && (
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage:    `url(${bgImage})`,
          backgroundSize:     'cover',
          backgroundPosition: 'center',
        }} />
      )}

      {/* Scrim */}
      <div style={{ position: 'absolute', inset: 0, backgroundColor: scrimCss }} />

      {/* Corner logo */}
      {cornerStyle && logoSrc && (
        <div style={cornerStyle}>
          <img src={logoSrc} alt="Logo" style={{ maxHeight: theme.logoMaxHeight, objectFit: 'contain' }} />
        </div>
      )}

      {/* Main layout — mirrors RoomDisplay's flex row */}
      <div style={{ display: 'flex', height: '100%', gap: 24, padding: 32, position: 'relative', zIndex: 1 }}>

        {/* ── Left: Status panel ─────────────────────────────────────────── */}
        <div style={{ display: 'flex', flex: 1, minWidth: 0, flexDirection: 'column', justifyContent: 'space-between', paddingTop: 8, paddingBottom: 8 }}>

          {/* Room name + clock */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{
              fontFamily: theme.roomNameFontFamily,
              fontSize:   theme.roomNameFontSize,
              fontWeight: theme.roomNameFontWeight,
              color:      theme.roomNameColor,
              textShadow: theme.roomNameTextShadow,
              lineHeight: 1.1,
            }}>
              Chapel A
            </div>
            <div style={{
              fontFamily: theme.clockFontFamily,
              fontSize:   theme.clockFontSize,
              color:      theme.clockColor,
              opacity:    theme.clockOpacity,
              fontWeight: 400,
            }}>
              {CLOCK}
            </div>
          </div>

          {/* Status word + available-until hint */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{
              fontFamily: theme.roomNameFontFamily,
              fontSize:   theme.statusFontSize,
              fontWeight: theme.statusFontWeight,
              color:      theme.accentColorAvailable,
              lineHeight: 1,
              textShadow: theme.statusTextShadow,
            }}>
              Available
            </div>
            <div style={{
              fontFamily: theme.roomNameFontFamily,
              fontSize:   '26px',
              color:      theme.roomNameColor,
              opacity:    0.7,
            }}>
              Available until {AVAILABLE_UNTIL}
            </div>
          </div>

          {/* Book Now + beside-book-now logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <div style={{
              backgroundColor: theme.accentColorBookButton,
              color:           theme.bookButtonTextColor,
              borderRadius:    theme.buttonBorderRadius,
              fontFamily:      theme.roomNameFontFamily,
              fontSize:        theme.bookButtonFontSize,
              fontWeight:      600,
              padding:         '16px 44px',
              boxShadow:       theme.glassPanelShadow,
              display:         'inline-block',
            }}>
              Book Now
            </div>
            {logoSrc && theme.logoPosition === 'beside-book-now' && (
              <img src={logoSrc} alt="Logo" style={{ maxHeight: theme.logoMaxHeight, objectFit: 'contain' }} />
            )}
          </div>
        </div>

        {/* ── Right: Agenda panel ────────────────────────────────────────── */}
        <div style={{
          width:               360,
          flexShrink:          0,
          borderRadius:        24,
          border:              `1px solid ${theme.glassPanelBorderColor}`,
          background:          theme.glassPanelTint,
          backdropFilter:      `blur(${theme.glassPanelBlur}px)`,
          WebkitBackdropFilter:`blur(${theme.glassPanelBlur}px)`,
          boxShadow:           theme.glassPanelShadow,
          overflow:            'hidden',
        }}>
          <div style={{ padding: 20 }}>
            {(['Today', 'Tomorrow'] as const).map((day) => {
              const evs = FAKE_EVENTS.filter((e) => e.day === day);
              return (
                <div key={day} style={{ marginBottom: day === 'Today' ? 20 : 0 }}>
                  <div style={{
                    color:         theme.agendaDayHeaderColor,
                    fontSize:      11,
                    fontWeight:    600,
                    letterSpacing: 1.5,
                    textTransform: 'uppercase',
                    marginBottom:  8,
                  }}>
                    {day}
                  </div>
                  {evs.map((ev, i) => (
                    <div key={i} style={{
                      background:   theme.agendaEventItemBackground,
                      borderRadius: theme.chipBorderRadius,
                      padding:      '10px 12px',
                      marginBottom: i < evs.length - 1 ? 6 : 0,
                    }}>
                      <div style={{ color: theme.agendaEventColor, fontSize: 14, fontWeight: 500, lineHeight: 1.3 }}>
                        {ev.title}
                      </div>
                      <div style={{ color: theme.agendaMutedColor, fontSize: 12, marginTop: 2 }}>
                        {ev.time}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
