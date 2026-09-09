/**
 * Route table. Mounted by main.jsx inside app/AppProviders.jsx.
 *
 * Everything except /login, /register and the password-reset pair goes through
 * ProtectedRoute, which also sends
 * admins to /admin and everyone else to /dashboard. The route list itself is
 * in app/routes.jsx so adding a screen doesn't mean editing this file.
 */
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "../features/auth/AuthContext";
import LoginPage from "../features/auth/LoginPage";
import RegisterPage from "../features/auth/RegisterPage";
import ForgotPasswordPage from "../features/auth/ForgotPasswordPage";
import ResetPasswordPage from "../features/auth/ResetPasswordPage";
import ProtectedRoute from "./ProtectedRoute";
import { routeConfig, landingPathFor } from "./routes";

// ✅ Root redirect component
function RootRedirect() {
  const { user, isAuthenticated, isAuthReady } = useAuth();
  if (!isAuthReady) return <FallbackLoader label="Loading..." />;
  return <Navigate to={isAuthenticated ? landingPathFor(user) : "/login"} replace />;
}

function App() {
  const { user, isAuthenticated, isAuthReady } = useAuth();

  if (!isAuthReady) {
    return <FallbackLoader label="Adjusting polygons..." />;
  }

  return (
    <Routes>
      {/* Opening / already lands a signed-in user on their screen, via
          RootRedirect below. This covers arriving at /login directly -- a
          bookmark, browser autocomplete, or the back button after signing out
          -- where the form would otherwise be shown to someone who is already
          signed in, and then refused: the API allows one live session per
          account, so signing in again is answered with "already logged in on
          another device", meaning the user's own other tab. */}
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to={landingPathFor(user)} replace /> : <LoginPage />}
      />

      {/* Invitation-based sign-up. Public by necessity -- the person
          completing it has no session yet -- but it can only finish an
          account a GIS Admin already pre-registered. */}
      <Route path="/register" element={<RegisterPage />} />

      {/* Password reset stays reachable while signed in, deliberately: there
          is no self-service password change, so this is also the route a
          signed-in user takes to change their own password. Completing a reset
          ends their session, which is the correct outcome. */}
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* ✅ Root route – redirects based on auth status */}
      <Route path="/" element={<RootRedirect />} />

      {/* Protected Routes from config */}
      {routeConfig.map((route, index) => (
        <Route
          key={index}
          path={route.path}
          element={
            <ProtectedRoute requireAdmin={route.requireAdmin}>
              {route.element}
            </ProtectedRoute>
          }
        />
      ))}

      {/* Catch‑all – redirect to root, which will handle auth */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;

// Small loader component that prefers the `calcite-loader` webcomponent but
// falls back to a native spinner if the custom element isn't registered.
function FallbackLoader({ label }) {
  const loaderAvailable = typeof customElements !== 'undefined' && customElements.get && customElements.get('calcite-loader');
  if (loaderAvailable) return <calcite-loader label={label} />;

  return (
    <div className="min-h-screen w-full bg-[#0f1115] flex items-center justify-center p-4">
      <div className="flex items-center gap-4">
        <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
        <div className="text-white">{label || 'Loading...'}</div>
      </div>
    </div>
  );
}