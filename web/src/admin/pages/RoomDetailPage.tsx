import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type WalkUp, type RoomEvent, type Tablet } from '../api.ts';

// ─── Preview constants ────────────────────────────────────────────────────────
const IFRAME_W = 1280;
const IFRAME_H = 720;
const SCALE    = 0.45;
const CARD_W   = IFRAME_W * SCALE; // 576
const CARD_H   = IFRAME_H * SCALE; // 324

const TZ_OPTIONS = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix',
  'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu',
];

export function RoomDetailPage() {
  const { id } = useParams<{ id: string }>();
  const roomId  = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: room, isLoading, isError } = useQuery({
    queryKey: ['room', roomId],
    queryFn:  () => api.getRoom(roomId),
  });

  const { data: events } = useQuery({
    queryKey: ['room-events', roomId],
    queryFn:  () => api.getRoomEvents(roomId, 14),
    enabled:  !!room,
  });

  const { data: groups } = useQuery({
    queryKey: ['theme-groups'],
    queryFn:  () => api.getThemeGroups(),
  });

  const { data: tablets } = useQuery({
    queryKey:        ['tablets'],
    queryFn:         () => api.getTablets(),
    refetchInterval: 30_000,
  });

  // ── Edit state ──────────────────────────────────────────────────────────────
  const [editingName, setEditingName] = useState(false);
  const [editName,    setEditName]    = useState('');
  const [editingTz,   setEditingTz]   = useState(false);
  const [editTz,      setEditTz]      = useState('');
  const [editError,   setEditError]   = useState<string | null>(null);

  const saveField = (patch: Record<string, unknown>) =>
    api.updateRoom(roomId, patch);

  const nameMutation = useMutation({
    mutationFn: () => saveField({ displayName: editName }),
    onSuccess:  () => {
      void qc.invalidateQueries({ queryKey: ['room', roomId] });
      void qc.invalidateQueries({ queryKey: ['rooms'] });
      setEditingName(false);
      setEditError(null);
    },
    onError: (err) => setEditError(err instanceof ApiError ? err.message : 'Save failed.'),
  });

  const tzMutation = useMutation({
    mutationFn: () => saveField({ timeZone: editTz }),
    onSuccess:  () => {
      void qc.invalidateQueries({ queryKey: ['room', roomId] });
      setEditingTz(false);
    },
    onError: (err) => setEditError(err instanceof ApiError ? err.message : 'Save failed.'),
  });

  // ── Group assignment ────────────────────────────────────────────────────────
  const groupMutation = useMutation({
    mutationFn: (themeGroupId: number | null) => api.updateRoom(roomId, { themeGroupId }),
    onSuccess:  () => {
      void qc.invalidateQueries({ queryKey: ['room', roomId] });
      void qc.invalidateQueries({ queryKey: ['rooms'] });
    },
  });

  // ── Walk-up cancel ──────────────────────────────────────────────────────────
  const deleteWalkUp = useMutation({
    mutationFn: (walkupId: number) => api.deleteWalkUp(roomId, walkupId),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['room', roomId] }),
  });

  // ── Room delete ─────────────────────────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteRoom = useMutation({
    mutationFn: () => api.deleteRoom(roomId),
    onSuccess:  () => navigate('/admin/rooms', { replace: true }),
    onError:    (err) => alert(err instanceof ApiError ? err.message : 'Delete failed.'),
  });

  if (isLoading) {
    return (
      <div className="p-8">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }
  if (isError || !room) {
    return (
      <div className="p-8">
        <p className="text-sm text-red-400">Room not found.</p>
      </div>
    );
  }

  const activeTablet  = tablets?.find((t) => t.currentSlug === room.slug && t.online);
  const assignedTablet = tablets?.find((t) => t.assignedRoomId === room.id);
  const isOnline       = !!activeTablet;
  const hasDevice      = !!assignedTablet;

  const currentGroup = groups?.find((g) => g.id === room.themeGroupId);

  // Theme tier: which tier is active?
  const roomThemeActive  = room.themeOverrideId !== null;
  const groupThemeActive = !roomThemeActive && currentGroup !== undefined && !currentGroup.usingGlobal;
  const globalActive     = !roomThemeActive && !groupThemeActive;

  return (
    <div className="p-8">
      <Link to="/admin/rooms" className="mb-5 inline-block text-sm text-indigo-400 hover:text-indigo-300">
        ← Rooms
      </Link>

      {/* Two-column layout */}
      <div className="flex gap-8 items-start">

        {/* ── Left column ─────────────────────────────────────────────────── */}
        <div className="min-w-0 flex-1 space-y-6">

          {/* Room name heading — inline editable */}
          <div>
            {editingName ? (
              <form
                onSubmit={(e) => { e.preventDefault(); nameMutation.mutate(); }}
                className="flex items-center gap-3"
              >
                <input
                  autoFocus
                  className="input text-xl font-semibold flex-1"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
                <button type="submit" disabled={nameMutation.isPending} className="btn-primary text-sm">
                  {nameMutation.isPending ? 'Saving…' : 'Save'}
                </button>
                <button type="button" onClick={() => setEditingName(false)} className="btn-secondary text-sm">
                  Cancel
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold text-white">{room.displayName}</h1>
                <button
                  onClick={() => { setEditName(room.displayName); setEditingName(true); }}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Rename
                </button>
              </div>
            )}
            {editError && <p className="mt-1 text-xs text-red-400">{editError}</p>}
            <p className="mt-1 text-sm text-gray-500">/{room.slug}</p>
          </div>

          {/* Info card */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 divide-y divide-gray-800">
            <InfoRow label="Source" value={room.source.name} />
            <InfoRow label="Calendar ID" value={room.externalCalendarId} mono />
            <div className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="text-gray-500">Time Zone</span>
              {editingTz ? (
                <form
                  onSubmit={(e) => { e.preventDefault(); tzMutation.mutate(); }}
                  className="flex items-center gap-2"
                >
                  <select
                    className="input text-sm py-1"
                    value={editTz}
                    onChange={(e) => setEditTz(e.target.value)}
                  >
                    {TZ_OPTIONS.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                  <button type="submit" disabled={tzMutation.isPending} className="btn-primary text-xs py-1 px-2">
                    Save
                  </button>
                  <button type="button" onClick={() => setEditingTz(false)} className="btn-secondary text-xs py-1 px-2">
                    Cancel
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-white">{room.timeZone}</span>
                  <button
                    onClick={() => { setEditTz(room.timeZone); setEditingTz(true); }}
                    className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    Change
                  </button>
                </div>
              )}
            </div>
            <InfoRow label="Created" value={new Date(room.createdAt).toLocaleDateString()} />
            <div className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="text-gray-500">Display URL</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-white">/display/{room.slug}</span>
                <a
                  href={`/display/${room.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-indigo-400 hover:text-indigo-300"
                >
                  Open ↗
                </a>
              </div>
            </div>
          </div>

          {/* ── Theme Control ─────────────────────────────────────────────── */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
              Theme Control
            </h2>
            <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">

              {/* Tier 1 — Room Override */}
              <div className={`flex items-center justify-between px-4 py-3.5 ${roomThemeActive ? 'bg-indigo-950/40' : ''}`}>
                <div className="flex items-center gap-3">
                  <TierIndicator active={roomThemeActive} />
                  <div>
                    <p className={`text-sm font-medium ${roomThemeActive ? 'text-white' : 'text-gray-400'}`}>
                      Room Override
                    </p>
                    <p className="text-xs text-gray-600">
                      {roomThemeActive ? 'Active — overrides group and global' : 'Not set'}
                    </p>
                  </div>
                </div>
                <Link
                  to={`/admin/rooms/${roomId}/theme`}
                  className={`text-xs transition-colors ${roomThemeActive ? 'text-indigo-400 hover:text-indigo-300' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  {roomThemeActive ? 'Edit →' : 'Enable →'}
                </Link>
              </div>

              <div className="border-t border-gray-800" />

              {/* Tier 2 — Group Theme */}
              <div className={`flex items-center justify-between px-4 py-3.5 ${groupThemeActive ? 'bg-indigo-950/40' : ''}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <TierIndicator active={groupThemeActive} />
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${groupThemeActive ? 'text-white' : 'text-gray-400'}`}>
                      Group Theme
                    </p>
                    <p className="text-xs text-gray-600">
                      {currentGroup
                        ? currentGroup.usingGlobal
                          ? `In "${currentGroup.name}" — using global theme`
                          : `In "${currentGroup.name}" — custom group theme`
                        : 'Not assigned to a group'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-3">
                  {currentGroup && (
                    <Link
                      to={`/admin/groups/${currentGroup.id}`}
                      className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      Edit group →
                    </Link>
                  )}
                  <GroupAssign
                    currentGroupId={room.themeGroupId}
                    groups={groups ?? []}
                    isPending={groupMutation.isPending}
                    onChange={(gid) => groupMutation.mutate(gid)}
                  />
                </div>
              </div>

              <div className="border-t border-gray-800" />

              {/* Tier 3 — Global */}
              <div className={`flex items-center justify-between px-4 py-3.5 ${globalActive ? 'bg-indigo-950/40' : ''}`}>
                <div className="flex items-center gap-3">
                  <TierIndicator active={globalActive} />
                  <div>
                    <p className={`text-sm font-medium ${globalActive ? 'text-white' : 'text-gray-400'}`}>
                      Global Theme
                    </p>
                    <p className="text-xs text-gray-600">
                      {globalActive ? 'Active — fallback for all rooms' : 'Overridden by higher tier'}
                    </p>
                  </div>
                </div>
                <Link
                  to="/admin/theme"
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Edit global →
                </Link>
              </div>

            </div>
          </section>

          {/* ── Active Walk-ups ───────────────────────────────────────────── */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
              Active Walk-ups ({room.activeWalkUps.length})
            </h2>
            {room.activeWalkUps.length === 0 ? (
              <p className="text-sm text-gray-600">No active walk-up bookings.</p>
            ) : (
              <div className="space-y-2">
                {room.activeWalkUps.map((w: WalkUp) => (
                  <div
                    key={w.id}
                    className="flex items-center justify-between rounded-lg border border-yellow-900 bg-yellow-950/20 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-white">{w.title}</p>
                      <p className="text-xs text-gray-500">
                        {fmtTime(w.starts_at)} – {fmtTime(w.ends_at)}
                        {w.created_from_ip ? ` · from ${w.created_from_ip}` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteWalkUp.mutate(w.id)}
                      disabled={deleteWalkUp.isPending}
                      className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Upcoming Events ───────────────────────────────────────────── */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
              Upcoming Events — next 14 days
            </h2>
            {!events && <p className="text-sm text-gray-600">Loading…</p>}
            {events?.length === 0 && (
              <p className="text-sm text-gray-600">No upcoming events in the next 14 days.</p>
            )}
            <div className="space-y-2">
              {events?.map((ev: RoomEvent) => (
                <div
                  key={ev.id}
                  className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-white">{ev.title}</p>
                    <p className="text-xs text-gray-500">
                      {fmtDate(ev.starts_at)} · {fmtTime(ev.starts_at)} – {fmtTime(ev.ends_at)}
                    </p>
                  </div>
                  <span className="text-xs text-gray-600 uppercase">{ev.source}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── Danger Zone ───────────────────────────────────────────────── */}
          <div className="rounded-xl border border-red-900 bg-red-950/20 p-5">
            <h2 className="mb-2 font-semibold text-red-400">Danger Zone</h2>
            <p className="mb-4 text-sm text-gray-400">
              Deleting a room removes all its cached events and walk-up bookings.
            </p>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="rounded-lg border border-red-800 px-4 py-2 text-sm text-red-400 hover:bg-red-900/30"
              >
                Delete Room
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-300">Are you sure?</span>
                <button
                  onClick={() => deleteRoom.mutate()}
                  disabled={deleteRoom.isPending}
                  className="rounded-lg bg-red-700 px-4 py-2 text-sm text-white hover:bg-red-600 disabled:opacity-50"
                >
                  {deleteRoom.isPending ? 'Deleting…' : 'Yes, delete'}
                </button>
                <button onClick={() => setConfirmDelete(false)} className="btn-secondary text-sm">
                  Cancel
                </button>
              </div>
            )}
          </div>

        </div>

        {/* ── Right column — preview + device ─────────────────────────────── */}
        <div className="shrink-0 space-y-4" style={{ width: CARD_W }}>

          {/* Tablet preview */}
          <div
            className="rounded-[24px] p-[2px] shadow-2xl"
            style={{
              background: 'linear-gradient(145deg, #d4d8de 0%, #a8adb5 40%, #8e9299 100%)',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.25) inset, 0 24px 48px rgba(0,0,0,0.65)',
            }}
          >
            <div className="rounded-[22px] bg-gray-950 p-[10px]">
              <div
                className="relative rounded-[8px]"
                style={{ width: CARD_W, height: CARD_H, overflow: 'hidden', transform: 'translateZ(0)' }}
              >
                <iframe
                  src={`/display/${room.slug}?preview=1`}
                  title={room.displayName}
                  tabIndex={-1}
                  className="absolute top-0 left-0 border-none pointer-events-none select-none"
                  style={{
                    width:           IFRAME_W,
                    height:          IFRAME_H,
                    transform:       `scale(${SCALE})`,
                    transformOrigin: 'top left',
                  }}
                />
                {!isOnline && (
                  <div className="absolute inset-0 bg-gray-950/40" />
                )}
              </div>
            </div>
          </div>

          {/* Device status card */}
          <DeviceCard
            activeTablet={activeTablet}
            assignedTablet={assignedTablet}
            isOnline={isOnline}
            hasDevice={hasDevice}
            onGoToDevices={() => navigate('/admin/tablets')}
          />

        </div>

      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function TierIndicator({ active }: { active: boolean }) {
  return (
    <div
      className={`h-2.5 w-2.5 shrink-0 rounded-full transition-colors ${
        active ? 'bg-indigo-400' : 'bg-gray-700'
      }`}
    />
  );
}

interface GroupAssignProps {
  currentGroupId: number | null;
  groups: { id: number; name: string }[];
  isPending: boolean;
  onChange: (gid: number | null) => void;
}

function GroupAssign({ currentGroupId, groups, isPending, onChange }: GroupAssignProps) {
  if (groups.length === 0) return null;

  if (currentGroupId !== null) {
    return (
      <button
        onClick={() => onChange(null)}
        disabled={isPending}
        className="text-xs text-gray-500 hover:text-red-400 transition-colors disabled:opacity-50"
      >
        Remove from group
      </button>
    );
  }

  return (
    <select
      className="rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-300 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
      value=""
      disabled={isPending}
      onChange={(e) => { if (e.target.value) onChange(Number(e.target.value)); }}
    >
      <option value="">Add to group…</option>
      {groups.map((g) => (
        <option key={g.id} value={g.id}>{g.name}</option>
      ))}
    </select>
  );
}

interface DeviceCardProps {
  activeTablet:   Tablet | undefined;
  assignedTablet: Tablet | undefined;
  isOnline:       boolean;
  hasDevice:      boolean;
  onGoToDevices:  () => void;
}

function DeviceCard({ activeTablet, assignedTablet, isOnline, hasDevice, onGoToDevices }: DeviceCardProps) {
  const tablet = activeTablet ?? assignedTablet;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500">Device</h3>
        <button
          onClick={onGoToDevices}
          className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          Manage →
        </button>
      </div>

      {!hasDevice && !isOnline ? (
        <p className="text-sm text-gray-600">No device assigned or connected.</p>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`}
            />
            <span className={`text-sm font-medium ${isOnline ? 'text-emerald-300' : 'text-gray-400'}`}>
              {isOnline ? 'Live' : 'Offline'}
            </span>
          </div>
          {tablet && (
            <>
              {tablet.label && (
                <p className="text-sm text-white">{tablet.label}</p>
              )}
              {tablet.lastIp && (
                <p className="text-xs text-gray-500 font-mono">{tablet.lastIp}</p>
              )}
              {tablet.lastSeenAt && (
                <p className="text-xs text-gray-600">
                  Last seen {new Date(tablet.lastSeenAt).toLocaleString()}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={`text-right max-w-[60%] break-all text-white ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </span>
    </div>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
