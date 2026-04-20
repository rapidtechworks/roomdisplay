import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api.ts';

export function DashboardPage() {
  const sources = useQuery({ queryKey: ['sources'], queryFn: () => api.getSources() });
  const rooms   = useQuery({ queryKey: ['rooms'],   queryFn: () => api.getRooms() });

  const errorSources = sources.data?.filter((s) => s.lastSyncStatus === 'error') ?? [];

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-semibold text-white">Dashboard</h1>

      {/* Summary cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Calendar Sources"
          value={sources.data?.length ?? '—'}
          sub={errorSources.length > 0 ? `${errorSources.length} with errors` : 'All syncing OK'}
          subColor={errorSources.length > 0 ? 'text-red-400' : 'text-emerald-400'}
          href="/admin/sources"
        />
        <SummaryCard
          label="Rooms"
          value={rooms.data?.length ?? '—'}
          sub="Configured"
          subColor="text-gray-400"
          href="/admin/rooms"
        />
      </div>

      {/* Sources status */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-500">
            Sync Status
          </h2>
          <Link to="/admin/sources" className="text-sm text-indigo-400 hover:text-indigo-300">
            Manage sources →
          </Link>
        </div>

        {sources.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
        {sources.isError  && <p className="text-sm text-red-400">Failed to load sources.</p>}

        {sources.data && sources.data.length === 0 && (
          <EmptyState
            message="No calendar sources yet."
            action={{ label: 'Add a source', href: '/admin/sources' }}
          />
        )}

        <div className="space-y-2">
          {sources.data?.map((s) => (
            <Link
              key={s.id}
              to={`/admin/sources/${s.id}`}
              className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 px-4 py-3 transition-colors hover:border-gray-700"
            >
              <div className="flex items-center gap-3">
                <StatusDot status={s.lastSyncStatus} />
                <div>
                  <p className="text-sm font-medium text-white">{s.displayName}</p>
                  <p className="text-xs text-gray-500">{s.type.toUpperCase()}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">
                  {s.lastSyncedAt ? `Synced ${formatRelative(s.lastSyncedAt)}` : 'Never synced'}
                </p>
                {s.lastSyncStatus === 'error' && (
                  <p className="mt-0.5 text-xs text-red-400 line-clamp-1">{s.lastSyncError}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Rooms */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-500">Rooms</h2>
          <Link to="/admin/rooms" className="text-sm text-indigo-400 hover:text-indigo-300">
            Manage rooms →
          </Link>
        </div>

        {rooms.isLoading && <p className="text-sm text-gray-500">Loading…</p>}

        {rooms.data && rooms.data.length === 0 && (
          <EmptyState
            message="No rooms configured yet."
            action={{ label: 'Add a room', href: '/admin/rooms' }}
          />
        )}

        <div className="space-y-2">
          {rooms.data?.map((r) => (
            <Link
              key={r.id}
              to={`/admin/rooms/${r.id}`}
              className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 px-4 py-3 transition-colors hover:border-gray-700"
            >
              <div>
                <p className="text-sm font-medium text-white">{r.displayName}</p>
                <p className="text-xs text-gray-500">/{r.slug}</p>
              </div>
              <p className="text-xs text-gray-500">{r.source.name}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({
  label, value, sub, subColor, href,
}: {
  label: string; value: number | string; sub: string; subColor: string; href: string;
}) {
  return (
    <Link
      to={href}
      className="rounded-xl border border-gray-800 bg-gray-900 p-5 transition-colors hover:border-gray-700"
    >
      <p className="text-3xl font-bold text-white">{value}</p>
      <p className="mt-1 text-sm text-gray-400">{label}</p>
      <p className={`mt-1 text-xs ${subColor}`}>{sub}</p>
    </Link>
  );
}

function StatusDot({ status }: { status: 'ok' | 'error' | 'pending' }) {
  const color =
    status === 'ok'      ? 'bg-emerald-500' :
    status === 'error'   ? 'bg-red-500'     :
                           'bg-yellow-500';
  return <span className={`h-2 w-2 rounded-full ${color} shrink-0`} />;
}

function EmptyState({ message, action }: { message: string; action: { label: string; href: string } }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-800 px-6 py-8 text-center">
      <p className="text-sm text-gray-500">{message}</p>
      <Link to={action.href} className="mt-2 inline-block text-sm text-indigo-400 hover:text-indigo-300">
        {action.label}
      </Link>
    </div>
  );
}

function formatRelative(iso: string): string {
  const diffMs  = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1)  return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24)  return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}
