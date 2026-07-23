import { FormEvent, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { useServerTable } from '../../components/useServerTable';
import { PageHeader } from '../../components/PageHeader';
import { Card, StatCard } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Tabs, TabDef } from '../../components/Tabs';
import { FilterBar, FilterChip } from '../../components/FilterBar';
import { EmptyState } from '../../components/EmptyState';
import { Calendar, CalendarDayCell } from '../../components/Calendar';
import { Modal } from '../../components/Modal';
import { CardsSkeleton } from '../../components/Skeleton';
import { CalendarCheck, ListChecks, LogOut, UserCheck, ArrowRight, FileSpreadsheet, Search } from '../../components/icons';
import { fmtDate, apiMessage } from '../../lib/format';
import { useToast } from '../../components/Toast';
import {
  AttendanceRow, SummaryRow, SummaryResponse, CalendarResponse, BranchOption, EmployeeOption,
  MONTHS, STATUS_FILTERS, statusLabel, STATUS_TONE, statusText, STATUS_LEGEND,
  fmtTime, fmtWorked, otHours, AttStatus,
} from './attendanceShared';

/** Small day-status chip pair (status + optional "Late") used in list cells. */
function StatusCell({ status, isLate, lateMinutes }: { status?: AttStatus; isLate?: boolean; lateMinutes?: number }) {
  if (!status) return <>—</>;
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      <Badge tone={STATUS_TONE[status]}>{statusText(status)}</Badge>
      {isLate && <Badge tone="warning">Late {lateMinutes ?? 0}m</Badge>}
    </span>
  );
}

/** The punch-derivation legend, shown under the summary tiles. */
function Legend() {
  return (
    <div className="att-legend">
      <span className="att-legend-lead">Statuses are derived from punches:</span>
      {STATUS_LEGEND.map((l) => (
        <span key={l.status} className="att-legend-item" title={l.hint}>
          <span className={`legend-swatch tone-${STATUS_TONE[l.status]}`} aria-hidden="true" />
          {statusText(l.status)}
        </span>
      ))}
    </div>
  );
}

type ViewKey = 'list' | 'summary' | 'calendar';

/**
 * Attendance — List + Calendar. A single browse surface with a view switch:
 * the daily records table and per-employee monthly summary (List), or a
 * per-employee month grid (Calendar). Self-service punch in/out lives in the
 * header; a full month drill-down opens at /attendance/:employeeId.
 */
