import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.ts';
import { RoomPreviewCard } from '../components/RoomPreviewCard.tsx';

export function DashboardPage() {
  const navigate = useNavigate();

  const rooms   = useQuery({ queryKey: ['rooms'],   queryFn: () => api.getRooms() });
  const tablets = useQuery({
    queryKey:       ['tablets'],
    queryFn:        () => api.getTablets(),
    refetchInterval: 30_000,
  });
  const sources = useQuery({ queryKey: ['sources'], queryFn: () => api.getSources() });

  const errorSources = sources.data?.filter((s) => s.lastSyncStatus === 'error') ?? [];

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
          <Link
            to="/admin/sources"
            className="text-sm text-red-400 transition-colors hover:text-red-300"
          >
            View →
          </Link>
        </div>
      )}

      {/* Room preview grid */}
      {rooms.isLoading && (
        <p className="text-sm text-gray-500">Loading rooms…</p>
      )}

      {!rooms.isLoading && rooms.data?.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-800 px-6 py-16 text-center">
          <p className="text-sm text-gray-500">No rooms configured yet.</p>
          <Link
            to="/admin/rooms"
            className="mt-2 inline-block text-sm text-indigo-400 hover:text-indigo-300"
          >
            Add a room →
          </Link>
        </div>
      )}

      {rooms.data && rooms.data.length > 0 && (
        <div className="flex flex-wrap gap-6">
          {rooms.data.map((room) => (
            <RoomPreviewCard
              key={room.id}
              room={room}
              tablets={tablets.data ?? []}
              onClick={() => navigate(`/admin/rooms/${room.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
