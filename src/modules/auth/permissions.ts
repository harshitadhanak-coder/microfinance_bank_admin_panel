/**
 * Front-end authorization model. This mirrors the rules enforced by the backend
 * (see each module's *.routes.ts) so the UI never offers an action or route that
 * the API would reject with a 403.
 *
 * Two layers:
 *   • MODULES  — which navigation sections a caller may open (sidebar + routing)
 *   • can()    — whether a caller may perform a specific in-page action
 *
 * Two sources of truth, in this order:
 *   1. The six BUILT-IN roles below are decided by the `roles` / ACTION_ROLES
 *      lists, exactly as they always have been. Those lists are what the app has
 *      been tested against, so they stay authoritative for them.
 *   2. Every OTHER role — OPERATIONS, COLLECTION_MANAGER, AUDITOR and every role
 *      created in Roles & Permissions — is decided by the permission matrix: the
 *      `permission` code on each module and action, checked against the caller's
 *      effective permissions from GET /me/permissions.
 *
 * (2) is why this file changed. `asRole()` used to return undefined for any name
 * outside the six, and `visibleModules` then returned an empty list — so an
 * Operations user signed in successfully and saw a sidebar with nothing in it,
 * no matter what the permission matrix said.
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

/** Data scope of the signed-in account, as reported by GET /me/permissions. */
export type ScopeType = 'ALL' | 'BRANCH' | 'SELF' | 'ASSIGNED';

export interface EffectivePermissions {
  wildcard: boolean;
  scope: ScopeType;
  codes: Set<string>;
}

/**
 * The signed-in account's effective permissions. Held here rather than passed
 * through every call site: `can()` / `canAccessModule()` already take the role
 * string and are called from ~85 places. AuthProvider loads this before the
 * shell renders and clears it on logout.
 */
let effective: EffectivePermissions | null = null;

/** Replaces the cached permission set. Pass null on logout. */
export const setEffectivePermissions = (
  value: { wildcard?: boolean; scope?: ScopeType; permissions?: string[] } | null,
): void => {
  effective = value
    ? {
        wildcard: Boolean(value.wildcard) || (value.permissions ?? []).includes('*'),
        scope: value.scope ?? 'SELF',
        codes: new Set(value.permissions ?? []),
      }
    : null;
};

/** Whether the permission set has been loaded for this session. */
export const permissionsLoaded = (): boolean => effective !== null;

/** Whether the signed-in account holds a permission code. */
export const hasPermission = (code?: string): boolean => {
  if (!effective || !code) return false;
  return effective.wildcard || effective.codes.has(code);
};

/** The account's broadest data scope ('SELF' until the permission set loads). */
export const currentScope = (): ScopeType => effective?.scope ?? 'SELF';

export type ModuleKey =
  | 'dashboard'
  | 'hrDashboard'
  | 'employees'
  | 'employeeImport'
  | 'attendance'
  | 'attendanceRequests'
  | 'holidays'
  | 'leave'
  | 'payroll'
  | 'salaryAdvances'
  | 'hrPolicy'
  | 'orgChart'
  | 'shifts'
  | 'exit'
  | 'announcements'
  | 'hrPolicyLibrary'
  | 'masters'
  | 'reports'
  | 'employeeLoans'
  | 'branches'
  | 'loans'
  | 'loanLink'
  | 'applications'
  | 'leads'
  | 'collections'
  | 'collectionImport'
  | 'collectionRecords'
  | 'collectionSettlement'
  | 'settlements'
  | 'bankDeposits'
  | 'bankReconciliation'
  | 'users'
  | 'documents'
  | 'settings';

export type ModuleGroup = 'overview' | 'hr' | 'finance' | 'operations' | 'insights' | 'admin';

