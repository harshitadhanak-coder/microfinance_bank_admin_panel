/**
 * Front-end authorization model. This mirrors the role rules enforced by the
 * backend (see each module's *.routes.ts) so the UI never offers an action or
 * route that the API would reject with a 403.
 *
 * Two layers:
 *   • MODULES  — which navigation sections a role may open (sidebar + routing)
 *   • can()    — whether a role may perform a specific in-page action
 *
 * Sidebar modules carry a `group` ('hr' | 'operations') so the navigation is
 * organised the way the operating plan describes — a Human Resources group and
 * an Operations group — rather than one long flat list.
 */

export type Role =
  | 'SUPER_ADMIN'
  | 'HEADQUARTERS_ADMIN'
  | 'BRANCH_MANAGER'
  | 'FIELD_OFFICER'
  | 'HUMAN_RESOURCES_ADMIN'
  | 'ACCOUNTANT';

export type ModuleKey =
  | 'dashboard'
  | 'hrDashboard'
  | 'employees'
  | 'attendance'
  | 'holidays'
  | 'leave'
  | 'payroll'
  | 'salaryAdvances'
  | 'masters'
  | 'reports'
  | 'employeeLoans'
  | 'branches'
  | 'loans'
  | 'loanLink'
  | 'applications'
  | 'leads'
  | 'collections'
  | 'settlements'
  | 'users'
  | 'documents'
  | 'settings';

export type ModuleGroup = 'overview' | 'hr' | 'finance' | 'operations' | 'insights' | 'admin';

export interface ModuleDef {
  key: ModuleKey;
  to: string;
  label: string;
  end?: boolean;
  roles: Role[];
  /** Sidebar group. Omitted for top-level links (e.g. Dashboard). */
  group?: ModuleGroup;
  /**
   * Hidden from the sidebar but still routable by URL. Used for screens whose
   * function is reached through another module (loan applications live under
   * the loan flow; officer-linking lives inside Collections & Settlements).
   */
  hidden?: boolean;
}

const ALL_ROLES: Role[] = [
  'SUPER_ADMIN',
  'HEADQUARTERS_ADMIN',
  'BRANCH_MANAGER',
  'FIELD_OFFICER',
  'HUMAN_RESOURCES_ADMIN',
  'ACCOUNTANT',
];

/**
 * Navigation modules, the roles allowed to open them, and their sidebar group.
 * Order defines sidebar order and the fallback landing page (first module the
 * role can see). Labels follow the operating plan's wording.
 */
export const MODULES: ModuleDef[] = [
  // Overview
  { key: 'dashboard', to: '/', label: 'Dashboard', end: true, roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'ACCOUNTANT', 'BRANCH_MANAGER'], group: 'overview' },
  { key: 'hrDashboard', to: '/hr-overview', label: 'HR Dashboard', end: true, roles: ['HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'], group: 'overview' },

  // Human Resources
  { key: 'employees', to: '/employees', label: 'Employees', roles: ['HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'], group: 'hr' },
  { key: 'attendance', to: '/attendance', label: 'Attendance', roles: ['HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'], group: 'hr' },
  { key: 'leave', to: '/leave', label: 'Leave', roles: ['HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'], group: 'hr' },
  { key: 'holidays', to: '/holidays', label: 'Holidays', roles: ['HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'], group: 'hr' },

  // Payroll & Finance
  { key: 'payroll', to: '/payroll', label: 'Payroll', roles: ['HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'], group: 'finance' },
  { key: 'employeeLoans', to: '/employee-loans', label: 'Employee Loans', roles: ['HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'], group: 'finance' },
  { key: 'salaryAdvances', to: '/salary-advances', label: 'Salary Advances', roles: ['HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'], group: 'finance' },

  // Operations
  { key: 'branches', to: '/branches', label: 'Branches', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'HUMAN_RESOURCES_ADMIN', 'ACCOUNTANT', 'BRANCH_MANAGER'], group: 'operations' },
  { key: 'leads', to: '/leads', label: 'Leads', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'BRANCH_MANAGER'], group: 'operations' },
  { key: 'loans', to: '/loans', label: 'Loans', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT'], group: 'operations' },
  // Loan Applications and Loan Assignments are now first-class, nav-visible pages
  // living under the loan flow (/loans/applications, /loans/assignments).
  { key: 'applications', to: '/loans/applications', label: 'Loan Applications', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'ACCOUNTANT'], group: 'operations' },
  { key: 'loanLink', to: '/loans/assignments', label: 'Loan Assignments', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN'], group: 'operations' },
  // Collections — the payment ledger (record / edit / import collections).
  { key: 'collections', to: '/collections', label: 'Collections', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'ACCOUNTANT', 'BRANCH_MANAGER'], group: 'operations' },
  // Day-End Settlements — verify each field officer's day-end cash (own route,
  // was a tab on the Collections mega-page). Settlement offers / NPA live under
  // /settlements/offers, reached from this page.
  { key: 'settlements', to: '/settlements', label: 'Day-End Settlements', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'ACCOUNTANT', 'BRANCH_MANAGER'], group: 'operations' },

  // Insights
  { key: 'reports', to: '/reports', label: 'Reports', roles: ['HUMAN_RESOURCES_ADMIN', 'HEADQUARTERS_ADMIN', 'BRANCH_MANAGER'], group: 'insights' },

  // Administration
  { key: 'users', to: '/users', label: 'User Management', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'], group: 'admin' },
  { key: 'documents', to: '/documents', label: 'Document Center', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'], group: 'admin' },
  { key: 'masters', to: '/masters', label: 'Organization Masters', roles: ['HUMAN_RESOURCES_ADMIN', 'HEADQUARTERS_ADMIN'], group: 'admin' },
  { key: 'settings', to: '/settings', label: 'Settings', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'HUMAN_RESOURCES_ADMIN'], group: 'admin' },
];

