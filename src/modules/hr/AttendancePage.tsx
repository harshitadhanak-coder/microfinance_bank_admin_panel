import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { useServerTable } from '../../components/useServerTable';
import { CardsSkeleton, TableSkeleton } from '../../components/Skeleton';
import { CalendarCheck, ListChecks, LogOut, UserCheck } from '../../components/icons';
import { fmtDate, titleCase, apiMessage } from '../../lib/format';
import { useToast } from '../../components/Toast';

type AttStatus = 'PRESENT' | 'HALF_DAY' | 'ABSENT' | 'WEEKLY_OFF' | 'HOLIDAY' | 'ON_LEAVE';

interface AttendanceRow {
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

interface SummaryEmployee { fullName: string; employeeCode: string; branch?: { name: string } | null }
interface SummaryRow {
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
interface SummaryResponse { month: number; year: number; rows: SummaryRow[] }

interface CalendarDay {
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
interface CalendarSummary {
  present: number;
  halfDay: number;
  absent: number;
  weeklyOff: number;
  holiday: number;
  onLeave: number;
  lateCount: number;
  overtimeHours: number;
}
interface CalendarResponse { month: number; year: number; days: CalendarDay[]; summary: CalendarSummary }

interface BranchOption { id: string; name: string; code: string }
interface EmployeeOption { id: string; fullName: string; employeeCode: string }

const STATUS_FILTERS = ['', 'PRESENT', 'ABSENT', 'HOLIDAY'] as const;
const statusLabel = (s: string): string => (s ? s.charAt(0) + s.slice(1).toLowerCase() : 'All statuses');

const fmtTime = (value?: string | null): string =>
  value ? new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';
const fmtWorked = (minutes: number): string =>
  minutes > 0 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : '—';
const otHours = (minutes?: number): string =>
  minutes && minutes > 0 ? `${(minutes / 60).toFixed(1)}h` : '—';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Small colored status chip, reused by the list and per-employee summary table. */
function StatusChip({ status }: { status?: AttStatus }) {
  if (!status) return <>—</>;
  return <span className={`att-chip att-${status.toLowerCase()}`}>{titleCase(status)}</span>;
}

export default function AttendancePage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const now = new Date();

  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [calEmployeeId, setCalEmployeeId] = useState('');

  const table = useServerTable({ initialSort: { key: 'attendanceDate', direction: 'desc' } });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [branchId, setBranchId] = useState('');
  const [status, setStatus] = useState('');
  const [employeeId, setEmployeeId] = useState('');

  const branchesQuery = useQuery({
    queryKey: ['/branches', 'attendance-filter'],
    queryFn: () => api.get('/branches?pageSize=100').then((r) => r.data.data as BranchOption[]),
  });
  const employeesQuery = useQuery({
    queryKey: ['/employees', 'attendance-filter'],
    queryFn: () => api.get('/employees?pageSize=100').then((r) => r.data.data as EmployeeOption[]),
  });

  const extra = new URLSearchParams();
  if (from) extra.set('from', from);
  if (to) extra.set('to', to);
  if (branchId) extra.set('branchId', branchId);
  if (status) extra.set('status', status);
  if (employeeId) extra.set('employeeId', employeeId);
  const listUrl = `/human-resources/attendance?${table.params}${extra.toString() ? `&${extra.toString()}` : ''}`;