export interface ModuleDef {
  key: ModuleKey;
  to: string;
  label: string;
  end?: boolean;
  /** Built-in roles that may open this module (authoritative for those six). */
  roles: Role[];
  /**
   * Permission code that gates this module for every other role. Omit for
   * screens that are deliberately unreachable outside the built-in roles (the
   * BC collection import is Super Admin only), which keeps them invisible to
   * custom roles rather than requiring a code no role can be granted.
   */
  permission?: string;
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
  { key: 'dashboard', to: '/', label: 'Dashboard', end: true, permission: 'dashboard:view', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'ACCOUNTANT', 'BRANCH_MANAGER'], group: 'overview' },
  { key: 'hrDashboard', to: '/hr-overview', label: 'HR Dashboard', end: true, permission: 'hr:view', roles: ['HUMAN_RESOURCES_ADMIN'], group: 'overview' },

  // Human Resources — the HR module is restricted to the HR role (and Super
  // Admin, who wildcards through below). This mirrors HR_MODULE_ROLES on the
  // backend; widening access here without widening it there yields 403s.
  { key: 'employees', to: '/employees', label: 'Employees', permission: 'employee:view', roles: ['HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'], group: 'hr' },
  { key: 'employeeImport', to: '/employees/import', label: 'Import Employees', permission: 'employee:import', roles: ['HUMAN_RESOURCES_ADMIN'], group: 'hr' },
  // Org Chart is deliberately kept out of the sidebar — reporting lines are set
  // from the employee record and the branch page, so the tree is a read-only
  // view reached by URL (/hr/hierarchy) rather than a menu destination.
  { key: 'orgChart', to: '/hr/hierarchy', label: 'Org Chart', permission: 'hierarchy:view', roles: ['HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'], group: 'hr', hidden: true },
  { key: 'attendance', to: '/attendance', label: 'Attendance', permission: 'attendance:view', roles: ['HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'], group: 'hr' },
  { key: 'attendanceRequests', to: '/hr/attendance-requests', label: 'Attendance Requests', permission: 'attendance:view', roles: ['HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'], group: 'hr' },
  { key: 'shifts', to: '/hr/shifts', label: 'Shifts', permission: 'shift:view', roles: ['HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'], group: 'hr' },
  { key: 'leave', to: '/leave', label: 'Leave', permission: 'leave:view', roles: ['HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'], group: 'hr' },
  { key: 'holidays', to: '/holidays', label: 'Holidays', permission: 'holiday:create', roles: ['HUMAN_RESOURCES_ADMIN'], group: 'hr' },
  { key: 'exit', to: '/hr/exit', label: 'Exit Management', permission: 'exit:view', roles: ['HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'], group: 'hr' },
  // Hidden from the sidebar per request. The attendance/payroll rules screen
  // stays routable at /settings/hr-policy (direct URL); it is no longer a menu item.
  { key: 'hrPolicy', to: '/settings/hr-policy', label: 'Attendance & Payroll Rules', permission: 'hr:configure', roles: ['HUMAN_RESOURCES_ADMIN'], group: 'hr', hidden: true },
  // Company-wide info published by HR — everyone with admin-panel access sees these.
  { key: 'announcements', to: '/announcements', label: 'Announcements', permission: 'announcement:view', roles: ALL_ROLES, group: 'hr' },
  { key: 'hrPolicyLibrary', to: '/hr-policies', label: 'HR Policies', permission: 'hr_policy:view', roles: ALL_ROLES, group: 'hr' },

  // Payroll & Finance — staff payroll, also HR-only.
  { key: 'payroll', to: '/payroll', label: 'Payroll', permission: 'payroll:view', roles: ['HUMAN_RESOURCES_ADMIN'], group: 'finance' },
  { key: 'employeeLoans', to: '/employee-loans', label: 'Employee Loans', permission: 'employee_loan:view', roles: ['HUMAN_RESOURCES_ADMIN'], group: 'finance' },
  { key: 'salaryAdvances', to: '/salary-advances', label: 'Salary Advances', permission: 'salary_advance:view', roles: ['HUMAN_RESOURCES_ADMIN'], group: 'finance' },

  // Operations
  { key: 'branches', to: '/branches', label: 'Branches', permission: 'branch:view', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'ACCOUNTANT', 'BRANCH_MANAGER'], group: 'operations' },
  { key: 'leads', to: '/leads', label: 'Leads', permission: 'lead:view', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'BRANCH_MANAGER'], group: 'operations' },
  { key: 'loans', to: '/loans', label: 'Loans', permission: 'loan:view', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT'], group: 'operations' },
  // Loan Applications and Loan Assignments are now first-class, nav-visible pages
  // living under the loan flow (/loans/applications, /loans/assignments).
  { key: 'applications', to: '/loans/applications', label: 'Loan Applications', permission: 'loan:approve', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'ACCOUNTANT'], group: 'operations' },
  { key: 'loanLink', to: '/loans/assignments', label: 'Loan Assignments', permission: 'loan:assign', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN'], group: 'operations' },
  // Collections — the payment ledger (record / edit / import collections).
  { key: 'collections', to: '/collections', label: 'Collections', permission: 'collection:view', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'ACCOUNTANT', 'BRANCH_MANAGER'], group: 'operations' },
  // Import the client's Business-Correspondent collection workbook — Super Admin only.
  { key: 'collectionImport', to: '/collections/import', label: 'Import Collections', roles: ['SUPER_ADMIN'], group: 'operations' },
  // Browse the imported BC collection ledger (separate from internal loan payments).
  { key: 'collectionRecords', to: '/collections/records', label: 'Collection Records', permission: 'collection:view', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'ACCOUNTANT'], group: 'operations' },
  // Bank-deposit settlement summary (opening/closing/deposits) from the imported
  // workbook. Branch Managers see it too — the backend pins them to their branch.
  { key: 'collectionSettlement', to: '/collections/settlement', label: 'Collection Settlement', permission: 'collection:view', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'ACCOUNTANT', 'BRANCH_MANAGER'], group: 'operations' },
  // Day-End Settlements — verify each field officer's day-end cash (own route,
  // was a tab on the Collections mega-page). Settlement offers / NPA live under
  // /settlements/offers, reached from this page.
  { key: 'settlements', to: '/settlements', label: 'Day-End Settlements', permission: 'collection:view', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'ACCOUNTANT', 'BRANCH_MANAGER'], group: 'operations' },
  // Branch-custody cash trail (stages 5–7): consolidated bank deposits, then
  // reconciliation of those deposits against the uploaded bank statement.
  { key: 'bankDeposits', to: '/reconciliation/deposits', label: 'Bank Deposits', permission: 'collection:reconcile', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'ACCOUNTANT', 'BRANCH_MANAGER'], group: 'operations' },
  { key: 'bankReconciliation', to: '/reconciliation', label: 'Bank Reconciliation', permission: 'collection:reconcile', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'ACCOUNTANT', 'BRANCH_MANAGER'], group: 'operations' },

  // Insights — every report in the catalog is an HR report (attendance,
  // employee, leave, payroll), so the whole engine is HR-only.
  { key: 'reports', to: '/reports', label: 'Reports', permission: 'reports:view', roles: ['HUMAN_RESOURCES_ADMIN'], group: 'insights' },

  // Administration
  // Hidden from the sidebar per request. Login accounts are administered per
  // employee from the Account & Access tab; the list stays routable at /users.
  { key: 'users', to: '/users', label: 'User Management', permission: 'employee:account', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'HUMAN_RESOURCES_ADMIN'], group: 'admin', hidden: true },
  // Employee personnel files — part of HR. Client/lead KYC lives on those records.
  { key: 'documents', to: '/documents', label: 'Document Center', permission: 'document:view', roles: ['HUMAN_RESOURCES_ADMIN'], group: 'admin' },
  { key: 'masters', to: '/masters', label: 'Organization Masters', permission: 'masters:view', roles: ['HUMAN_RESOURCES_ADMIN'], group: 'admin' },
  // Settings hosts only the RBAC role/permission editor, so it is gated on
  // 'roles:configure' — the code that unlocks that editor — not the broad
  // 'settings:view'. A role with settings:view but no roles:configure (e.g.
  // Operations, Auditor) would otherwise see a Settings menu whose single tile
  // opens an empty Roles & Permissions page. HR is deliberately NOT in `roles`
  // — HR must not be able to grant itself access beyond the HR module. The HR
  // policy screen (hrPolicy) is hidden from the menu; it stays reachable at
  // /settings/hr-policy by direct URL.
  { key: 'settings', to: '/settings', label: 'Settings', permission: 'roles:configure', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN'], group: 'admin' },
];

