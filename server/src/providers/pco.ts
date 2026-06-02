import { request as httpsRequest } from 'node:https';
import type {
  CalendarProvider,
  RemoteCalendar,
  RemoteEvent,
  ConnectionResult,
  PcoCredentials,
} from './base.js';

const PCO_BASE = 'https://api.planningcenteronline.com/calendar/v2';
const TIMEOUT_MS = 15_000;
const UA = 'RoomDisplay/1.0 (PCO sync; +https://github.com/your-org/roomdisplay)';

// ─── PCO JSON API shapes ──────────────────────────────────────────────────────

type PcoAttr = Record<string, unknown>;

interface PcoResource {
  type: string;
  id: string;
  attributes: PcoAttr;
  relationships?: Record<string, { data?: { type: string; id: string } | null }>;
}

interface PcoEnvelope {
  data: PcoResource | PcoResource[];
  included?: PcoResource[];
  links?: { next?: string | null };
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function pcoGet(url: string, creds: PcoCredentials): Promise<PcoEnvelope> {
  return new Promise((resolve, reject) => {
    const fullUrl = url.startsWith('https://') ? url : `${PCO_BASE}${url}`;
    const parsed  = new URL(fullUrl);
    const auth    = Buffer.from(`${creds.clientId}:${creds.secret}`).toString('base64');

    const req = httpsRequest(
      {
        hostname: parsed.hostname,
        path:     parsed.pathname + parsed.search,
        method:   'GET',
        headers: {
          Authorization: `Basic ${auth}`,
          'User-Agent':  UA,
          Accept:        'application/json',
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode === 401) {
            return reject(new Error('Invalid credentials — check your Application ID and Secret (HTTP 401)'));
          }
          if (res.statusCode === 403) {
            return reject(new Error('Missing calendar scope or insufficient permissions (HTTP 403)'));
          }
          if ((res.statusCode ?? 0) >= 400) {
            return reject(new Error(`PCO API returned HTTP ${res.statusCode}`));
          }
          try {
            resolve(JSON.parse(body) as PcoEnvelope);
          } catch {
            reject(new Error('PCO API returned non-JSON response'));
          }
        });
        res.on('error', reject);
      },
    );

    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error(`PCO API request timed out after ${TIMEOUT_MS / 1000}s`));
    });

    req.on('error', reject);
    req.end();
  });
}

/** Exhaust all pages of a paginated PCO list endpoint. */
async function fetchAll(
  firstUrl: string,
  creds: PcoCredentials,
): Promise<{ items: PcoResource[]; included: PcoResource[] }> {
  const items:    PcoResource[] = [];
  const included: PcoResource[] = [];
  let url: string | null = firstUrl;

  while (url) {
    const resp = await pcoGet(url, creds);
    const data = resp.data;
    if (Array.isArray(data)) items.push(...data);
    else if (data)           items.push(data);
    if (resp.included) included.push(...resp.included);
    url = resp.links?.next ?? null;
  }

  return { items, included };
}

// ─── PcoProvider ──────────────────────────────────────────────────────────────

export class PcoProvider implements CalendarProvider {
  readonly supportsWriteback = false as const;
  readonly type = 'pco' as const;

  constructor(
    readonly sourceId: number,
    private readonly credentials: PcoCredentials,
  ) {}

  async testConnection(): Promise<ConnectionResult> {
    try {
      // GET /calendar/v2 returns the Organization record — cheapest possible check
      const resp = await pcoGet('', this.credentials);
      const data  = resp.data;
      const org   = Array.isArray(data) ? data[0] : data;
      const name  = (org?.attributes?.['name'] as string | undefined) ?? 'Planning Center';
      return { ok: true, message: `Connected to ${name}` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  async listCalendars(): Promise<RemoteCalendar[]> {
    const { items } = await fetchAll(
      `${PCO_BASE}/resources?where[kind]=Room&order=name&per_page=100`,
      this.credentials,
    );

    return items.map((r) => {
      const name     = (r.attributes['name']      as string | undefined)?.trim() || r.id;
      const pathName = (r.attributes['path_name'] as string | undefined)?.trim();
      // Include path_name as a parenthetical when it differs from name (i.e. room is inside a folder)
      const label = pathName && pathName !== name ? `${name} (${pathName})` : name;
      return { id: r.id, name: label, kind: 'Room' };
    });
  }

  async fetchEvents(calendarId: string, from: Date, to: Date): Promise<RemoteEvent[]> {
    // Query approved bookings that overlap [from, to):
    //   starts_at < to  AND  ends_at > from
    const params = new URLSearchParams({
      'filter':                  'approved',
      'where[starts_at][lte]':   to.toISOString(),
      'where[ends_at][gte]':     from.toISOString(),
      'include':                 'event_instance',
      'per_page':                '100',
    });

    const { items: bookings, included } = await fetchAll(
      `${PCO_BASE}/resources/${calendarId}/resource_bookings?${params.toString()}`,
      this.credentials,
    );

    // Index included EventInstances by ID for O(1) lookup
    const instances = new Map<string, PcoResource>();
    for (const inc of included) {
      if (inc.type === 'EventInstance') instances.set(inc.id, inc);
    }

    const events: RemoteEvent[] = [];

    for (const booking of bookings) {
      const instanceId = booking.relationships?.['event_instance']?.data?.id;
      const instance   = instanceId ? instances.get(instanceId) : undefined;

      // Blockout slots are internal holds (setup/teardown), not bookable events
      if (instance?.attributes['kind'] === 'blockout') continue;

      const startsAt = new Date(booking.attributes['starts_at'] as string);
      const endsAt   = new Date(booking.attributes['ends_at']   as string);

      if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) continue;

      const title  = ((instance?.attributes['name'] as string | undefined)?.trim()) || '(No title)';
      const allDay = (instance?.attributes['all_day_event'] as boolean | undefined) ?? false;

      events.push({
        // Prefix prevents any collision with iCal UIDs if a room ever switches types
        externalId: `pco_rb_${booking.id}`,
        title,
        startsAt,
        endsAt,
        allDay,
      });
    }

    return events;
  }
}
