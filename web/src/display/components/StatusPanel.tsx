import type { Theme, CachedEvent } from '@roomdisplay/shared';
import type { RoomStatus } from '../RoomDisplay.tsx';

interface LogoProp {
  src:       string;
  maxHeight: string;
}

interface Props {
  roomName:         string;
  timeZone:         string;
  now:              Date;
  status:           RoomStatus;
  currentEvent:     CachedEvent | null;
  availableUntil:   string | null;
  minutesRemaining: number | null;
  theme:            Theme;
  onBook:           () => void;
  logo:             LogoProp | null;
}

function fmtClock(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone, hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(date);
}

function fmtTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone, hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(iso));
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

export function StatusPanel({
  roomName, timeZone, now, status, currentEvent,
  availableUntil, minutesRemaining, theme, onBook, logo,
}: Props) {
  const color   = statusColor(status, theme);
  const canBook = status === 'available' || status === 'ending-soon';

  return (
    <div className="flex h-full flex-col justify-between py-2">

      {/* Room name + clock stacked at the top */}
      <div className="flex flex-col gap-2">
        <h1 style={{
          fontFamily: theme.roomNameFontFamily,
          fontSize:   `clamp(36px, 6vw, ${theme.roomNameFontSize})`,
          fontWeight: theme.roomNameFontWeight,
          color:      theme.roomNameColor,
          textShadow: theme.roomNameTextShadow,
          lineHeight: 1.1,
        }}>
          {roomName}
        </h1>

        {/* Clock — just below the room name */}
        <p style={{
          fontFamily: theme.clockFontFamily,
          fontSize:   theme.clockFontSize,
          color:      theme.clockColor,
          opacity:    theme.clockOpacity,
          fontWeight: 400,
        }}>
          {fmtClock(now, timeZone)}
        </p>
      </div>

      {/* Status block — middle */}
      <div className="flex flex-col gap-4">
        {/* placeholder so justify-between spreads top / middle / bottom */}

        {/* Status word */}
        <p style={{
          fontFamily: theme.roomNameFontFamily,
          fontSize:   `clamp(32px, 7vw, ${theme.statusFontSize})`,
          fontWeight: theme.statusFontWeight,
          color,
          lineHeight: 1,
        }}>
          {statusLabel(status)}
        </p>

        {/* Sub-info */}
        {status === 'available' && availableUntil && (
          <p style={{
            fontFamily: theme.roomNameFontFamily,
            fontSize:   'clamp(16px, 2.2vw, 30px)',
            color:      theme.roomNameColor,
            opacity:    0.7,
          }}>
            Available until {availableUntil}
          </p>
        )}

        {(status === 'occupied' || status === 'ending-soon') && currentEvent && (
          <div>
            <p style={{
              fontFamily: theme.eventFontFamily,
              fontSize:   `clamp(22px, 4.5vw, ${theme.eventFontSize})`,
              fontWeight: theme.eventFontWeight,
              color:      theme.eventColor,
              lineHeight: 1.2,
            }}>
              {currentEvent.title}
            </p>

            {status === 'ending-soon' && minutesRemaining !== null && (
              <p style={{
                fontFamily: theme.roomNameFontFamily,
                fontSize:   'clamp(14px, 1.8vw, 26px)',
                color:      theme.accentColorEndingSoon,
                marginTop:  '8px',
              }}>
                Ends in {minutesRemaining} minute{minutesRemaining !== 1 ? 's' : ''}
              </p>
            )}

            {status === 'occupied' && (
              <p style={{
                fontFamily: theme.roomNameFontFamily,
                fontSize:   'clamp(14px, 1.8vw, 26px)',
                color:      theme.roomNameColor,
                opacity:    0.55,
                marginTop:  '8px',
              }}>
                Until {fmtTime(currentEvent.endsAt, timeZone)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Book Now button + beside-book-now logo */}
      <div className="flex items-center gap-6">
        {canBook && (
          <button
            onClick={onBook}
            style={{
              backgroundColor: theme.accentColorBookButton,
              color:           theme.bookButtonTextColor,
              borderRadius:    theme.buttonBorderRadius,
              fontFamily:      theme.roomNameFontFamily,
              fontSize:        theme.bookButtonFontSize,
              fontWeight:      600,
              padding:         '16px 44px',
              border:          'none',
              cursor:          'pointer',
              transition:      'opacity 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            Book Now
          </button>
        )}
        {logo && (
          <img
            src={logo.src}
            alt="Logo"
            style={{ maxHeight: logo.maxHeight, objectFit: 'contain' }}
          />
        )}
      </div>
    </div>
  );
}
