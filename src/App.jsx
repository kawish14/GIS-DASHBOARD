import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import ProtectedRoute from "./routes/ProtectedRoute";
import {routeConfig} from "./routes/route";

function App() {
  const { isAuthReady, login } = useAuth();

  if (!isAuthReady) {
    return  <calcite-loader label="Adjusting polygons..."></calcite-loader>;
  }

  return (
    <Routes>
      {/* Public Route */}
      <Route path="/login" element={<Login />} />

      {/* 3. Loop through Protected Routes */}
      {routeConfig.map((route, index) => (
       
        <Route
          key={index}
          path={route.path}
          element={
            <ProtectedRoute allowedRoles={route.allowedRoles} >
              {route.element}
            </ProtectedRoute>
          }
        />
      ))}

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default App;