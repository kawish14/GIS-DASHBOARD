import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import ProtectedRoute from "./routes/ProtectedRoute";
import { routeConfig } from "./routes/route";

// ✅ Root redirect component
function RootRedirect() {
  const { isAuthenticated, isAuthReady } = useAuth();
  if (!isAuthReady) return <FallbackLoader label="Loading..." />;
  return <Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />;
}

function App() {
  const { isAuthReady } = useAuth();

  if (!isAuthReady) {
    return <FallbackLoader label="Adjusting polygons..." />;
  }

  return (
    <Routes>
      {/* Public Route */}
      <Route path="/login" element={<Login />} />

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