// ─── Shared types ─────────────────────────────────────────────────────────────

export interface RemoteCalendar {
  id: string;     // Provider-specific identifier
  name: string;   // Human-readable name for admin UI dropdown
  kind?: string;  // e.g. "Room" for PCO; absent for iCal
}

export interface RemoteEvent {
  externalId: string;  // Stable identifier — used as bookings_cache.external_id
  title: string;
  startsAt: Date;      // Absolute UTC
  endsAt: Date;        // Absolute UTC
  allDay?: boolean;    // True when the source event is a DATE (not DATETIME) value
}

export interface ConnectionResult {
  ok: boolean;
  message: string;
}

// ─── Credentials shapes (stored encrypted in calendar_sources) ────────────────

export interface IcalCredentials {
  url: string;
  httpAuth: { username: string; password: string } | null;
}

export interface PcoCredentials {
  authType: 'pat';
  clientId: string;
  secret: string;
}

export type ProviderCredentials = IcalCredentials | PcoCredentials;

// ─── Provider interface ───────────────────────────────────────────────────────

export interface CalendarProvider {
  readonly sourceId: number;
  readonly type: 'pco' | 'ical';
  readonly supportsWriteback: false;  // Always false in v1

  /** Returns calendars/rooms available from this source (for admin UI mapping). */
  listCalendars(): Promise<RemoteCalendar[]>;

  /** Fetches events in [from, to). Called by the sync scheduler and force-sync. */
  fetchEvents(calendarId: string, from: Date, to: Date): Promise<RemoteEvent[]>;

  /** Tests credentials. Called when admin saves a source. */
  testConnection(): Promise<ConnectionResult>;
}
