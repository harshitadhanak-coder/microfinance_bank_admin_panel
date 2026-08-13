/**
 * Shared types and helpers for the ledger leave module (`/leave`).
 *
 * This replaces the legacy `/human-resources/leaves*` surface. Three shape
 * changes drive most of the screen rewrites, and they are worth stating up
 * front because none of them is a rename:
 *
 *  1. **Leave types are data, not an enum.** There is no fixed
 *     CASUAL|SICK|EARNED list any more — types are rows with a `code`, fetched
 *     from `/leave/types`. Never hardcode the list; HR can add one at any time.
 *
 *  2. **A request has LINES.** One request can span several leave types (5 days
 *     asked for, 3 paid + 2 LWP), so there is no single `leaveType` on the
 *     request. Use `requestTypeLabel()` for display.
 *
 *  3. **Approval is a chain, not a boolean.** `PARTIALLY_APPROVED` means
 *     approved at one step and waiting at the next. Anything that used to test
 *     `status === 'PENDING'` to mean "still open" must use `isOpen()`.
 */
import { api } from '../../api/client';

// ── Types ────────────────────────────────────────────────────────────────

export interface LeaveTypeDef {
  id: string;
  code: string;
  name: string;
  shortCode: string;
  unit: 'DAY' | 'HOUR';
  isPaid: boolean;
  affectsPayroll: boolean;
  isBalanceTracked: boolean;
  isEncashable: boolean;
  isSystem: boolean;
  colorHex?: string | null;
  displayOrder: number;
  status: 'ACTIVE' | 'INACTIVE';
}

/**
 * One leave type an employee may actually apply for, from
 * `/leave/me/eligibility` (or the HR route for somebody else).
 *
 * The apply pickers are built from THIS, not from `/leave/types`: maternity and
 * paternity are gender-scoped, so the full type list would offer people types
 * they can only be refused for. `rules.maxDaysPerRequest` is where the
 * entitlement lives for the types that carry no balance.
 */
export interface EligibleLeaveType {
  leaveTypeId: string;
  code: string;
  name: string;
  shortCode: string;
  unit: 'DAY' | 'HOUR';
  isPaid: boolean;
  isBalanceTracked: boolean;
  planCode: string;
  rules: {
    annualEntitlement: number;
    minNoticeDays: number;
    maxDaysPerRequest: number | null;
    allowHalfDay: boolean;
    allowHourly: boolean;
    sandwichRule: string;
    documentRequiredAfterDays: number | null;
  };
}

export interface LeaveBalance {
  leaveTypeId: string;
  code: string;
  name: string;
  shortCode: string;
  unit: 'DAY' | 'HOUR';
  isPaid: boolean;
  periodLabel: string;
  entitlement: number;
  opening: number;
  accrued: number;
  used: number;
  /** Days held by requests awaiting approval — reserved, not yet consumed. */
  pending: number;
  blocked: number;
  available: number;
  expiringSoon: number;
}

export interface BalancesResponse {
  asOf: string;
  balances: LeaveBalance[];
}

export interface LeaveRequestLine {
  id: string;
  leaveTypeId: string;
  quantity: string | number;
  isAutoConverted: boolean;
  leaveType: { code: string; name: string; shortCode: string };
}

export interface LeaveApproval {
  id: string;
  stepNo: number;
  action: 'PENDING' | 'APPROVED' | 'REJECTED' | 'RETURNED' | 'SKIPPED';
  comments?: string | null;
  actedAt?: string | null;
  dueAt?: string | null;
  approver?: { fullName: string } | null;
}

export interface LeaveRequestRow {
  id: string;
  requestNo: string;
  employeeId: string;
  fromDate: string;
  toDate: string;
  totalDays: string | number;
  reason?: string | null;
  status: LeaveRequestStatus;
  isEmergency: boolean;
  appliedOnBehalf: boolean;
  currentStepNo?: number | null;
  submittedAt?: string | null;
  decidedAt?: string | null;
  createdAt: string;
  employee?: {
    employeeCode: string;
    fullName: string;
    designation?: string | null;
    branch?: { name: string } | null;
  };
  lines: LeaveRequestLine[];
  approvals?: LeaveApproval[];
}

export interface LeaveRequestListResponse {
  items: LeaveRequestRow[];
  totalItems: number;
}

export type LeaveRequestStatus =
  | 'DRAFT' | 'PENDING' | 'PARTIALLY_APPROVED' | 'APPROVED'
  | 'REJECTED' | 'CANCELLED' | 'WITHDRAWN' | 'SUPERSEDED' | 'EXPIRED';

/** One violated rule from the preview. BLOCK stops submission; WARN does not. */
export interface RuleViolation {
  code: string;
  field?: string;
  message: string;
  severity: 'BLOCK' | 'WARN' | 'REQUIRE_HR_APPROVAL';
  meta?: Record<string, unknown>;
}

export interface PreviewDay {
  date: string;
  dayPortion: string;
  hours?: number | null;
  charged: number;
  dayClass: string;
  chargeable: boolean;
  chargeReason?: string | null;
}

