import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type WalkUp, type RoomEvent } from '../api.ts';
import { Modal, Field, ErrorBox } from './SourcesPage.tsx';

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

  // Edit state
  const [editing,      setEditing]      = useState(false);
  const [editName,     setEditName]     = useState('');
  const [editTz,       setEditTz]       = useState('');
  const [editError,    setEditError]    = useState<string | null>(null);

  const startEdit = () => {
    setEditName(room?.displayName ?? '');
    setEditTz(room?.timeZone ?? 'America/Chicago');
    setEditError(null);
    setEditing(true);
  };

  const updateMutation = useMutation({
    mutationFn: () => api.updateRoom(roomId, { displayName: editName, timeZone: editTz }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['room', roomId] });
      void qc.invalidateQueries({ queryKey: ['rooms'] });
      setEditing(false);
    },
    onError: (err) => setEditError(err instanceof ApiError ? err.message : 'Update failed.'),
  });

  // Delete walk-up
  const deleteWalkUp = useMutation({
    mutationFn: (walkupId: number) => api.deleteWalkUp(roomId, walkupId),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['room', roomId] }),
  });

  // Delete room
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteRoom = useMutation({
    mutationFn: () => api.deleteRoom(roomId),
    onSuccess:  () => navigate('/admin/rooms', { replace: true }),
    onError:    (err) => alert(err instanceof ApiError ? err.message : 'Delete failed.'),
  });

  if (isLoading) return <PageShell><p className="text-gray-400">Loading…</p></PageShell>;
  if (isError || !room) return <PageShell><p className="text-red-400">Room not found.</p></PageShell>;

  return (
    <PageShell>
      <Link to="/admin/rooms" className="mb-4 inline-block text-sm text-indigo-400 hover:text-indigo-300">
        ← Rooms
      </Link>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">{room.displayName}</h1>
          <p className="text-sm text-gray-500">/{room.slug} · {room.timeZone}</p>
        </div>
        <button onClick={startEdit} className="btn-secondary text-sm">Edit</button>
      </div>

      {/* Info */}
      <div className="mb-6 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 space-y-2">
        <Row label="Source"      value={room.source.name} />
        <Row label="Calendar ID" value={room.externalCalendarId} mono />
        <Row label="Time zone"   value={room.timeZone} />
        <Row label="Created"     value={new Date(room.createdAt).toLocaleDateString()} />
        <Row label="Display URL" value={`/display/${room.slug}`} mono />
      </div>

      {/* Active walk-ups */}
      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-gray-500">
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

      {/* Upcoming events */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-gray-500">
          Upcoming Events — next 14 days
        </h2>
        {!events && <p className="text-sm text-gray-600">Loading…</p>}
        {events?.length === 0 && <p className="text-sm text-gray-600">No upcoming events in the next 14 days.</p>}
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

      {/* Danger zone */}
      <div className="rounded-xl border border-red-900 bg-red-950/20 p-5">
        <h2 className="mb-2 font-semibold text-red-400">Danger Zone</h2>
        <p className="mb-4 text-sm text-gray-400">
          Deleting a room removes all its cached events and walk-up bookings.
        </p>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="rounded-lg border border-red-800 px-4 py-2 text-sm text-red-400 hover:bg-red-900/30">
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
            <button onClick={() => setConfirmDelete(false)} className="btn-secondary">Cancel</button>
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editing && (
        <Modal title="Edit Room" onClose={() => setEditing(false)}>
          <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(); }} className="space-y-4">
            <Field label="Display Name">
              <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} required />
            </Field>
            <Field label="Time Zone">
              <select className="input" value={editTz} onChange={(e) => setEditTz(e.target.value)}>
                {TZ_OPTIONS.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
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
    </PageShell>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="p-8 max-w-2xl">{children}</div>;
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={`text-right max-w-[60%] break-all text-white ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