export default function AttendancePage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [manualOpen, setManualOpen] = useState(false);
  const navigate = useNavigate();
  const now = new Date();

  const [params, setParams] = useSearchParams();
  const view = (params.get('view') as ViewKey) || 'list';
  const month = Number(params.get('month')) || now.getMonth() + 1;
  const year = Number(params.get('year')) || now.getFullYear();
  const calEmployeeId = params.get('emp') || '';

  const patchParams = (patch: Record<string, string | null>) =>
    setParams((p) => {
      Object.entries(patch).forEach(([k, v]) => (v == null ? p.delete(k) : p.set(k, v)));
      return p;
    }, { replace: true });

  const setView = (v: ViewKey) => patchParams({ view: v });
  const setMonth = (m: number) => patchParams({ month: String(m) });
  const setYear = (y: number) => patchParams({ year: String(y) });
  const setCalEmployeeId = (id: string) => patchParams({ emp: id || null });
  const shiftMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    patchParams({ month: String(d.getMonth() + 1), year: String(d.getFullYear()) });
  };

  const table = useServerTable({ initialSort: { key: 'attendanceDate', direction: 'desc' } });
  const from = params.get('from') || '';
  const to = params.get('to') || '';
  const branchId = params.get('branch') || '';
  const status = params.get('status') || '';
  const employeeId = params.get('employee') || '';

  const setFilter = (key: string, value: string) => { patchParams({ [key]: value || null }); table.setPage(1); };

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
    enabled: view === 'list',
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

  const totals = useMemo(() => summaryRows.reduce(
    (acc, r) => ({
      present: acc.present + (r.present || 0),
      halfDay: acc.halfDay + (r.halfDay || 0),
      absent: acc.absent + (r.absent || 0),
      onLeave: acc.onLeave + (r.onLeave || 0),
      lateCount: acc.lateCount + (r.lateCount || 0),
      overtimeHours: acc.overtimeHours + (r.overtimeHours || 0),
    }),
    { present: 0, halfDay: 0, absent: 0, onLeave: 0, lateCount: 0, overtimeHours: 0 },
  ), [summaryRows]);

  const calUrl = `/human-resources/attendance/calendar?month=${month}&year=${year}&employeeId=${calEmployeeId}`;
  const calendarQuery = useQuery({
    queryKey: [calUrl],
    queryFn: () => api.get(calUrl).then((r) => r.data.data as CalendarResponse),
    enabled: view === 'calendar' && !!calEmployeeId,
    placeholderData: keepPreviousData,
  });

  const invalidateAttendance = () => {
    queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/human-resources/attendance') });
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

  const openEmployee = (id?: string) => id && navigate(`/attendance/${id}?month=${month}&year=${year}`);

  const columns: Column<AttendanceRow>[] = [
    { header: 'Employee', render: (a) => <a className="cell-link" onClick={() => openEmployee(a.employee.id)}>{a.employee.fullName}</a>, sortKey: 'employee' },
    { header: 'Code', render: (a) => <code>{a.employee.employeeCode}</code>, sortKey: 'employeeCode' },
    { header: 'Branch', render: (a) => a.employee.branch?.name ?? '—', sortKey: 'branch' },
    { header: 'Date', render: (a) => fmtDate(a.attendanceDate), sortKey: 'attendanceDate' },
    { header: 'Status', render: (a) => <StatusCell status={a.status} isLate={a.isLate} lateMinutes={a.lateMinutes} /> },
    { header: 'Check in', render: (a) => fmtTime(a.checkInAt), sortKey: 'checkInAt' },
    { header: 'Check out', render: (a) => fmtTime(a.checkOutAt), sortKey: 'checkOutAt' },
    { header: 'Worked', render: (a) => fmtWorked(a.workedMinutes), sortKey: 'workedMinutes' },
    { header: 'Late by', render: (a) => (a.lateMinutes ? `${a.lateMinutes}m` : '—'), sortKey: 'lateMinutes' },
    { header: 'OT', render: (a) => otHours(a.overtimeMinutes), sortKey: 'overtimeMinutes' },
    { header: 'Source', render: (a) => <Badge tone="neutral">{a.source.replaceAll('_', ' ')}</Badge>, sortKey: 'source' },
  ];

  const summaryColumns: Column<SummaryRow & { id: string }>[] = [
    { header: 'Employee', render: (r) => <a className="cell-link" onClick={() => openEmployee(r.employeeId)}>{r.employee.fullName}</a>, sortValue: (r) => r.employee.fullName },
    { header: 'Code', render: (r) => <code>{r.employee.employeeCode}</code>, sortValue: (r) => r.employee.employeeCode },
    { header: 'Present', render: (r) => <span className="num">{r.present}</span>, sortValue: (r) => r.present },
    { header: 'Half', render: (r) => <span className="num">{r.halfDay}</span>, sortValue: (r) => r.halfDay },
    { header: 'Absent', render: (r) => <span className="num">{r.absent}</span>, sortValue: (r) => r.absent },
    { header: 'Leave', render: (r) => <span className="num">{r.onLeave}</span>, sortValue: (r) => r.onLeave },
    { header: 'Late', render: (r) => <span className="num">{r.lateCount}</span>, sortValue: (r) => r.lateCount },
    { header: 'OT (hrs)', render: (r) => <span className="num">{r.overtimeHours.toFixed(1)}</span>, sortValue: (r) => r.overtimeHours },
    { header: '', render: (r) => <button type="button" className="sm ghost" onClick={() => openEmployee(r.employeeId)}>Month <ArrowRight size={13} /></button> },
  ];
  const summaryTableRows = summaryRows.map((r) => ({ ...r, id: r.employeeId }));

  const clearFilters = () => { patchParams({ from: null, to: null, branch: null, status: null, employee: null }); table.setPage(1); };
  const employeeName = (id: string) => employeesQuery.data?.find((e) => e.id === id);
  const chips: FilterChip[] = [
    ...(from ? [{ key: 'from', label: `From ${from}`, onRemove: () => setFilter('from', '') }] : []),
    ...(to ? [{ key: 'to', label: `To ${to}`, onRemove: () => setFilter('to', '') }] : []),
    ...(branchId ? [{ key: 'branch', label: `Branch: ${branchesQuery.data?.find((b) => b.id === branchId)?.name ?? '…'}`, onRemove: () => setFilter('branch', '') }] : []),
    ...(employeeId ? [{ key: 'employee', label: `Employee: ${employeeName(employeeId)?.fullName ?? '…'}`, onRemove: () => setFilter('employee', '') }] : []),
    ...(status ? [{ key: 'status', label: `Status: ${statusLabel(status)}`, onRemove: () => setFilter('status', '') }] : []),
  ];

  const yearOptions = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  const cal = calendarQuery.data;
  const calendarDays: CalendarDayCell[] = (cal?.days ?? []).map((d) => ({
    date: d.date,
    primary: d.status ? { label: statusText(d.status), tone: STATUS_TONE[d.status] } : undefined,
    extra: d.isLate ? [{ label: 'Late', tone: 'warning' as const }] : undefined,
    title: d.status === 'HOLIDAY' ? d.holidayName ?? undefined : d.status === 'ON_LEAVE' ? d.leaveType ?? undefined : undefined,
    dim: d.status === 'UPCOMING',
  }));

  const tiles = (t: typeof totals) => (
    <div className="stat-grid att-tiles">
      <StatCard label="Present" value={t.present} tone="success" icon={<UserCheck size={16} />} />
      <StatCard label="Half-day" value={t.halfDay} tone="warning" />
      <StatCard label="Absent" value={t.absent} tone="danger" />
      <StatCard label="On leave" value={t.onLeave} tone="info" />
      <StatCard label="Late" value={t.lateCount} tone="warning" />
      <StatCard label="Overtime (hrs)" value={t.overtimeHours.toFixed(1)} tone="brass" />
    </div>
  );

  const viewTabs: TabDef[] = [
    { key: 'list', label: <><ListChecks size={15} /> List</> },
    { key: 'summary', label: <><FileSpreadsheet size={15} /> Monthly summary</> },
    { key: 'calendar', label: <><CalendarCheck size={15} /> Calendar</> },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Human Resources' }, { label: 'Attendance' }]}
        title="Attendance"
        subtitle="Track daily employee attendance across all branches."
        actions={(
          <>
            <div className="hdr-period" role="group" aria-label="Reporting period">
              <select aria-label="Month" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <select aria-label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <span className="hdr-sep" aria-hidden="true" />
            <button type="button" className="ghost" onClick={() => setManualOpen(true)}>
              <CalendarCheck size={15} /> Add attendance
            </button>
            <button type="button" className="ghost" disabled={punchOut.isPending} onClick={() => punchOut.mutate()}>
              <LogOut size={15} /> {punchOut.isPending ? 'Checking out…' : 'Check out'}
            </button>
            <button type="button" className="btn-lg" disabled={punchIn.isPending} onClick={() => punchIn.mutate()}>
              <UserCheck size={16} /> {punchIn.isPending ? 'Checking in…' : 'Check in'}
            </button>
          </>
        )}
        tabs={<Tabs tabs={viewTabs} active={view} onChange={(t) => setView(t as ViewKey)} />}
      />

      {view === 'list' && (
        <>
          <FilterBar
            chips={chips}
            onReset={chips.length ? clearFilters : undefined}
            search={(
              <div className="filter-search">
                <Search size={16} />
                <input
                  value={table.search}
                  onChange={(e) => table.onSearchChange(e.target.value)}
                  placeholder="Search by employee name, code, or branch…"
                  aria-label="Search attendance"
                />
              </div>
            )}
          >
            <select className="filter-control" value={branchId} onChange={(e) => setFilter('branch', e.target.value)} aria-label="Branch" title="Branch">
              <option value="">All branches</option>
              {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select className="filter-control" value={employeeId} onChange={(e) => setFilter('employee', e.target.value)} aria-label="Employee" title="Employee">
              <option value="">All employees</option>
              {employeesQuery.data?.map((e) => <option key={e.id} value={e.id}>{e.fullName} ({e.employeeCode})</option>)}
            </select>
            <select className="filter-control" value={status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Status" title="Status">
              {STATUS_FILTERS.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </select>
            <label className="filter-field"><span>From</span><input type="date" value={from} onChange={(e) => setFilter('from', e.target.value)} aria-label="From date" /></label>
            <label className="filter-field"><span>To</span><input type="date" value={to} onChange={(e) => setFilter('to', e.target.value)} aria-label="To date" /></label>
          </FilterBar>

          <DataTable
            columns={columns}
            rows={rows}
            loading={query.isLoading}
            searchable={false}
            empty="No attendance records for the selected filters."
            server={{
              page: table.page, pageSize: table.pageSize, totalItems,
              onPageChange: table.setPage, sort: table.sort, onSortChange: table.onSortChange,
              search: table.search, onSearchChange: table.onSearchChange,
            }}
          />
        </>
      )}

      {view === 'summary' && (
        <>
          <section className="att-summary-band">
            <div className="att-summary-band-head">
              <h2>Overview</h2>
              <span className="muted">{MONTHS[month - 1]} {year} · all branches</span>
            </div>
            {summaryQuery.isLoading ? <CardsSkeleton count={6} /> : tiles(totals)}
          </section>

          <Card title={`Per-employee summary — ${MONTHS[month - 1]} ${year}`}>
            <DataTable
              columns={summaryColumns}
              rows={summaryTableRows}
              loading={summaryQuery.isLoading}
              empty="No summary data for this month."
              searchPlaceholder="Search employees…"
              pageSize={25}
            />
          </Card>
        </>
      )}

      {view === 'calendar' && (
        <Card
          title="Employee month calendar"
          action={(
            <label className="inline-select">Employee
              <select value={calEmployeeId} onChange={(e) => setCalEmployeeId(e.target.value)}>
                <option value="">Select an employee…</option>
                {summaryRows.map((r) => (
                  <option key={r.employeeId} value={r.employeeId}>{r.employee.fullName} ({r.employee.employeeCode})</option>
                ))}
              </select>
            </label>
          )}
        >
          {!calEmployeeId ? (
            <EmptyState variant="no-data" title="No employee selected" message="Choose an employee to view their monthly attendance calendar." />
          ) : calendarQuery.isLoading ? (
            <CardsSkeleton count={3} />
          ) : !cal ? (
            <EmptyState variant="no-data" title="No calendar data" message="Nothing on record for this month." />
          ) : (
            <>
              <Calendar
                month={cal.month}
                year={cal.year}
                days={calendarDays}
                onPrev={() => shiftMonth(-1)}
                onNext={() => shiftMonth(1)}
                aside={(
                  <button type="button" className="sm ghost" onClick={() => openEmployee(calEmployeeId)}>
                    Open full detail <ArrowRight size={13} />
                  </button>
                )}
                legend={<Legend />}
              />
            </>
          )}
        </Card>
      )}
      {manualOpen && (
        <ManualAttendanceModal
          employees={employeesQuery.data ?? []}
          onClose={() => setManualOpen(false)}
          onDone={() => { setManualOpen(false); queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/human-resources/attendance') }); }}
        />
      )}
    </>
  );
}

// ── HR manual attendance (missing-punch add) ────────────────────────────────
function ManualAttendanceModal({ employees, onClose, onDone }: { employees: EmployeeOption[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [employeeId, setEmployeeId] = useState('');
  const [attendanceDate, setAttendanceDate] = useState('');
  const [checkInAt, setCheckInAt] = useState('');
  const [checkOutAt, setCheckOutAt] = useState('');
  const [status, setStatus] = useState('PRESENT');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: () => api.post('/human-resources/attendance/manual', {
      employeeId,
      attendanceDate,
      ...(checkInAt ? { checkInAt: `${attendanceDate}T${checkInAt}:00` } : {}),
      ...(checkOutAt ? { checkOutAt: `${attendanceDate}T${checkOutAt}:00` } : {}),
      status,
      ...(note.trim() ? { note: note.trim() } : {}),
    }),
    onSuccess: () => { toast.success('Attendance recorded.'); onDone(); },
    onError: (err) => setError(apiMessage(err, 'Could not record attendance.')),
  });

  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); save.mutate(); };
  const disabled = save.isPending || !employeeId || !attendanceDate;

  return (
    <Modal
      size="md" onClose={onClose} icon={<CalendarCheck size={20} />}
      title="Add / correct attendance"
      subtitle="Manually record a missing punch. The row is flagged as a manual entry."
      footer={<>
        <button type="button" className="ghost" onClick={onClose}>Cancel</button>
        <button type="submit" form="manual-att-form" disabled={disabled}>{save.isPending ? 'Saving…' : 'Save'}</button>
      </>}
    >
      <form id="manual-att-form" className="form-grid" onSubmit={submit}>
        <label className="span-all">Employee
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required>
            <option value="">— Select employee —</option>
            {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.fullName} ({emp.employeeCode})</option>)}
          </select>
        </label>
        <label>Date<input type="date" value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)} required /></label>
        <label>Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="PRESENT">Present</option>
            <option value="HALF_DAY">Half day</option>
            <option value="ABSENT">Absent</option>
          </select>
        </label>
        <label>Check in<input type="time" value={checkInAt} onChange={(e) => setCheckInAt(e.target.value)} /></label>
        <label>Check out<input type="time" value={checkOutAt} onChange={(e) => setCheckOutAt(e.target.value)} /></label>
        <label className="span-all">Note<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" /></label>
        {error && <div className="error-box span-all">{error}</div>}
      </form>
    </Modal>
  );
}
