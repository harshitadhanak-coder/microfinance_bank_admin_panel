/**
 * Shared types + helpers for the Roles administration UI. These mirror the RBAC
 * endpoints (`/roles`, `/permissions`, `/employees/:id/roles`) added in the RBAC
 * redesign. See the API's `src/constants/rbac.constants.ts` for the catalog.
 */
import { BadgeTone } from '../../components/Badge';

export type ScopeType = 'ALL' | 'BRANCH' | 'SELF' | 'ASSIGNED';

export interface RoleRow {
  id: string;
  name: string;
  key: string | null;
  displayName: string | null;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  scopeType: ScopeType;
  _count?: { permissions?: number; users?: number; employeeRoles?: number };
}

export interface RoleDetail extends RoleRow {
  permissions: { permissionId: string; permission: { code: string } }[];
}

export interface RoleOption {
  id: string;
  key: string | null;
  name: string;
  displayName: string | null;
  isSystem: boolean;
  scopeType: ScopeType;
}

export interface PermissionEntry {
  id: string;
  code: string;
  module: string;
  action: string;
  displayName: string;
  sortOrder: number;
}

export interface PermissionGroup {
  module: string;
  label: string;
  permissions: PermissionEntry[];
}

export interface EmployeeRoleAssignment {
  id: string;
  roleId: string;
  isPrimary: boolean;
  branchId: string | null;
  assignedAt: string;
  revokedAt: string | null;
  role: { id: string; key: string | null; name: string; displayName: string | null; scopeType: ScopeType; isActive: boolean };
  branch: { id: string; code: string; name: string } | null;
}

/** Human label for a role: prefer displayName, fall back to a titled name. */
export const roleLabel = (role: { displayName?: string | null; name?: string }): string =>
  role.displayName || (role.name ?? '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const SCOPE_LABEL: Record<ScopeType, string> = {
  ALL: 'Organisation',
  BRANCH: 'Branch',
  SELF: 'Own records',
  ASSIGNED: 'Assigned',
};
export const scopeLabel = (scope: ScopeType): string => SCOPE_LABEL[scope] ?? scope;

const SCOPE_TONE: Record<ScopeType, BadgeTone> = {
  ALL: 'brass',
  BRANCH: 'info',
  SELF: 'neutral',
  ASSIGNED: 'warning',
};
export const scopeTone = (scope: ScopeType): BadgeTone => SCOPE_TONE[scope] ?? 'neutral';

export const SCOPE_OPTIONS: { value: ScopeType; label: string }[] = [
  { value: 'ALL', label: 'Organisation-wide (all branches)' },
  { value: 'BRANCH', label: 'Own branch only' },
  { value: 'SELF', label: 'Own records only' },
  { value: 'ASSIGNED', label: 'Assigned records only' },
];
