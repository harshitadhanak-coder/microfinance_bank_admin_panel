import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';

interface AttendanceRow {
  id: string;
  attendanceDate: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  workedMinutes: number;
  source: string;
  employee: { fullName: string; employeeCode: string; branch?: { name: string } | null };
}

interface BranchOption { id: string; name: string; code: string }

const fmtDate = (value?: string | null): string =>
  value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtTime = (value?: string | null): string =>
  value ? new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';
const fmtWorked = (minutes: number): string =>
  minutes > 0 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : '—';

export default function AttendancePage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [branchId, setBranchId] = useState('');

  const branchesQuery = useQuery({
    queryKey: ['/branches', 'attendance-filter'],
    queryFn: () => api.get('/branches?pageSize=100').then((r) => r.data.data as BranchOption[]),
  });

  const params = new URLSearchParams({ pageSize: '100' });
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (branchId) params.set('branchId', branchId);
  const listUrl = `/human-resources/attendance?${params.toString()}`;

  const query = useQuery({
    queryKey: [listUrl],
    queryFn: () => api.get(listUrl).then((r) => r.data.data as AttendanceRow[]),
  });

  const columns: Column<AttendanceRow>[] = [
    { header: 'Employee', render: (a) => <strong>{a.employee.fullName}</strong>, sortValue: (a) => a.employee.fullName },
    { header: 'Code', render: (a) => <code>{a.employee.employeeCode}</code>, sortValue: (a) => a.employee.employeeCode },
    { header: 'Branch', render: (a) => a.employee.branch?.name ?? '—', sortValue: (a) => a.employee.branch?.name ?? '' },
    { header: 'Date', render: (a) => fmtDate(a.attendanceDate), sortValue: (a) => a.attendanceDate },
    { header: 'Check in', render: (a) => fmtTime(a.checkInAt), sortValue: (a) => a.checkInAt ?? '' },
    { header: 'Check out', render: (a) => fmtTime(a.checkOutAt), sortValue: (a) => a.checkOutAt ?? '' },
    { header: 'Worked', render: (a) => fmtWorked(a.workedMinutes), sortValue: (a) => a.workedMinutes },
    { header: 'Source', render: (a) => <span className="pill pill-active">{a.source.replaceAll('_', ' ')}</span>, sortValue: (a) => a.source },
  ];

  const clearFilters = () => { setFrom(''); setTo(''); setBranchId(''); };
  const hasFilters = !!(from || to || branchId);

  return (
    <>
      <header className="page-head">
        <h1>Attendance</h1>
        <p className="muted">Daily check-in / check-out records across all branches</p>
      </header>

      <div className="filter-bar">
        <label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label>Branch
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">All branches</option>
            {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        {hasFilters && <button type="button" className="ghost sm" onClick={clearFilters}>Clear</button>}
      </div>

      <DataTable
        columns={columns}
        rows={query.data ?? []}
        loading={query.isLoading}
        empty="No attendance records for the selected filters."
        searchPlaceholder="Search by employee, code or branch…"
      />
    </>
  );
}
