import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute ({ children, allowedRoles }) {
  const { user, isAuthenticated, isAuthReady } = useAuth();

 
  if (!isAuthReady) return <div>Loading Session...</div>;

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  // Check if user's role is in the allowed list
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    console.log(user)
    return (
      <div className="h-screen flex items-center justify-center text-red-500">
        Access Denied: You do not have permission to view this page.
      </div>
    );
  }


  return children;
};