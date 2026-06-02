/**
 * Typed API client for the admin UI.
 * Handles CSRF tokens, session cookies, and JSON parsing.
 */
import type { Theme } from '@roomdisplay/shared';

// ─── Unauthorized handler ─────────────────────────────────────────────────────
// Called whenever any API request returns 401 so the UI can redirect to login.

let _onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(fn: () => void): void {
  _onUnauthorized = fn;
}

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
    if (res.status === 401) {
      clearCsrfToken();
      _onUnauthorized?.();
    }
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
  upcomingEventCount: number;
}

export interface SourceEvent {
  event_id: number;
  source: string;
  external_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  room_id: number;
  room_name: string;
  room_slug: string;
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
  themeGroupId: number | null;
  themeTier: 'room' | 'group' | 'global';
  backgroundImagePath: string | null;
  createdAt: string;
  source: { id: number; name: string; type: string };
}

export interface ThemeGroup {
  id: number;
  name: string;
  themeId: number | null;
  usingGlobal: boolean;
  roomCount: number;
  createdAt: string;
}

export interface ThemeGroupDetail extends ThemeGroup {
  rooms: { id: number; slug: string; displayName: string }[];
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

export interface ThemeResponse {
  id:       number;
  name:     string;
  settings: Theme;
}

export interface RoomThemeResponse {
  usingGlobal: boolean;
  themeId:     number | null;
  settings:    Theme;
}

export interface NamedTheme {
  id:              number;
  name:            string;
  settings:        Theme;
  usedByRooms:     number;
  usedByGroups:    number;
  usedBySchedules: number;
  createdAt:       string;
  updatedAt:       string;
}

export interface ThemeSchedule {
  id:             number;
  name:           string;
  themeId:        number;
  themeName:      string;
  scopeType:      'global' | 'group' | 'room';
  scopeId:        number | null;
  scopeName:      string;
  recurrenceType: 'weekly' | 'one_time';
  dayOfWeek:      number | null;
  date:           string | null;
  startTime:      string;
  endTime:        string | null;
  timeZone:       string;
  enabled:        boolean;
  createdAt:      string;
}

export interface CreateScheduleData {
  name:           string;
  themeId:        number;
  scopeType:      'global' | 'group' | 'room';
  scopeId?:       number | null;
  recurrenceType: 'weekly' | 'one_time';
  dayOfWeek?:     number | null;
  date?:          string | null;
  startTime:      string;
  endTime?:       string | null;
  timeZone:       string;
  enabled?:       boolean;
}

export type { Theme };

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
  getSourceEvents:    (id: number, days = 14) => call<SourceEvent[]>('GET', `/api/admin/sources/${id}/events?days=${days}`),

  // Rooms
  getRooms:      ()                     => call<Room[]>('GET',    '/api/admin/rooms'),
  getRoom:       (id: number)           => call<RoomDetail>('GET',    `/api/admin/rooms/${id}`),
  createRoom:    (data: unknown)        => call<{ id: number; slug: string }>('POST',   '/api/admin/rooms', data),
  updateRoom:    (id: number, data: unknown) => call<{ ok: boolean }>('PATCH',  `/api/admin/rooms/${id}`, data),
  deleteRoom:    (id: number)           => call<{ ok: boolean }>('DELETE', `/api/admin/rooms/${id}`),
  getRoomEvents: (id: number, days = 14) => call<RoomEvent[]>('GET', `/api/admin/rooms/${id}/events?days=${days}`),
  deleteWalkUp:  (roomId: number, walkupId: number) => call<{ ok: boolean }>('DELETE', `/api/admin/rooms/${roomId}/walkups/${walkupId}`),

  // Theme Groups
  getThemeGroups:       ()                => call<ThemeGroup[]>('GET',    '/api/admin/theme-groups'),
  getThemeGroup:        (id: number)      => call<ThemeGroupDetail>('GET', `/api/admin/theme-groups/${id}`),
  createThemeGroup:     (name: string)    => call<{ id: number; name: string }>('POST', '/api/admin/theme-groups', { name }),
  updateThemeGroup:     (id: number, data: { name?: string; themeId?: number | null }) => call<{ ok: boolean }>('PATCH', `/api/admin/theme-groups/${id}`, data),
  deleteThemeGroup:     (id: number)      => call<{ ok: boolean }>('DELETE', `/api/admin/theme-groups/${id}`),
  getThemeGroupTheme:   (id: number)      => call<RoomThemeResponse>('GET',    `/api/admin/theme-groups/${id}/theme`),
  enableThemeGroupTheme:(id: number)      => call<{ themeId: number; settings: Theme }>('POST', `/api/admin/theme-groups/${id}/theme`),
  updateThemeGroupTheme:(id: number, data: Partial<Theme>) => call<{ ok: boolean }>('PATCH', `/api/admin/theme-groups/${id}/theme`, data),
  disableThemeGroupTheme:(id: number)     => call<{ ok: boolean }>('DELETE', `/api/admin/theme-groups/${id}/theme`),

