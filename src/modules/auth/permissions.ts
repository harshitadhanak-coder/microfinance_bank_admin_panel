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
  | 'leave'
  | 'payroll'
  | 'employeeLoans'
  | 'branches'
  | 'loans'
  | 'loanLink'
  | 'applications'
  | 'leads'
  | 'collections'
  | 'settlements';

export type ModuleGroup = 'hr' | 'operations';

export interface ModuleDef {
  key: ModuleKey;
  to: string;
  label: string;
  end?: boolean;
  roles: Role[];
  /** Sidebar group. Omitted for top-level links (e.g. Dashboard). */
  group?: ModuleGroup;
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
  // Top-level
  { key: 'dashboard', to: '/', label: 'Dashboard', end: true, roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'ACCOUNTANT', 'BRANCH_MANAGER'] },

  // Human Resources
  { key: 'hrDashboard', to: '/hr-overview', label: 'HR', end: true, roles: ['HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'], group: 'hr' },
  { key: 'employees', to: '/employees', label: 'Employee Management', roles: ['HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'], group: 'hr' },
  { key: 'attendance', to: '/attendance', label: 'Attendance', roles: ['HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'], group: 'hr' },
  { key: 'employeeLoans', to: '/employee-loans', label: 'Employee Loan', roles: ['HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'], group: 'hr' },
  { key: 'payroll', to: '/payroll', label: 'Payroll', roles: ['HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'], group: 'hr' },
  { key: 'leave', to: '/leave', label: 'Leave', roles: ['HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'], group: 'hr' },

  // Operations
  { key: 'branches', to: '/branches', label: 'Branch Master', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'HUMAN_RESOURCES_ADMIN', 'ACCOUNTANT', 'BRANCH_MANAGER'], group: 'operations' },
  { key: 'leads', to: '/leads', label: 'Lead Review', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'BRANCH_MANAGER'], group: 'operations' },
  { key: 'applications', to: '/applications', label: 'Loan Applications', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'ACCOUNTANT'], group: 'operations' },
  { key: 'loans', to: '/loans', label: 'Loan List', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT'], group: 'operations' },
  { key: 'loanLink', to: '/loan-link', label: 'Loan Link with FO', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN'], group: 'operations' },
  // Collections & Settlements — one screen: assign loans to field officers for
  // collection, and verify each officer's day-end cash (plus settlement offers
  // / NPA classification for HQ & accounts).
  { key: 'collections', to: '/collections', label: 'Collections & Settlements', roles: ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'ACCOUNTANT', 'BRANCH_MANAGER'], group: 'operations' },
];

/** In-page actions, each mapped to the roles the backend permits. */
export const ACTION_ROLES = {
  'employee:create': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'],
  'employee:update': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'],
  'leave:decide': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'],
  'payroll:run': ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'HUMAN_RESOURCES_ADMIN', 'BRANCH_MANAGER'],
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
  hr: 'Human Resources',
  operations: 'Operations',
};
const GROUP_ORDER: ModuleGroup[] = ['hr', 'operations'];

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
 * Sidebar navigation for a role: top-level links first (Dashboard), then a
 * collapsible group per section (Human Resources, Operations). The HR admin —
 * whose entire sidebar is HR — keeps a flat list instead of a single group.
 */
export const navItems = (role?: string | null): NavItem[] => {
  const mods = visibleModules(role);
  const r = asRole(role);

  if (r === 'HUMAN_RESOURCES_ADMIN') {
    return mods.map((module) => ({ type: 'link', module }));
  }

  const items: NavItem[] = mods.filter((m) => !m.group).map((module) => ({ type: 'link', module }));

  for (const groupKey of GROUP_ORDER) {
    const children = mods
      .filter((m) => m.group === groupKey)
      // The HR overview's own label is "Dashboard"; inside a group that clashes
      // with the top-level Dashboard, so show it as "HR Dashboard" there.
      .map((m) => (m.key === 'hrDashboard' ? { ...m, label: 'HR Dashboard' } : m));
    if (children.length) items.push({ type: 'group', key: groupKey, label: GROUP_LABEL[groupKey], children });
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
