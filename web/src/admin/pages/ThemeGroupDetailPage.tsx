import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api, ApiError } from '../api.ts';

export function ThemeGroupDetailPage() {
  const { id }    = useParams<{ id: string }>();
  const groupId   = Number(id);
  const qc        = useQueryClient();
  const navigate  = useNavigate();

  const group = useQuery({
    queryKey: ['theme-group', groupId],
    queryFn:  () => api.getThemeGroup(groupId),
    enabled:  !!groupId,
  });
  const allRooms = useQuery({ queryKey: ['rooms'], queryFn: () => api.getRooms() });

  const [renaming,  setRenaming]  = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [error,     setError]     = useState<string | null>(null);

  const renameMutation = useMutation({
    mutationFn: (name: string) => api.updateThemeGroup(groupId, { name }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['theme-group', groupId] });
      void qc.invalidateQueries({ queryKey: ['theme-groups'] });
      setRenaming(false);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Rename failed.'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteThemeGroup(groupId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['theme-groups'] });
      void qc.invalidateQueries({ queryKey: ['rooms'] });
      navigate('/admin/groups');
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Delete failed.'),
  });

  const assignMutation = useMutation({
    mutationFn: async ({ roomId, assign }: { roomId: number; assign: boolean }) => {
      if (assign) {
        // If the room has a room override active, disable it first so the
        // group tier takes effect cleanly.
        const room = allRooms.data?.find((r) => r.id === roomId);
        if (room?.themeOverrideId !== null && room?.themeOverrideId !== undefined) {
          await api.disableRoomTheme(roomId);
        }
        await api.updateRoom(roomId, { themeGroupId: groupId, themeTier: 'group' });
      } else {
        // Remove from active group tier but keep groupId remembered.
        await api.updateRoom(roomId, { themeTier: 'global' });
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['theme-group', groupId] });
      void qc.invalidateQueries({ queryKey: ['rooms'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to update room.'),
  });

  if (group.isLoading) {
    return <div className="p-8"><p className="text-sm text-gray-500">Loading…</p></div>;
  }
  if (!group.data) {
    return <div className="p-8"><p className="text-sm text-red-400">Group not found.</p></div>;
  }

  const g = group.data;

  // Rooms not actively using this group's theme tier — available to add.
  const unassignedRooms = allRooms.data?.filter(
    (r) => !(r.themeGroupId === groupId && r.themeTier === 'group'),
  ) ?? [];

  const handleDelete = () => {
    if (!confirm(`Delete "${g.name}"? Rooms in this group will become ungrouped.`)) return;
    setError(null);
    deleteMutation.mutate();
  };

  return (
    <div className="max-w-3xl p-8">
      <Link to="/admin/groups" className="mb-4 inline-block text-sm text-indigo-400 hover:text-indigo-300">
        ← Theme Groups
      </Link>

      {error && (
        <div className="mb-4 rounded-lg border border-red-900 bg-red-950/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Group name */}
      <div className="mb-8">
        {renaming ? (
          <form
            onSubmit={(e) => { e.preventDefault(); renameMutation.mutate(nameInput); }}
            className="flex items-center gap-3"
          >
            <input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-xl font-semibold text-white focus:border-indigo-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={renameMutation.isPending || !nameInput.trim()}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setRenaming(false)}
              className="text-sm text-gray-500 hover:text-gray-300"
            >
              Cancel
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-white">{g.name}</h1>
            <button
              onClick={() => { setNameInput(g.name); setRenaming(true); }}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Rename
            </button>
          </div>
        )}
        <p className="mt-1 text-sm text-gray-500">
          {g.rooms.length} room{g.rooms.length !== 1 ? 's' : ''} in this group
        </p>
      </div>

      {/* Theme */}
      <section className="mb-8 rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Theme</h2>
            {g.usingGlobal ? (
              <p className="mt-0.5 text-sm text-gray-500">
                Using the <Link to="/admin/theme" className="text-indigo-400 hover:underline">global theme</Link>.
                Customize to give this group its own look.
              </p>
            ) : (
              <p className="mt-0.5 text-sm text-emerald-500">Custom theme active for this group.</p>
            )}
          </div>
          <Link
            to={`/admin/groups/${groupId}/theme`}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:border-gray-600 hover:text-white transition-colors"
          >
            Edit Theme →
          </Link>
        </div>
      </section>

      {/* Rooms in this group */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-gray-500">
          Rooms in this group
        </h2>

        {g.rooms.length === 0 && (
          <p className="text-sm text-gray-600">No rooms assigned yet. Add rooms below.</p>
        )}

        <div className="space-y-2">
          {g.rooms.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-white">{r.displayName}</p>
                <p className="text-xs text-gray-500">/{r.slug}</p>
              </div>
              <button
                onClick={() => assignMutation.mutate({ roomId: r.id, assign: false })}
                disabled={assignMutation.isPending}
                className="text-xs text-gray-500 hover:text-red-400 transition-colors disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        {/* Add room */}
        {unassignedRooms.length > 0 && (
          <div className="mt-3">
            <select
              defaultValue=""
              onChange={(e) => {
                if (!e.target.value) return;
                assignMutation.mutate({ roomId: Number(e.target.value), assign: true });
                e.target.value = '';
              }}
              className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300 focus:border-indigo-500 focus:outline-none"
            >
              <option value="" disabled>+ Add a room to this group…</option>
              {unassignedRooms.map((r) => {
                let label = r.displayName;
                if (r.themeTier === 'group' && r.themeGroupId !== groupId) {
                  label += ' (in another group)';
                } else if (r.themeTier === 'room') {
                  label += ' (room override active)';
                } else if (r.themeGroupId === groupId) {
                  label += ' (remembered — not active)';
                }
                return <option key={r.id} value={r.id}>{label}</option>;
              })}
            </select>
          </div>
        )}
      </section>

      {/* Danger zone */}
      <section className="rounded-xl border border-red-900 bg-red-950/20 p-5">
        <h3 className="mb-2 font-semibold text-red-400">Delete Group</h3>
        <p className="mb-4 text-sm text-gray-400">
          Deletes the group and its custom theme. Rooms in the group will become ungrouped and
          inherit the global theme (or their own override if they have one).
        </p>
        <button
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
          className="rounded-lg border border-red-800 px-4 py-2 text-sm text-red-400 hover:bg-red-900/30 disabled:opacity-50 transition-colors"
        >
          {deleteMutation.isPending ? 'Deleting…' : 'Delete Group'}
        </button>
      </section>
    </div>
  );
}
