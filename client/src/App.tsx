import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore.js';
import { useSettingsStore, fontSizeMap } from './stores/settingsStore.js';
import LoginPage from './pages/LoginPage.js';
import RegisterPage from './pages/RegisterPage.js';
import HomePage from './pages/HomePage.js';
import WorkspacePage from './pages/WorkspacePage.js';
import BoardPage from './pages/BoardPage.js';
import AdminUsersPage from './pages/AdminUsersPage.js';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore();
  if (loading) return <div className="flex items-center justify-center min-h-screen text-gray-500">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const { fetchMe } = useAuthStore();
  const fontSize = useSettingsStore((s) => s.fontSize);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  // Apply font size to <html> element so all rem-based sizing scales
  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSizeMap[fontSize]}px`;
  }, [fontSize]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/w/:workspaceId"
        element={<ProtectedRoute><WorkspacePage /></ProtectedRoute>}
      />
      <Route
        path="/b/:boardId"
        element={<ProtectedRoute><BoardPage /></ProtectedRoute>}
      />
      <Route
        path="/admin/users"
        element={<ProtectedRoute><AdminUsersPage /></ProtectedRoute>}
      />
      <Route
        path="/"
        element={<ProtectedRoute><HomePage /></ProtectedRoute>}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
