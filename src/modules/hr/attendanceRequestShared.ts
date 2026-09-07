import { titleCase } from '../../lib/format';

/**
 * Shapes and helpers shared by the two halves of the Attendance Requests page:
 * the HR/Branch-Manager review queue (AttendanceRequestsPage) and the
 * self-service tab where an admin-portal employee raises their own correction
 * (MyAttendanceRequests). Kept together so the type list, the labels and the
 * which-fields-does-this-type-need rules cannot drift between them.
 */

export const REQUEST_TYPES = [
  'MISSING_PUNCH',
  'REGULARIZATION',
  'WRONG_TIMING',
  'OUTDOOR_DUTY',
  'WORK_FROM_HOME',
  'PERMISSION',
] as const;
export type AttendanceRequestType = (typeof REQUEST_TYPES)[number];

/** Types that correct a punch, so a requested check-in time is required. */
const PUNCH_TYPES: readonly string[] = ['MISSING_PUNCH', 'REGULARIZATION', 'WRONG_TIMING'];
/** Types that can span several days, so a `toDate` is offered. */
const RANGE_TYPES: readonly string[] = ['OUTDOOR_DUTY', 'WORK_FROM_HOME'];

export const isPunchRequest = (type: string): boolean => PUNCH_TYPES.includes(type);
export const isRangeRequest = (type: string): boolean => RANGE_TYPES.includes(type);

/** "MISSING_PUNCH" → "Missing Punch". */
export const requestTypeLabel = (type: string): string => titleCase(type.replace(/_/g, ' '));

/** Requested check-in/out are full timestamps; only the clock time matters. */
export const fmtRequestTime = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

/** One of the caller's own requests (`GET /attendance/requests/me`). */
export interface MyAttendanceRequest {
  id: string;
  type: AttendanceRequestType;
  fromDate: string;
  toDate: string;
  requestedCheckIn: string | null;
  requestedCheckOut: string | null;
  reason: string | null;
  status: string;
}

export const myAttendanceRequestsKey = ['/human-resources/attendance/requests/me'] as const;

/** Refreshes both the review queue and the caller's own list after a change. */
export const invalidateAttendanceRequests = (qc: {
  invalidateQueries: (f: { predicate: (q: { queryKey: readonly unknown[] }) => boolean }) => void;
}) =>
  qc.invalidateQueries({
    predicate: (q) => String(q.queryKey[0]).startsWith('/human-resources/attendance/requests'),
  });
