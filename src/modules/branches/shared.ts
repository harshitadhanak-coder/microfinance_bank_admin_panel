/** Shared types + helpers for the Branches module (List, Create, Edit, Details). */

export interface BranchRow {
  id: string; code: string; name: string; addressLine: string; city: string; state: string; status: string;
  manager?: { fullName: string } | null;
  _count?: { clients: number; loans: number; employees: number };
}

export interface BranchDetail extends BranchRow {
  managerId?: string | null;
}

/** Aggregate returned by GET /branches/:id/dashboard. */
export interface BranchDashboard {
  activeLoanCount: number;
  outstandingPrincipal: number | string;
  overdueInstallmentCount: number;
  pendingCollectionAmount: number | string;
  collectedToday: number | string;
}

/** Editable branch fields (financials/manager are managed elsewhere). */
export interface BranchForm { code: string; name: string; addressLine: string; city: string; state: string }

export const emptyBranchForm: BranchForm = { code: '', name: '', addressLine: '', city: '', state: '' };

/** Branch status values used as the list filter (blank = all). */
export const BRANCH_STATUSES = ['', 'ACTIVE', 'INACTIVE'];
