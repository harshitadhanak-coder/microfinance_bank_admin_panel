/** Shared types + labels for the Employee Loans module (List, Create, Details). */

export interface EmployeeLoanRow {
  id: string;
  loanNumber: string;
  principalAmount: string;
  annualInterestRate: string;
  tenureMonths: number;
  monthlyDeduction: string;
  outstandingAmount: string;
  purpose?: string | null;
  decisionNote?: string | null;
  status: string;
  requestedAt: string;
  disbursedAt?: string | null;
  closedAt?: string | null;
  employee: { fullName: string; employeeCode: string; designation: string; branch?: { name: string } | null };
}

export interface EmployeeOption { id: string; fullName: string; employeeCode: string }

export const EMPLOYEE_LOAN_STATUSES = ['ALL', 'PENDING', 'APPROVED', 'DISBURSED', 'CLOSED', 'REJECTED'] as const;
export type EmployeeLoanStatusFilter = (typeof EMPLOYEE_LOAN_STATUSES)[number];

export const empLoanStatusLabel = (s: string): string => s.charAt(0) + s.slice(1).toLowerCase();
