import { useEffect, useState } from 'react';

interface HealthResponse {
  ok: boolean;
  uptime: number;
  version: string;
  timestamp: string;
}

export function HealthCheck() {
  const [status, setStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [data, setData] = useState<HealthResponse | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json() as Promise<HealthResponse>)
      .then((d) => {
        setData(d);
        setStatus('ok');
      })
      .catch(() => setStatus('error'));
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-950 text-white">
      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight">Room Display</h1>
        <p className="mt-2 text-gray-400">Phase 0 — Bootstrap</p>
      </div>

      <div className="w-80 rounded-xl border border-gray-800 bg-gray-900 p-6">
        <p className="mb-3 text-sm font-medium uppercase tracking-widest text-gray-500">
          Server health
        </p>
        {status === 'checking' && (
          <p className="text-gray-400">Checking /api/health…</p>
        )}
        {status === 'ok' && data && (
          <div className="space-y-2 text-sm">
            <Row label="Status" value="OK" valueClass="text-emerald-400" />
            <Row label="Version" value={data.version} />
            <Row label="Uptime" value={`${data.uptime}s`} />
            <Row label="Server time" value={new Date(data.timestamp).toLocaleTimeString()} />
          </div>
        )}
        {status === 'error' && (
          <p className="text-red-400">
            Could not reach server — make sure <code className="text-red-300">npm run dev</code> is
            running in <code className="text-red-300">server/</code>.
          </p>
        )}
      </div>

      <p className="text-xs text-gray-600">
        Navigate to <code>/admin</code> or <code>/display</code> when Phase 1 is ready.
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  valueClass = 'text-white',
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}
