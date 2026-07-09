/**
 * Front-end authorization model. This mirrors the role rules enforced by the
 * backend (see each module's *.routes.ts) so the UI never offers an action or
 * route that the API would reject with a 403.
 *
 * Two layers:
 *   • MODULES  — which navigation sections a role may open (sidebar + routing)
 *   • can()    — whether a role may perform a specific in-page action
 */

export type Role =
  | 'SUPER_ADMIN'
  | 'HEADQUARTERS_ADMIN'
  | 'BRANCH_MANAGER'
  | 'FIELD_OFFICER'
  | 'HUMAN_RESOURCES_ADMIN'
  | 'ACCOUNTANT';

export type ModuleKey = 'dashboard' | 'hrDashboard' | 'employees' | 'attendance' | 'leave' | 'payroll' | 'employeeLoans' | 'branches' | 'loans' | 'applications' | 'leads' | 'collections';

export interface ModuleDef {
  key: ModuleKey;
  to: string;
  label: string;
  end?: boolean;
  roles: Role[];
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
 * Navigation modules and the roles allowed to open them. Order defines the
 * sidebar order and the fallback landing page (first module the role can see).
 */
export const MODULES: ModuleDef[] = [
  { key: 'dashboard', to: '/', label: 'Dashboard', end: true, roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'ACCOUNTANT', 'BRANCH_MANAGER', 'FIELD_OFFICER'] },
  // HR-facing screens. Scoped to HR (and SUPER_ADMIN, which sees every module)
  // so no other role's sidebar changes. 'hrDashboard' is first among HR modules
  // so it becomes HR's landing page.
  { key: 'hrDashboard', to: '/hr-overview', label: 'Dashboard', end: true, roles: ['HUMAN_RESOURCES_ADMIN'] },
  { key: 'employees', to: '/employees', label: 'Employees', roles: ['HUMAN_RESOURCES_ADMIN'] },
  { key: 'attendance', to: '/attendance', label: 'Attendance', roles: ['HUMAN_RESOURCES_ADMIN'] },
  { key: 'leave', to: '/leave', label: 'Leave', roles: ['HUMAN_RESOURCES_ADMIN'] },
  { key: 'payroll', to: '/payroll', label: 'Payroll', roles: ['HUMAN_RESOURCES_ADMIN'] },
  { key: 'employeeLoans', to: '/employee-loans', label: 'Employee Loans', roles: ['HUMAN_RESOURCES_ADMIN'] },
  { key: 'branches', to: '/branches', label: 'Branches', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'HUMAN_RESOURCES_ADMIN', 'ACCOUNTANT', 'BRANCH_MANAGER'] },
  // Client loans — an operations/finance function, not HR. Every role except HR.
  { key: 'loans', to: '/loans', label: 'Loans', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'BRANCH_MANAGER', 'FIELD_OFFICER', 'ACCOUNTANT'] },
  { key: 'applications', to: '/applications', label: 'Applications', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'ACCOUNTANT', 'BRANCH_MANAGER', 'FIELD_OFFICER'] },
  { key: 'leads', to: '/leads', label: 'Leads', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'BRANCH_MANAGER', 'FIELD_OFFICER'] },
  { key: 'collections', to: '/collections', label: 'Collections', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'ACCOUNTANT', 'BRANCH_MANAGER'] },
];

/** In-page actions, each mapped to the roles the backend permits. */
export const ACTION_ROLES = {
  // POST /employees  &  PATCH /employees/:id
  'employee:create': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'HUMAN_RESOURCES_ADMIN'],
  'employee:update': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'HUMAN_RESOURCES_ADMIN'],
  // POST /human-resources/leaves/:id/decision
  'leave:decide': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'],
  // POST /human-resources/payroll/run
  'payroll:run': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'HUMAN_RESOURCES_ADMIN'],
  // Employee-loan lifecycle (apply / decide / disburse / repay)
  'employeeLoan:manage': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'HUMAN_RESOURCES_ADMIN'],
  // POST /branches
  'branch:create': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN'],
  // PATCH /branches/:id
  'branch:update': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN'],
  // DELETE /branches/:id
  'branch:delete': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN'],
  // POST /loans/applications/:id/review
  'application:review': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'BRANCH_MANAGER'],
  // POST /loans/applications/:id/disburse
  'application:disburse': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'ACCOUNTANT'],
  // POST /settlements/:id/decision
  'settlement:decide': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN'],
  // POST /settlements/:id/complete
  'settlement:complete': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'ACCOUNTANT'],
  // POST /collections/jobs/classify-npa
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

/**
 * HR-facing modules that SUPER_ADMIN sees collected under a single "Human
 * Resources" sidebar group. The HUMAN_RESOURCES_ADMIN role keeps these as a
 * plain flat list (its whole sidebar is HR), so grouping only applies to
 * SUPER_ADMIN — see navItems().
 */
export const HR_GROUP_KEYS: ModuleKey[] = [
  'hrDashboard',
  'employees',
  'attendance',
  'leave',
  'payroll',
  'employeeLoans',
];

export interface NavLinkItem {
  type: 'link';
  module: ModuleDef;
}

export interface NavGroupItem {
  type: 'group';
  key: string;
  label: string;
  children: ModuleDef[];
}

export type NavItem = NavLinkItem | NavGroupItem;

/**
 * Sidebar navigation for a role. For SUPER_ADMIN the HR screens are folded into
 * one collapsible "Human Resources" group (inserted where the first HR module
 * would sit) so the long flat list stays readable. Every other role — including
 * HUMAN_RESOURCES_ADMIN — gets the unchanged flat list.
 */
export const navItems = (role?: string | null): NavItem[] => {
  const mods = visibleModules(role);
  if (asRole(role) !== 'SUPER_ADMIN') {
    return mods.map((module) => ({ type: 'link', module }));
  }

  const items: NavItem[] = [];
  let hrGroup: NavGroupItem | null = null;
  for (const module of mods) {
    if (HR_GROUP_KEYS.includes(module.key)) {
      if (!hrGroup) {
        hrGroup = { type: 'group', key: 'hr', label: 'Human Resources', children: [] };
        items.push(hrGroup);
      }
      // The HR overview's own label is just "Dashboard"; inside the SUPER_ADMIN
      // "Human Resources" group that clashes with the top-level Dashboard, so
      // show it as "HR Dashboard" here only. HR's own sidebar is unaffected.
      hrGroup.children.push(
        module.key === 'hrDashboard' ? { ...module, label: 'HR Dashboard' } : module,
      );
    } else {
      items.push({ type: 'link', module });
    }
  }
  return items;
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
