import { useState, useEffect, useRef } from 'react';
import { api, ApiError } from '../api.ts';
import type { SystemInfo, UpdateStatus } from '../api.ts';

const POLL_MS = 2500;

export function SystemPage() {
  const [info, setInfo]             = useState<SystemInfo | null>(null);
  const [status, setStatus]         = useState<UpdateStatus>({ status: 'idle' });
  const [triggering, setTriggering] = useState(false);
  const [serverDown, setServerDown] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api.getSystem()
      .then((data) => {
        setInfo(data);
        setStatus(data.updateStatus);
        if (data.updateStatus.status === 'running' || data.updateStatus.status === 'restarting') {
          startPolling();
        }
      })
      .catch(() => { /* non-critical on load */ });

    return () => stopPolling();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function startPolling() {
    if (pollRef.current) return;
    pollRef.current = setInterval(() => void poll(), POLL_MS);
  }

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  async function poll() {
    try {
      const s = await api.getUpdateStatus();
      setStatus(s);
      setServerDown(false);
      if (s.status !== 'running' && s.status !== 'restarting') {
        stopPolling();
        if (s.status === 'ok') {
          api.getSystem().then(setInfo).catch(() => { /* ignore */ });
        }
      }
    } catch {
      setServerDown(true); // server is restarting — keep polling
    }
  }

  async function handleUpdate() {
    if (!confirm('Pull the latest code from GitHub and restart the service?\n\nTablets will reconnect automatically after ~60 seconds.')) return;
    setTriggering(true);
    try {
      await api.triggerUpdate();
      setStatus({ status: 'running', step: 'Starting update…', startedAt: new Date().toISOString() });
      startPolling();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to start update.');
    } finally {
      setTriggering(false);
    }
  }

  const isActive = status.status === 'running' || status.status === 'restarting';
  const busy = isActive || serverDown || triggering;

  return (
    <div className="p-8 max-w-xl">
      <h1 className="mb-6 text-2xl font-semibold text-white">System</h1>

      {/* Version */}
      <div className="mb-6 rounded-xl border border-gray-800 bg-gray-900 px-5 py-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
          Current Version
        </p>
        {info ? (
          <div className="space-y-1.5 text-sm">
            <Row label="Commit"  value={info.version.hash}    mono />
            <Row label="Message" value={info.version.subject} />
            <Row label="Date"    value={new Date(info.version.date).toLocaleString()} />
          </div>
        ) : (
          <p className="text-sm text-gray-500">Loading…</p>
        )}
      </div>

      {/* Update */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
          Update
        </p>

        {/* Progress / result banner */}
        {(isActive || serverDown) && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-indigo-900 bg-indigo-950/40 px-4 py-3">
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-indigo-400" />
            <span className="text-sm text-indigo-300">
              {serverDown
                ? 'Server restarting — waiting for it to come back up…'
                : (status.step ?? 'Working…')}
            </span>
          </div>
        )}

        {status.status === 'ok' && (
          <div className="mb-4 rounded-lg border border-emerald-900 bg-emerald-950/40 px-4 py-3">
            <p className="text-sm text-emerald-400">Update complete — running the latest version.</p>
          </div>
        )}

        {status.status === 'error' && (
          <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3">
            <p className="text-sm text-red-400">{status.message ?? 'Update failed.'}</p>
            <p className="mt-1 text-xs text-gray-500">
              Check <code className="text-gray-400">/var/log/roomdisplay/update.log</code> on the server.
            </p>
          </div>
        )}

        <p className="mb-4 text-sm text-gray-400">
          Pulls the latest code from GitHub, rebuilds, runs any new migrations, and restarts
          the service. Tablets reconnect automatically. Expect ~60 seconds of downtime.
        </p>

        <button
          onClick={() => void handleUpdate()}
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
        >
          {busy ? 'Updating…' : 'Update Now'}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="shrink-0 text-gray-500">{label}</span>
      <span className={`text-right text-white ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}
