import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import './styles.css';
import { retryBackoff, retryTransient } from './api/client';

import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import AppLayout from './layouts/AppLayout';
import { AuthProvider, useAuth } from './modules/auth/AuthContext';
import LoginPage from './modules/auth/LoginPage';
import { canAccessModule, ModuleKey, visibleModules } from './modules/auth/permissions';

/**
 * Every screen below is loaded on demand.
 *
 * These used to be static imports, which meant one bundle containing all ~70
 * pages — plus the spreadsheet and PDF libraries the reports screens pull in.
 * The browser had to download and parse the entire application before it could
 * paint the sign-in form, which is the part of "logging in takes ages" that
 * happens before a single request is sent. Route-level splitting means the
 * login screen ships only what the login screen needs, and each page arrives
 * when it is first opened.
 *
 * LoginPage and AppLayout stay static: they are on the critical path already,
 * so deferring them would only add a round trip.
 */
const ChangePasswordPage = lazy(() => import('./modules/auth/ChangePasswordPage'));
const BranchesPage = lazy(() => import('./modules/branches/BranchesPage'));
const BranchCreatePage = lazy(() => import('./modules/branches/BranchCreatePage'));
const BranchDetailPage = lazy(() => import('./modules/branches/BranchDetailPage'));
const BranchEditPage = lazy(() => import('./modules/branches/BranchEditPage'));
const CollectionsPage = lazy(() => import('./modules/collections/CollectionsPage'));
const CollectionImportPage = lazy(() => import('./modules/collections/CollectionImportPage'));
const CollectionRecordsPage = lazy(() => import('./modules/collections/CollectionRecordsPage'));
const CollectionSettlementPage = lazy(() => import('./modules/collections/CollectionSettlementPage'));
const SettlementsPage = lazy(() => import('./modules/collections/SettlementsPage'));
const SettlementOffersPage = lazy(() => import('./modules/collections/SettlementOffersPage'));
const BranchDepositsPage = lazy(() => import('./modules/reconciliation/BranchDepositsPage'));
const BankReconciliationPage = lazy(() => import('./modules/reconciliation/BankReconciliationPage'));
const DashboardPage = lazy(() => import('./modules/dashboard/DashboardPage'));
const EmployeesPage = lazy(() => import('./modules/employees/EmployeesPage'));
const EmployeeCreatePage = lazy(() => import('./modules/employees/EmployeeCreatePage'));
const EmployeeImportPage = lazy(() => import('./modules/employees/EmployeeImportPage'));
const EmployeeDetailPage = lazy(() => import('./modules/employees/EmployeeDetailPage'));
const EmployeeEditPage = lazy(() => import('./modules/employees/EmployeeEditPage'));
const HrDashboardPage = lazy(() => import('./modules/hr/HrDashboardPage'));
const AttendancePage = lazy(() => import('./modules/hr/AttendancePage'));
const AttendanceEmployeePage = lazy(() => import('./modules/hr/AttendanceEmployeePage'));
const HolidaysPage = lazy(() => import('./modules/hr/HolidaysPage'));
const LeavePage = lazy(() => import('./modules/hr/LeavePage'));
const PayrollPage = lazy(() => import('./modules/hr/PayrollPage'));
const PayrollRunPage = lazy(() => import('./modules/hr/PayrollRunPage'));
const PayrollRunDetailPage = lazy(() => import('./modules/hr/PayrollRunDetailPage'));
const SalarySlipPage = lazy(() => import('./modules/hr/SalarySlipPage'));
const SalaryAdvancesPage = lazy(() => import('./modules/hr/SalaryAdvancesPage'));
const OrgChartPage = lazy(() => import('./modules/hr/OrgChartPage'));
const ShiftsPage = lazy(() => import('./modules/hr/ShiftsPage'));
const AttendanceRequestsPage = lazy(() => import('./modules/hr/AttendanceRequestsPage'));
const ExitPage = lazy(() => import('./modules/hr/ExitPage'));
const AnnouncementsPage = lazy(() => import('./modules/hr/AnnouncementsPage'));
const AnnouncementDetailPage = lazy(() => import('./modules/hr/AnnouncementDetailPage'));
const HrPolicyLibraryPage = lazy(() => import('./modules/hr/HrPolicyLibraryPage'));
const HrPolicyDetailPage = lazy(() => import('./modules/hr/HrPolicyDetailPage'));
const MastersPage = lazy(() => import('./modules/masters/MastersPage'));
const MasterResourcePage = lazy(() => import('./modules/masters/MasterResourcePage'));
const UsersPage = lazy(() => import('./modules/users/UsersPage'));
const SubAdminsPage = lazy(() => import('./modules/sub-admins/SubAdminsPage'));
const DocumentCenterPage = lazy(() => import('./modules/documents/DocumentCenterPage'));
const SettingsHubPage = lazy(() => import('./modules/settings/SettingsHubPage'));
const HrPolicyPage = lazy(() => import('./modules/settings/HrPolicyPage'));
const RolesListPage = lazy(() => import('./modules/roles/RolesListPage'));
const RoleFormPage = lazy(() => import('./modules/roles/RoleFormPage'));
const RolePermissionMatrixPage = lazy(() => import('./modules/roles/RolePermissionMatrixPage'));
const ReportsCatalogPage = lazy(() => import('./modules/reports/ReportsCatalogPage'));
const ReportRunnerPage = lazy(() => import('./modules/reports/ReportRunnerPage'));
const EmployeeLoansPage = lazy(() => import('./modules/hr/EmployeeLoansPage'));
const EmployeeLoanCreatePage = lazy(() => import('./modules/hr/EmployeeLoanCreatePage'));
const EmployeeLoanDetailPage = lazy(() => import('./modules/hr/EmployeeLoanDetailPage'));
const LeadsPage = lazy(() => import('./modules/leads/LeadsPage'));
const LeadFormPage = lazy(() => import('./modules/leads/LeadFormPage'));
const LeadDetailPage = lazy(() => import('./modules/leads/LeadDetailPage'));
const MyProfilePage = lazy(() => import('./modules/profile/MyProfilePage'));
const ApplicationsPage = lazy(() => import('./modules/loans/ApplicationsPage'));
const LoansPage = lazy(() => import('./modules/loans/LoansPage'));
const LoanCreatePage = lazy(() => import('./modules/loans/LoanCreatePage'));
const LoanImportPage = lazy(() => import('./modules/loans/LoanImportPage'));
const LoanDetailPage = lazy(() => import('./modules/loans/LoanDetailPage'));
const LoanLinkPage = lazy(() => import('./modules/loans/LoanLinkPage'));