  const query = useQuery({
    queryKey: [listUrl],
    queryFn: () => api.get(listUrl).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const rows = (query.data?.data ?? []) as AttendanceRow[];
  const totalItems = (query.data?.pagination?.totalItems ?? 0) as number;

  const summaryUrl = `/human-resources/attendance/summary?month=${month}&year=${year}`;
  const summaryQuery = useQuery({
    queryKey: [summaryUrl],
    queryFn: () => api.get(summaryUrl).then((r) => r.data.data as SummaryResponse),
    placeholderData: keepPreviousData,
  });
  const summaryRows = summaryQuery.data?.rows ?? [];

  const totals = useMemo(() => {
    return summaryRows.reduce(
      (acc, r) => ({
        present: acc.present + (r.present || 0),
        halfDay: acc.halfDay + (r.halfDay || 0),
        absent: acc.absent + (r.absent || 0),
        onLeave: acc.onLeave + (r.onLeave || 0),
        lateCount: acc.lateCount + (r.lateCount || 0),
        overtimeHours: acc.overtimeHours + (r.overtimeHours || 0),
      }),
      { present: 0, halfDay: 0, absent: 0, onLeave: 0, lateCount: 0, overtimeHours: 0 },
    );
  }, [summaryRows]);

  const calUrl = `/human-resources/attendance/calendar?month=${month}&year=${year}&employeeId=${calEmployeeId}`;
  const calendarQuery = useQuery({
    queryKey: [calUrl],
    queryFn: () => api.get(calUrl).then((r) => r.data.data as CalendarResponse),
    enabled: view === 'calendar' && !!calEmployeeId,
    placeholderData: keepPreviousData,
  });

  const invalidateAttendance = () => {
    queryClient.invalidateQueries({ queryKey: [listUrl] });
    queryClient.invalidateQueries({ queryKey: [summaryUrl] });
    queryClient.invalidateQueries({ queryKey: [calUrl] });
  };

  const punchIn = useMutation({
    mutationFn: () => api.post('/human-resources/attendance/punch-in', {}).then((r) => r.data),
    onSuccess: (data) => { toast.success(data?.message || 'Checked in'); invalidateAttendance(); },
    onError: (err) => toast.error(apiMessage(err, 'Check-in failed')),
  });
  const punchOut = useMutation({
    mutationFn: () => api.post('/human-resources/attendance/punch-out', {}).then((r) => r.data),
    onSuccess: (data) => { toast.success(data?.message || 'Checked out'); invalidateAttendance(); },
    onError: (err) => toast.error(apiMessage(err, 'Check-out failed')),
  });

  const columns: Column<AttendanceRow>[] = [
    { header: 'Employee', render: (a) => <strong>{a.employee.fullName}</strong>, sortKey: 'employee' },
    { header: 'Code', render: (a) => <code>{a.employee.employeeCode}</code>, sortKey: 'employeeCode' },
    { header: 'Branch', render: (a) => a.employee.branch?.name ?? '—', sortKey: 'branch' },
    { header: 'Date', render: (a) => fmtDate(a.attendanceDate), sortKey: 'attendanceDate' },
    {
      header: 'Status',
      render: (a) => (
        <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
          <StatusChip status={a.status} />
          {a.isLate && <span className="att-chip att-late">Late {a.lateMinutes ?? 0}m</span>}
        </span>
      ),
    },
    { header: 'Check in', render: (a) => fmtTime(a.checkInAt), sortKey: 'checkInAt' },
    { header: 'Check out', render: (a) => fmtTime(a.checkOutAt), sortKey: 'checkOutAt' },
    { header: 'Worked', render: (a) => fmtWorked(a.workedMinutes), sortKey: 'workedMinutes' },
    { header: 'Late by', render: (a) => (a.lateMinutes ? `${a.lateMinutes}m` : '—'), sortKey: 'lateMinutes' },
    { header: 'OT', render: (a) => otHours(a.overtimeMinutes), sortKey: 'overtimeMinutes' },
    { header: 'Source', render: (a) => <span className="pill pill-active">{a.source.replaceAll('_', ' ')}</span>, sortKey: 'source' },
  ];

  const resetPage = () => table.setPage(1);
  const clearFilters = () => { setFrom(''); setTo(''); setBranchId(''); setStatus(''); setEmployeeId(''); resetPage(); };
  const hasFilters = !!(from || to || branchId || status || employeeId);

  const yearOptions = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  const cal = calendarQuery.data;
  const leadingEmpty = cal && cal.days.length ? new Date(cal.days[0]!.date).getUTCDay() : 0;

  const renderSummaryTiles = (t: { present: number; halfDay: number; absent: number; onLeave: number; lateCount: number; overtimeHours: number }) => (
    <div className="att-summary">
      <div className="sum-tile"><div className="sum-val">{t.present}</div><div className="sum-lbl">Present</div></div>
      <div className="sum-tile"><div className="sum-val">{t.halfDay}</div><div className="sum-lbl">Half-day</div></div>
      <div className="sum-tile"><div className="sum-val">{t.absent}</div><div className="sum-lbl">Absent</div></div>
      <div className="sum-tile"><div className="sum-val">{t.onLeave}</div><div className="sum-lbl">On leave</div></div>
      <div className="sum-tile"><div className="sum-val">{t.lateCount}</div><div className="sum-lbl">Late</div></div>
      <div className="sum-tile"><div className="sum-val">{t.overtimeHours.toFixed(1)}</div><div className="sum-lbl">Overtime (hrs)</div></div>
    </div>
  );

  return (
    <>
      <header className="page-head">
        <h1>Attendance</h1>
        <p className="muted">Daily check-in / check-out records across all branches</p>
      </header>

      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><UserCheck /> My attendance</strong>
        <span className="muted" style={{ fontSize: 13 }}>Mark your own check-in / check-out for today.</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="primary sm" disabled={punchIn.isPending} onClick={() => punchIn.mutate()}>
          <UserCheck /> {punchIn.isPending ? 'Checking in…' : 'Check in'}
        </button>
        <button type="button" className="ghost sm" disabled={punchOut.isPending} onClick={() => punchOut.mutate()}>
          <LogOut /> {punchOut.isPending ? 'Checking out…' : 'Check out'}
        </button>
      </div>

      <div className="filter-bar">
        <label>Month
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </label>
        <label>Year
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <span style={{ flex: 1 }} />
        <div className="pill-toggle" role="group" style={{ display: 'inline-flex', gap: 6 }}>
          <button type="button" className={view === 'list' ? 'primary sm' : 'ghost sm'} onClick={() => setView('list')}>
            <ListChecks /> List
          </button>
          <button type="button" className={view === 'calendar' ? 'primary sm' : 'ghost sm'} onClick={() => setView('calendar')}>
            <CalendarCheck /> Calendar
          </button>
        </div>
      </div>

      {summaryQuery.isLoading ? (
        <CardsSkeleton count={6} />
      ) : (
        <>
          {renderSummaryTiles(totals)}
        </>
      )}

      {view === 'list' ? (
        <>
          <div className="filter-bar">
            <label>From<input type="date" value={from} onChange={(e) => { setFrom(e.target.value); resetPage(); }} /></label>
            <label>To<input type="date" value={to} onChange={(e) => { setTo(e.target.value); resetPage(); }} /></label>
            <label>Branch
              <select value={branchId} onChange={(e) => { setBranchId(e.target.value); resetPage(); }}>
                <option value="">All branches</option>
                {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label>Employee
              <select value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); resetPage(); }}>
                <option value="">All employees</option>
                {employeesQuery.data?.map((e) => <option key={e.id} value={e.id}>{e.fullName} ({e.employeeCode})</option>)}
              </select>
            </label>
            <label>Status
              <select value={status} onChange={(e) => { setStatus(e.target.value); resetPage(); }}>
                {STATUS_FILTERS.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
              </select>
            </label>
            {hasFilters && <button type="button" className="ghost sm" onClick={clearFilters}>Clear</button>}
          </div>

          <DataTable
            columns={columns}
            rows={rows}
            loading={query.isLoading}
            empty="No attendance records for the selected filters."
            searchPlaceholder="Search by employee, code, branch or source…"
            server={{
              page: table.page, pageSize: table.pageSize, totalItems,
              onPageChange: table.setPage, sort: table.sort, onSortChange: table.onSortChange,
              search: table.search, onSearchChange: table.onSearchChange,
            }}
          />

          <section className="card" style={{ marginTop: 16 }}>
            <h2 style={{ marginTop: 0 }}>Monthly summary — {MONTHS[month - 1]} {year}</h2>
            {summaryQuery.isLoading ? (
              <TableSkeleton rows={6} columns={7} />
            ) : summaryRows.length === 0 ? (
              <p className="muted">No summary data for this month.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Employee</th><th>Present</th><th>Half</th><th>Absent</th>
                      <th>Leave</th><th>Late</th><th>OT (hrs)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryRows.map((r) => (
                      <tr key={r.employeeId}>
                        <td><strong>{r.employee.fullName}</strong> <code>{r.employee.employeeCode}</code></td>
                        <td>{r.present}</td>
                        <td>{r.halfDay}</td>
                        <td>{r.absent}</td>
                        <td>{r.onLeave}</td>
                        <td>{r.lateCount}</td>
                        <td>{r.overtimeHours.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="card" style={{ marginTop: 4 }}>
          <div className="filter-bar">
            <label>Employee
              <select value={calEmployeeId} onChange={(e) => setCalEmployeeId(e.target.value)}>
                <option value="">Select an employee…</option>
                {summaryRows.map((r) => (
                  <option key={r.employeeId} value={r.employeeId}>
                    {r.employee.fullName} ({r.employee.employeeCode})
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!calEmployeeId ? (
            <p className="muted">Select an employee to view their monthly calendar.</p>
          ) : calendarQuery.isLoading ? (
            <CardsSkeleton count={6} />
          ) : !cal ? (
            <p className="muted">No calendar data available.</p>
          ) : (
            <>
              {renderSummaryTiles(cal.summary)}
              <div className="att-cal">
                {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
                {Array.from({ length: leadingEmpty }).map((_, i) => <div key={`empty-${i}`} className="cal-cell empty" />)}
                {cal.days.map((day) => {
                  const dom = new Date(day.date).getUTCDate();
                  const tagTitle = day.status === 'HOLIDAY' ? day.holidayName ?? undefined
                    : day.status === 'ON_LEAVE' ? day.leaveType ?? undefined : undefined;
                  return (
                    <div key={day.date} className="cal-cell">
                      <span className="cal-day">{dom}</span>
                      {day.status && (
                        <span className={`cal-tag att-${day.status.toLowerCase()}`} title={tagTitle}>
                          {titleCase(day.status)}
                        </span>
                      )}
                      {day.isLate && <span className="cal-tag att-late" title={`${day.lateMinutes ?? 0}m late`}>Late</span>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
