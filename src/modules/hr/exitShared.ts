import { titleCase } from '../../lib/format';

/**
 * Shapes and helpers shared by the two halves of Exit Management: HR's review
 * queue / the Branch Manager's read-only branch view (ExitPage), and the
 * self-service tab where an admin-portal employee files their own resignation
 * (MyResignation). Kept together so the status labels and the resignation shape
 * cannot drift between them.
 */

export interface ClearanceItem {
  id: string;
  department: string;
  label: string;
  status: string;
  remarks?: string | null;
}

export interface FinalSettlement {
  unpaidSalary: string;
  leaveEncashment: string;
  gratuity: string;
  deductions: string;
  loanRecovery: string;
  advanceRecovery: string;
  netPayable: string;
}

/**
 * A resignation as the self-service endpoints return it. The review queue adds
 * the `employee` block on top of this (see ExitPage) — the caller's own list
 * has no need of it.
 */
export interface Resignation {
  id: string;
  reason: string | null;
  resignationDate: string;
  requestedLastWorkingDate: string;
  approvedLastWorkingDate: string | null;
  noticePeriodDays: number;
  status: string;
  clearanceItems?: ClearanceItem[];
  finalSettlement?: FinalSettlement | null;
}

/** "NOTICE_PERIOD" → "Notice Period". */
export const exitLabel = (value: string): string => titleCase(value.replace(/_/g, ' '));

export const myResignationsKey = ['/human-resources/exit/resignations/me'] as const;

/** Refreshes both the review queue and the caller's own list after a change. */
export const invalidateResignations = (qc: {
  invalidateQueries: (f: { predicate: (q: { queryKey: readonly unknown[] }) => boolean }) => void;
}) =>
  qc.invalidateQueries({
    predicate: (q) => String(q.queryKey[0]).startsWith('/human-resources/exit/resignations'),
  });
