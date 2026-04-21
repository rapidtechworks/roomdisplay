import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.ts';
import type { Tablet } from '../api.ts';

// ─── Relative time helper ─────────────────────────────────────────────────────

function relativeTime(isoString: string | null): string {
  if (!isoString) return 'Never';
  const diffMs = Date.now() - new Date(isoString).getTime();
  const secs   = Math.floor(diffMs / 1000);
  if (secs < 60)         return 'Just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60)         return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24)        return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Inline label editor ──────────────────────────────────────────────────────

interface LabelCellProps {
  tablet: Tablet;
  onSave: (uuid: string, label: string | null) => void;
  isSaving: boolean;
}

function LabelCell({ tablet, onSave, isSaving }: LabelCellProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue]     = useState(tablet.label ?? '');
  const inputRef              = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setValue(tablet.label ?? '');
    setEditing(true);
    // Focus after render
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const commit = () => {
    setEditing(false);
    const trimmed = value.trim();
    const next    = trimmed === '' ? null : trimmed;
    if (next !== tablet.label) {
      onSave(tablet.tabletUuid, next);
    }
  };

  const cancel = () => {
    setValue(tablet.label ?? '');
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="w-full rounded border border-indigo-500 bg-gray-800 px-2 py-0.5 text-sm text-gray-100 outline-none focus:ring-1 focus:ring-indigo-500"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') cancel();
        }}
        disabled={isSaving}
        placeholder="Add label…"
      />
    );
  }

  return (
    <button
      onClick={startEdit}
      className="group flex items-center gap-1.5 text-left"
      title="Click to edit label"
    >
      {tablet.label ? (
        <span className="text-sm text-gray-100">{tablet.label}</span>
      ) : (
        <span className="text-sm text-gray-600 italic">No label</span>
      )}
      <span className="text-xs text-gray-600 opacity-0 transition-opacity group-hover:opacity-100">
        ✎
      </span>
    </button>
  );
}

// ─── Truncated UUID display ───────────────────────────────────────────────────

function ShortUuid({ uuid }: { uuid: string }) {
  return (
    <span className="font-mono text-xs text-gray-500" title={uuid}>
      {uuid.slice(0, 8)}…
    </span>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function TabletsPage() {
  const qc = useQueryClient();

  const { data: tablets, isLoading, error } = useQuery({
    queryKey: ['tablets'],
    queryFn:  () => api.getTablets(),
    refetchInterval: 15_000,
  });

  const updateLabel = useMutation({
    mutationFn: ({ uuid, label }: { uuid: string; label: string | null }) =>
      api.updateTablet(uuid, { label }),
    onMutate: async ({ uuid, label }) => {
      // Optimistic update
      await qc.cancelQueries({ queryKey: ['tablets'] });
      const prev = qc.getQueryData<Tablet[]>(['tablets']);
      qc.setQueryData<Tablet[]>(['tablets'], (old) =>
        old?.map((t) => t.tabletUuid === uuid ? { ...t, label } : t),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['tablets'], ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['tablets'] });
    },
  });

  const handleSaveLabel = (uuid: string, label: string | null) => {
    updateLabel.mutate({ uuid, label });
  };

  // ── Loading / error states ─────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="p-8">
        <h1 className="mb-6 text-2xl font-semibold text-white">Tablets</h1>
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <h1 className="mb-6 text-2xl font-semibold text-white">Tablets</h1>
        <div className="rounded-lg border border-red-900 bg-red-950/20 px-4 py-3 text-sm text-red-400">
          Failed to load tablets. Please refresh.
        </div>
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────────

  if (!tablets || tablets.length === 0) {
    return (
      <div className="p-8">
        <h1 className="mb-6 text-2xl font-semibold text-white">Tablets</h1>
        <div className="rounded-lg border border-dashed border-gray-800 px-6 py-12 text-center">
          <p className="text-gray-400">No tablets have connected yet.</p>
          <p className="mt-1 text-sm text-gray-600">
            Open <code className="text-gray-500">/display/&lt;slug&gt;</code> on a tablet to register it.
          </p>
        </div>
      </div>
    );
  }

  // ── Online summary ─────────────────────────────────────────────────────────

  const onlineCount = tablets.filter((t) => t.online).length;

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Tablets</h1>
        <span className="text-sm text-gray-500">
          {onlineCount} of {tablets.length} online
        </span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-gray-800 bg-gray-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left">
              <th className="px-4 py-3 font-medium text-gray-400">Status</th>
              <th className="px-4 py-3 font-medium text-gray-400">Label</th>
              <th className="px-4 py-3 font-medium text-gray-400">UUID</th>
              <th className="px-4 py-3 font-medium text-gray-400">Room</th>
              <th className="px-4 py-3 font-medium text-gray-400">Last Seen</th>
              <th className="px-4 py-3 font-medium text-gray-400">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {tablets.map((tablet) => (
              <tr key={tablet.tabletUuid} className="transition-colors hover:bg-gray-800/40">
                {/* Status */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        tablet.online ? 'bg-green-400' : 'bg-gray-600'
                      }`}
                    />
                    <span className={tablet.online ? 'text-green-400' : 'text-gray-500'}>
                      {tablet.online ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </td>

                {/* Label — inline editable */}
                <td className="px-4 py-3">
                  <LabelCell
                    tablet={tablet}
                    onSave={handleSaveLabel}
                    isSaving={
                      updateLabel.isPending &&
                      updateLabel.variables?.uuid === tablet.tabletUuid
                    }
                  />
                </td>

                {/* UUID */}
                <td className="px-4 py-3">
                  <ShortUuid uuid={tablet.tabletUuid} />
                </td>

                {/* Room */}
                <td className="px-4 py-3">
                  {tablet.online && tablet.currentSlug ? (
                    <span className="text-gray-100">
                      {tablet.currentSlug}
                      <span className="ml-1 text-xs text-gray-500">(live)</span>
                    </span>
                  ) : tablet.assignedRoomName ? (
                    <span className="text-gray-400">{tablet.assignedRoomName}</span>
                  ) : (
                    <span className="text-gray-600 italic">Unassigned</span>
                  )}
                </td>

                {/* Last Seen */}
                <td className="px-4 py-3 text-gray-400">
                  {relativeTime(tablet.lastSeenAt)}
                </td>

                {/* IP */}
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-gray-500">
                    {tablet.lastIp ?? '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
