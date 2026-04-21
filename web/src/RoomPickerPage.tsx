import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface Room {
  slug: string;
  displayName: string;
}

export function RoomPickerPage() {
  const navigate = useNavigate();
  const [rooms, setRooms]       = useState<Room[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);

  useEffect(() => {
    fetch('/api/rooms')
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<Room[]>;
      })
      .then((data) => { setRooms(data); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">

      {/* Header */}
      <header className="flex items-center justify-between px-8 py-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Room Display</h1>
          <p className="mt-0.5 text-sm text-gray-400">Select a room to view its schedule</p>
        </div>
        <a
          href="/admin"
          className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-200"
        >
          Admin
        </a>
      </header>

      {/* Content */}
      <main className="px-8 py-4">
        {loading && (
          <p className="text-gray-500">Loading rooms…</p>
        )}

        {error && (
          <div className="rounded-lg border border-red-900 bg-red-950/20 px-4 py-3 text-sm text-red-400">
            Could not load rooms. Is the server running?
          </div>
        )}

        {!loading && !error && rooms.length === 0 && (
          <div className="mt-16 text-center">
            <p className="text-gray-400">No rooms have been configured yet.</p>
            <p className="mt-1 text-sm text-gray-600">
              Go to <a href="/admin" className="text-indigo-400 hover:underline">Admin → Rooms</a> to add one.
            </p>
          </div>
        )}

        {!loading && !error && rooms.length > 0 && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rooms.map((room) => (
              <button
                key={room.slug}
                onClick={() => navigate(`/display/${room.slug}`)}
                className="group relative overflow-hidden rounded-2xl border border-gray-700 bg-gray-800/60 p-8 text-left transition-all duration-200 hover:border-indigo-500 hover:bg-gray-800 hover:shadow-lg hover:shadow-indigo-500/10 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <p className="text-xl font-semibold text-white group-hover:text-indigo-200 transition-colors">
                  {room.displayName}
                </p>
                <p className="mt-1 font-mono text-xs text-gray-500">
                  /display/{room.slug}
                </p>
                <div className="absolute bottom-4 right-4 text-gray-600 transition-colors group-hover:text-indigo-400">
                  →
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
