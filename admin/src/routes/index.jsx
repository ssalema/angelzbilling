import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout.jsx';
import { ProtectedRoute, PublicOnlyRoute, RoleGuard } from './guards.jsx';
import NotFoundPage from '../features/misc/NotFoundPage.jsx';
import RouteError from '../components/common/RouteError.jsx';

const lazyPage = (factory) =>
  lazy(() =>
    factory().catch(
      () => new Promise((resolve, reject) => setTimeout(() => factory().then(resolve, reject), 700))
    )
  );

const importLogin = () => import('../features/auth/LoginPage.jsx');
const importDashboard = () => import('../features/dashboard/DashboardPage.jsx');

// Starts downloading the first screen while the session is still being restored.
export const warmFirstScreens = () => {
  importLogin().catch(() => {});
  importDashboard().catch(() => {});
};

const LoginPage = lazyPage(importLogin);
const ProfilePage = lazyPage(() => import('../features/auth/ProfilePage.jsx'));
const DashboardPage = lazyPage(importDashboard);
const PerfumeListPage = lazyPage(() => import('../features/perfumes/PerfumeListPage.jsx'));
const PerfumeFormPage = lazyPage(() => import('../features/perfumes/PerfumeFormPage.jsx'));
const PerfumeViewPage = lazyPage(() => import('../features/perfumes/PerfumeViewPage.jsx'));
const CreateBillPage = lazyPage(() => import('../features/billing/CreateBillPage.jsx'));
const BillListPage = lazyPage(() => import('../features/billing/BillListPage.jsx'));
const BillDetailPage = lazyPage(() => import('../features/billing/BillDetailPage.jsx'));
const UserListPage = lazyPage(() => import('../features/users/UserListPage.jsx'));
const SettingsPage = lazyPage(() => import('../features/settings/SettingsPage.jsx'));

// Every page carries its own `errorElement`.
const page = (element) => ({ element, errorElement: <RouteError /> });

export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <PublicOnlyRoute>
        <LoginPage />
      </PublicOnlyRoute>
    ),
    // Nothing is mounted around /login, so this one takes the whole screen.
    errorElement: <RouteError fullHeight />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <DashboardLayout />
      </ProtectedRoute>
    ),
    // Only reached if the layout itself (sidebar, topbar) fails to render.
    errorElement: <RouteError fullHeight />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', ...page(<DashboardPage />) },

      // Catalogue — reading is open to every signed-in account; the write
      // routes are gated here and again on the API.
      { path: 'perfumes', ...page(<PerfumeListPage />) },
      {
        path: 'perfumes/new',
        ...page(
          <RoleGuard roles={['superadmin', 'admin']}>
            <PerfumeFormPage />
          </RoleGuard>
        ),
      },
      { path: 'perfumes/:id', ...page(<PerfumeViewPage />) },
      {
        path: 'perfumes/:id/edit',
        ...page(
          <RoleGuard roles={['superadmin', 'admin']}>
            <PerfumeFormPage />
          </RoleGuard>
        ),
      },

      // Billing — available to every role, branch-scoped on the server.
      { path: 'billing', ...page(<BillListPage />) },
      { path: 'billing/new', ...page(<CreateBillPage />) },
      { path: 'billing/:id', ...page(<BillDetailPage />) },

      // Administration
      {
        path: 'users',
        ...page(
          <RoleGuard roles={['superadmin']}>
            <UserListPage />
          </RoleGuard>
        ),
      },
      {
        path: 'settings',
        ...page(
          <RoleGuard roles={['superadmin', 'admin']}>
            <SettingsPage />
          </RoleGuard>
        ),
      },
      // Same guard as /settings, deliberately.
      {
        path: 'settings/branches',
        ...page(
          <RoleGuard roles={['superadmin', 'admin']}>
            <SettingsPage />
          </RoleGuard>
        ),
      },

      { path: 'profile', ...page(<ProfilePage />) },
      { path: '*', ...page(<NotFoundPage />) },
    ],
  },
  { path: '*', element: <NotFoundPage />, errorElement: <RouteError fullHeight /> },
]);

export default router;
