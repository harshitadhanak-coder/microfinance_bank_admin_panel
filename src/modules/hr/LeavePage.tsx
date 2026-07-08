import { useState } from 'react';
import { AxiosError } from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';

interface LeaveRow {
  id: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  numberOfDays: string;
  reason?: string | null;
  status: string;
  employee: { fullName: string; employeeCode: string; branch?: { name: string } | null };
}

const STATUS_FILTERS = ['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const fmtDate = (value?: string | null): string =>
  value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const apiMessage = (err: unknown, fallback: string): string =>
  (err instanceof AxiosError && err.response?.data?.message) || fallback;

export default function LeavePage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [error, setError] = useState('');

  const canDecide = can(user?.role, 'leave:decide');

  const listUrl = `/human-resources/leaves?pageSize=100${status === 'ALL' ? '' : `&status=${status}`}`;
  const query = useQuery({
    queryKey: [listUrl],
    queryFn: () => api.get(listUrl).then((r) => r.data.data as LeaveRow[]),
  });

  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'APPROVED' | 'REJECTED' }) =>
      api.post(`/human-resources/leaves/${id}/decision`, { decision }),
    onSuccess: () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/human-resources/leaves') }),
    onError: (err) => setError(apiMessage(err, 'Could not record the decision.')),
  });

  const columns: Column<LeaveRow>[] = [
    { header: 'Employee', render: (l) => <strong>{l.employee.fullName}</strong>, sortValue: (l) => l.employee.fullName },
    { header: 'Branch', render: (l) => l.employee.branch?.name ?? '—', sortValue: (l) => l.employee.branch?.name ?? '' },
    { header: 'Type', render: (l) => l.leaveType, sortValue: (l) => l.leaveType },
    { header: 'From', render: (l) => fmtDate(l.fromDate), sortValue: (l) => l.fromDate },
    { header: 'To', render: (l) => fmtDate(l.toDate), sortValue: (l) => l.toDate },
    { header: 'Days', render: (l) => l.numberOfDays, sortValue: (l) => Number(l.numberOfDays) },
    { header: 'Reason', render: (l) => l.reason ?? '—' },
    { header: 'Status', render: (l) => <span className={`pill pill-${l.status.toLowerCase()}`}>{l.status}</span>, sortValue: (l) => l.status },
  ];

  if (canDecide) {
    columns.push({
      header: 'Actions',
      render: (l) =>
        l.status === 'PENDING' ? (
          <div className="row-actions">
            <button type="button" className="sm ghost" disabled={decide.isPending} onClick={() => { setError(''); decide.mutate({ id: l.id, decision: 'APPROVED' }); }}>Approve</button>
            <button type="button" className="sm ghost danger" disabled={decide.isPending} onClick={() => { setError(''); decide.mutate({ id: l.id, decision: 'REJECTED' }); }}>Reject</button>
          </div>
        ) : <span className="muted">—</span>,
    });
  }

  return (
    <>
      <header className="page-head">
        <h1>Leave requests</h1>
        <p className="muted">Review and decide staff leave applications</p>
      </header>

      <div className="filter-row">
        {STATUS_FILTERS.map((s) => (
          <button key={s} type="button" className={`sm ${status === s ? '' : 'ghost'}`} onClick={() => setStatus(s)}>
            {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {error && <div className="error-box">{error}</div>}

      <DataTable
        columns={columns}
        rows={query.data ?? []}
        loading={query.isLoading}
        empty="No leave requests found."
        searchPlaceholder="Search by employee or branch…"
      />
    </>
  );
}