/** In-page actions, each mapped to the roles the backend permits. */
export const ACTION_ROLES = {
  'employee:create': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'],
  'employee:update': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'],
  'leave:decide': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'],
  'payroll:run': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'],
  // Mark-paid, holiday management, leave accrual and HR policy edits are HR/HQ only.
  'payroll:markPaid': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'HUMAN_RESOURCES_ADMIN'],
  'holiday:manage': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'HUMAN_RESOURCES_ADMIN'],
  'leave:accrue': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'HUMAN_RESOURCES_ADMIN'],
  'salaryAdvance:manage': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'],
  // Organization masters management is HR/HQ; document management includes branch managers.
  'master:manage': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'HUMAN_RESOURCES_ADMIN'],
  'document:manage': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'],
  // Employee login-account management (send credentials, lock/unlock, etc.).
  'account:manage': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'],
  'employeeLoan:manage': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'],
  'branch:create': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN'],
  'branch:update': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN'],
  'branch:delete': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN'],
  'lead:create': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'BRANCH_MANAGER', 'FIELD_OFFICER'],
  'lead:update': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'BRANCH_MANAGER', 'FIELD_OFFICER'],
  'lead:assign': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'BRANCH_MANAGER'],
  'lead:stage': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'BRANCH_MANAGER', 'FIELD_OFFICER'],
  'application:review': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'BRANCH_MANAGER'],
  'application:disburse': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'ACCOUNTANT'],
  // POST /loans and POST /loans/import — back-office quick-create + bulk import
  'loan:create': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'ACCOUNTANT'],
  // PATCH /loans/:id — edit a loan's officer / purpose
  'loan:edit': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'BRANCH_MANAGER'],
  // POST /collections/payments/manual · /import, PATCH /collections/payments/:id
  'collection:record': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'ACCOUNTANT', 'BRANCH_MANAGER'],
  // PATCH /loans/:id/assign-officer — Loan Link with Field Officer
  'loan:link': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'BRANCH_MANAGER'],
  // POST /collections/settlements/:id/accept — Settlement Verification
  'settlement:verify': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'BRANCH_MANAGER'],
  'settlement:decide': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN'],
  'settlement:complete': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'ACCOUNTANT'],
  'collection:classify': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'ACCOUNTANT'],
} satisfies Record<string, Role[]>;

export type Action = keyof typeof ACTION_ROLES;

const asRole = (role?: string | null): Role | undefined =>
  ALL_ROLES.includes(role as Role) ? (role as Role) : undefined;

/** Modules the given role may open, in sidebar order. */
export const visibleModules = (role?: string | null): ModuleDef[] => {
  const r = asRole(role);
  if (!r) return [];
  if (r === 'SUPER_ADMIN') return MODULES;
  return MODULES.filter((m) => m.roles.includes(r));
};

const GROUP_LABEL: Record<ModuleGroup, string> = {
  overview: 'Overview',
  hr: 'Human Resources',
  finance: 'Payroll & Finance',
  operations: 'Operations',
  insights: 'Insights',
  admin: 'Administration',
};
const GROUP_ORDER: ModuleGroup[] = ['overview', 'hr', 'finance', 'operations', 'insights', 'admin'];

export interface NavSection {
  key: ModuleGroup;
  label: string;
  modules: ModuleDef[];
}

/**
 * Sidebar navigation for a role: sections in a fixed order (Overview · Human
 * Resources · Payroll & Finance · Operations · Insights · Administration).
 * AppLayout renders Overview as top-level links and every other section as a
 * collapsible menu group (one open at a time) so the nav fits the viewport
 * without scrolling. Only sections the role can see are returned; hidden
 * modules stay routable but never appear here.
 */
export const navSections = (role?: string | null): NavSection[] => {
  const mods = visibleModules(role).filter((m) => !m.hidden);
  return GROUP_ORDER
    .map((key) => ({ key, label: GROUP_LABEL[key], modules: mods.filter((m) => m.group === key) }))
    .filter((s) => s.modules.length > 0);
};

/** Whether a role may open a given module. SUPER_ADMIN may open anything. */
export const canAccessModule = (role: string | null | undefined, key: ModuleKey): boolean => {
  const r = asRole(role);
  if (!r) return false;
  if (r === 'SUPER_ADMIN') return true;
  return MODULES.some((m) => m.key === key && m.roles.includes(r));
};

/** Whether a role may perform a specific in-page action. */
export const can = (role: string | null | undefined, action: Action): boolean => {
  const r = asRole(role);
  if (!r) return false;
  if (r === 'SUPER_ADMIN') return true;
  return (ACTION_ROLES[action] as Role[]).includes(r);
};

/**
 * Roles that see the organisation-wide (headquarters) dashboard. Everyone else
 * with an assigned branch sees their branch dashboard instead.
 */
export const canViewHqDashboard = (role?: string | null): boolean => {
  const r = asRole(role);
  return r === 'SUPER_ADMIN' || r === 'HEADQUARTERS_ADMIN' || r === 'ACCOUNTANT';
};

/** Roles that can list every branch. Others are pinned to their own branch. */
export const canListAllBranches = (role?: string | null): boolean => {
  const r = asRole(role);
  return (
    r === 'SUPER_ADMIN' ||
    r === 'HEADQUARTERS_ADMIN' ||
    r === 'HUMAN_RESOURCES_ADMIN' ||
    r === 'ACCOUNTANT'
  );
};
