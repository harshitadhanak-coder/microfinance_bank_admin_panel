/** Shared types + labels for the Payroll module (run history, run detail, wizard). */

export interface PayrollRun {
  id: string;
  month: number;
  year: number;
  status: string;
  createdAt: string;
  totalNetPay?: number;
  totalGrossEarnings?: number;
  _count?: { payslips: number };
}

export interface Payslip {
  id: string;
  standardDays?: number | string;
  presentDays: string;
  paidLeaveDays?: number | string;
  lwpDays?: number | string;
  lossOfPayDays?: number | string;
  grossEarnings: string;
  totalDeductions?: string;
  providentFund: string;
  stateInsurance: string;
  professionalTax: string;
  loanDeduction: string;
  netPay: string;
  lateCount?: number;
  overtimeHours?: number | string;
  incentive?: string;
  bonus?: string;
  employee: { fullName: string; employeeCode: string; branch?: { name: string } | null };
}

/** Short month labels for compact period columns. */
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const periodLabel = (month: number, year: number): string => `${MONTHS_SHORT[month - 1]} ${year}`;
