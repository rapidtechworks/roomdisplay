import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api.ts';
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
          <StatusDot status={source.lastSyncStatus} />
          <div>
            <h1 className="text-2xl font-semibold text-white">{source.displayName}</h1>
            <p className="text-sm text-gray-500">{source.type.toUpperCase()} · {source.roomCount ?? 0} room(s)</p>
          </div>
        </div>
        <button onClick={startEdit} className="btn-secondary text-sm">Edit</button>
      </div>

      {/* Info card */}
      <Card className="mb-4">
        <Row label="Last synced"   value={source.lastSyncedAt ? new Date(source.lastSyncedAt).toLocaleString() : 'Never'} />
        <Row label="Sync status"   value={source.lastSyncStatus} valueClass={source.lastSyncStatus === 'ok' ? 'text-emerald-400' : source.lastSyncStatus === 'error' ? 'text-red-400' : 'text-yellow-400'} />
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
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-gray-500">
            Calendars ({calendars.length})
          </h2>
          <div className="space-y-2">
            {calendars.map((cal) => (
              <div
                key={cal.id}
                className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-white">{cal.name}</p>
                  <p className="text-xs text-gray-500 font-mono">{cal.id}</p>
                </div>
                {cal.mappedRoom ? (
                  <Link to={`/admin/rooms/${cal.mappedRoom.id}`} className="text-xs text-indigo-400 hover:text-indigo-300">
                    → {cal.mappedRoom.display_name}
                  </Link>
                ) : (
                  <span className="text-xs text-gray-600">Unmapped</span>
                )}
              </div>
            ))}
          </div>
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
