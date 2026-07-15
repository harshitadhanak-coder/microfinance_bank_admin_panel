/**
 * Shared types, label maps and option shapes for the Loans module — extracted so
 * the List, Create, Import and Details pages speak one vocabulary (mirrors the
 * employees module's shared.ts).
 */

export interface LoanRow {
  id: string; loanNumber: string; principalAmount: string; outstandingPrincipal: string;
  installmentAmount: string; status: string; assetClassification: string;
  disbursedAt?: string | null; nextDueDate?: string | null;
  client: { fullName: string; phoneNumber: string };
  loanProduct: { name: string };
  branch: { name: string };
  assignedOfficer?: { id: string; fullName: string } | null;
}

export interface Installment {
  id: string; sequenceNumber: number; dueDate: string;
  principalDue: string; interestDue: string; totalDue: string;
  amountPaid: string; penaltyAmount: string; status: string; paidAt?: string | null;
}

export interface LoanPayment {
  id: string; receiptNumber: string; amount: string; paymentMode: string; collectedAt: string; remarks?: string | null;
}

export interface LoanDetail {
  id: string; loanNumber: string; status: string; assetClassification: string;
  principalAmount: string; annualInterestRate: string; tenureMonths: number;
  installmentAmount: string; outstandingPrincipal: string; totalAmountPaid: string;
  accruedPenalty: string; disbursedAt?: string | null; closedAt?: string | null; purpose?: string | null;
  client: { fullName: string; phoneNumber: string; clientCode: string };
  loanProduct: { name: string; interestMethod: string };
  branch: { name: string };
  loanApplication?: { applicationNumber: string; status: string; leadId?: string | null } | null;
  assignedOfficerId?: string | null;
  installments: Installment[];
  payments: LoanPayment[];
}

export interface ClientOption { id: string; fullName: string; clientCode: string; kycStatus: string; isBlacklisted: boolean; branchId: string }
export interface ProductOption { id: string; name: string; minimumAmount: string; maximumAmount: string; minimumTenureMonths: number; maximumTenureMonths: number }
export interface EmployeeOption { id: string; fullName: string; designation: string | null; branchId?: string | null }

/** Loan lifecycle statuses used as the list's status filter (blank = all). */
export const LOAN_STATUSES = ['', 'ACTIVE', 'CLOSED', 'SETTLED', 'WRITTEN_OFF', 'FORECLOSED'];

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Active', CLOSED: 'Closed', SETTLED: 'Settled',
  WRITTEN_OFF: 'Written off', FORECLOSED: 'Foreclosed',
};
export const loanStatusLabel = (v: string): string => STATUS_LABEL[v] ?? v.replaceAll('_', ' ');

const BUCKET_LABEL: Record<string, string> = {
  STANDARD: 'Standard', SPECIAL_MENTION_0: 'SMA-0', SPECIAL_MENTION_1: 'SMA-1',
  SPECIAL_MENTION_2: 'SMA-2', NON_PERFORMING: 'NPA', WRITTEN_OFF: 'Written off',
};
export const bucketLabel = (v: string): string => BUCKET_LABEL[v] ?? v.replaceAll('_', ' ');

/** Application review stages used as the applications list filter. */
export const APPLICATION_STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'DISBURSED'];