export interface PreviewResult {
  totalChargedDays: number;
  lines: Array<{
    leaveTypeId: string;
    leaveTypeCode: string;
    planVersionId: string;
    quantity: number;
    isAutoConverted: boolean;
    days: PreviewDay[];
  }>;
  balance: { available: number; afterRequest: number } | null;
  violations: RuleViolation[];
  warnings: RuleViolation[];
  approvalChain: Array<{ stepNo: number; approverId: string; approverName: string }>;
  canSubmit: boolean;
}

export interface ApplyLeaveBody {
  employeeId?: string;
  lines: Array<{ leaveTypeId: string; fromDate: string; toDate: string }>;
  dayOverrides?: Array<{ date: string; dayPortion?: string; hours?: number }>;
  reason: string;
  contactDuringLeave?: string;
  handoverToId?: string;
  isEmergency?: boolean;
}

export interface LedgerEntry {
  id: string;
  sequenceNo: string | number;
  entryType: string;
  direction: 'CREDIT' | 'DEBIT';
  credit: string | number;
  debit: string | number;
  balanceAfter: string | number;
  entryStatus: string;
  effectiveDate: string;
  createdAt: string;
  reason?: string | null;
  referenceNo?: string | null;
  leaveType?: { code: string } | null;
}

// ── Status helpers ───────────────────────────────────────────────────────

/** Still moving through approval — the ledger's equivalent of "PENDING". */
export const isOpen = (status: string): boolean =>
  status === 'PENDING' || status === 'PARTIALLY_APPROVED';

/** Cancellable: open requests, and approved ones whose dates have not passed. */
export const isCancellable = (row: { status: string; toDate: string }): boolean =>
  isOpen(row.status) || (row.status === 'APPROVED' && new Date(row.toDate) >= new Date(new Date().toDateString()));

/**
 * Display label for a request's leave type. A request can carry several lines
 * — the auto-convert-to-LWP path produces exactly that — so a single type name
 * is not always the truth.
 */
export const requestTypeLabel = (lines: LeaveRequestLine[] | undefined): string => {
  if (!lines?.length) return '—';
  if (lines.length === 1) return lines[0].leaveType.name;
  return lines.map((l) => l.leaveType.shortCode).join(' + ');
};

/** Who the request is currently sitting with, for the list views. */
export const currentApprover = (row: LeaveRequestRow): string => {
  const pending = row.approvals?.find((a) => a.action === 'PENDING');
  return pending?.approver?.fullName ?? '—';
};

export const STATUS_FILTERS = [
  'ALL', 'PENDING', 'PARTIALLY_APPROVED', 'APPROVED', 'REJECTED', 'CANCELLED',
] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

// ── Query keys ───────────────────────────────────────────────────────────
// Every key starts '/leave' so a single predicate invalidates the whole module.

export const leaveKeys = {
  all: ['/leave'] as const,
  types: ['/leave/types'] as const,
  myRequests: ['/leave/me/requests'] as const,
  myBalances: ['/leave/me/balances'] as const,
  myEligibility: ['/leave/me/eligibility'] as const,
  myLedger: ['/leave/me/ledger'] as const,
  requests: (filter?: string) => ['/leave/requests', filter ?? 'all'] as const,
  employeeBalances: (employeeId: string) => ['/leave/employees/balances', employeeId] as const,
  employeeEligibility: (employeeId: string) => ['/leave/employees/eligibility', employeeId] as const,
  employeeLedger: (employeeId: string) => ['/leave/employees/ledger', employeeId] as const,
  policies: ['/leave/policies'] as const,
  policy: (id: string) => ['/leave/policies', id] as const,
  periodSchemes: ['/leave/period-schemes'] as const,
  accrualRuns: ['/leave/accrual/runs'] as const,
  pendingApprovals: ['/leave/approvals/pending'] as const,
};

/** Invalidates every leave query. Pass the client from useQueryClient(). */
export const invalidateLeave = (qc: { invalidateQueries: (f: { predicate: (q: { queryKey: readonly unknown[] }) => boolean }) => void }) =>
  qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/leave') });

// ── Fetchers ─────────────────────────────────────────────────────────────

const data = <T>(r: { data: { data: T } }): T => r.data.data;

