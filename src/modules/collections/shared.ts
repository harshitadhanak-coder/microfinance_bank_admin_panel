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

export interface SettlementAttachment {
  id: string;
  documentType: string;
  fileName: string;
}

/** One itemised bank pay-in within a day-end settlement. */
export interface SettlementDeposit {
  id: string;
  bank: 'AXIS' | 'SBI' | 'HDFC';
  amount: string;
  slipNumber: string | null;
  reference: string | null;
}

export interface DayEndSettlement {
  id: string;
  businessDate: string;
  openingBalance: string;
  hospicash: string;
  totalCashCollected: string;
  axisDeposit: string;
  sbiDeposit: string;
  hdfcDeposit: string;
  totalCashDeposited: string;
  closingBalance: string;
  varianceAmount: string;
  status: DayCloseStatus;
  depositReference: string | null;
  submittedAt: string | null;
  reviewNote: string | null;
  approvedById: string | null;
  employee: { fullName: string; employeeCode: string; branch: { name: string } | null };
  attachments: SettlementAttachment[];
  /** Itemised deposits that sum into the per-bank + total figures above. */
  deposits?: SettlementDeposit[];
}

/** One aggregated branch row of the Branch Closing Report. */
export interface BranchClosingRow {
  branchId: string | null;
  branchName: string;
  officerCount: number;
  settlementCount: number;
  openingBalance: number;
  hospicash: number;
  collection: number;
  axisDeposit: number;
  sbiDeposit: number;
  hdfcDeposit: number;
  totalDeposit: number;
  closingBalance: number;
}

export interface BranchClosingReport {
  rows: BranchClosingRow[];
  totals: Omit<BranchClosingRow, 'branchId' | 'branchName'>;
}

export const SETTLEMENT_ATTACHMENT_LABEL: Record<string, string> = {
  DEPOSIT_SLIP: 'Deposit slip',
  BANK_RECEIPT: 'Bank receipt',
  CASH_RECEIPT: 'Cash receipt',
  AXIS_DEPOSIT_SLIP: 'AXIS deposit slip',
  SBI_DEPOSIT_SLIP: 'SBI deposit slip',
  HDFC_DEPOSIT_SLIP: 'HDFC deposit slip',
};

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
