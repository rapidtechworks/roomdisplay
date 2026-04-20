import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api.ts';
import { Modal, Field, ErrorBox } from './SourcesPage.tsx';

const TZ_OPTIONS = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix',
  'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu',
];

export function RoomsPage() {
  const qc = useQueryClient();

  const { data: rooms,   isLoading: roomsLoading }   = useQuery({ queryKey: ['rooms'],   queryFn: () => api.getRooms() });
  const { data: sources, isLoading: sourcesLoading } = useQuery({ queryKey: ['sources'], queryFn: () => api.getSources() });

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    displayName: '',
    calendarSourceId: 0,
    externalCalendarId: 'default',
    timeZone: 'America/Chicago',
    slug: '',
  });
  const [formError, setFormError] = useState<string | null>(null);

  // When source changes, load its calendars for the externalCalendarId dropdown
  const { data: calendars } = useQuery({
    queryKey: ['source-calendars', form.calendarSourceId],
    queryFn:  () => api.getSourceCalendars(form.calendarSourceId),
    enabled:  form.calendarSourceId > 0,
  });

  const create = useMutation({
    mutationFn: (body: unknown) => api.createRoom(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['rooms'] });
      setShowModal(false);
      setForm({ displayName: '', calendarSourceId: 0, externalCalendarId: 'default', timeZone: 'America/Chicago', slug: '' });
      setFormError(null);
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : 'Failed to create room.'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const body: Record<string, unknown> = {
      displayName:        form.displayName,
      calendarSourceId:   form.calendarSourceId,
      externalCalendarId: form.externalCalendarId,
      timeZone:           form.timeZone,
    };
    if (form.slug.trim()) body['slug'] = form.slug.trim();
    create.mutate(body);
  };

  const isLoading = roomsLoading || sourcesLoading;

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Rooms</h1>
        <button
          onClick={() => setShowModal(true)}
          disabled={!sources?.length}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          + New Room
        </button>
      </div>

      {!sources?.length && !sourcesLoading && (
        <div className="mb-6 rounded-lg border border-yellow-900 bg-yellow-950/20 px-4 py-3 text-sm text-yellow-400">
          Add a calendar source first before creating rooms.{' '}
          <Link to="/admin/sources" className="underline">Go to Sources →</Link>
        </div>
      )}

      {isLoading && <p className="text-sm text-gray-500">Loading…</p>}

      {rooms?.length === 0 && !isLoading && (
        <div className="rounded-lg border border-dashed border-gray-800 px-6 py-12 text-center">
          <p className="text-gray-400">No rooms configured yet.</p>
          <p className="mt-1 text-sm text-gray-600">Each room maps to a calendar and gets its own display URL.</p>
        </div>
      )}

      <div className="space-y-2">
        {rooms?.map((r) => (
          <Link
            key={r.id}
            to={`/admin/rooms/${r.id}`}
            className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 px-4 py-4 transition-colors hover:border-gray-700"
          >
            <div>
              <p className="font-medium text-white">{r.displayName}</p>
              <p className="text-xs text-gray-500">/{r.slug} · {r.timeZone}</p>
            </div>
            <div className="text-right text-xs text-gray-500">
              <p>{r.source.name}</p>
              <p className="text-gray-600 font-mono">{r.externalCalendarId}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Create room modal */}
      {showModal && (
        <Modal title="New Room" onClose={() => { setShowModal(false); setFormError(null); }}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Display Name">
              <input
                required
                className="input"
                placeholder="e.g. Fellowship Hall"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              />
            </Field>

            <Field label="Calendar Source">
              <select
                required
                className="input"
                value={form.calendarSourceId || ''}
                onChange={(e) => setForm({ ...form, calendarSourceId: Number(e.target.value), externalCalendarId: 'default' })}
              >
                <option value="">Select a source…</option>
                {sources?.map((s) => (
                  <option key={s.id} value={s.id}>{s.displayName} ({s.type})</option>
                ))}
              </select>
            </Field>

            <Field label="Calendar ID">
              {calendars && calendars.length > 1 ? (
                <select
                  required
                  className="input"
                  value={form.externalCalendarId}
                  onChange={(e) => setForm({ ...form, externalCalendarId: e.target.value })}
                >
                  {calendars.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.id})</option>
                  ))}
                </select>
              ) : (
                <input
                  required
                  className="input"
                  placeholder="default"
                  value={form.externalCalendarId}
                  onChange={(e) => setForm({ ...form, externalCalendarId: e.target.value })}
                />
              )}
              <p className="mt-1 text-xs text-gray-600">
                For iCal sources use <code className="text-gray-500">default</code>. For PCO, use the resource/room ID.
              </p>
            </Field>

            <Field label="Time Zone">
              <select
                className="input"
                value={form.timeZone}
                onChange={(e) => setForm({ ...form, timeZone: e.target.value })}
              >
                {TZ_OPTIONS.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </Field>

            <Field label="Slug (optional — auto-generated from name)">
              <input
                className="input"
                placeholder="fellowship-hall"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
              />
            </Field>

            {formError && <ErrorBox message={formError} />}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => { setShowModal(false); setFormError(null); }} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={create.isPending} className="btn-primary">
                {create.isPending ? 'Creating…' : 'Create Room'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
