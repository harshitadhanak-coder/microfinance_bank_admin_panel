import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import './styles.css';

import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import AppLayout from './layouts/AppLayout';
import { AuthProvider, useAuth } from './modules/auth/AuthContext';
import LoginPage from './modules/auth/LoginPage';
import ChangePasswordPage from './modules/auth/ChangePasswordPage';
import { canAccessModule, ModuleKey, visibleModules } from './modules/auth/permissions';
import BranchesPage from './modules/branches/BranchesPage';
import CollectionsPage from './modules/collections/CollectionsPage';
import DashboardPage from './modules/dashboard/DashboardPage';
import EmployeesPage from './modules/employees/EmployeesPage';
import EmployeeCreatePage from './modules/employees/EmployeeCreatePage';
import EmployeeDetailPage from './modules/employees/EmployeeDetailPage';
import EmployeeEditPage from './modules/employees/EmployeeEditPage';
import HrDashboardPage from './modules/hr/HrDashboardPage';
import AttendancePage from './modules/hr/AttendancePage';
import AttendanceEmployeePage from './modules/hr/AttendanceEmployeePage';
import HolidaysPage from './modules/hr/HolidaysPage';
import LeavePage from './modules/hr/LeavePage';
import PayrollPage from './modules/hr/PayrollPage';
import SalaryAdvancesPage from './modules/hr/SalaryAdvancesPage';
import MastersPage from './modules/masters/MastersPage';
import ReportsPage from './modules/reports/ReportsPage';
import EmployeeLoansPage from './modules/hr/EmployeeLoansPage';
import LeadsPage from './modules/leads/LeadsPage';
import MyProfilePage from './modules/profile/MyProfilePage';
import ApplicationsPage from './modules/loans/ApplicationsPage';
import LoansPage from './modules/loans/LoansPage';
import LoanLinkPage from './modules/loans/LoanLinkPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function RequireAuth() {
  const { user, mustChangePassword } = useAuth();
  const { pathname } = useLocation();
  if (!user) return <Navigate to="/login" replace />;
  // A forced password change pins the session to the change screen until done.
  if (mustChangePassword && pathname !== '/change-password') return <Navigate to="/change-password" replace />;
  return <Outlet />;
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
          <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route path="change-password" element={<ChangePasswordPage />} />
              <Route element={<AppLayout />}>
                <Route index element={<IndexRoute />} />
                <Route path="profile" element={<MyProfilePage />} />
                <Route path="hr-overview" element={<RequireModule module="hrDashboard"><HrDashboardPage /></RequireModule>} />
                <Route path="employees" element={<RequireModule module="employees"><EmployeesPage /></RequireModule>} />
                <Route path="employees/new" element={<RequireModule module="employees"><EmployeeCreatePage /></RequireModule>} />
                <Route path="employees/:id" element={<RequireModule module="employees"><EmployeeDetailPage /></RequireModule>} />
                <Route path="employees/:id/edit" element={<RequireModule module="employees"><EmployeeEditPage /></RequireModule>} />
                <Route path="attendance" element={<RequireModule module="attendance"><AttendancePage /></RequireModule>} />
                <Route path="attendance/:employeeId" element={<RequireModule module="attendance"><AttendanceEmployeePage /></RequireModule>} />
                <Route path="holidays" element={<RequireModule module="holidays"><HolidaysPage /></RequireModule>} />
                <Route path="leave" element={<RequireModule module="leave"><LeavePage /></RequireModule>} />
                <Route path="payroll" element={<RequireModule module="payroll"><PayrollPage /></RequireModule>} />
                <Route path="salary-advances" element={<RequireModule module="salaryAdvances"><SalaryAdvancesPage /></RequireModule>} />
                <Route path="masters" element={<RequireModule module="masters"><MastersPage /></RequireModule>} />
                <Route path="reports" element={<RequireModule module="reports"><ReportsPage /></RequireModule>} />
                <Route path="employee-loans" element={<RequireModule module="employeeLoans"><EmployeeLoansPage /></RequireModule>} />
                <Route path="branches" element={<RequireModule module="branches"><BranchesPage /></RequireModule>} />
                <Route path="loans" element={<RequireModule module="loans"><LoansPage /></RequireModule>} />
                <Route path="loan-link" element={<RequireModule module="loanLink"><LoanLinkPage /></RequireModule>} />
                <Route path="applications" element={<RequireModule module="applications"><ApplicationsPage /></RequireModule>} />
                <Route path="leads" element={<RequireModule module="leads"><LeadsPage /></RequireModule>} />
                <Route path="collections" element={<RequireModule module="collections"><CollectionsPage /></RequireModule>} />
                {/* Legacy /settlements deep links now live inside Collections & Settlements. */}
                <Route path="settlements" element={<Navigate to="/collections" replace />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </ToastProvider>
          </ErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
