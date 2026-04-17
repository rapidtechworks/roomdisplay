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

  // Background treatment
  backgroundOverlayGradient: string;
  defaultBackgroundImagePath: string;

  // Typography — room name
  roomNameFontFamily: string;
  roomNameFontSize: string;
  roomNameFontWeight: number;
  roomNameColor: string;
  roomNameTextShadow: string;

  // Typography — current event
  eventFontFamily: string;
  eventFontSize: string;
  eventFontWeight: number;
  eventColor: string;

  // Typography — status word
  statusFontSize: string;
  statusFontWeight: number;

  // Colors
  accentColorAvailable: string;
  accentColorBusy: string;
  accentColorEndingSoon: string;
  accentColorBookButton: string;
  bookButtonTextColor: string;

  // Shapes
  buttonBorderRadius: string;
  chipBorderRadius: string;

  // Agenda panel
  agendaDayHeaderColor: string;
  agendaEventColor: string;
  agendaMutedColor: string;

  // Offline banner
  offlineBannerBackground: string;
  offlineBannerTextColor: string;

  // Logo
  logoImagePath: string | null;
  logoPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'none';
  logoMaxHeight: string;
}

export const DEFAULT_THEME: Theme = {
  glassPanelTint: 'rgba(255, 255, 255, 0.14)',
  glassPanelBlur: 24,
  glassPanelBorderColor: 'rgba(255, 255, 255, 0.2)',

  backgroundOverlayGradient: 'linear-gradient(135deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.25) 100%)',
  defaultBackgroundImagePath: '/defaults/bg-neutral.jpg',

  roomNameFontFamily: "'Inter', system-ui, sans-serif",
  roomNameFontSize: '96px',
  roomNameFontWeight: 600,
  roomNameColor: '#FFFFFF',
  roomNameTextShadow: '0 2px 16px rgba(0,0,0,0.3)',

  eventFontFamily: "'Inter', system-ui, sans-serif",
  eventFontSize: '88px',
  eventFontWeight: 600,
  eventColor: '#FFFFFF',

  statusFontSize: '120px',
  statusFontWeight: 500,

  accentColorAvailable: '#34D399',
  accentColorBusy: '#F87171',
  accentColorEndingSoon: '#FBBF24',
  accentColorBookButton: '#3B82F6',
  bookButtonTextColor: '#FFFFFF',

  buttonBorderRadius: '16px',
  chipBorderRadius: '16px',

  agendaDayHeaderColor: 'rgba(255, 255, 255, 0.85)',
  agendaEventColor: 'rgba(255, 255, 255, 0.95)',
  agendaMutedColor: 'rgba(255, 255, 255, 0.5)',

  offlineBannerBackground: 'rgba(251, 191, 36, 0.92)',
  offlineBannerTextColor: '#1F2937',

  logoImagePath: null,
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

export interface AvailableDurationsResponse {
  now: string; // UTC ISO-8601
  availableDurations: number[]; // minutes: subset of [15, 30, 45, 60, 90, 120]
  nextEvent: { title: string; startsAt: string } | null;
}

export interface CreateBookingRequest {
  title?: string;
  durationMinutes: number;
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
