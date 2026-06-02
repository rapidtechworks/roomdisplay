import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api, ApiError, type ThemeSchedule, type CreateScheduleData } from '../api.ts';

// ─── Day / TZ helpers ─────────────────────────────────────────────────────────

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TZ_OPTIONS = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix',
  'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu',
  'America/Anchorage', 'UTC',
];

function fmtScheduleTime(sched: ThemeSchedule): string {
  const time = sched.endTime
    ? `${sched.startTime} – ${sched.endTime}`
    : `${sched.startTime} onwards`;
  if (sched.recurrenceType === 'weekly') {
    return `Every ${DAY_NAMES[sched.dayOfWeek!] ?? '?'}, ${time}`;
  }
  return `${sched.date ?? '?'}, ${time}`;
}

// ─── Schedule Form ────────────────────────────────────────────────────────────

interface ScheduleFormProps {
  initial?: Partial<ThemeSchedule>;
  themeOptions: { id: number; name: string }[];
  roomOptions:  { id: number; displayName: string }[];
  groupOptions: { id: number; name: string }[];
  onSave: (data: CreateScheduleData) => void;
  onCancel: () => void;
  saving: boolean;
}

function ScheduleForm({ initial, themeOptions, roomOptions, groupOptions, onSave, onCancel, saving }: ScheduleFormProps) {
  const [name,      setName]      = useState(initial?.name ?? '');
  const [themeId,   setThemeId]   = useState<number | ''>(initial?.themeId ?? '');
  const [scopeType, setScopeType] = useState<'global' | 'group' | 'room'>(initial?.scopeType ?? 'global');
  const [scopeId,   setScopeId]   = useState<number | ''>(initial?.scopeId ?? '');
  const [recur,     setRecur]     = useState<'weekly' | 'one_time'>(initial?.recurrenceType ?? 'weekly');
  const [dow,       setDow]       = useState<number | ''>(initial?.dayOfWeek ?? '');
  const [date,      setDate]      = useState(initial?.date ?? '');
  const [startTime, setStartTime] = useState(initial?.startTime ?? '09:00');
  const [endTime,   setEndTime]   = useState(initial?.endTime ?? '12:00');
  const [tz,        setTz]        = useState(initial?.timeZone ?? 'America/Chicago');
  const [enabled,   setEnabled]   = useState(initial?.enabled ?? true);
  const [err,       setErr]       = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!themeId) { setErr('Select a theme.'); return; }
    if (scopeType !== 'global' && !scopeId) { setErr('Select a room or group.'); return; }
    if (recur === 'weekly' && dow === '') { setErr('Select a day of the week.'); return; }
    if (recur === 'one_time' && !date) { setErr('Enter a date.'); return; }

    onSave({
      name:           name.trim(),
      themeId:        Number(themeId),
      scopeType,
      scopeId:        scopeType !== 'global' ? Number(scopeId) : null,
      recurrenceType: recur,
      dayOfWeek:      recur === 'weekly' ? Number(dow) : null,
      date:           recur === 'one_time' ? date : null,
      startTime,
      endTime:        endTime || null,
      timeZone:       tz,
      enabled,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-gray-700 bg-gray-900 p-5">
      <p className="text-sm font-semibold text-white">{initial?.id ? 'Edit Schedule' : 'New Schedule'}</p>

      {err && <p className="text-sm text-red-400">{err}</p>}

      {/* Name */}
      <div>
        <label className="mb-1 block text-xs text-gray-400">Schedule name</label>
        <input
          required
          className="input w-full"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Sunday Morning Service"
        />
      </div>

      {/* Theme + Scope row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-gray-400">Theme</label>
          <select className="input w-full" value={themeId} onChange={(e) => setThemeId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Select theme…</option>
            {themeOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-400">Applies to</label>
          <select className="input w-full" value={scopeType} onChange={(e) => { setScopeType(e.target.value as 'global' | 'group' | 'room'); setScopeId(''); }}>
            <option value="global">All Rooms (Global)</option>
            <option value="group">Specific Group</option>
            <option value="room">Specific Room</option>
          </select>
        </div>
      </div>

      {/* Scope selector */}
      {scopeType === 'group' && (
        <div>
          <label className="mb-1 block text-xs text-gray-400">Group</label>
          <select className="input w-full" value={scopeId} onChange={(e) => setScopeId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Select group…</option>
            {groupOptions.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
      )}
      {scopeType === 'room' && (
        <div>
          <label className="mb-1 block text-xs text-gray-400">Room</label>
          <select className="input w-full" value={scopeId} onChange={(e) => setScopeId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Select room…</option>
            {roomOptions.map((r) => <option key={r.id} value={r.id}>{r.displayName}</option>)}
          </select>
        </div>
      )}

      {/* Recurrence */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-gray-400">Recurrence</label>
          <select className="input w-full" value={recur} onChange={(e) => setRecur(e.target.value as 'weekly' | 'one_time')}>
            <option value="weekly">Weekly (repeating)</option>
            <option value="one_time">One-time</option>
          </select>
        </div>
        {recur === 'weekly' ? (
          <div>
            <label className="mb-1 block text-xs text-gray-400">Day of week</label>
            <select className="input w-full" value={dow} onChange={(e) => setDow(e.target.value !== '' ? Number(e.target.value) : '')}>
              <option value="">Select day…</option>
              {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-xs text-gray-400">Date</label>
            <input type="date" className="input w-full" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        )}
      </div>

      {/* Time window + TZ */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="mb-1 block text-xs text-gray-400">Start time</label>
          <input type="time" className="input w-full" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-400">End time</label>
          <input type="time" className="input w-full" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-400">Timezone</label>
          <select className="input w-full" value={tz} onChange={(e) => setTz(e.target.value)}>
            {TZ_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Enabled */}
      <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-indigo-500"
        />
        Enabled
      </label>

      <div className="flex justify-end gap-3 pt-1">
        <button type="button" onClick={onCancel} className="btn-secondary text-sm">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary text-sm">
          {saving ? 'Saving…' : 'Save Schedule'}
        </button>
      </div>
    </form>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ThemesPage() {
  const qc       = useQueryClient();
  const navigate = useNavigate();

  const globalTheme  = useQuery({ queryKey: ['global-theme'],    queryFn: () => api.getGlobalTheme() });
  const namedThemes  = useQuery({ queryKey: ['named-themes'],    queryFn: () => api.getNamedThemes() });
  const schedules    = useQuery({ queryKey: ['theme-schedules'], queryFn: () => api.getThemeSchedules() });
  const rooms        = useQuery({ queryKey: ['rooms'],           queryFn: () => api.getRooms() });
  const groups       = useQuery({ queryKey: ['theme-groups'],    queryFn: () => api.getThemeGroups() });

  // ── New theme ───────────────────────────────────────────────────────────────
  const [creating,   setCreating]   = useState(false);
  const [newName,    setNewName]    = useState('');
  const [createErr,  setCreateErr]  = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (name: string) => api.createNamedTheme(name),
    onSuccess: (theme) => {
      void qc.invalidateQueries({ queryKey: ['named-themes'] });
      setCreating(false);
      setNewName('');
      navigate(`/admin/themes/${theme.id}`);
    },
    onError: (err) => setCreateErr(err instanceof ApiError ? err.message : 'Failed to create theme.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteNamedTheme(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['named-themes'] }),
    onError: (err) => alert(err instanceof ApiError ? err.message : 'Delete failed.'),
  });

  // ── Schedule CRUD ───────────────────────────────────────────────────────────
  const [addingSched,  setAddingSched]  = useState(false);
  const [editingSched, setEditingSched] = useState<ThemeSchedule | null>(null);

  const createSchedMutation = useMutation({
    mutationFn: (data: CreateScheduleData) => api.createThemeSchedule(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['theme-schedules'] });
      setAddingSched(false);
    },
  });

  const updateSchedMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateScheduleData> }) =>
      api.updateThemeSchedule(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['theme-schedules'] });
      setEditingSched(null);
    },
  });

  const deleteSchedMutation = useMutation({
    mutationFn: (id: number) => api.deleteThemeSchedule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['theme-schedules'] }),
  });

  const toggleSched = (sched: ThemeSchedule) => {
    updateSchedMutation.mutate({ id: sched.id, data: { enabled: !sched.enabled } });
  };

  const themeOptions  = namedThemes.data?.map((t) => ({ id: t.id, name: t.name })) ?? [];
  const roomOptions   = rooms.data?.map((r) => ({ id: r.id, displayName: r.displayName })) ?? [];
  const groupOptions  = groups.data?.map((g) => ({ id: g.id, name: g.name })) ?? [];

  return (
    <div className="p-8 max-w-5xl space-y-12">

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold text-white">Themes</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your theme library, assign themes to rooms and groups, and schedule themes for specific time windows.
        </p>
      </div>

      {/* ── Global Theme ─────────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
          Global Theme
        </h2>
        <div className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 px-5 py-4">
          <div>
            <p className="text-sm font-medium text-white">
              {globalTheme.data?.name ?? 'Global Theme'}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              Default appearance for all rooms. Applied when no other theme is active.
            </p>
          </div>
          <Link
            to="/admin/themes/global"
            className="btn-primary text-sm"
          >
            Edit →
          </Link>
        </div>
      </section>

      {/* ── Theme Library ─────────────────────────────────────────────────────── */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            Theme Library
          </h2>
          <button
            onClick={() => { setCreating(true); setNewName(''); setCreateErr(null); }}
            className="btn-primary text-sm"
          >
            + New Theme
          </button>
        </div>

        {creating && (
          <form
            onSubmit={(e) => { e.preventDefault(); if (newName.trim()) createMutation.mutate(newName.trim()); }}
            className="mb-4 rounded-xl border border-gray-700 bg-gray-900 p-5"
          >
            <p className="mb-3 text-sm font-semibold text-white">New Theme</p>
            {createErr && <p className="mb-2 text-sm text-red-400">{createErr}</p>}
            <div className="flex gap-3">
              <input
                autoFocus
                className="input flex-1"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Sunday Morning, Christmas, Dark Mode"
                required
              />
              <button
                type="submit"
                disabled={createMutation.isPending || !newName.trim()}
                className="btn-primary text-sm"
              >
                {createMutation.isPending ? 'Creating…' : 'Create & Edit'}
              </button>
              <button type="button" onClick={() => setCreating(false)} className="btn-secondary text-sm">
                Cancel
              </button>
            </div>
          </form>
        )}

        {namedThemes.isLoading && <p className="text-sm text-gray-500">Loading…</p>}

        {!namedThemes.isLoading && namedThemes.data?.length === 0 && !creating && (
          <div className="rounded-xl border border-dashed border-gray-800 px-6 py-10 text-center">
            <p className="text-sm text-gray-500">No themes in the library yet.</p>
            <p className="mt-1 text-xs text-gray-600">
              Create named themes and assign them to rooms, groups, or schedules.
            </p>
          </div>
        )}

        <div className="space-y-2">
          {namedThemes.data?.map((theme) => (
            <div
              key={theme.id}
              className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 px-5 py-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">{theme.name}</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {[
                    theme.usedByRooms    > 0 && `${theme.usedByRooms} room${theme.usedByRooms !== 1 ? 's' : ''}`,
                    theme.usedByGroups   > 0 && `${theme.usedByGroups} group${theme.usedByGroups !== 1 ? 's' : ''}`,
                    theme.usedBySchedules > 0 && `${theme.usedBySchedules} schedule${theme.usedBySchedules !== 1 ? 's' : ''}`,
                  ].filter(Boolean).join(' · ') || 'Not assigned to anything'}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-4">
                <Link
                  to={`/admin/themes/${theme.id}`}
                  className="btn-secondary text-xs"
                >
                  Edit →
                </Link>
                <button
                  onClick={() => {
                    if (theme.usedByRooms + theme.usedByGroups + theme.usedBySchedules > 0) {
                      alert('This theme is in use. Unassign it from all rooms, groups, and schedules before deleting.');
                      return;
                    }
                    if (confirm(`Delete "${theme.name}"?`)) deleteMutation.mutate(theme.id);
                  }}
                  disabled={deleteMutation.isPending}
                  className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Schedules ────────────────────────────────────────────────────────── */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              Theme Schedules
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Automatically apply a theme during a time window. Schedules override all other theme settings.
            </p>
          </div>
          <button
            onClick={() => { setAddingSched(true); setEditingSched(null); }}
            className="btn-primary text-sm shrink-0 ml-4"
            disabled={themeOptions.length === 0}
            title={themeOptions.length === 0 ? 'Add a theme to the library first' : undefined}
          >
            + Add Schedule
          </button>
        </div>

        {addingSched && !editingSched && (
          <div className="mb-4">
            <ScheduleForm
              themeOptions={themeOptions}
              roomOptions={roomOptions}
              groupOptions={groupOptions}
              onSave={(data) => createSchedMutation.mutate(data)}
              onCancel={() => setAddingSched(false)}
              saving={createSchedMutation.isPending}
            />
          </div>
        )}

        {schedules.isLoading && <p className="text-sm text-gray-500">Loading…</p>}

        {!schedules.isLoading && schedules.data?.length === 0 && !addingSched && (
          <div className="rounded-xl border border-dashed border-gray-800 px-6 py-10 text-center">
            <p className="text-sm text-gray-500">No schedules yet.</p>
            <p className="mt-1 text-xs text-gray-600">
              Schedules let you automatically switch themes — e.g. Sunday morning or Christmas week.
            </p>
          </div>
        )}

        <div className="space-y-2">
          {schedules.data?.map((sched) => (
            <div key={sched.id}>
              {editingSched?.id === sched.id ? (
                <div className="mb-2">
                  <ScheduleForm
                    initial={sched}
                    themeOptions={themeOptions}
                    roomOptions={roomOptions}
                    groupOptions={groupOptions}
                    onSave={(data) => updateSchedMutation.mutate({ id: sched.id, data })}
                    onCancel={() => setEditingSched(null)}
                    saving={updateSchedMutation.isPending}
                  />
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 px-5 py-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${sched.enabled ? 'bg-emerald-400' : 'bg-gray-600'}`}
                      />
                      <p className="text-sm font-medium text-white">{sched.name}</p>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {fmtScheduleTime(sched)} · {sched.timeZone} ·{' '}
                      <span className="text-gray-400">{sched.themeName}</span>
                      {' → '}
                      <span className="text-gray-400">{sched.scopeName}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    <button
                      onClick={() => toggleSched(sched)}
                      disabled={updateSchedMutation.isPending}
                      className={`text-xs transition-colors ${
                        sched.enabled
                          ? 'text-emerald-400 hover:text-gray-400'
                          : 'text-gray-500 hover:text-emerald-400'
                      }`}
                    >
                      {sched.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                    <button
                      onClick={() => { setEditingSched(sched); setAddingSched(false); }}
                      className="btn-secondary text-xs"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => { if (confirm(`Delete "${sched.name}"?`)) deleteSchedMutation.mutate(sched.id); }}
                      disabled={deleteSchedMutation.isPending}
                      className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
