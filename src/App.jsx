import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import ProtectedRoute from "./routes/ProtectedRoute";
import { routeConfig } from "./routes/route";

// ✅ Root redirect component
function RootRedirect() {
  const { isAuthenticated, isAuthReady } = useAuth();
  if (!isAuthReady) return <calcite-loader label="Loading..." />;
  return <Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />;
}

function App() {
  const { isAuthReady } = useAuth();

  if (!isAuthReady) {
    return <calcite-loader label="Adjusting polygons..."></calcite-loader>;
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