import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store.ts';

const NAV = [
  { to: '/admin',         label: 'Dashboard', exact: true },
  { to: '/admin/sources', label: 'Sources',   exact: false },
  { to: '/admin/rooms',   label: 'Rooms',     exact: false },
];

export function Layout() {
  const { logout } = useAuthStore();
  const navigate = useNavigate();

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

        <div className="border-t border-gray-800 px-3 py-4">
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
