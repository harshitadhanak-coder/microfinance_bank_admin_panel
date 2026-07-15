import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { Card, StatCard } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { Calendar, CalendarDayCell } from '../../components/Calendar';
import { CardsSkeleton } from '../../components/Skeleton';
import { UserCheck } from '../../components/icons';
import { fmtDate } from '../../lib/format';
import {
  CalendarResponse, CalendarDay,
  STATUS_TONE, statusText, STATUS_LEGEND, fmtTime, fmtWorked, otHours,
} from './attendanceShared';

interface EmployeeDetail {
  id: string; fullName: string; employeeCode: string; designation: string;
  employmentStatus: string; branch?: { name: string } | null;
}

/** Legend explaining how each day's status is derived from punches. */
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

/**
 * Attendance — Employee month detail (`/attendance/:employeeId`). Full month
 * drill-down for one employee: a status calendar, the month's totals as KPI
 * tiles, and the day-by-day punch records. Month is navigable via the calendar
 * header and reflected in the URL (`?month=&year=`).
 */
export default function AttendanceEmployeePage() {
  const { employeeId = '' } = useParams();
  const now = new Date();
  const [params, setParams] = useSearchParams();
  const month = Number(params.get('month')) || now.getMonth() + 1;
  const year = Number(params.get('year')) || now.getFullYear();

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setParams((p) => { p.set('month', String(d.getMonth() + 1)); p.set('year', String(d.getFullYear())); return p; }, { replace: true });
  };

  const employeeQuery = useQuery({
    queryKey: ['/employees', employeeId, 'attendance-detail'],
    queryFn: () => api.get(`/employees/${employeeId}`).then((r) => r.data.data as EmployeeDetail),
  });
  const employee = employeeQuery.data;

  const calUrl = `/human-resources/attendance/calendar?month=${month}&year=${year}&employeeId=${employeeId}`;
  const calendarQuery = useQuery({
    queryKey: [calUrl],
    queryFn: () => api.get(calUrl).then((r) => r.data.data as CalendarResponse),
    placeholderData: keepPreviousData,
  });
  const cal = calendarQuery.data;

  const recordsUrl = `/human-resources/attendance?pageSize=31&sortBy=attendanceDate&sortOrder=asc&employeeId=${employeeId}&from=${year}-${String(month).padStart(2, '0')}-01&to=${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
  const recordsQuery = useQuery({
    queryKey: [recordsUrl],
    queryFn: () => api.get(recordsUrl).then((r) => r.data.data as (CalendarDay & { id: string; attendanceDate: string; workedMinutes: number; source: string })[]),
    placeholderData: keepPreviousData,
  });
  const records = recordsQuery.data ?? [];

  const calendarDays: CalendarDayCell[] = useMemo(() => (cal?.days ?? []).map((d) => ({
    date: d.date,
    primary: d.status ? { label: statusText(d.status), tone: STATUS_TONE[d.status] } : undefined,
    extra: d.isLate ? [{ label: 'Late', tone: 'warning' as const }] : undefined,
    title: d.status === 'HOLIDAY' ? d.holidayName ?? undefined : d.status === 'ON_LEAVE' ? d.leaveType ?? undefined : undefined,
    dim: d.status === 'UPCOMING',
  })), [cal]);

  const s = cal?.summary;

  const columns: Column<{ id: string; attendanceDate: string; status?: CalendarDay['status']; isLate?: boolean; lateMinutes?: number; checkInAt?: string | null; checkOutAt?: string | null; workedMinutes: number; overtimeMinutes?: number; source: string }>[] = [
    { header: 'Date', render: (a) => fmtDate(a.attendanceDate), sortValue: (a) => a.attendanceDate },
    { header: 'Status', render: (a) => a.status ? <Badge tone={STATUS_TONE[a.status]}>{statusText(a.status)}</Badge> : '—' },
    { header: 'Check in', render: (a) => fmtTime(a.checkInAt) },
    { header: 'Check out', render: (a) => fmtTime(a.checkOutAt) },
    { header: 'Worked', render: (a) => fmtWorked(a.workedMinutes) },
    { header: 'Late by', render: (a) => (a.lateMinutes ? `${a.lateMinutes}m` : '—') },
    { header: 'OT', render: (a) => otHours(a.overtimeMinutes) },
    { header: 'Source', render: (a) => <Badge tone="neutral">{a.source.replaceAll('_', ' ')}</Badge> },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: 'Human Resources' },
          { label: 'Attendance', to: '/attendance' },
          { label: employee?.fullName ?? 'Employee' },
        ]}
        title={employee?.fullName ?? 'Employee attendance'}
        subtitle={employee ? <>{employee.designation} · <code>{employee.employeeCode}</code>{employee.branch ? ` · ${employee.branch.name}` : ''}</> : undefined}
        meta={employee && <Badge status={employee.employmentStatus} />}
      />

      {s && (
        <div className="stat-grid att-tiles">
          <StatCard label="Present" value={s.present} tone="success" icon={<UserCheck size={16} />} />
          <StatCard label="Half-day" value={s.halfDay} tone="warning" />
          <StatCard label="Absent" value={s.absent} tone="danger" />
          <StatCard label="On leave" value={s.onLeave} tone="info" />
          <StatCard label="Late" value={s.lateCount} tone="warning" />
          <StatCard label="Overtime (hrs)" value={s.overtimeHours.toFixed(1)} tone="brass" />
        </div>
      )}

      <div className="detail-cols att-detail-cols">
        <Card title="Month calendar">
          {calendarQuery.isLoading && !cal ? (
            <CardsSkeleton count={3} />
          ) : !cal || cal.days.length === 0 ? (
            <EmptyState variant="no-data" title="No calendar data" message="Nothing on record for this month." />
          ) : (
            <Calendar
              month={cal.month}
              year={cal.year}
              days={calendarDays}
              onPrev={() => shiftMonth(-1)}
              onNext={() => shiftMonth(1)}
              legend={<Legend />}
            />
          )}
        </Card>

        <Card title="Daily records">
          <DataTable
            columns={columns}
            rows={records}
            loading={recordsQuery.isLoading && records.length === 0}
            empty="No punch records for this month."
            searchable={false}
            pageSize={0}
          />
        </Card>
      </div>
    </>
  );
}
