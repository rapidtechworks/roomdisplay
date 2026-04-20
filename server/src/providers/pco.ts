import type {
  CalendarProvider,
  RemoteCalendar,
  RemoteEvent,
  ConnectionResult,
} from './base.js';

/**
 * PCO provider stub — Phase 2.
 * All methods throw until credentials are configured and Phase 2 is built.
 */
export class PcoProvider implements CalendarProvider {
  readonly supportsWriteback = false as const;
  readonly type = 'pco' as const;

  constructor(readonly sourceId: number) {}

  testConnection(): Promise<ConnectionResult> {
    return Promise.resolve({
      ok: false,
      message: 'PCO integration is not yet available. It will be added in Phase 2.',
    });
  }

  listCalendars(): Promise<RemoteCalendar[]> {
    return Promise.reject(new Error('PCO provider not implemented yet (Phase 2)'));
  }

  fetchEvents(_calendarId: string, _from: Date, _to: Date): Promise<RemoteEvent[]> {
    return Promise.reject(new Error('PCO provider not implemented yet (Phase 2)'));
  }
}
