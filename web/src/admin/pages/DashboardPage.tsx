import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.ts';
import { RoomPreviewCard } from '../components/RoomPreviewCard.tsx';

export function DashboardPage() {
  const navigate = useNavigate();

  const rooms   = useQuery({ queryKey: ['rooms'],        queryFn: () => api.getRooms() });
  const groups  = useQuery({ queryKey: ['theme-groups'], queryFn: () => api.getThemeGroups() });
  const tablets = useQuery({
    queryKey:        ['tablets'],
    queryFn:         () => api.getTablets(),
    refetchInterval: 30_000,
  });
  const sources = useQuery({ queryKey: ['sources'], queryFn: () => api.getSources() });

  const errorSources = sources.data?.filter((s) => s.lastSyncStatus === 'error') ?? [];

  // Organise rooms: keyed by group id, plus an ungrouped bucket
  const roomsByGroup = new Map<number, typeof rooms.data>() ;
  const ungrouped: typeof rooms.data = [];

  for (const room of rooms.data ?? []) {
    if (room.themeGroupId !== null && room.themeGroupId !== undefined) {
      const bucket = roomsByGroup.get(room.themeGroupId) ?? [];
      bucket.push(room);
      roomsByGroup.set(room.themeGroupId, bucket);
    } else {
      ungrouped.push(room);
    }
  }

  const allRoomsEmpty = (rooms.data?.length ?? 0) === 0;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
        <Link
          to="/admin/rooms"
          className="text-sm text-indigo-400 transition-colors hover:text-indigo-300"
        >
          + Add room
        </Link>
      </div>

      {/* Sync error banner */}
      {errorSources.length > 0 && (
        <div className="mb-6 flex items-center justify-between rounded-lg border border-red-900 bg-red-950/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            <p className="text-sm text-red-300">
              {errorSources.length} calendar source{errorSources.length > 1 ? 's' : ''} with sync errors
            </p>
          </div>
          <Link to="/admin/sources" className="text-sm text-red-400 transition-colors hover:text-red-300">
            View →
          </Link>
        </div>
      )}

      {rooms.isLoading && <p className="text-sm text-gray-500">Loading rooms…</p>}

      {!rooms.isLoading && allRoomsEmpty && (
        <div className="rounded-lg border border-dashed border-gray-800 px-6 py-16 text-center">
          <p className="text-sm text-gray-500">No rooms configured yet.</p>
          <Link to="/admin/rooms" className="mt-2 inline-block text-sm text-indigo-400 hover:text-indigo-300">
            Add a room →
          </Link>
        </div>
      )}

      {!allRoomsEmpty && (
        <div className="space-y-6">

          {/* Grouped sections */}
          {groups.data?.map((group) => {
            const groupRooms = roomsByGroup.get(group.id) ?? [];
            if (groupRooms.length === 0) return null;
            return (
              <div
                key={group.id}
                className="rounded-2xl border border-gray-700/50 bg-gray-900/50 p-5"
              >
                {/* Group header */}
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                        group.usingGlobal ? 'bg-gray-600' : 'bg-indigo-500'
                      }`}
                    />
                    <h2 className="text-sm font-semibold text-gray-200">{group.name}</h2>
                    <span className="text-xs text-gray-600">
                      {group.usingGlobal ? 'Global theme' : 'Custom theme'}
                    </span>
                  </div>
                  <Link
                    to={`/admin/groups/${group.id}`}
                    className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    Edit group →
                  </Link>
                </div>

                {/* Preview cards */}
                <div className="flex flex-wrap gap-5">
                  {groupRooms.map((room) => (
                    <RoomPreviewCard
                      key={room.id}
                      room={room}
                      tablets={tablets.data ?? []}
                      onClick={() => navigate(`/admin/rooms/${room.id}`)}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Ungrouped rooms */}
          {ungrouped.length > 0 && (
            <div>
              {(groups.data?.length ?? 0) > 0 && (
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-600">
                  Ungrouped
                </p>
              )}
              <div className="flex flex-wrap gap-6">
                {ungrouped.map((room) => (
                  <RoomPreviewCard
                    key={room.id}
                    room={room}
                    tablets={tablets.data ?? []}
                    onClick={() => navigate(`/admin/rooms/${room.id}`)}
                  />
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
