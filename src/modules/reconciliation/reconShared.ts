/** Shared types + helpers for the Bank Deposits and Bank Reconciliation pages. */
import { BadgeTone } from '../../components/Badge';

export type DepositBank = 'AXIS' | 'SBI' | 'HDFC';
export type BankDepositStatus = 'DEPOSITED' | 'RECONCILED' | 'CANCELLED';
export type MatchStatus = 'UNMATCHED' | 'AUTO' | 'MANUAL';

export const DEPOSIT_BANKS: DepositBank[] = ['AXIS', 'SBI', 'HDFC'];

export interface BranchRef {
  id: string;
  name: string;
  code: string;
}

/** A consolidated branch deposit (stage 5) — money paid into one bank. */
export interface BankDeposit {
  id: string;
  branchId: string;
  branch: BranchRef | null;
  bank: DepositBank;
  depositDate: string;
  amount: string;
  slipNumber: string | null;
  reference: string | null;
  status: BankDepositStatus;
  reconciledAmount: string;
  notes: string | null;
  reconciledAt: string | null;
  createdAt: string;
}

/** The deposit a statement line is matched to (compact form on a line). */
export interface MatchedDepositRef {
  id: string;
  bank: DepositBank;
  amount: string;
  depositDate: string;
  slipNumber: string | null;
  reference: string | null;
  branchId: string;
}

/** One parsed row of an uploaded bank statement (stage 6). */
export interface BankStatementLine {
  id: string;
  statementId: string;
  txnDate: string;
  valueDate: string | null;
  description: string | null;
  reference: string | null;
  debit: string;
  credit: string;
  balance: string | null;
  matchStatus: MatchStatus;
  matchedDepositId: string | null;
  matchedDeposit: MatchedDepositRef | null;
  matchedAt: string | null;
}

export interface BankStatement {
  id: string;
  bank: DepositBank;
  branchId: string | null;
  branch: BranchRef | null;
  accountNumber: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  fileName: string | null;
  closingBalance: string | null;
  lineCount: number;
  matchedCount: number;
  status: string;
  createdAt: string;
  /** Present on the detail endpoint. */
  lines?: BankStatementLine[];
}

export interface ReconciliationSummary {
  inTransit: { count: number; amount: number };
  reconciled: { count: number; amount: number };
  unmatchedLines: { count: number; amount: number };
  oldestInTransitDays: number;
}

export type DepositSettlementStatus = 'PENDING' | 'PARTIAL' | 'COMPLETED';

/** Per-bank money split shared by expected / deposited / remaining figures. */
export interface BankTotals {
  total: number;
  axis: number;
  sbi: number;
  hdfc: number;
}

/**
 * DB-computed deposit position for the Bank Deposits screen, scoped to a branch
 * and a settlement window (a single day, or a date range). Every figure is a
 * fresh server aggregate — the single source of truth — so the UI never derives
 * a running total from local state.
 */
export interface DepositSettlementSummary {
  scope: { from: string | null; to: string | null; isToday: boolean };
  /** What the branch is due to bank (from approved day-end settlements). */
  expected: BankTotals;
  /** What has actually been recorded as consolidated deposits (not cancelled). */
  deposited: BankTotals;
  /** expected − deposited (signed; negative means over-deposited). */
  remaining: BankTotals;
  entryCount: number;
  approvedSettlements: number;
  status: DepositSettlementStatus;
  inTransit: { count: number; amount: number };
  reconciled: { count: number; amount: number };
}

export const DEPOSIT_SETTLEMENT_STATUS_LABEL: Record<DepositSettlementStatus, string> = {
  PENDING: 'Pending',
  PARTIAL: 'Partial',
  COMPLETED: 'Completed',
};
export const DEPOSIT_SETTLEMENT_STATUS_TONE: Record<DepositSettlementStatus, BadgeTone> = {
  PENDING: 'warning',
  PARTIAL: 'info',
  COMPLETED: 'success',
};

export const BANK_TOTAL_KEY: Record<DepositBank, keyof Omit<BankTotals, 'total'>> = {
  AXIS: 'axis', SBI: 'sbi', HDFC: 'hdfc',
};

export const DEPOSIT_STATUS_TONE: Record<BankDepositStatus, BadgeTone> = {
  DEPOSITED: 'warning',
  RECONCILED: 'success',
  CANCELLED: 'neutral',
};
export const DEPOSIT_STATUS_LABEL: Record<BankDepositStatus, string> = {
  DEPOSITED: 'In transit',
  RECONCILED: 'Reconciled',
  CANCELLED: 'Cancelled',
};

export const MATCH_STATUS_TONE: Record<MatchStatus, BadgeTone> = {
  UNMATCHED: 'warning',
  AUTO: 'success',
  MANUAL: 'info',
};
export const MATCH_STATUS_LABEL: Record<MatchStatus, string> = {
  UNMATCHED: 'Unmatched',
  AUTO: 'Auto-matched',
  MANUAL: 'Matched',
};