export const leaveApi = {
  listTypes: () => api.get('/leave/types').then(data<LeaveTypeDef[]>),

  myBalances: () => api.get('/leave/me/balances').then(data<BalancesResponse>),
  myEligibility: () =>
    api.get('/leave/me/eligibility').then(data<{ eligibility: EligibleLeaveType[] }>).then((r) => r.eligibility),
  myRequests: (limit = 100) => api.get(`/leave/me/requests?limit=${limit}`).then(data<LeaveRequestListResponse>),
  myLedger: (limit = 100) => api.get(`/leave/me/ledger?limit=${limit}`).then(data<{ entries: LedgerEntry[] }>),

  preview: (body: ApplyLeaveBody) => api.post('/leave/me/requests/preview', body).then(data<PreviewResult>),
  apply: (body: ApplyLeaveBody) => api.post('/leave/me/requests', body).then(data<LeaveRequestRow>),
  cancelMine: (id: string, reason?: string) =>
    api.post(`/leave/me/requests/${id}/cancel`, reason ? { reason } : {}).then(data<unknown>),

  listRequests: (params: Record<string, string | number | undefined>) => {
    const query = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== '' && v !== 'ALL')
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&');
    return api.get(`/leave/requests${query ? `?${query}` : ''}`).then(data<LeaveRequestListResponse>);
  },
  getRequest: (id: string) => api.get(`/leave/requests/${id}`).then(data<LeaveRequestRow>),
  employeeBalances: (employeeId: string) =>
    api.get(`/leave/employees/${employeeId}/balances`).then(data<BalancesResponse>),
  employeeEligibility: (employeeId: string) =>
    api.get(`/leave/employees/${employeeId}/eligibility`)
      .then(data<{ eligibility: EligibleLeaveType[] }>)
      .then((r) => r.eligibility),
  employeeLedger: (employeeId: string, limit = 100) =>
    api.get(`/leave/employees/${employeeId}/ledger?limit=${limit}`).then(data<{ entries: LedgerEntry[] }>),

  applyOnBehalf: (body: ApplyLeaveBody) => api.post('/leave/requests/on-behalf', body).then(data<LeaveRequestRow>),
  /**
   * HR cancels someone else's request. There is deliberately no delete: the
   * ledger reverses with a contra entry instead of destroying the record.
   */
  hrCancel: (id: string, reason?: string) =>
    api.post(`/leave/requests/${id}/cancel`, reason ? { reason } : {}).then(data<unknown>),

  decide: (approvalId: string, action: 'APPROVED' | 'REJECTED' | 'RETURNED', comments?: string) =>
    api.post(`/leave/approvals/${approvalId}/decision`, { action, ...(comments ? { comments } : {}) }).then(data<unknown>),
  pendingApprovals: () => api.get('/leave/approvals/pending').then(data<unknown[]>),

  /**
   * How much history a policy has. Decides whether the screen offers Delete
   * (never used — clearing a mistake) or Retire (in use — stop it applying
   * without destroying the explanation for balances it already produced).
   */
  /** Reset cycles a policy version can be anchored to (calendar year, FY…). */
  listPeriodSchemes: () => api.get('/leave/period-schemes').then(data<PeriodScheme[]>),

  planUsage: (planId: string) => api.get(`/leave/policies/${planId}/usage`).then(data<PlanUsage>),
  deletePlan: (planId: string) => api.delete(`/leave/policies/${planId}`).then(data<unknown>),
  retirePlan: (planId: string) => api.post(`/leave/policies/${planId}/retire`).then(data<RetireResult>),
  deleteAssignment: (planId: string, assignmentId: string) =>
    api.delete(`/leave/policies/${planId}/assignments/${assignmentId}`).then(data<unknown>),

  runAccrual: (month: number, year: number, dryRun = false) =>
    api.post('/leave/accrual/runs', { month, year, dryRun }).then(data<AccrualRunResult>),
  backfillAccrual: (monthsBack = 12) =>
    api.post('/leave/accrual/backfill', { monthsBack }).then(data<unknown>),
  listAccrualRuns: () => api.get('/leave/accrual/runs').then(data<AccrualRun[]>),
};

export interface PeriodScheme {
  id: string;
  code: string;
  name: string;
  startMonth: number;
  startDay: number;
  durationMonths: number;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface PlanUsage {
  ledgerEntries: number;
  requestLines: number;
  resolutions: number;
  accrualItems: number;
  /** Assignments targeting people right now. */
  activeAssignments: number;
  /** Versions that ever left DRAFT — i.e. the policy has been in force. */
  liveVersions: number;
  /** Rows elsewhere whose numbers this policy's rules explain. */
  hasHistory: boolean;
  /**
   * True if the policy ever went live or targets anyone today — so the screen
   * offers Retire rather than Delete.
   */
  isUsed: boolean;
  /**
   * Nothing anywhere references it, so it can be removed outright. Stays true
   * once retired, which is how a retired-but-never-used policy gets cleared
   * off the list instead of sitting there forever.
   */
  canDelete: boolean;
}

export interface RetireResult {
  id: string;
  status: string;
  assignmentsClosed: number;
  versionsClosed: number;
  resolutionsClosed: number;
}

export interface AccrualRunResult {
  runId: string;
  runNo: string;
  dryRun: boolean;
  totalEmployees: number;
  successCount: number;
  skippedCount: number;
  failedCount: number;
  totalCredited: number;
  skipBreakdown: Record<string, number>;
}

export interface AccrualRun {
  id: string;
  runNo: string;
  runType: string;
  accrualMonth: number;
  accrualYear: number;
  status: string;
  isDryRun: boolean;
  totalEmployees: number;
  successCount: number;
  skippedCount: number;
  failedCount: number;
  totalCredited: string | number;
  completedAt?: string | null;
  createdAt: string;
}
