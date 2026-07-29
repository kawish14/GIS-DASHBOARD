import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute ({ children, requireAdmin }) {
  const { user, isAuthenticated, isAuthReady } = useAuth();

  if (!isAuthReady) return <div>Loading Session...</div>;

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  // 1. If this route requires admin (e.g., /admin) and they aren't admin, kick them to the dashboard
  if (requireAdmin && user.role !== 'admin') {
    return (
      <div className="h-screen flex items-center justify-center text-red-500">
        Access Denied: You must be an administrator to view this page.
      </div>
    );
  }

  // 2. If an admin tries to visit the standard dashboard, force them to the admin panel
  if (!requireAdmin && user.role === 'admin') {
     return <Navigate to="/admin" replace />;
  }

  // Let them through! The JSON permissions will dictate what they see inside the Dashboard.
  return children;
}