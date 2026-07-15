import { BadgeTone } from '../../components/Badge';

// ── Domain shapes (shared by the list, summary and month-detail views) ──

export type AttStatus = 'PRESENT' | 'HALF_DAY' | 'ABSENT' | 'WEEKLY_OFF' | 'HOLIDAY' | 'ON_LEAVE' | 'UPCOMING';

export interface AttendanceRow {
  id: string;
  attendanceDate: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  workedMinutes: number;
  source: string;
  isHoliday: boolean;
  status?: AttStatus;
  isLate?: boolean;
  lateMinutes?: number;
  overtimeMinutes?: number;
  earlyDepartureMinutes?: number;
  employee: { id?: string; fullName: string; employeeCode: string; branch?: { name: string } | null };
}

export interface SummaryEmployee { fullName: string; employeeCode: string; branch?: { name: string } | null }
export interface SummaryRow {
  employeeId: string;
  employee: SummaryEmployee;
  present: number;
  halfDay: number;
  absent: number;
  weeklyOff: number;
  holiday: number;
  onLeave: number;
  lateCount: number;
  overtimeHours: number;
}
export interface SummaryResponse { month: number; year: number; rows: SummaryRow[] }

export interface CalendarDay {
  date: string;
  status?: AttStatus;
  isLate?: boolean;
  lateMinutes?: number;
  overtimeMinutes?: number;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  leaveType?: string | null;
  holidayName?: string | null;
}
export interface CalendarSummary {
  present: number;
  halfDay: number;
  absent: number;
  weeklyOff: number;
  holiday: number;
  onLeave: number;
  lateCount: number;
  overtimeHours: number;
}
export interface CalendarResponse { month: number; year: number; days: CalendarDay[]; summary: CalendarSummary }

export interface BranchOption { id: string; name: string; code: string }
export interface EmployeeOption { id: string; fullName: string; employeeCode: string }

// ── Presentation constants & helpers ──

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const STATUS_FILTERS = ['', 'PRESENT', 'ABSENT', 'HOLIDAY'] as const;

export const statusLabel = (s: string): string => (s ? s.charAt(0) + s.slice(1).toLowerCase() : 'All statuses');

/** Attendance status → badge tone. One mapping, reused by the list, calendar and legend. */
export const STATUS_TONE: Record<AttStatus, BadgeTone> = {
  PRESENT: 'success',
  HALF_DAY: 'warning',
  ABSENT: 'danger',
  ON_LEAVE: 'info',
  WEEKLY_OFF: 'neutral',
  HOLIDAY: 'brass',
  UPCOMING: 'neutral',
};

/** Human label for a status, e.g. `HALF_DAY → "Half-day"`. */
export const statusText = (s: AttStatus): string =>
  s.replace(/_/g, '-').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/** The punch-derived statuses, for the "how is this derived?" legend. */
export const STATUS_LEGEND: { status: AttStatus; hint: string }[] = [
  { status: 'PRESENT', hint: 'Punched in for a full day' },
  { status: 'HALF_DAY', hint: 'Worked below the half-day threshold' },
  { status: 'ABSENT', hint: 'No punch on a working day' },
  { status: 'ON_LEAVE', hint: 'Approved leave' },
  { status: 'HOLIDAY', hint: 'Declared holiday' },
  { status: 'WEEKLY_OFF', hint: 'Weekly off' },
];

export const fmtTime = (value?: string | null): string =>
  value ? new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';
export const fmtWorked = (minutes: number): string =>
  minutes > 0 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : '—';
export const otHours = (minutes?: number): string =>
  minutes && minutes > 0 ? `${(minutes / 60).toFixed(1)}h` : '—';