/** In-page actions, each mapped to the roles the backend permits. */
export const ACTION_ROLES = {
  // ── HR module actions. Restricted to HR (+ Super Admin, who wildcards
  // through `can`) to match HR_MODULE_ROLES on the backend.
  'employee:create': ['SUPER_ADMIN', 'HUMAN_RESOURCES_ADMIN'],
  'employee:update': ['SUPER_ADMIN', 'HUMAN_RESOURCES_ADMIN'],
  'leave:decide': ['SUPER_ADMIN', 'HUMAN_RESOURCES_ADMIN'],
  'payroll:run': ['SUPER_ADMIN', 'HUMAN_RESOURCES_ADMIN'],
  'payroll:markPaid': ['SUPER_ADMIN', 'HUMAN_RESOURCES_ADMIN'],
  'holiday:manage': ['SUPER_ADMIN', 'HUMAN_RESOURCES_ADMIN'],
  'leave:accrue': ['SUPER_ADMIN', 'HUMAN_RESOURCES_ADMIN'],
  // Org-wide leave-policy config (entitlement / accrual per leave type).
  'leave:managePolicy': ['SUPER_ADMIN', 'HUMAN_RESOURCES_ADMIN'],
  'salaryAdvance:manage': ['SUPER_ADMIN', 'HUMAN_RESOURCES_ADMIN'],
  // ── HRJee HR-module actions. HR (+ Super Admin) only — Branch Managers hold
  // the modules for VIEW but never these write/approve actions (read-only).
  'shift:manage': ['SUPER_ADMIN', 'HUMAN_RESOURCES_ADMIN'],
  'attendance:approve': ['SUPER_ADMIN', 'HUMAN_RESOURCES_ADMIN'],
  'hierarchy:manage': ['SUPER_ADMIN', 'HUMAN_RESOURCES_ADMIN'],
  'exit:manage': ['SUPER_ADMIN', 'HUMAN_RESOURCES_ADMIN'],
  'announcement:manage': ['SUPER_ADMIN', 'HUMAN_RESOURCES_ADMIN'],
  'hrPolicy:manage': ['SUPER_ADMIN', 'HUMAN_RESOURCES_ADMIN'],
  // Also gates the HR Policy screen (attendance rules + payroll rates).
  'master:manage': ['SUPER_ADMIN', 'HUMAN_RESOURCES_ADMIN'],
  'document:manage': ['SUPER_ADMIN', 'HUMAN_RESOURCES_ADMIN'],
  // Employee login-account management (send credentials, lock/unlock, etc.).
  'account:manage': ['SUPER_ADMIN', 'HUMAN_RESOURCES_ADMIN'],
  'employeeLoan:manage': ['SUPER_ADMIN', 'HUMAN_RESOURCES_ADMIN'],
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
  // Bank deposits + statement reconciliation (record deposit / match / unmatch).
  'reconcile:manage': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'ACCOUNTANT', 'BRANCH_MANAGER'],
  // RBAC — role administration (create/edit/configure the permission matrix) is
  // HQ / Super Admin. Assigning an existing role to an employee additionally
  // includes HR, who owns staff records; HR cannot edit the matrix itself and
  // so cannot widen its own access.
  'role:manage': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN'],
  'role:assign': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'HUMAN_RESOURCES_ADMIN'],
} satisfies Record<string, Role[]>;

