/** Shared types + helpers for the Collections and Settlements modules. */

export interface PaymentRow {
  id: string; receiptNumber: string; amount: string; paymentMode: string; collectedAt: string; remarks: string | null;
  loan: { loanNumber: string; client: { fullName: string }; branch: { name: string } | null };
  collectedByEmployee: { fullName: string } | null;
}

export interface ActiveLoanOption {
  id: string; loanNumber: string; client: { fullName: string }; assignedOfficer?: { fullName: string } | null;
}

export type DayCloseStatus = 'DRAFT' | 'SUBMITTED' | 'VERIFIED' | 'APPROVED' | 'REJECTED';

export interface DayEndSettlement {
  id: string;
  businessDate: string;
  totalCashCollected: string;
  totalCashDeposited: string;
  varianceAmount: string;
  status: DayCloseStatus;
  depositReference: string | null;
  submittedAt: string | null;
  reviewNote: string | null;
  approvedById: string | null;
  employee: { fullName: string; employeeCode: string; branch: { name: string } | null };
}

export interface SettlementOffer {
  id: string; settlementType: string; status: string; settlementAmount: string; waiverAmount: string;
  loan: { loanNumber: string; client: { fullName: string }; branch: { name: string } };
}

export const PAYMENT_MODES = ['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const modeLabel = (m: string) => m.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** Day-end settlement statuses used as the list filter. */
export const SETTLEMENT_STATUSES = ['PENDING', 'SUBMITTED', 'VERIFIED', 'APPROVED', 'REJECTED', ''];
export const settlementStatusLabel: Record<string, string> = {
  PENDING: 'Pending review', SUBMITTED: 'Submitted', VERIFIED: 'Verified', APPROVED: 'Approved', REJECTED: 'Rejected', '': 'All',
};
