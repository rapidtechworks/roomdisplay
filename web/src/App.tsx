import { Routes, Route, Navigate } from 'react-router-dom';
import { AdminApp } from './admin/AdminApp.tsx';

export default function App() {
  return (
    <Routes>
      <Route path="/"        element={<Navigate to="/admin" replace />} />
      <Route path="/admin/*" element={<AdminApp />} />

      {/* Display routes — Phase 1 */}
      <Route path="/display/*" element={<div className="p-8 text-white">Tablet Display — coming soon</div>} />

      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