// Retry transient failures (network drop while the dev backend restarts, or a
// 5xx) with backoff so a brief blip self-heals instead of surfacing an error.
// 4xx are never retried; a 401 is handled by the axios interceptor (refresh).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: retryTransient(4),
      retryDelay: retryBackoff,
      refetchOnWindowFocus: false,
    },
  },
});

/** Shown while a route's chunk is in flight. */
const RouteFallback = () => <div className="content"><p className="muted">Loading…</p></div>;

function RequireAuth() {
  const { user, mustChangePassword } = useAuth();
  const { pathname } = useLocation();
  if (!user) return <Navigate to="/login" replace />;
  // A forced password change pins the session to the change screen until done.
  if (mustChangePassword && pathname !== '/change-password') return <Navigate to="/change-password" replace />;
  return <Outlet />;
}

/**
 * The first module the current role may open — used as their landing page.
 * Falls back to the always-accessible profile page: a role with no visible
 * modules would otherwise be redirected to a route it cannot open either,
 * looping forever.
 */
function useHomePath() {
  const { user } = useAuth();
  return visibleModules(user?.role)[0]?.to ?? '/profile';
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
          <Suspense fallback={<RouteFallback />}>
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
                <Route path="employees/import" element={<RequireModule module="employeeImport"><EmployeeImportPage /></RequireModule>} />
                <Route path="employees/:id" element={<RequireModule module="employees"><EmployeeDetailPage /></RequireModule>} />
                <Route path="employees/:id/edit" element={<RequireModule module="employees"><EmployeeEditPage /></RequireModule>} />
                <Route path="attendance" element={<RequireModule module="attendance"><AttendancePage /></RequireModule>} />
                <Route path="attendance/:employeeId" element={<RequireModule module="attendance"><AttendanceEmployeePage /></RequireModule>} />
                <Route path="holidays" element={<RequireModule module="holidays"><HolidaysPage /></RequireModule>} />
                <Route path="leave" element={<RequireModule module="leave"><LeavePage /></RequireModule>} />
                <Route path="payroll" element={<RequireModule module="payroll"><PayrollPage /></RequireModule>} />
                <Route path="payroll/run" element={<RequireModule module="payroll"><PayrollRunPage /></RequireModule>} />
                <Route path="payroll/slip/:id" element={<RequireModule module="payroll"><SalarySlipPage /></RequireModule>} />
                <Route path="payroll/:runId" element={<RequireModule module="payroll"><PayrollRunDetailPage /></RequireModule>} />
                <Route path="salary-advances" element={<RequireModule module="salaryAdvances"><SalaryAdvancesPage /></RequireModule>} />
                {/* HRJee HR-module screens */}
                <Route path="hr/hierarchy" element={<RequireModule module="orgChart"><OrgChartPage /></RequireModule>} />
                <Route path="hr/shifts" element={<RequireModule module="shifts"><ShiftsPage /></RequireModule>} />
                <Route path="hr/attendance-requests" element={<RequireModule module="attendanceRequests"><AttendanceRequestsPage /></RequireModule>} />
                <Route path="hr/exit" element={<RequireModule module="exit"><ExitPage /></RequireModule>} />
                <Route path="announcements" element={<RequireModule module="announcements"><AnnouncementsPage /></RequireModule>} />
                <Route path="announcements/:id" element={<RequireModule module="announcements"><AnnouncementDetailPage /></RequireModule>} />
                <Route path="hr-policies" element={<RequireModule module="hrPolicyLibrary"><HrPolicyLibraryPage /></RequireModule>} />
                <Route path="hr-policies/:id" element={<RequireModule module="hrPolicyLibrary"><HrPolicyDetailPage /></RequireModule>} />
                <Route path="masters" element={<RequireModule module="masters"><MastersPage /></RequireModule>} />
                <Route path="masters/:resource" element={<RequireModule module="masters"><MasterResourcePage /></RequireModule>} />
                <Route path="users" element={<RequireModule module="users"><UsersPage /></RequireModule>} />
                <Route path="sub-admins" element={<RequireModule module="subAdmins"><SubAdminsPage /></RequireModule>} />
                <Route path="documents" element={<RequireModule module="documents"><DocumentCenterPage /></RequireModule>} />
                <Route path="settings" element={<RequireModule module="settings"><SettingsHubPage /></RequireModule>} />
                {/* HR Policy belongs to the HR module, not Settings: HR must reach
                    it without also reaching the RBAC role/permission editor. */}
                <Route path="settings/hr-policy" element={<RequireModule module="hrPolicy"><HrPolicyPage /></RequireModule>} />
                <Route path="settings/roles" element={<RequireModule module="settings"><RolesListPage /></RequireModule>} />
                <Route path="settings/roles/new" element={<RequireModule module="settings"><RoleFormPage /></RequireModule>} />
                <Route path="settings/roles/:id/edit" element={<RequireModule module="settings"><RoleFormPage /></RequireModule>} />
                <Route path="settings/roles/:id/permissions" element={<RequireModule module="settings"><RolePermissionMatrixPage /></RequireModule>} />
                <Route path="reports" element={<RequireModule module="reports"><ReportsCatalogPage /></RequireModule>} />
                <Route path="reports/:reportKey" element={<RequireModule module="reports"><ReportRunnerPage /></RequireModule>} />
                <Route path="employee-loans" element={<RequireModule module="employeeLoans"><EmployeeLoansPage /></RequireModule>} />
                <Route path="employee-loans/new" element={<RequireModule module="employeeLoans"><EmployeeLoanCreatePage /></RequireModule>} />
                <Route path="employee-loans/:id" element={<RequireModule module="employeeLoans"><EmployeeLoanDetailPage /></RequireModule>} />
                <Route path="branches" element={<RequireModule module="branches"><BranchesPage /></RequireModule>} />
                <Route path="branches/new" element={<RequireModule module="branches"><BranchCreatePage /></RequireModule>} />
                <Route path="branches/:id" element={<RequireModule module="branches"><BranchDetailPage /></RequireModule>} />
                <Route path="branches/:id/edit" element={<RequireModule module="branches"><BranchEditPage /></RequireModule>} />
                <Route path="loans" element={<RequireModule module="loans"><LoansPage /></RequireModule>} />
                <Route path="loans/new" element={<RequireModule module="loans"><LoanCreatePage /></RequireModule>} />
                <Route path="loans/import" element={<RequireModule module="loans"><LoanImportPage /></RequireModule>} />
                <Route path="loans/applications" element={<RequireModule module="applications"><ApplicationsPage /></RequireModule>} />
                <Route path="loans/assignments" element={<RequireModule module="loanLink"><LoanLinkPage /></RequireModule>} />
                <Route path="loans/:id" element={<RequireModule module="loans"><LoanDetailPage /></RequireModule>} />
                {/* Legacy deep links now live under the loan flow. */}
                <Route path="loan-link" element={<Navigate to="/loans/assignments" replace />} />
                <Route path="applications" element={<Navigate to="/loans/applications" replace />} />
                <Route path="leads" element={<RequireModule module="leads"><LeadsPage /></RequireModule>} />
                <Route path="leads/new" element={<RequireModule module="leads"><LeadFormPage /></RequireModule>} />
                <Route path="leads/:id" element={<RequireModule module="leads"><LeadDetailPage /></RequireModule>} />
                <Route path="leads/:id/edit" element={<RequireModule module="leads"><LeadFormPage /></RequireModule>} />
                <Route path="collections/import" element={<RequireModule module="collectionImport"><CollectionImportPage /></RequireModule>} />
                <Route path="collections/records" element={<RequireModule module="collectionRecords"><CollectionRecordsPage /></RequireModule>} />
                <Route path="collections/settlement" element={<RequireModule module="collectionSettlement"><CollectionSettlementPage /></RequireModule>} />
                <Route path="collections" element={<RequireModule module="collections"><CollectionsPage /></RequireModule>} />
                <Route path="settlements" element={<RequireModule module="settlements"><SettlementsPage /></RequireModule>} />
                <Route path="settlements/offers" element={<RequireModule module="settlements"><SettlementOffersPage /></RequireModule>} />
                <Route path="reconciliation/deposits" element={<RequireModule module="bankDeposits"><BranchDepositsPage /></RequireModule>} />
                <Route path="reconciliation" element={<RequireModule module="bankReconciliation"><BankReconciliationPage /></RequireModule>} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
          </ToastProvider>
          </ErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
