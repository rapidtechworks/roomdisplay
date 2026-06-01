import { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type SourceEvent } from '../api.ts';
import { StatusDot, Modal, Field, ErrorBox } from './SourcesPage.tsx';

export function SourceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const sourceId = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: source, isLoading, isError } = useQuery({
    queryKey: ['source', sourceId],
    queryFn:  () => api.getSource(sourceId),
  });

  const { data: calendars } = useQuery({
    queryKey: ['source-calendars', sourceId],
    queryFn:  () => api.getSourceCalendars(sourceId),
    enabled:  !!source,
  });

  const { data: sourceEvents } = useQuery({
    queryKey: ['source-events', sourceId],
    queryFn:  () => api.getSourceEvents(sourceId, 14),
    enabled:  !!source,
  });

  // Edit state
  const [editName,     setEditName]     = useState('');
  const [editInterval, setEditInterval] = useState(0);
  const [editError,    setEditError]    = useState<string | null>(null);
  const [editing,      setEditing]      = useState(false);

  const startEdit = () => {
    setEditName(source?.displayName ?? '');
    setEditInterval(source?.pollIntervalSeconds ?? 300);
    setEditError(null);
    setEditing(true);
  };

  const updateMutation = useMutation({
    mutationFn: () => api.updateSource(sourceId, {
      displayName: editName,
      pollIntervalSeconds: editInterval,
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['source', sourceId] });
      void qc.invalidateQueries({ queryKey: ['sources'] });
      setEditing(false);
    },
    onError: (err) => setEditError(err instanceof ApiError ? err.message : 'Update failed.'),
  });

  // Credentials update
  const [showCredsModal, setShowCredsModal] = useState(false);
  const [newUrl,         setNewUrl]         = useState('');
  const [credsError,     setCredsError]     = useState<string | null>(null);

  const updateCreds = useMutation({
    mutationFn: () => api.updateSource(sourceId, {
      credentials: { url: newUrl, httpAuth: null },
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['source', sourceId] });
      setShowCredsModal(false);
      setNewUrl('');
      setCredsError(null);
    },
    onError: (err) => setCredsError(err instanceof ApiError ? err.message : 'Update failed.'),
  });

  // Test + Sync
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const testMutation = useMutation({
    mutationFn: () => api.testSource(sourceId),
    onSuccess:  (r) => setTestResult(r),
    onError:    (err) => setTestResult({ ok: false, message: err instanceof ApiError ? err.message : 'Test failed.' }),
  });

  const [syncResult, setSyncResult] = useState<string | null>(null);
  const syncMutation = useMutation({
    mutationFn: () => api.syncSource(sourceId),
    onSuccess: (r) => {
      setSyncResult(`${r.status === 'ok' ? '✓' : '✗'} ${r.message} — ${r.eventsUpserted} events upserted`);
      void qc.invalidateQueries({ queryKey: ['source', sourceId] });
      void qc.invalidateQueries({ queryKey: ['sources'] });
      void qc.invalidateQueries({ queryKey: ['source-events', sourceId] });
    },
    onError: (err) => setSyncResult(`✗ ${err instanceof ApiError ? err.message : 'Sync failed.'}`),
  });

  // Delete
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteMutation = useMutation({
    mutationFn: () => api.deleteSource(sourceId),
    onSuccess:  () => navigate('/admin/sources', { replace: true }),
    onError:    (err) => alert(err instanceof ApiError ? err.message : 'Delete failed.'),
  });

  // Collapsed rooms in the event panel
  const [collapsedRooms, setCollapsedRooms] = useState<Set<number>>(new Set());
  const toggleRoom = (roomId: number) => {
    setCollapsedRooms((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId); else next.add(roomId);
      return next;
    });
  };

  // Group events by room
  const eventsByRoom = useMemo(() => {
    if (!sourceEvents) return [];
    const map = new Map<number, { roomName: string; roomSlug: string; events: SourceEvent[] }>();
    for (const ev of sourceEvents) {
      if (!map.has(ev.room_id)) {
        map.set(ev.room_id, { roomName: ev.room_name, roomSlug: ev.room_slug, events: [] });
      }
      map.get(ev.room_id)!.events.push(ev);
    }
    return Array.from(map.entries()).map(([roomId, data]) => ({ roomId, ...data }));
  }, [sourceEvents]);

  // Event counts per room (for calendar-level display)
  const eventCountByRoomId = useMemo(() => {
    const m = new Map<number, number>();
    for (const group of eventsByRoom) {
      m.set(group.roomId, group.events.length);
    }
    return m;
  }, [eventsByRoom]);

  // Stale detection
  const stale = source
    ? source.lastSyncStatus === 'ok'
      && !!source.lastSyncedAt
      && (Date.now() - new Date(source.lastSyncedAt).getTime()) > 2 * source.pollIntervalSeconds * 1000
    : false;

  const effectiveStatus = source
    ? (stale ? 'stale' : source.lastSyncStatus) as 'ok' | 'error' | 'pending' | 'stale'
    : 'pending';

  // Unmapped calendar count
  const unmappedCount = calendars ? calendars.filter((c) => !c.mappedRoom).length : 0;

  if (isLoading) return <PageShell><p className="text-gray-400">Loading…</p></PageShell>;
  if (isError || !source) return <PageShell><p className="text-red-400">Source not found.</p></PageShell>;

  return (
    <PageShell>
      {/* Back */}
      <Link to="/admin/sources" className="mb-4 inline-block text-sm text-indigo-400 hover:text-indigo-300">
        ← Sources
      </Link>

      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <StatusDot status={effectiveStatus} />
          <div>
            <h1 className="text-2xl font-semibold text-white">{source.displayName}</h1>
            <p className="text-sm text-gray-500">
              {source.type.toUpperCase()} · {source.roomCount ?? 0} room(s)
              {source.upcomingEventCount > 0 && (
                <span className="ml-2 text-indigo-400">{source.upcomingEventCount} events in next 14 days</span>
              )}
            </p>
          </div>
        </div>
        <button onClick={startEdit} className="btn-secondary text-sm">Edit</button>
      </div>

      {/* Stale sync warning */}
      {stale && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-800 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
          <span className="mt-0.5 shrink-0">⚠</span>
          <span>
            Sync is overdue — last synced {formatRelative(source.lastSyncedAt!)} but expected every{' '}
            {formatInterval(source.pollIntervalSeconds)}. Click <strong>Sync Now</strong> or check for scheduler issues.
          </span>
        </div>
      )}

      {/* Info card */}
      <Card className="mb-4">
        <Row label="Last synced"   value={source.lastSyncedAt ? new Date(source.lastSyncedAt).toLocaleString() : 'Never'} />
        <Row label="Sync status"   value={effectiveStatus} valueClass={effectiveStatus === 'ok' ? 'text-emerald-400' : effectiveStatus === 'error' ? 'text-red-400' : effectiveStatus === 'stale' ? 'text-amber-400' : 'text-yellow-400'} />
        {source.lastSyncError && <Row label="Last error" value={source.lastSyncError} valueClass="text-red-400" />}
        <Row label="Poll interval" value={`${source.pollIntervalSeconds}s`} />
        <Row label="Credentials"   value={source.credentials.url ? '••••••••' : `${source.credentials.authType as string} / ${source.credentials.clientId as string}`} />
      </Card>

      {/* Actions */}
      <div className="mb-6 flex flex-wrap gap-3">
        <button
          onClick={() => { setTestResult(null); testMutation.mutate(); }}
          disabled={testMutation.isPending}
          className="btn-secondary"
        >
          {testMutation.isPending ? 'Testing…' : 'Test Connection'}
        </button>
        <button
          onClick={() => { setSyncResult(null); syncMutation.mutate(); }}
          disabled={syncMutation.isPending}
          className="btn-secondary"
        >
          {syncMutation.isPending ? 'Syncing…' : 'Sync Now'}
        </button>
        {source.type === 'ical' && (
          <button onClick={() => setShowCredsModal(true)} className="btn-secondary">
            Update URL
          </button>
        )}
      </div>

      {testResult && (
        <p className={`mb-4 text-sm ${testResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
          {testResult.ok ? '✓' : '✗'} {testResult.message}
        </p>
      )}
      {syncResult && (
        <p className={`mb-4 text-sm ${syncResult.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>
          {syncResult}
        </p>
      )}

      {/* Calendars */}
      {calendars && (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-gray-500">
            Calendars ({calendars.length})
          </h2>

          {unmappedCount > 0 && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-800 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
              <span className="mt-0.5 shrink-0">⚠</span>
              <span>
                {unmappedCount} calendar{unmappedCount !== 1 ? 's are' : ' is'} not mapped to any room —
                events from {unmappedCount !== 1 ? 'these calendars' : 'this calendar'} will not appear on any display.
                Go to <Link to="/admin/rooms" className="underline hover:text-amber-200">Rooms</Link> to create and map them.
              </span>
            </div>
          )}

          <div className="space-y-2">
            {calendars.map((cal) => {
              const eventCount = cal.mappedRoom ? (eventCountByRoomId.get(cal.mappedRoom.id) ?? 0) : 0;
              return (
                <div
                  key={cal.id}
                  className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{cal.name}</p>
                    <p className="text-xs text-gray-500 font-mono truncate">{cal.id}</p>
                  </div>
                  <div className="flex items-center gap-3 pl-4 shrink-0">
                    {cal.mappedRoom ? (
                      <>
                        {eventCount > 0 && (
                          <span className="text-xs text-indigo-400">{eventCount} event{eventCount !== 1 ? 's' : ''}</span>
                        )}
                        {eventCount === 0 && (
                          <span className="text-xs text-gray-600">0 events</span>
                        )}
                        <Link to={`/admin/rooms/${cal.mappedRoom.id}`} className="text-xs text-indigo-400 hover:text-indigo-300">
                          → {cal.mappedRoom.display_name}
                        </Link>
                      </>
                    ) : (
                      <span className="text-xs text-amber-500">Unmapped</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Upcoming events panel */}
      {sourceEvents !== undefined && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-gray-500">
            Upcoming Events — Next 14 Days ({sourceEvents.length})
          </h2>

          {sourceEvents.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-800 px-6 py-8 text-center">
              <p className="text-sm text-gray-500">No events in the next 14 days.</p>
              <p className="mt-1 text-xs text-gray-600">Sync the source or check that rooms are mapped.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {eventsByRoom.map(({ roomId, roomName, roomSlug, events }) => {
                const collapsed = collapsedRooms.has(roomId);
                return (
                  <div key={roomId} className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden">
                    <button
                      onClick={() => toggleRoom(roomId)}
                      className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">{roomName}</span>
                        <Link
                          to={`/admin/rooms/${roomId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-indigo-400 hover:text-indigo-300"
                        >
                          /rooms/{roomSlug}
                        </Link>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500">{events.length} event{events.length !== 1 ? 's' : ''}</span>
                        <span className="text-xs text-gray-600">{collapsed ? '▶' : '▼'}</span>
                      </div>
                    </button>

                    {!collapsed && (
                      <div className="border-t border-gray-800 divide-y divide-gray-800/60">
                        {events.map((ev) => (
                          <div key={ev.event_id} className="flex items-center justify-between px-4 py-2.5">
                            <span className="text-sm text-white truncate max-w-[55%]">{ev.title}</span>
                            <span className="text-xs text-gray-500 text-right pl-2 shrink-0">
                              {formatEventTime(ev.starts_at, ev.ends_at)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Danger zone */}
      <div className="rounded-xl border border-red-900 bg-red-950/20 p-5">
        <h2 className="mb-2 font-semibold text-red-400">Danger Zone</h2>
        <p className="mb-4 text-sm text-gray-400">
          Deleting a source removes all synced events. Rooms must be remapped first.
        </p>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="rounded-lg border border-red-800 px-4 py-2 text-sm text-red-400 hover:bg-red-900/30">
            Delete Source
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-300">Are you sure?</span>
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="rounded-lg bg-red-700 px-4 py-2 text-sm text-white hover:bg-red-600 disabled:opacity-50"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Yes, delete'}
            </button>
            <button onClick={() => setConfirmDelete(false)} className="btn-secondary">Cancel</button>
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editing && (
        <Modal title="Edit Source" onClose={() => setEditing(false)}>
          <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(); }} className="space-y-4">
            <Field label="Display Name">
              <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} required />
            </Field>
            <Field label="Poll Interval (seconds)">
              <input className="input" type="number" min={60} max={3600} value={editInterval} onChange={(e) => setEditInterval(Number(e.target.value))} required />
            </Field>
            {editError && <ErrorBox message={editError} />}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setEditing(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={updateMutation.isPending} className="btn-primary">
                {updateMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Update credentials modal */}
      {showCredsModal && (
        <Modal title="Update iCal URL" onClose={() => { setShowCredsModal(false); setCredsError(null); }}>
          <form onSubmit={(e) => { e.preventDefault(); updateCreds.mutate(); }} className="space-y-4">
            <Field label="New iCal URL">
              <input className="input" type="url" required value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://…" />
            </Field>
            {credsError && <ErrorBox message={credsError} />}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowCredsModal(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={updateCreds.isPending} className="btn-primary">
                {updateCreds.isPending ? 'Testing & saving…' : 'Update URL'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </PageShell>
  );
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="p-8 max-w-2xl">{children}</div>;
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 space-y-2 ${className}`}>
      {children}
    </div>
  );
}

function Row({ label, value, valueClass = 'text-white' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={`text-right max-w-[60%] break-all ${valueClass}`}>{value}</span>
    </div>
  );
}

function formatRelative(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1)  return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24)  return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function formatInterval(seconds: number): string {
  if (seconds < 120) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

function formatEventTime(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end   = new Date(endsAt);
  const date  = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const s     = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const e     = end.toLocaleTimeString('en-US',   { hour: 'numeric', minute: '2-digit' });
  return `${date}, ${s} – ${e}`;
}
