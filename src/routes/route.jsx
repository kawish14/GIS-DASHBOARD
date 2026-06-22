import Dashboard from '../pages/Dashboard';
import AdminPanel from '../pages/AdminPanel';
import Login from "../pages/Login";

export const routeConfig = [
  {
    path: "/",
    element: <Login />,
    // Add 'admin' here if that is what your DB says
    //allowedRoles: ['management', 'north', 'south', 'viewer', 'admin'], 
  },
  {
    path: "/management",
    element: <Dashboard />,
    // Add 'admin' here if that is what your DB says
    allowedRoles: ['management'], 
  },
  {
    path: "/north",
    element: <Dashboard />,
    // Add 'admin' here if that is what your DB says
    allowedRoles: ['north.tech', 'north.manager'], 
  },
  {
    path: "/south",
    element: <Dashboard />,
    // Add 'admin' here if that is what your DB says
    allowedRoles: ['south.tech', 'south.manager'], 
  },
  {
    path: "/central",
    element: <Dashboard />,
    // Add 'admin' here if that is what your DB says
    allowedRoles: ['central.tech', 'central.manager'], 
  },
   {
    path: "/twa",
    element: <Dashboard />,
    // Add 'admin' here if that is what your DB says
    allowedRoles: ['twa'], 
  },
   {
    path: "/commercial",
    element: <Dashboard />,
    // Add 'admin' here if that is what your DB says
    allowedRoles: ['commercial'], 
  },
   {
    path: "/gis-user",
    element: <Dashboard />,
    // Add 'admin' here if that is what your DB says
    allowedRoles: ['gis'], 
  },
  {
    path: "/admin",
    element: <AdminPanel />,
    allowedRoles: ['admin'], 
  },
]