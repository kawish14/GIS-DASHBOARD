import Dashboard from '../pages/Dashboard';
import AdminPanel from '../pages/AdminPanel';
// Note: We don't need Login here anymore if we handle it directly in App.jsx

export const routeConfig = [
  {
    path: "/dashboard",
    element: <Dashboard />,
    requireAdmin: false, // All standard logged-in users go here
  },
  {
    path: "/admin",
    element: <AdminPanel />,
    requireAdmin: true, // Only the 'admin' role can access this
  },
];