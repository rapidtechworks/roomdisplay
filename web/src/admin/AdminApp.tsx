import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store.ts';
import { Layout } from './components/Layout.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { SourcesPage } from './pages/SourcesPage.tsx';
import { SourceDetailPage } from './pages/SourceDetailPage.tsx';
import { RoomsPage } from './pages/RoomsPage.tsx';
import { RoomDetailPage } from './pages/RoomDetailPage.tsx';
import { TabletsPage } from './pages/TabletsPage.tsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

export function AdminApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <AdminRoutes />
    </QueryClientProvider>
  );
}

function AdminRoutes() {
  const { loggedIn, initialized, checkAuth } = useAuthStore();

  useEffect(() => { void checkAuth(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!initialized) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <p className="text-gray-400">Loading…</p>
      </div>
    );
  }

  return (
    <Routes>
      {/* Login — redirect away if already authenticated */}
      <Route
        path="login"
        element={loggedIn ? <Navigate to="/admin" replace /> : <LoginPage />}
      />

      {/* Protected layout routes */}
      <Route element={loggedIn ? <Layout /> : <Navigate to="/admin/login" replace />}>
        <Route index element={<DashboardPage />} />
        <Route path="sources" element={<SourcesPage />} />
        <Route path="sources/:id" element={<SourceDetailPage />} />
        <Route path="rooms" element={<RoomsPage />} />
        <Route path="rooms/:id" element={<RoomDetailPage />} />
        <Route path="tablets" element={<TabletsPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}
