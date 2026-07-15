import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

/**
 * Shared types, constants and helpers for the Employee module's List / Create /
 * Edit / Details pages, so those pages don't each re-declare the salary
 * components, org-master option shapes and fetching, or the compaction helpers.
 */

// ── Row / detail shapes ──
export interface EmployeeRow {
  id: string;
  employeeCode: string;
  fullName: string;
  phoneNumber: string;
  email?: string | null;
  designation: string;
  employmentStatus: string;
  joiningDate: string;
  branchId?: string | null;
  branch?: { name: string } | null;
}

export interface BranchOption { id: string; name: string; code: string }
export interface DepartmentOption { id: string; name: string; code: string }
export interface DesignationOption { id: string; name: string; code: string; department: { id: string; name: string } | null }
export interface GradeOption { id: string; name: string; code: string; level?: number }
export interface EmploymentTypeOption { id: string; name: string; code: string }
export interface ShiftOption { id: string; name: string; code: string; startTime?: string; endTime?: string }
export interface EmployeeLite { id: string; fullName: string; designation: string; branchId?: string | null }

// ── Status ──
export const STATUS_FILTERS = ['', 'ONBOARDING', 'ACTIVE', 'ON_NOTICE', 'SEPARATED'] as const;
export const statusLabel = (s: string): string =>
  s ? s.charAt(0) + s.slice(1).toLowerCase().replaceAll('_', ' ') : 'All statuses';

// ── Login roles for the create form's account section ──
export const LOGIN_ROLES: { value: string; label: string; portal: string }[] = [
  { value: 'FIELD_OFFICER', label: 'Field Officer', portal: 'Field Officer app' },
  { value: 'ACCOUNTANT', label: 'Accountant', portal: 'Field Officer app' },
  { value: 'BRANCH_MANAGER', label: 'Branch Manager', portal: 'Admin panel' },
];

// ── Salary components (sum to gross / CTC) ──
export type SalaryComponentKey =
  | 'basicSalary' | 'houseRentAllowance' | 'dearnessAllowance' | 'specialAllowance'
  | 'conveyanceAllowance' | 'medicalAllowance' | 'travelAllowance' | 'foodAllowance'
  | 'mobileAllowance' | 'otherAllowance';

export const SALARY_COMPONENTS: { key: SalaryComponentKey; label: string }[] = [
  { key: 'basicSalary', label: 'Basic' },
  { key: 'houseRentAllowance', label: 'House rent allowance' },
  { key: 'dearnessAllowance', label: 'Dearness allowance' },
  { key: 'specialAllowance', label: 'Special allowance' },
  { key: 'conveyanceAllowance', label: 'Conveyance allowance' },
  { key: 'medicalAllowance', label: 'Medical allowance' },
  { key: 'travelAllowance', label: 'Travel allowance' },
  { key: 'foodAllowance', label: 'Food allowance' },
  { key: 'mobileAllowance', label: 'Mobile allowance' },
  { key: 'otherAllowance', label: 'Other allowance' },
];

// ── Documents ──
export const DOCUMENT_TYPES = [
  'Aadhaar Card', 'PAN Card', 'Passport', 'Driving License', 'Voter ID',
  'Photograph', 'Offer Letter', 'Employment Contract', 'Other',
];
export const DOCUMENT_CATEGORIES: { key: string; label: string }[] = [
  { key: 'PERSONAL', label: 'Personal' },
  { key: 'EMPLOYMENT', label: 'Employment' },
  { key: 'FINANCIAL', label: 'Financial' },
  { key: 'OTHER', label: 'Other' },
];

const MS_PER_DAY = 86_400_000;
/** True when a document expires within the next 30 days (or is already past due). */
export const isExpiringSoon = (expiryDate?: string | null): boolean =>
  !!expiryDate && (new Date(expiryDate).getTime() - Date.now()) <= 30 * MS_PER_DAY;

// ── Helpers ──
/** Drop empty-string / null keys so PATCH/POST bodies omit untouched fields. */
export const compact = <T extends Record<string, unknown>>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null)) as Partial<T>;

export const num = (v: string): number | '' => (v ? Number(v) : '');

// ── Org-master option lists (shared fetch) ──
export interface EmployeeMasters {
  branches: BranchOption[];
  departments: DepartmentOption[];
  designations: DesignationOption[];
  grades: GradeOption[];
  employmentTypes: EmploymentTypeOption[];
  shifts: ShiftOption[];
  managers: EmployeeLite[];
  isLoading: boolean;
}

/**
 * Fetches every option list the Create/Edit forms need (branches, the five
 * org-masters, and the employee directory for the reporting-manager select).
 * `enabled` gates the requests so a list page doesn't pull them until needed.
 */
export function useEmployeeMasters(enabled = true): EmployeeMasters {
  const branches = useQuery({
    queryKey: ['/branches', 'options'],
    queryFn: () => api.get('/branches?pageSize=100').then((r) => r.data.data as BranchOption[]),
    enabled,
  });
  const departments = useQuery({
    queryKey: ['/masters/departments/options'],
    queryFn: () => api.get('/masters/departments/options').then((r) => r.data.data as DepartmentOption[]),
    enabled,
  });
  const designations = useQuery({
    queryKey: ['/masters/designations/options'],
    queryFn: () => api.get('/masters/designations/options').then((r) => r.data.data as DesignationOption[]),
    enabled,
  });
  const grades = useQuery({
    queryKey: ['/masters/grades/options'],
    queryFn: () => api.get('/masters/grades/options').then((r) => r.data.data as GradeOption[]),
    enabled,
  });
  const employmentTypes = useQuery({
    queryKey: ['/masters/employment-types/options'],
    queryFn: () => api.get('/masters/employment-types/options').then((r) => r.data.data as EmploymentTypeOption[]),
    enabled,
  });
  const shifts = useQuery({
    queryKey: ['/masters/shifts/options'],
    queryFn: () => api.get('/masters/shifts/options').then((r) => r.data.data as ShiftOption[]),
    enabled,
  });
  const managers = useQuery({
    queryKey: ['/employees', 'directory'],
    queryFn: () => api.get('/employees?pageSize=200').then((r) => r.data.data as EmployeeLite[]),
    enabled,
  });
  return {
    branches: branches.data ?? [],
    departments: departments.data ?? [],
    designations: designations.data ?? [],
    grades: grades.data ?? [],
    employmentTypes: employmentTypes.data ?? [],
    shifts: shifts.data ?? [],
    managers: managers.data ?? [],
    isLoading: branches.isLoading || departments.isLoading || designations.isLoading,
  };
}
