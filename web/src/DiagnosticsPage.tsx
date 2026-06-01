/**
 * DiagnosticsPage — per-tablet camera-wake checker.
 *
 * Reachable at /diagnostics on any tablet. Camera capability is a property of
 * the device + browser + how the page is served (HTTPS), NOT of a room, so this
 * page is room-independent. A tech opens it on each tablet to confirm whether
 * the "wake on camera motion" screensaver feature can actually work there.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  probeCameraCapabilities,
  readinessExplanation,
  type CameraCapabilities,
} from './display/lib/cameraCapabilities.ts';
import { useCameraMotion, type CameraMotionStatus } from './display/hooks/useCameraMotion.ts';

type Verdict = 'good' | 'warn' | 'bad';

function Row({ label, value, verdict }: { label: string; value: string; verdict: Verdict }) {
  const dot =
    verdict === 'good' ? 'bg-emerald-500' :
    verdict === 'warn' ? 'bg-amber-400'   :
                         'bg-red-500';
  const text =
    verdict === 'good' ? 'text-emerald-300' :
    verdict === 'warn' ? 'text-amber-300'   :
                         'text-red-300';
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-sm text-gray-400">{label}</span>
      <span className={`flex items-center gap-2 text-sm font-medium ${text}`}>
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {value}
      </span>
    </div>
  );
}

export function DiagnosticsPage() {
  const [caps, setCaps]   = useState<CameraCapabilities | null>(null);
  const [testing, setTesting] = useState(false);
  const [status, setStatus]   = useState<CameraMotionStatus | null>(null);
  const [motionCount, setMotionCount] = useState(0);
  const [flash, setFlash] = useState(false);

  // WebSocket live-sync test (the thing that dies in standalone/home-screen mode)
  type WsState = 'idle' | 'connecting' | 'open' | 'failed';
  const [wsState, setWsState] = useState<WsState>('idle');
  const wsRef = useRef<WebSocket | null>(null);

  const wsUrl = typeof window !== 'undefined'
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`
    : '';

  const runWsTest = () => {
    wsRef.current?.close();
    setWsState('connecting');
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      // If it doesn't open within 8s, treat as failed (standalone blocks often hang).
      const timeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) { setWsState('failed'); ws.close(); }
      }, 8_000);
      ws.onopen  = () => { clearTimeout(timeout); setWsState('open'); };
      ws.onerror = () => { clearTimeout(timeout); setWsState('failed'); };
      ws.onclose = () => setWsState((s) => (s === 'open' ? 'open' : 'failed'));
    } catch {
      setWsState('failed');
    }
  };

  // Close any open test socket on unmount.
  useEffect(() => () => wsRef.current?.close(), []);

  const refresh = () => { void probeCameraCapabilities().then(setCaps); };
  useEffect(() => { refresh(); }, []);

  // Live test — only mounts the camera hook while `testing` is true.
  useCameraMotion({
    enabled:  testing,
    onStatus: setStatus,
    onMotion: () => {
      setMotionCount((c) => c + 1);
      setFlash(true);
      setTimeout(() => setFlash(false), 400);
    },
  });

  const secureVerdict: Verdict = caps?.secureContext ? 'good' : 'bad';
  const apiVerdict:    Verdict = caps?.hasGetUserMedia ? 'good' : (caps?.secureContext ? 'bad' : 'warn');
  const permVerdict:   Verdict =
    caps?.permission === 'granted' ? 'good' :
    caps?.permission === 'denied'  ? 'bad'  : 'warn';

  const overallVerdict: Verdict =
    !caps ? 'warn' :
    caps.readiness === 'ready'  ? 'good' :
    caps.readiness === 'prompt' || caps.readiness === 'unknown' ? 'warn' : 'bad';

  const statusLabel: Record<CameraMotionStatus, string> = {
    'active':            '✓ Camera active — wave your hand in front of the tablet',
    'insecure-context':  '✗ Blocked: page is not served over HTTPS',
    'no-api':            '✗ Blocked: no camera API in this browser mode',
    'denied':            '✗ Permission denied',
    'no-camera':         '✗ No camera device found',
    'error':             '✗ Could not start the camera',
  };

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-8 text-gray-100">
      <div className="mx-auto max-w-lg">

        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-white">Camera Wake Diagnostics</h1>
          <Link to="/" className="text-sm text-indigo-400 hover:text-indigo-300">← Home</Link>
        </div>

        <p className="mb-6 text-sm text-gray-500">
          Checks whether the “wake on camera motion” screensaver feature can run on
          <em> this tablet</em>. Open this page on each device you want to use it on.
        </p>

        {/* Capability checks */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-2 divide-y divide-gray-800">
          <Row
            label="Secure context (HTTPS)"
            value={caps ? (caps.secureContext ? 'Yes' : 'No — blocked') : '…'}
            verdict={secureVerdict}
          />
          <Row
            label="Camera API available"
            value={caps ? (caps.hasGetUserMedia ? 'Yes' : 'No') : '…'}
            verdict={apiVerdict}
          />
          <Row
            label="Camera permission"
            value={caps ? (caps.permission === 'unsupported' ? 'Not reported' : caps.permission) : '…'}
            verdict={permVerdict}
          />
        </div>

        {/* Verdict explanation */}
        {caps && (
          <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
            overallVerdict === 'good' ? 'border-emerald-900 bg-emerald-950/30 text-emerald-300' :
            overallVerdict === 'warn' ? 'border-amber-900 bg-amber-950/30 text-amber-300' :
                                        'border-red-900 bg-red-950/30 text-red-300'
          }`}>
            {readinessExplanation(caps.readiness)}
          </div>
        )}

        {/* Live test */}
        <div className="mt-6 rounded-xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest text-gray-400">
            Live Test
          </h2>
          <p className="mb-4 text-sm text-gray-500">
            Starts the camera and runs the real motion detector. Grant the permission
            prompt if it appears, then wave at the tablet — the counter should rise.
            No video is recorded or sent anywhere; frames are compared on-device only.
          </p>

          {!testing ? (
            <button
              onClick={() => { setMotionCount(0); setStatus(null); setTesting(true); }}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Start live camera test
            </button>
          ) : (
            <div className="space-y-4">
              <div className={`rounded-lg border px-4 py-3 text-sm transition-colors ${
                flash ? 'border-emerald-500 bg-emerald-950/50 text-emerald-200'
                      : 'border-gray-700 bg-gray-800 text-gray-300'
              }`}>
                {status ? statusLabel[status] : 'Starting camera…'}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">
                  Motion events detected: <span className="font-mono text-white">{motionCount}</span>
                </span>
                <button
                  onClick={() => { setTesting(false); refresh(); }}
                  className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:border-gray-500 hover:text-white"
                >
                  Stop test
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Live-sync (WebSocket) test — the part that breaks in standalone/home-screen mode */}
        <div className="mt-6 rounded-xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest text-gray-400">
            Live Sync (WebSocket)
          </h2>
          <p className="mb-1 text-sm text-gray-500">
            The display's real-time updates and the admin “online” indicator both ride
            on a WebSocket. Walk-up booking uses plain REST and can work even when this
            doesn't — so test it here, especially from a home-screen / bookmarked launch.
          </p>
          <p className="mb-4 break-all font-mono text-xs text-gray-600">{wsUrl}</p>

          <div className="flex items-center gap-3">
            <button
              onClick={runWsTest}
              disabled={wsState === 'connecting'}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {wsState === 'connecting' ? 'Connecting…' : 'Test live sync'}
            </button>
            {wsState !== 'idle' && (
              <span className={`flex items-center gap-2 text-sm font-medium ${
                wsState === 'open' ? 'text-emerald-300' :
                wsState === 'failed' ? 'text-red-300' : 'text-gray-400'
              }`}>
                <span className={`h-2 w-2 rounded-full ${
                  wsState === 'open' ? 'bg-emerald-500' :
                  wsState === 'failed' ? 'bg-red-500' : 'bg-amber-400'
                }`} />
                {wsState === 'open'   && '✓ Connected — live sync works in this context'}
                {wsState === 'failed' && '✗ Could not connect — live sync is blocked here'}
                {wsState === 'connecting' && 'Connecting…'}
              </span>
            )}
          </div>

          {wsState === 'failed' && (
            <p className="mt-3 rounded-lg border border-red-900 bg-red-950/30 px-3 py-2 text-xs text-red-300">
              REST works but the WebSocket is blocked in this launch mode. This is the
              usual home-screen / standalone-PWA limitation (especially on iOS with a
              privately-issued certificate). Compare this result against a normal browser
              tab — if the tab connects and the home-screen launch doesn't, that confirms it.
            </p>
          )}
        </div>

        {/* Raw context info — handy when escalating an issue */}
        <details className="mt-6 text-xs text-gray-600">
          <summary className="cursor-pointer hover:text-gray-400">Technical details</summary>
          <dl className="mt-2 space-y-1 font-mono">
            <div className="break-all"><span className="text-gray-500">URL: </span>{typeof window !== 'undefined' ? window.location.href : ''}</div>
            <div className="break-all"><span className="text-gray-500">isSecureContext: </span>{String(typeof window !== 'undefined' && window.isSecureContext)}</div>
            <div className="break-all"><span className="text-gray-500">UA: </span>{typeof navigator !== 'undefined' ? navigator.userAgent : ''}</div>
          </dl>
        </details>

      </div>
    </div>
  );
}
