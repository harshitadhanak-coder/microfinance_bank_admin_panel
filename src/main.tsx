import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import './styles.css';

import { ErrorBoundary } from './components/ErrorBoundary';
import AppLayout from './layouts/AppLayout';
import { AuthProvider, useAuth } from './modules/auth/AuthContext';
import LoginPage from './modules/auth/LoginPage';
import { canAccessModule, ModuleKey, visibleModules } from './modules/auth/permissions';
import BranchesPage from './modules/branches/BranchesPage';
import CollectionsPage from './modules/collections/CollectionsPage';
import DashboardPage from './modules/dashboard/DashboardPage';
import LeadsPage from './modules/leads/LeadsPage';
import ApplicationsPage from './modules/loans/ApplicationsPage';
import LoansPage from './modules/loans/LoansPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function RequireAuth() {
  const { user } = useAuth();
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

/** The first module the current role may open — used as their landing page. */
function useHomePath() {
  const { user } = useAuth();
  return visibleModules(user?.role)[0]?.to ?? '/loans';
}

/**
 * Blocks a route if the signed-in role may not access the module, even when the
 * URL is entered directly. Sends the user to their own landing page instead.
 */
function RequireModule({ module, children }: { module: ModuleKey; children: JSX.Element }) {
  const { user } = useAuth();
  const home = useHomePath();
  if (canAccessModule(user?.role, module)) return children;
  return <Navigate to={home} replace />;
}

/** Sends the index route to the role's first accessible module. */
function IndexRoute() {
  const { user } = useAuth();
  const home = useHomePath();
  return canAccessModule(user?.role, 'dashboard') ? <DashboardPage /> : <Navigate to={home} replace />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ErrorBoundary>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route element={<AppLayout />}>
                <Route index element={<IndexRoute />} />
                <Route path="branches" element={<RequireModule module="branches"><BranchesPage /></RequireModule>} />
                <Route path="loans" element={<RequireModule module="loans"><LoansPage /></RequireModule>} />
                <Route path="applications" element={<RequireModule module="applications"><ApplicationsPage /></RequireModule>} />
                <Route path="leads" element={<RequireModule module="leads"><LeadsPage /></RequireModule>} />
                <Route path="collections" element={<RequireModule module="collections"><CollectionsPage /></RequireModule>} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </ErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
