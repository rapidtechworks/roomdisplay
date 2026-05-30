import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api, ApiError } from '../api.ts';

export function ThemeGroupsPage() {
  const qc     = useQueryClient();
  const groups = useQuery({ queryKey: ['theme-groups'], queryFn: () => api.getThemeGroups() });

  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (name: string) => api.createThemeGroup(name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['theme-groups'] });
      setNewName('');
      setCreating(false);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Failed to create group.');
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setError(null);
    createMutation.mutate(newName.trim());
  };

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Theme Groups</h1>
          <p className="mt-1 text-sm text-gray-500">
            Group rooms together to share a theme between the global default and individual overrides.
          </p>
        </div>
        <button
          onClick={() => { setCreating(true); setError(null); }}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
        >
          + New Group
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <form onSubmit={handleCreate} className="mb-6 rounded-xl border border-gray-700 bg-gray-900 p-5">
          <p className="mb-3 text-sm font-medium text-white">New Theme Group</p>
          {error && (
            <p className="mb-3 text-sm text-red-400">{error}</p>
          )}
          <div className="flex gap-3">
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Youth Wing, Main Building"
              className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={createMutation.isPending || !newName.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              {createMutation.isPending ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => { setCreating(false); setError(null); setNewName(''); }}
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {groups.isLoading && <p className="text-sm text-gray-500">Loading…</p>}

      {!groups.isLoading && groups.data?.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-800 px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No theme groups yet.</p>
          <p className="mt-1 text-xs text-gray-600">
            Create a group to share a theme across multiple rooms.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {groups.data?.map((g) => (
          <Link
            key={g.id}
            to={`/admin/groups/${g.id}`}
            className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 px-5 py-4 transition-colors hover:border-gray-700"
          >
            <div className="flex items-center gap-3">
              {/* Theme indicator */}
              <div
                className={`h-3 w-3 rounded-full shrink-0 ${g.usingGlobal ? 'bg-gray-600' : 'bg-indigo-500'}`}
                title={g.usingGlobal ? 'Using global theme' : 'Custom theme'}
              />
              <div>
                <p className="text-sm font-medium text-white">{g.name}</p>
                <p className="text-xs text-gray-500">
                  {g.roomCount} room{g.roomCount !== 1 ? 's' : ''} ·{' '}
                  {g.usingGlobal ? 'Using global theme' : 'Custom theme'}
                </p>
              </div>
            </div>
            <span className="text-xs text-gray-600">Edit →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
