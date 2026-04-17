import { Routes, Route, Navigate } from 'react-router-dom';
import { HealthCheck } from './shared/HealthCheck.tsx';

export default function App() {
  return (
    <Routes>
      {/* Placeholder root — shows health check until real routes exist */}
      <Route path="/" element={<HealthCheck />} />

      {/* Admin routes — Phase 1 */}
      <Route path="/admin/*" element={<div className="p-8 text-white">Admin UI — coming in Phase 1</div>} />

      {/* Display routes — Phase 1 */}
      <Route path="/display/*" element={<div className="p-8 text-white">Tablet Display — coming in Phase 1</div>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
