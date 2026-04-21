/**
 * Typed API client for the admin UI.
 * Handles CSRF tokens, session cookies, and JSON parsing.
 */

// ─── CSRF token management ────────────────────────────────────────────────────

let _csrfToken: string | null = null;

export async function refreshCsrfToken(): Promise<void> {
  const res = await fetch('/api/admin/csrf-token', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch CSRF token');
  const data = (await res.json()) as { csrfToken: string };
  _csrfToken = data.csrfToken;
}

export function clearCsrfToken(): void {
  _csrfToken = null;
}

async function getCsrf(): Promise<string> {
  if (!_csrfToken) await refreshCsrfToken();
  return _csrfToken!;
}

// ─── Error type ───────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function call<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const isMutation = method !== 'GET';
  const headers: Record<string, string> = {};

  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (isMutation) headers['x-csrf-token'] = await getCsrf();

  const opts = (): RequestInit => ({
    method,
    credentials: 'include',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let res = await fetch(path, opts());

  // Auto-refresh CSRF on 403 and retry once
  if (res.status === 403 && isMutation) {
    clearCsrfToken();
    headers['x-csrf-token'] = await getCsrf();
    res = await fetch(path, opts());
  }

  if (!res.ok) {
    let code = 'unknown_error';
    let message = `HTTP ${res.status}`;
    try {
      const err = (await res.json()) as { error?: string; message?: string };
      code = err.error ?? code;
      message = err.message ?? message;
    } catch { /* ignore */ }
    throw new ApiError(res.status, code, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface Source {
  id: number;
  type: 'ical' | 'pco';
  displayName: string;
  pollIntervalSeconds: number;
  lastSyncedAt: string | null;
  lastSyncStatus: 'ok' | 'error' | 'pending';
  lastSyncError: string | null;
  createdAt: string;
  credentials: Record<string, unknown>;
  roomCount?: number;
}

export interface Calendar {
  id: string;
  name: string;
  kind: string | null;
  mappedRoom: { id: number; slug: string; display_name: string } | null;
}

export interface Room {
  id: number;
  slug: string;
  displayName: string;
  timeZone: string;
  calendarSourceId: number;
  externalCalendarId: string;
  themeOverrideId: number | null;
  backgroundImagePath: string | null;
  createdAt: string;
  source: { id: number; name: string; type: string };
}

export interface WalkUp {
  id: number;
  title: string;
  starts_at: string;
  ends_at: string;
  created_at: string;
  created_from_ip: string | null;
}

export interface RoomDetail extends Room {
  activeWalkUps: WalkUp[];
}

export interface RoomEvent {
  id: number;
  source: string;
  external_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
}

export interface Tablet {
  tabletUuid: string;
  label: string | null;
  lastSeenAt: string | null;
  lastIp: string | null;
  userAgent: string | null;
  assignedRoomId: number | null;
  assignedRoomSlug: string | null;
  assignedRoomName: string | null;
  createdAt: string;
  online: boolean;
  currentSlug: string | null;
}

export interface SyncResult {
  sourceId: number;
  status: 'ok' | 'error';
  message: string;
  roomsSynced: number;
  eventsUpserted: number;
  eventsDeleted: number;
  durationMs: number;
}

// ─── API functions ────────────────────────────────────────────────────────────

export const api = {
  // Auth
  getMe:  ()               => call<{ loggedIn: boolean }>('GET',    '/api/admin/me'),
  login:  (password: string) => call<{ ok: boolean }>('POST',  '/api/admin/login',  { password }),
  logout: ()               => call<{ ok: boolean }>('POST',  '/api/admin/logout'),

  // Sources
  getSources:         ()                => call<Source[]>('GET',    '/api/admin/sources'),
  getSource:          (id: number)      => call<Source>('GET',    `/api/admin/sources/${id}`),
  createSource:       (data: unknown)   => call<{ id: number }>('POST',   '/api/admin/sources', data),
  updateSource:       (id: number, data: unknown) => call<{ ok: boolean }>('PATCH',  `/api/admin/sources/${id}`, data),
  deleteSource:       (id: number)      => call<{ ok: boolean }>('DELETE', `/api/admin/sources/${id}`),
  testSource:         (id: number)      => call<{ ok: boolean; message: string }>('POST', `/api/admin/sources/${id}/test`),
  syncSource:         (id: number)      => call<SyncResult>('POST',   `/api/admin/sources/${id}/sync`),
  getSourceCalendars: (id: number)      => call<Calendar[]>('GET',    `/api/admin/sources/${id}/calendars`),

  // Rooms
  getRooms:      ()                     => call<Room[]>('GET',    '/api/admin/rooms'),
  getRoom:       (id: number)           => call<RoomDetail>('GET',    `/api/admin/rooms/${id}`),
  createRoom:    (data: unknown)        => call<{ id: number; slug: string }>('POST',   '/api/admin/rooms', data),
  updateRoom:    (id: number, data: unknown) => call<{ ok: boolean }>('PATCH',  `/api/admin/rooms/${id}`, data),
  deleteRoom:    (id: number)           => call<{ ok: boolean }>('DELETE', `/api/admin/rooms/${id}`),
  getRoomEvents: (id: number, days = 14) => call<RoomEvent[]>('GET', `/api/admin/rooms/${id}/events?days=${days}`),
  deleteWalkUp:  (roomId: number, walkupId: number) => call<{ ok: boolean }>('DELETE', `/api/admin/rooms/${roomId}/walkups/${walkupId}`),

  // Tablets
  getTablets:   ()                                   => call<Tablet[]>('GET',   '/api/admin/tablets'),
  updateTablet: (uuid: string, data: { label?: string | null; assignedRoomId?: number | null }) =>
    call<{ ok: boolean }>('PATCH', `/api/admin/tablets/${uuid}`, data),
};
