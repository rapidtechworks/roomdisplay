import { useState, useEffect, useRef } from 'react';
import { api, ApiError } from '../api.ts';
import type { SystemInfo, UpdateStatus } from '../api.ts';

const POLL_MS = 2500;
const STALE_AFTER_MS = 3 * 60 * 1000; // status hasn't moved in 3 min → consider stale

export function SystemPage() {
  const [info, setInfo]             = useState<SystemInfo | null>(null);
  const [status, setStatus]         = useState<UpdateStatus>({ status: 'idle' });
  const [triggering, setTriggering] = useState(false);
  const [serverDown, setServerDown] = useState(false);
  const [now, setNow]               = useState(() => Date.now());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

    // Tick every 10s so stale detection updates without polling the server
    tickRef.current = setInterval(() => setNow(Date.now()), 10_000);

    return () => {
      stopPolling();
      if (tickRef.current) clearInterval(tickRef.current);
    };
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

  async function handleReset() {
    if (!confirm('Mark this update as failed and allow a new update to start?')) return;
    try {
      // Trigger a new update — the server will overwrite the stale status
      await api.triggerUpdate();
      setStatus({ status: 'running', step: 'Starting update…', startedAt: new Date().toISOString() });
      startPolling();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Server still thinks an update is running — force-set local state to error
        // so the user can retry. The server will eventually time out or overwrite.
        setStatus({ status: 'error', message: 'Previous update appears to be stuck. Reset on the server: rm /opt/roomdisplay/data/update-status.json' });
      } else {
        alert(err instanceof ApiError ? err.message : 'Failed to reset.');
      }
    }
  }

  // ── Stale detection ───────────────────────────────────────────────────────
  // If status is "running" or "restarting" but startedAt is older than the
  // threshold, treat it as stuck. Most updates finish in under 60 seconds.
  const isActive = status.status === 'running' || status.status === 'restarting';
  const ageMs = status.startedAt ? now - new Date(status.startedAt).getTime() : 0;
  const isStale = isActive && ageMs > STALE_AFTER_MS;

  const busy = (isActive && !isStale) || serverDown || triggering;

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

        {/* Active progress banner */}
        {busy && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-indigo-900 bg-indigo-950/40 px-4 py-3">
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-indigo-400" />
            <span className="text-sm text-indigo-300">
              {serverDown
                ? 'Server restarting — waiting for it to come back up…'
                : (status.step ?? 'Working…')}
            </span>
          </div>
        )}

        {/* Stale status — user can retry */}
        {isStale && !serverDown && (
          <div className="mb-4 rounded-lg border border-yellow-900 bg-yellow-950/40 px-4 py-3">
            <p className="text-sm text-yellow-400">
              Update appears stuck on &ldquo;{status.step ?? 'running'}&rdquo; — last update
              was {Math.floor(ageMs / 60_000)} minutes ago.
            </p>
            <p className="mt-1 text-xs text-gray-500">
              The service likely restarted successfully but the script couldn&apos;t write its
              final status. Try again or check{' '}
              <code className="text-gray-400">/var/log/roomdisplay/update.log</code>.
            </p>
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
          onClick={() => void (isStale ? handleReset() : handleUpdate())}
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
        >
          {busy ? 'Updating…' : isStale ? 'Retry Update' : 'Update Now'}
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
