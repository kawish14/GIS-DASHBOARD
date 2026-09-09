/**
 * Gate on the routes declared in app/routes.jsx.
 *
 * Three decisions, in order: wait while the session check is in flight, bounce
 * anonymous visitors to /login, then keep admins and standard users on their
 * own screen. Per-feature permissions are NOT checked here -- those are
 * enforced inside the dashboard by features/auth/FeatureGuard.jsx.
 */
import { Navigate } from "react-router-dom";
import { useAuth } from "../features/auth/AuthContext";

export default function ProtectedRoute ({ children, requireAdmin }) {
  const { user, isAuthenticated, isAuthReady } = useAuth();

  // Unstyled text on the app's dark ground was effectively a black screen.
  // App.jsx already holds the tree back until the session check settles, so
  // this is a fallback -- but it should look like the rest of the app.
  if (!isAuthReady) {
    return (
      <div className="min-h-screen w-full bg-[#0f1115] flex items-center justify-center gap-4">
        <div className="w-8 h-8 border-[3px] border-white/15 border-t-blue-500 rounded-full animate-spin" />
        <span className="text-slate-400 text-sm">Checking your session…</span>
      </div>
    );
  }

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