export type Action = keyof typeof ACTION_ROLES;

/**
 * The permission code behind each in-page action — the matrix cell the backend
 * guard for that action checks. Used for every role outside the built-in six,
 * whose rights come from the matrix rather than from ACTION_ROLES above.
 */
export const ACTION_PERMISSIONS = {
  'employee:create': 'employee:create',
  'employee:update': 'employee:edit',
  'leave:decide': 'leave:approve',
  'payroll:run': 'payroll:run',
  'payroll:markPaid': 'payroll:approve',
  'holiday:manage': 'holiday:create',
  'leave:accrue': 'leave:accrue',
  'leave:managePolicy': 'leave:accrue',
  'salaryAdvance:manage': 'salary_advance:create',
  'shift:manage': 'shift:create',
  'attendance:approve': 'attendance:approve',
  'hierarchy:manage': 'hierarchy:manage',
  'exit:manage': 'exit:approve',
  'announcement:manage': 'announcement:create',
  'hrPolicy:manage': 'hr_policy:create',
  'master:manage': 'masters:create',
  'document:manage': 'document:create',
  'account:manage': 'employee:account',
  'employeeLoan:manage': 'employee_loan:create',
  'branch:create': 'branch:create',
  'branch:update': 'branch:edit',
  'branch:delete': 'branch:delete',
  'lead:create': 'lead:create',
  'lead:update': 'lead:edit',
  'lead:assign': 'lead:assign',
  'lead:stage': 'lead:edit',
  'application:review': 'loan:approve',
  'application:disburse': 'loan:disburse',
  'loan:create': 'loan:create',
  'loan:edit': 'loan:edit',
  'collection:record': 'collection:record',
  'loan:link': 'loan:assign',
  'settlement:verify': 'collection:verify',
  'settlement:decide': 'settlement:approve',
  'settlement:complete': 'settlement:complete',
  'collection:classify': 'collection:reconcile',
  // Bank deposits + statement reconciliation ride on the Collections module's
  // reconcile cell — the branch cash trail has no module of its own.
  'reconcile:manage': 'collection:reconcile',
  'role:manage': 'roles:configure',
  'role:assign': 'roles:assign',
} satisfies Record<Action, string>;

