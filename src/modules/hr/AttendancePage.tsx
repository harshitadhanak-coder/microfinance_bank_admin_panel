import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { useServerTable } from '../../components/useServerTable';

interface AttendanceRow {
  id: string;
  attendanceDate: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  workedMinutes: number;
  source: string;
  isHoliday: boolean;
  employee: { id?: string; fullName: string; employeeCode: string; branch?: { name: string } | null };
}

interface BranchOption { id: string; name: string; code: string }
interface EmployeeOption { id: string; fullName: string; employeeCode: string }

const STATUS_FILTERS = ['', 'PRESENT', 'ABSENT', 'HOLIDAY'] as const;
const statusLabel = (s: string): string => (s ? s.charAt(0) + s.slice(1).toLowerCase() : 'All statuses');

const fmtDate = (value?: string | null): string =>
  value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtTime = (value?: string | null): string =>
  value ? new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';
const fmtWorked = (minutes: number): string =>
  minutes > 0 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : '—';

const presence = (a: AttendanceRow): { label: string; cls: string } =>
  a.isHoliday ? { label: 'Holiday', cls: 'pill-on_notice' }
    : a.checkInAt ? { label: 'Present', cls: 'pill-active' }
      : { label: 'Absent', cls: 'pill-rejected' };

export default function AttendancePage() {
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

  const columns: Column<AttendanceRow>[] = [
    { header: 'Employee', render: (a) => <strong>{a.employee.fullName}</strong>, sortKey: 'employee' },
    { header: 'Code', render: (a) => <code>{a.employee.employeeCode}</code>, sortKey: 'employeeCode' },
    { header: 'Branch', render: (a) => a.employee.branch?.name ?? '—', sortKey: 'branch' },
    { header: 'Date', render: (a) => fmtDate(a.attendanceDate), sortKey: 'attendanceDate' },
    { header: 'Status', render: (a) => { const p = presence(a); return <span className={`pill ${p.cls}`}>{p.label}</span>; } },
    { header: 'Check in', render: (a) => fmtTime(a.checkInAt), sortKey: 'checkInAt' },
    { header: 'Check out', render: (a) => fmtTime(a.checkOutAt), sortKey: 'checkOutAt' },
    { header: 'Worked', render: (a) => fmtWorked(a.workedMinutes), sortKey: 'workedMinutes' },
    { header: 'Source', render: (a) => <span className="pill pill-active">{a.source.replaceAll('_', ' ')}</span>, sortKey: 'source' },
  ];

  const resetPage = () => table.setPage(1);
  const clearFilters = () => { setFrom(''); setTo(''); setBranchId(''); setStatus(''); setEmployeeId(''); resetPage(); };
  const hasFilters = !!(from || to || branchId || status || employeeId);

  return (
    <>
      <header className="page-head">
        <h1>Attendance</h1>
        <p className="muted">Daily check-in / check-out records across all branches</p>
      </header>

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
    </>
  );
}
