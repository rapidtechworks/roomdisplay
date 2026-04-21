import { Routes, Route, Navigate } from 'react-router-dom';
import { AdminApp }        from './admin/AdminApp.tsx';
import { DisplayApp }      from './display/DisplayApp.tsx';
import { RoomPickerPage }  from './RoomPickerPage.tsx';

export default function App() {
  return (
    <Routes>
      <Route path="/"              element={<RoomPickerPage />} />
      <Route path="/admin/*"       element={<AdminApp />} />
      <Route path="/display/:slug" element={<DisplayApp />} />
      <Route path="/display"       element={<DisplayApp />} />
      <Route path="*"              element={<Navigate to="/" replace />} />
    </Routes>
  );
}
