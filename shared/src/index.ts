// Shared types used by both server and web

// ─── Calendar / Events ───────────────────────────────────────────────────────

export type CalendarSourceType = 'pco' | 'ical';
export type BookingSource = 'pco' | 'ical' | 'local_walkup';
export type SyncStatus = 'ok' | 'error' | 'pending';

export interface RemoteCalendar {
  id: string;
  name: string;
  kind?: string;
}

export interface RemoteEvent {
  externalId: string;
  title: string;
  startsAt: string; // UTC ISO-8601
  endsAt: string;   // UTC ISO-8601
}

// ─── Room state (what the tablet displays) ───────────────────────────────────

export interface CachedEvent {
  id: string;          // bookings_cache row id (stringified)
  source: BookingSource;
  title: string;
  startsAt: string;    // UTC ISO-8601
  endsAt: string;      // UTC ISO-8601
  allDay: boolean;     // True for DATE-only events (no time component in source)
}

export interface RoomState {
  version: 1;
  cachedAt: string;       // UTC ISO-8601 — when this snapshot was built
  roomSlug: string;
  roomName: string;
  timeZone: string;       // IANA tz
  theme: Theme;
  events: CachedEvent[];  // Rolling 7-day window
}

// ─── Theme ───────────────────────────────────────────────────────────────────

export interface Theme {
  // Panel / material
  glassPanelTint: string;
  glassPanelBlur: number;
  glassPanelBorderColor: string;
  glassPanelShadow: string;  // box-shadow applied to panels + buttons for the "floating" effect

  // Background treatment
  backgroundColor: string;            // solid colour shown behind the image
  backgroundOverlayGradient: string;  // kept for backward compat; use scrimColor+scrimOpacity instead
  scrimColor: string;                 // hex colour of the overlay scrim (usually #000000)
  scrimOpacity: number;               // 0–1 opacity of the scrim over the background image
  defaultBackgroundImagePath: string; // server-stored upload path (e.g. /uploads/…)
  backgroundImageUrl: string | null;  // external URL (takes priority over path)

  // Typography — room name
  roomNameFontFamily: string;
  roomNameFontSize: string;
  roomNameFontWeight: number;
  roomNameColor: string;
  roomNameTextShadow: string;

  // Typography — clock (sits just below room name)
  clockFontFamily: string;
  clockFontSize: string;
  clockColor: string;
  clockOpacity: number;

  // Typography — current event
  eventFontFamily: string;
  eventFontSize: string;
  eventFontWeight: number;
  eventColor: string;

  // Typography — status word
  statusFontSize: string;
  statusFontWeight: number;
  statusTextShadow: string;

  // Colors
  accentColorAvailable: string;
  accentColorBusy: string;
  accentColorEndingSoon: string;
  accentColorBookButton: string;
  bookButtonTextColor: string;
  bookButtonFontSize: string;

  // Shapes
  buttonBorderRadius: string;
  chipBorderRadius: string;

  // Agenda panel
  agendaDayHeaderColor: string;
  agendaEventColor: string;
  agendaMutedColor: string;
  agendaEventItemBackground: string;  // individual event card tint

  // Offline banner
  offlineBannerBackground: string;
  offlineBannerTextColor: string;

  // Screensaver (burn-in protection)
  screensaverEnabled: boolean;
  screensaverIdleMinutes: number;       // minutes of inactivity before activating
  screensaverUseCameraMotion: boolean;  // opt-in: wake on camera motion
  screensaverTextColor: string;         // colour of drifting room name text

  // Logo
  logoImagePath: string | null;
  logoImageUrl: string | null;        // external URL (takes priority over path)
  logoPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'beside-book-now' | 'none';
  logoMaxHeight: string;
}

export const DEFAULT_THEME: Theme = {
  glassPanelTint: 'rgba(255, 255, 255, 0.14)',
  glassPanelBlur: 24,
  glassPanelBorderColor: 'rgba(255, 255, 255, 0.2)',
  glassPanelShadow: '8px 12px 40px rgba(0,0,0,0.45)',

  backgroundColor: '#0f172a',
  backgroundOverlayGradient: 'linear-gradient(135deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.25) 100%)',
  scrimColor: '#000000',
  scrimOpacity: 0.25,
  defaultBackgroundImagePath: '/defaults/bg-neutral.jpg',
  backgroundImageUrl: null,

  roomNameFontFamily: "'Inter', system-ui, sans-serif",
  roomNameFontSize: '96px',
  roomNameFontWeight: 600,
  roomNameColor: '#FFFFFF',
  roomNameTextShadow: '0 2px 16px rgba(0,0,0,0.3)',

  clockFontFamily: "'Inter', system-ui, sans-serif",
  clockFontSize: 'clamp(20px, 2.5vw, 36px)',
  clockColor: '#FFFFFF',
  clockOpacity: 0.65,

  eventFontFamily: "'Inter', system-ui, sans-serif",
  eventFontSize: '88px',
  eventFontWeight: 600,
  eventColor: '#FFFFFF',

  statusFontSize: '120px',
  statusFontWeight: 500,
  statusTextShadow: '3px 4px 24px rgba(0,0,0,0.5)',

  accentColorAvailable: '#34D399',
  accentColorBusy: '#F87171',
  accentColorEndingSoon: '#FBBF24',
  accentColorBookButton: '#3B82F6',
  bookButtonTextColor: '#FFFFFF',
  bookButtonFontSize: 'clamp(18px, 2.2vw, 28px)',

  buttonBorderRadius: '16px',
  chipBorderRadius: '16px',

  agendaDayHeaderColor: 'rgba(255, 255, 255, 0.85)',
  agendaEventColor: 'rgba(255, 255, 255, 0.95)',
  agendaMutedColor: 'rgba(255, 255, 255, 0.5)',
  agendaEventItemBackground: 'rgba(255,255,255,0.07)',

  offlineBannerBackground: 'rgba(251, 191, 36, 0.92)',
  offlineBannerTextColor: '#1F2937',

  screensaverEnabled: true,
  screensaverIdleMinutes: 5,
  screensaverUseCameraMotion: false,
  screensaverTextColor: 'rgba(255, 255, 255, 0.2)',

  logoImagePath: null,
  logoImageUrl: null,
  logoPosition: 'none',
  logoMaxHeight: '80px',
};

// ─── WebSocket messages ───────────────────────────────────────────────────────

// Client → Server
export type WsClientMessage =
  | { type: 'subscribe'; roomSlug: string; tabletUuid: string }
  | { type: 'pong' };

// Server → Client
export type WsServerMessage =
  | { type: 'state'; payload: RoomState }
  | { type: 'ping' }
  | { type: 'server_shutting_down' };

// ─── API shapes ───────────────────────────────────────────────────────────────

export interface BookingSlot {
  minutes: number; // approximate duration (for display only)
  endsAt:  string; // UTC ISO-8601 — clean rounded end time
}

export interface AvailableDurationsResponse {
  now:            string;        // UTC ISO-8601
  availableSlots: BookingSlot[]; // pre-computed rounded end times
  nextEvent:      { title: string; startsAt: string } | null;
}

export interface CreateBookingRequest {
  title?:  string;
  endsAt:  string; // UTC ISO-8601 — the clean rounded end time from availableSlots
}

export interface CreateBookingResponse {
  id: number;
  startsAt: string;
  endsAt: string;
  title: string;
}

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}
