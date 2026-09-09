import DashboardPage from '../features/dashboard/DashboardPage';
import AdminPage from '../features/admin/AdminPage';

// Protected routes, rendered by app/App.jsx through app/ProtectedRoute.jsx.
// The public /login route is declared in App.jsx itself.

export const routeConfig = [
  {
    path: "/dashboard",
    element: <DashboardPage />,
    requireAdmin: false, // All standard logged-in users go here
  },
  {
    path: "/admin",
    element: <AdminPage />,
    requireAdmin: true, // Only the 'admin' role can access this
  },
];

/**
 * Where a signed-in user belongs.
 *
 * Stated once because three places need it: the root redirect, the guard that
 * keeps signed-in users off /login, and LoginPage after a successful sign-in.
 * Admins land on the admin panel -- ProtectedRoute bounces them off
 * /dashboard anyway, so sending them there first is a redirect nobody needs.
 */
export function landingPathFor(user) {
  return user?.role === 'admin' ? '/admin' : '/dashboard';
}
