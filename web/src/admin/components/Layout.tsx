import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store.ts';
import { api } from '../api.ts';

const NAV = [
  { to: '/admin',          label: 'Dashboard', exact: true },
  { to: '/admin/sources',  label: 'Sources',   exact: false },
  { to: '/admin/rooms',    label: 'Rooms',     exact: false },
  { to: '/admin/tablets',  label: 'Devices',   exact: false },
  { to: '/admin/theme',    label: 'Theme',     exact: false },
];

const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

function useUpdateAvailable(): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    async function check() {
      try {
        const result = await api.checkForUpdate();
        setUpdateAvailable(result.updateAvailable);
      } catch {
        // Server unreachable — leave current state unchanged
      }
    }

    void check();
    const id = setInterval(() => void check(), UPDATE_CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return updateAvailable;
}

export function Layout() {
  const { logout } = useAuthStore();
  const navigate = useNavigate();
  const updateAvailable = useUpdateAvailable();

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login', { replace: true });
  };

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      {/* ── Sidebar ────────────────────────────────────────── */}
      <aside className="flex w-52 flex-col border-r border-gray-800 bg-gray-900">
        <div className="px-5 py-5">
          <p className="text-sm font-semibold uppercase tracking-widest text-gray-500">
            Room Display
          </p>
          <p className="text-xs text-gray-600">Admin</p>
        </div>

        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.map(({ to, label, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-gray-800 px-3 py-4 space-y-1">
          {/* Update button — anchored to bottom, only shown when relevant */}
          {updateAvailable && (
            <NavLink
              to="/admin/system"
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-indigo-400 hover:bg-indigo-950 hover:text-indigo-300'
                }`
              }
            >
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
              Update Available
            </NavLink>
          )}

          <a
            href="/"
            className="block rounded-lg px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-100"
          >
            ← Room Picker
          </a>
          <button
            onClick={handleLogout}
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-100"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content ───────────────────────────────────── */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