const asRole = (role?: string | null): Role | undefined =>
  ALL_ROLES.includes(role as Role) ? (role as Role) : undefined;

/**
 * Modules the caller may open, in sidebar order.
 *
 * Built-in roles use their `roles` list; everyone else (Operations, Collection
 * Manager, Auditor, custom roles) is resolved from the permission matrix.
 */
export const visibleModules = (role?: string | null): ModuleDef[] => {
  if (role === 'SUPER_ADMIN') return MODULES;
  const r = asRole(role);
  if (r) return MODULES.filter((m) => m.roles.includes(r));
  if (!role) return [];
  return MODULES.filter((m) => hasPermission(m.permission));
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

/** Whether the caller may open a given module. SUPER_ADMIN may open anything. */
export const canAccessModule = (role: string | null | undefined, key: ModuleKey): boolean => {
  if (role === 'SUPER_ADMIN') return true;
  const module = MODULES.find((m) => m.key === key);
  if (!module) return false;
  const r = asRole(role);
  if (r) return module.roles.includes(r);
  if (!role) return false;
  return hasPermission(module.permission);
};

/** Whether the caller may perform a specific in-page action. */
export const can = (role: string | null | undefined, action: Action): boolean => {
  if (role === 'SUPER_ADMIN') return true;
  const r = asRole(role);
  if (r) return (ACTION_ROLES[action] as Role[]).includes(r);
  if (!role) return false;
  return hasPermission(ACTION_PERMISSIONS[action]);
};

/**
 * Whether the caller sees the organisation-wide (headquarters) dashboard.
 * Everyone else with an assigned branch sees their branch dashboard instead.
 * Outside the built-in roles this follows the role's declared data scope, so an
 * org-wide role (Operations) gets the org-wide view.
 */
export const canViewHqDashboard = (role?: string | null): boolean => {
  const r = asRole(role);
  if (r) return r === 'SUPER_ADMIN' || r === 'HEADQUARTERS_ADMIN' || r === 'ACCOUNTANT';
  return Boolean(role) && currentScope() === 'ALL';
};

/** Whether the caller can list every branch. Others are pinned to their own. */
export const canListAllBranches = (role?: string | null): boolean => {
  const r = asRole(role);
  if (r) {
    return (
      r === 'SUPER_ADMIN' ||
      r === 'HEADQUARTERS_ADMIN' ||
      r === 'HUMAN_RESOURCES_ADMIN' ||
      r === 'ACCOUNTANT'
    );
  }
  return Boolean(role) && currentScope() === 'ALL';
};
