import * as ical from 'node-ical';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import type {
  CalendarProvider,
  RemoteCalendar,
  RemoteEvent,
  ConnectionResult,
  IcalCredentials,
} from './base.js';

const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT = 'RoomDisplay/1.0 (iCal sync)';

// ─── HTTP fetch helper ────────────────────────────────────────────────────────

function fetchUrl(
  url: string,
  auth: IcalCredentials['httpAuth'],
): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const reqFn = isHttps ? httpsRequest : httpRequest;

    const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
    if (auth) {
      const encoded = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
      headers['Authorization'] = `Basic ${encoded}`;
    }

    const req = reqFn(
      { hostname: parsed.hostname, port: parsed.port, path: parsed.pathname + parsed.search, headers },
      (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const location = res.headers['location'];
          if (location) return resolve(fetchUrl(location, auth));
          return reject(new Error('Redirect with no Location header'));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode ?? 'unknown'} from iCal URL`));
        }
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', reject);
      },
    );

    req.setTimeout(FETCH_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error(`Request timed out after ${FETCH_TIMEOUT_MS}ms`));
    });

    req.on('error', reject);
    req.end();
  });
}

// ─── IcalProvider ────────────────────────────────────────────────────────────

export class IcalProvider implements CalendarProvider {
  readonly supportsWriteback = false as const;
  readonly type = 'ical' as const;

  constructor(
    readonly sourceId: number,
    private readonly displayName: string,
    private readonly credentials: IcalCredentials,
  ) {}

  async testConnection(): Promise<ConnectionResult> {
    try {
      const data = await fetchUrl(this.credentials.url, this.credentials.httpAuth);
      // Quick sanity check that it looks like an ICS file
      if (!data.includes('BEGIN:VCALENDAR')) {
        return { ok: false, message: 'URL did not return a valid iCal feed (missing BEGIN:VCALENDAR)' };
      }
      return { ok: true, message: 'Connection successful' };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  async listCalendars(): Promise<RemoteCalendar[]> {
    // iCal URLs are always one calendar per URL
    return [{ id: 'default', name: this.displayName }];
  }

  async fetchEvents(
    _calendarId: string,
    from: Date,
    to: Date,
  ): Promise<RemoteEvent[]> {
    const data = await fetchUrl(this.credentials.url, this.credentials.httpAuth);
    const parsed = ical.sync.parseICS(data);
    const events: RemoteEvent[] = [];

    for (const [uid, component] of Object.entries(parsed)) {
      if (component.type !== 'VEVENT') continue;

      const event = component as ical.VEvent;
      const summary = (event.summary ?? '(No title)').trim();

      if (event.rrule) {
        // ── Recurring event ────────────────────────────────────────────────
        const occurrences = event.rrule.between(from, to, true);

        // Build a set of excluded dates (EXDATE)
        const exdates = new Set<number>();
        if (event.exdate) {
          for (const ex of Object.values(event.exdate)) {
            const exDate = ex instanceof Date ? ex : new Date(String(ex));
            exdates.add(exDate.getTime());
          }
        }

        const eventStart = event.start instanceof Date ? event.start : new Date(String(event.start));
        const eventEnd   = event.end   instanceof Date ? event.end   : new Date(eventStart);
        const durationMs = eventEnd.getTime() - eventStart.getTime();

        for (const occurrence of occurrences) {
          if (exdates.has(occurrence.getTime())) continue;

          const occEnd = new Date(occurrence.getTime() + durationMs);
          events.push({
            externalId: `${uid}_${occurrence.toISOString()}`,
            title: summary,
            startsAt: occurrence,
            endsAt: occEnd,
          });
        }
      } else {
        // ── Single event ───────────────────────────────────────────────────
        const start = event.start instanceof Date ? event.start : new Date(String(event.start));
        const end   = event.end   instanceof Date ? event.end   : new Date(start);

        // Overlap check: event overlaps [from, to) if start < to AND end > from
        if (start < to && end > from) {
          events.push({
            externalId: uid,
            title: summary,
            startsAt: start,
            endsAt: end,
          });
        }
      }
    }

    return events;
  }
}
