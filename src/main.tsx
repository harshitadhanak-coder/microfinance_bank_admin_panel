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
import BranchCreatePage from './modules/branches/BranchCreatePage';
import BranchDetailPage from './modules/branches/BranchDetailPage';
import BranchEditPage from './modules/branches/BranchEditPage';
import CollectionsPage from './modules/collections/CollectionsPage';
import CollectionImportPage from './modules/collections/CollectionImportPage';
import CollectionRecordsPage from './modules/collections/CollectionRecordsPage';
import CollectionSettlementPage from './modules/collections/CollectionSettlementPage';
import SettlementsPage from './modules/collections/SettlementsPage';
import SettlementOffersPage from './modules/collections/SettlementOffersPage';
import DashboardPage from './modules/dashboard/DashboardPage';
import EmployeesPage from './modules/employees/EmployeesPage';
import EmployeeCreatePage from './modules/employees/EmployeeCreatePage';
import EmployeeImportPage from './modules/employees/EmployeeImportPage';
import EmployeeDetailPage from './modules/employees/EmployeeDetailPage';
import EmployeeEditPage from './modules/employees/EmployeeEditPage';
import HrDashboardPage from './modules/hr/HrDashboardPage';
import AttendancePage from './modules/hr/AttendancePage';
import AttendanceEmployeePage from './modules/hr/AttendanceEmployeePage';
import HolidaysPage from './modules/hr/HolidaysPage';
import LeavePage from './modules/hr/LeavePage';
import PayrollPage from './modules/hr/PayrollPage';
import PayrollRunPage from './modules/hr/PayrollRunPage';
import PayrollRunDetailPage from './modules/hr/PayrollRunDetailPage';
import SalarySlipPage from './modules/hr/SalarySlipPage';
import SalaryAdvancesPage from './modules/hr/SalaryAdvancesPage';
import MastersPage from './modules/masters/MastersPage';
import MasterResourcePage from './modules/masters/MasterResourcePage';
import UsersPage from './modules/users/UsersPage';
import DocumentCenterPage from './modules/documents/DocumentCenterPage';
import SettingsHubPage from './modules/settings/SettingsHubPage';
import HrPolicyPage from './modules/settings/HrPolicyPage';
import RolesPage from './modules/settings/RolesPage';
import ReportsCatalogPage from './modules/reports/ReportsCatalogPage';
import ReportRunnerPage from './modules/reports/ReportRunnerPage';
import EmployeeLoansPage from './modules/hr/EmployeeLoansPage';
import EmployeeLoanCreatePage from './modules/hr/EmployeeLoanCreatePage';
import EmployeeLoanDetailPage from './modules/hr/EmployeeLoanDetailPage';
import LeadsPage from './modules/leads/LeadsPage';
import LeadFormPage from './modules/leads/LeadFormPage';
import LeadDetailPage from './modules/leads/LeadDetailPage';
import MyProfilePage from './modules/profile/MyProfilePage';
import ApplicationsPage from './modules/loans/ApplicationsPage';
import LoansPage from './modules/loans/LoansPage';
import LoanCreatePage from './modules/loans/LoanCreatePage';
import LoanImportPage from './modules/loans/LoanImportPage';
import LoanDetailPage from './modules/loans/LoanDetailPage';
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
                <Route path="masters" element={<RequireModule module="masters"><MastersPage /></RequireModule>} />
                <Route path="masters/:resource" element={<RequireModule module="masters"><MasterResourcePage /></RequireModule>} />
                <Route path="users" element={<RequireModule module="users"><UsersPage /></RequireModule>} />
                <Route path="documents" element={<RequireModule module="documents"><DocumentCenterPage /></RequireModule>} />
                <Route path="settings" element={<RequireModule module="settings"><SettingsHubPage /></RequireModule>} />
                <Route path="settings/hr-policy" element={<RequireModule module="settings"><HrPolicyPage /></RequireModule>} />
                <Route path="settings/roles" element={<RequireModule module="settings"><RolesPage /></RequireModule>} />
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