  // Themes
  getGlobalTheme:    ()                                  => call<ThemeResponse>('GET',   '/api/admin/themes/global'),
  updateGlobalTheme: (data: Partial<Theme>)              => call<{ ok: boolean }>('PATCH', '/api/admin/themes/global', data),
  getRoomTheme:      (roomId: number)                    => call<RoomThemeResponse>('GET', `/api/admin/rooms/${roomId}/theme`),
  enableRoomTheme:   (roomId: number)                    => call<{ themeId: number; settings: Theme }>('POST',   `/api/admin/rooms/${roomId}/theme`),
  updateRoomTheme:   (roomId: number, data: Partial<Theme>) => call<{ ok: boolean }>('PATCH',  `/api/admin/rooms/${roomId}/theme`, data),
  disableRoomTheme:  (roomId: number)                    => call<{ ok: boolean }>('DELETE', `/api/admin/rooms/${roomId}/theme`),

  // Named Themes
  getNamedThemes:    ()                                          => call<NamedTheme[]>('GET',    '/api/admin/named-themes'),
  getNamedTheme:     (id: number)                               => call<NamedTheme>('GET',    `/api/admin/named-themes/${id}`),
  createNamedTheme:  (name: string)                             => call<NamedTheme>('POST',   '/api/admin/named-themes', { name }),
  updateNamedTheme:  (id: number, data: { name?: string } & Partial<Theme>) => call<{ ok: boolean }>('PATCH', `/api/admin/named-themes/${id}`, data),
  deleteNamedTheme:  (id: number)                               => call<{ ok: boolean }>('DELETE', `/api/admin/named-themes/${id}`),

  // Theme Schedules
  getThemeSchedules:    ()                                 => call<ThemeSchedule[]>('GET',    '/api/admin/theme-schedules'),
  createThemeSchedule:  (data: CreateScheduleData)         => call<{ id: number }>('POST',   '/api/admin/theme-schedules', data),
  updateThemeSchedule:  (id: number, data: Partial<CreateScheduleData>) => call<{ ok: boolean }>('PATCH', `/api/admin/theme-schedules/${id}`, data),
  deleteThemeSchedule:  (id: number)                       => call<{ ok: boolean }>('DELETE', `/api/admin/theme-schedules/${id}`),

  // Image upload (multipart — handled separately, not via call())
  uploadImage: async (file: File): Promise<{ path: string }> => {
    const csrf = await getCsrf();
    const form = new FormData();
    form.append('image', file);
    const res = await fetch('/api/admin/images/upload', {
      method:      'POST',
      credentials: 'include',
      headers:     { 'x-csrf-token': csrf },
      body:        form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string; message?: string };
      throw new ApiError(res.status, err.error ?? 'upload_error', err.message ?? `HTTP ${res.status}`);
    }
    return res.json() as Promise<{ path: string }>;
  },

  // Tablets
  getTablets:    ()                                   => call<Tablet[]>('GET',    '/api/admin/tablets'),
  updateTablet:  (uuid: string, data: { label?: string | null; assignedRoomId?: number | null }) =>
    call<{ ok: boolean }>('PATCH',  `/api/admin/tablets/${uuid}`, data),
  deleteTablet:  (uuid: string)                       => call<{ ok: boolean }>('DELETE', `/api/admin/tablets/${uuid}`),

  // System
  getSystem:        () => call<SystemInfo>('GET',  '/api/admin/system'),
  triggerUpdate:    () => call<{ message: string }>('POST', '/api/admin/system/update'),
  getUpdateStatus:  () => call<UpdateStatus>('GET', '/api/admin/system/update/status'),
  checkForUpdate:   () => call<UpdateCheckResult>('GET', '/api/admin/system/update-check'),
};

export interface GitVersion  { hash: string; subject: string; date: string; }
export interface UpdateStatus {
  status: 'idle' | 'running' | 'restarting' | 'ok' | 'error';
  step?: string;
  message?: string;
  startedAt?: string;
  completedAt?: string;
}
export interface SystemInfo      { version: GitVersion; updateStatus: UpdateStatus; repoDir: string; }
export interface UpdateCheckResult {
  updateAvailable: boolean;
  latestVersion:   string | null;
  latestCommit:    string | null;
}
