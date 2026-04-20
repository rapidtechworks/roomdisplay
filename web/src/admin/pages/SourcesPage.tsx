import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api.ts';

type SourceType = 'ical' | 'pco';

interface IcalForm { displayName: string; url: string; pollIntervalSeconds: number }
interface PcoForm  { displayName: string; clientId: string; secret: string; pollIntervalSeconds: number }

const DEFAULT_ICAL: IcalForm = { displayName: '', url: '', pollIntervalSeconds: 300 };
const DEFAULT_PCO:  PcoForm  = { displayName: '', clientId: '', secret: '', pollIntervalSeconds: 120 };

export function SourcesPage() {
  const qc = useQueryClient();
  const { data: sources, isLoading, isError } = useQuery({
    queryKey: ['sources'],
    queryFn:  () => api.getSources(),
  });

  const [showModal, setShowModal] = useState(false);
  const [type, setType]           = useState<SourceType>('ical');
  const [icalForm, setIcal]       = useState<IcalForm>(DEFAULT_ICAL);
  const [pcoForm,  setPco]        = useState<PcoForm>(DEFAULT_PCO);
  const [formError, setFormError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (body: unknown) => api.createSource(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sources'] });
      setShowModal(false);
      setIcal(DEFAULT_ICAL);
      setPco(DEFAULT_PCO);
      setFormError(null);
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? err.message : 'Failed to create source.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (type === 'ical') {
      create.mutate({
        type: 'ical',
        displayName: icalForm.displayName,
        credentials: { url: icalForm.url, httpAuth: null },
        pollIntervalSeconds: icalForm.pollIntervalSeconds,
      });
    } else {
      create.mutate({
        type: 'pco',
        displayName: pcoForm.displayName,
        credentials: { authType: 'pat', clientId: pcoForm.clientId, secret: pcoForm.secret },
        pollIntervalSeconds: pcoForm.pollIntervalSeconds,
      });
    }
  };

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Calendar Sources</h1>
        <button
          onClick={() => setShowModal(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          + New Source
        </button>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading…</p>}
      {isError   && <p className="text-sm text-red-400">Failed to load sources.</p>}

      {sources?.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-800 px-6 py-12 text-center">
          <p className="text-gray-400">No calendar sources yet.</p>
          <p className="mt-1 text-sm text-gray-600">Add an iCal URL or Planning Center Online connection.</p>
        </div>
      )}

      <div className="space-y-2">
        {sources?.map((s) => (
          <Link
            key={s.id}
            to={`/admin/sources/${s.id}`}
            className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 px-4 py-4 transition-colors hover:border-gray-700"
          >
            <div className="flex items-center gap-3">
              <StatusDot status={s.lastSyncStatus} />
              <div>
                <p className="font-medium text-white">{s.displayName}</p>
                <p className="text-xs text-gray-500">
                  {s.type.toUpperCase()} · {s.roomCount ?? 0} room{(s.roomCount ?? 0) !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <div className="text-right text-xs text-gray-500">
              {s.lastSyncedAt ? formatRelative(s.lastSyncedAt) : 'Never synced'}
              {s.lastSyncStatus === 'error' && (
                <p className="mt-0.5 text-red-400 line-clamp-1 max-w-[200px]">{s.lastSyncError}</p>
              )}
            </div>
          </Link>
        ))}
      </div>

      {/* ── Create source modal ───────────────────────────────── */}
      {showModal && (
        <Modal title="New Calendar Source" onClose={() => { setShowModal(false); setFormError(null); }}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Type selector */}
            <div>
              <label className="label">Source Type</label>
              <div className="flex gap-2">
                {(['ical', 'pco'] as SourceType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                      type === t
                        ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300'
                        : 'border-gray-700 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    {t === 'ical' ? 'iCal URL' : 'Planning Center'}
                  </button>
                ))}
              </div>
            </div>

            {/* Display name */}
            <Field label="Display Name">
              <input
                required
                className="input"
                placeholder="e.g. Main Campus Calendar"
                value={type === 'ical' ? icalForm.displayName : pcoForm.displayName}
                onChange={(e) => type === 'ical'
                  ? setIcal({ ...icalForm, displayName: e.target.value })
                  : setPco({ ...pcoForm,  displayName: e.target.value })
                }
              />
            </Field>

            {type === 'ical' ? (
              <>
                <Field label="iCal URL">
                  <input
                    required
                    type="url"
                    className="input"
                    placeholder="https://calendar.google.com/calendar/ical/…"
                    value={icalForm.url}
                    onChange={(e) => setIcal({ ...icalForm, url: e.target.value })}
                  />
                </Field>
                <Field label="Poll Interval (seconds)">
                  <input
                    required
                    type="number"
                    min={60}
                    max={3600}
                    className="input"
                    value={icalForm.pollIntervalSeconds}
                    onChange={(e) => setIcal({ ...icalForm, pollIntervalSeconds: Number(e.target.value) })}
                  />
                </Field>
              </>
            ) : (
              <>
                <Field label="Application ID (Client ID)">
                  <input
                    required
                    className="input"
                    value={pcoForm.clientId}
                    onChange={(e) => setPco({ ...pcoForm, clientId: e.target.value })}
                  />
                </Field>
                <Field label="Secret">
                  <input
                    required
                    type="password"
                    className="input"
                    value={pcoForm.secret}
                    onChange={(e) => setPco({ ...pcoForm, secret: e.target.value })}
                  />
                </Field>
                <Field label="Poll Interval (seconds)">
                  <input
                    required
                    type="number"
                    min={60}
                    max={900}
                    className="input"
                    value={pcoForm.pollIntervalSeconds}
                    onChange={(e) => setPco({ ...pcoForm, pollIntervalSeconds: Number(e.target.value) })}
                  />
                </Field>
              </>
            )}

            {formError && <ErrorBox message={formError} />}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setShowModal(false); setFormError(null); }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" disabled={create.isPending} className="btn-primary">
                {create.isPending ? 'Testing connection…' : 'Create Source'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ─── Shared primitives ────────────────────────────────────────────────────────

export function StatusDot({ status }: { status: 'ok' | 'error' | 'pending' }) {
  const color =
    status === 'ok'    ? 'bg-emerald-500' :
    status === 'error' ? 'bg-red-500'     :
                         'bg-yellow-500';
  return <span className={`inline-block h-2 w-2 rounded-full ${color} shrink-0`} />;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
          <h2 className="font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">✕</button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-300">{label}</label>
      {children}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-400">{message}</p>
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
