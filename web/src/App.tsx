import { Routes, Route, Navigate } from 'react-router-dom';
import { AdminApp }        from './admin/AdminApp.tsx';
import { DisplayApp }      from './display/DisplayApp.tsx';
import { RoomPickerPage }  from './RoomPickerPage.tsx';
import { ErrorBoundary }   from './ErrorBoundary.tsx';

export default function App() {
  return (
    <Routes>
      <Route path="/"              element={<RoomPickerPage />} />
      <Route path="/admin/*"       element={<ErrorBoundary context="admin"><AdminApp /></ErrorBoundary>} />
      <Route path="/display/:slug" element={<ErrorBoundary context="display"><DisplayApp /></ErrorBoundary>} />
      <Route path="/display"       element={<ErrorBoundary context="display"><DisplayApp /></ErrorBoundary>} />
      <Route path="*"              element={<Navigate to="/" replace />} />
    </Routes>
  );
}
