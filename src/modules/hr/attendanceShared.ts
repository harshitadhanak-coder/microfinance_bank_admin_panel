import { BadgeTone } from '../../components/Badge';

// ── Domain shapes (shared by the list, summary and month-detail views) ──

export type AttStatus = 'PRESENT' | 'HALF_DAY' | 'ABSENT' | 'WEEKLY_OFF' | 'HOLIDAY' | 'ON_LEAVE' | 'UPCOMING';

export interface AttendanceRow {
  id: string;
  attendanceDate: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  /** Place name resolved at punch time; null when GPS was unavailable. */
  checkInLocation?: string | null;
  checkOutLocation?: string | null;
  checkInLatitude?: string | number | null;
  checkInLongitude?: string | number | null;
  checkOutLatitude?: string | number | null;
  checkOutLongitude?: string | number | null;
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
  checkInLocation?: string | null;
  checkOutLocation?: string | null;
  checkInLatitude?: string | number | null;
  checkInLongitude?: string | number | null;
  checkOutLatitude?: string | number | null;
  checkOutLongitude?: string | number | null;
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

/**
 * The exact position of a punch, ready to display and to plot.
 *
 * `display` is for reading, `mapUrl` for proving. A geocoded name can only ever
 * be as precise as the underlying map data — in thinly-mapped areas the best
 * available answer names a whole town — so the coordinates are what actually
 * establish where somebody was, and every punch that has them gets a link to
 * see the pin.
 */
export const punchCoordinates = (
  latitude?: string | number | null,
  longitude?: string | number | null,
): { display: string; mapUrl: string } | null => {
  if (latitude == null || longitude == null) return null;
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    display: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
    mapUrl: `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`,
  };
};

/**
 * How one punch's place reads on screen: the name resolved when the punch was
 * recorded, falling back to the raw coordinates.
 *
 * The fallback matters — a punch whose coordinates were captured before place
 * names existed, or whose lookup failed, still knows *where* it happened, and
 * showing the numbers is far better than an empty cell that implies no GPS.
 */
export const punchLocation = (
  name?: string | null,
  latitude?: string | number | null,
  longitude?: string | number | null,
): string | null => {
  if (name && name.trim()) return name.trim();
  return punchCoordinates(latitude, longitude)?.display ?? null;
};
