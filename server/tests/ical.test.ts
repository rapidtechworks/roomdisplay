import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { IcalProvider } from '../src/providers/ical.js';

// ─── Local ICS fixture server ─────────────────────────────────────────────────
// Spin up a real HTTP server so we exercise the actual fetch path without
// hitting the network or mocking node:http.

let server: Server;
let baseUrl: string;
const routes = new Map<string, string>();

beforeAll(async () => {
  server = createServer((req, res) => {
    const body = routes.get(req.url ?? '');
    if (body === undefined) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    res.setHeader('content-type', 'text/calendar');
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function serve(path: string, ics: string): string {
  routes.set(path, ics);
  return `${baseUrl}${path}`;
}

function makeProvider(url: string): IcalProvider {
  return new IcalProvider(1, 'Test', { url, httpAuth: null });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('IcalProvider.fetchEvents', () => {
  it('parses a single VEVENT inside the window', async () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Test//EN',
      'BEGIN:VEVENT',
      'UID:single-1@test',
      'SUMMARY:Staff Meeting',
      'DTSTART:20260601T140000Z',
      'DTEND:20260601T150000Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const url = serve('/single.ics', ics);
    const provider = makeProvider(url);

    const events = await provider.fetchEvents(
      'default',
      new Date('2026-06-01T00:00:00Z'),
      new Date('2026-06-02T00:00:00Z'),
    );

    expect(events).toHaveLength(1);
    expect(events[0]?.title).toBe('Staff Meeting');
    expect(events[0]?.externalId).toBe('single-1@test');
    expect(events[0]?.startsAt.toISOString()).toBe('2026-06-01T14:00:00.000Z');
    expect(events[0]?.endsAt.toISOString()).toBe('2026-06-01T15:00:00.000Z');
    expect(events[0]?.allDay).toBeFalsy();
  });

  it('excludes events that fall outside the window', async () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:past@test',
      'SUMMARY:Past',
      'DTSTART:20260101T000000Z',
      'DTEND:20260101T010000Z',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:future@test',
      'SUMMARY:Future',
      'DTSTART:20270101T000000Z',
      'DTEND:20270101T010000Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const url = serve('/window.ics', ics);
    const events = await makeProvider(url).fetchEvents(
      'default',
      new Date('2026-06-01T00:00:00Z'),
      new Date('2026-07-01T00:00:00Z'),
    );

    expect(events).toHaveLength(0);
  });

  it('expands an RRULE into multiple occurrences', async () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:weekly@test',
      'SUMMARY:Weekly Standup',
      'DTSTART:20260601T140000Z',
      'DTEND:20260601T143000Z',
      'RRULE:FREQ=WEEKLY;COUNT=4',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const url = serve('/weekly.ics', ics);
    const events = await makeProvider(url).fetchEvents(
      'default',
      new Date('2026-06-01T00:00:00Z'),
      new Date('2026-07-01T00:00:00Z'),
    );

    expect(events.length).toBeGreaterThanOrEqual(4);
    for (const e of events) {
      expect(e.title).toBe('Weekly Standup');
      expect(e.endsAt.getTime() - e.startsAt.getTime()).toBe(30 * 60 * 1000);
      expect(e.externalId.startsWith('weekly@test_')).toBe(true);
    }
    // External IDs are unique per occurrence
    const ids = new Set(events.map((e) => e.externalId));
    expect(ids.size).toBe(events.length);
  });

  it('respects EXDATE exclusions in a recurring event', async () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:weekly-skip@test',
      'SUMMARY:Weekly',
      'DTSTART:20260601T140000Z',
      'DTEND:20260601T150000Z',
      'RRULE:FREQ=WEEKLY;COUNT=4',
      'EXDATE:20260608T140000Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const url = serve('/exdate.ics', ics);
    const events = await makeProvider(url).fetchEvents(
      'default',
      new Date('2026-06-01T00:00:00Z'),
      new Date('2026-07-01T00:00:00Z'),
    );

    // 4 occurrences minus 1 EXDATE = 3
    expect(events).toHaveLength(3);
    const sorted = [...events].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    const week = 7 * 24 * 60 * 60 * 1000;
    // Week 2 (June 8) is excluded — gap between occ[0] (June 1) and occ[1] (June 15) is 2 weeks
    expect(sorted[1]!.startsAt.getTime() - sorted[0]!.startsAt.getTime()).toBe(2 * week);
    expect(sorted[2]!.startsAt.getTime() - sorted[1]!.startsAt.getTime()).toBe(week);
  });

  it('flags all-day events with allDay=true', async () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:allday@test',
      'SUMMARY:Holiday',
      'DTSTART;VALUE=DATE:20260704',
      'DTEND;VALUE=DATE:20260705',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const url = serve('/allday.ics', ics);
    const events = await makeProvider(url).fetchEvents(
      'default',
      new Date('2026-07-01T00:00:00Z'),
      new Date('2026-07-31T00:00:00Z'),
    );

    expect(events).toHaveLength(1);
    expect(events[0]?.allDay).toBe(true);
    expect(events[0]?.title).toBe('Holiday');
  });
});

describe('IcalProvider.testConnection', () => {
  it('returns ok for a parseable feed', async () => {
    const url = serve('/conn.ics', 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n');
    const result = await makeProvider(url).testConnection();
    expect(result.ok).toBe(true);
  });

  it('returns not-ok for a non-iCal response', async () => {
    const url = serve('/garbage.ics', 'this is not iCal');
    const result = await makeProvider(url).testConnection();
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/BEGIN:VCALENDAR/);
  });

  it('returns not-ok on HTTP error', async () => {
    const result = await makeProvider(`${baseUrl}/does-not-exist`).testConnection();
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/HTTP 404/);
  });
});
