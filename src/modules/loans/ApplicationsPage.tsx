import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { useServerTable } from '../../components/useServerTable';
import { inr } from '../../components/StatCard';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';

interface Application {
  id: string; applicationNumber: string; requestedAmount: string; tenureMonths: number; status: string;
  leadId?: string | null;
  createdAt: string;
  client: { fullName: string };
  loanProduct: { name: string };
}

const STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'DISBURSED'];

const fmtDate = (v?: string | null): string =>
  v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function ApplicationsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [status, setStatus] = useState('SUBMITTED');
  const table = useServerTable();

  const canReview = can(user?.role, 'application:review');
  const canDisburse = can(user?.role, 'application:disburse');

  const url = `/loans/applications?${table.params}&status=${status}`;
  const { data, isLoading } = useQuery({
    queryKey: [url],
    queryFn: () => api.get(url).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const rows = (data?.data ?? []) as Application[];
  const totalItems = (data?.pagination?.totalItems ?? 0) as number;

  // Query keys are the full request URLs, so invalidate by URL prefix.
  const invalidate = (prefix: string) =>
    qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith(prefix) });

  const review = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'APPROVED' | 'REJECTED' }) =>
      api.post(`/loans/applications/${id}/review`, { decision }),
    onSuccess: () => invalidate('/loans/applications'),
  });

  const disburse = useMutation({
    mutationFn: (id: string) => {
      const firstDue = new Date();
      firstDue.setMonth(firstDue.getMonth() + 1);
      return api.post(`/loans/applications/${id}/disburse`, { firstDueDate: firstDue.toISOString() });
    },
    onSuccess: () => invalidate('/loans'), // covers both /loans and /loans/applications
  });

  const columns: Column<Application>[] = [
    { header: 'App no.', render: (a) => <><code>{a.applicationNumber}</code>{a.leadId && <div className="muted sm-text">from lead</div>}</>, sortKey: 'applicationNumber' },
    { header: 'Client', render: (a) => <strong>{a.client.fullName}</strong>, sortKey: 'client' },
    { header: 'Product', render: (a) => a.loanProduct.name, sortKey: 'product' },
    { header: 'Amount', render: (a) => <span className="num">{inr(a.requestedAmount)}</span>, sortKey: 'requestedAmount' },
    { header: 'Tenure', render: (a) => `${a.tenureMonths} mo`, sortKey: 'tenureMonths' },
    { header: 'Submitted', render: (a) => fmtDate(a.createdAt), sortKey: 'submittedAt' },
  ];

  if (canReview || canDisburse) {
    columns.push({
      header: 'Actions',
      render: (a) => {
        const reviewable = canReview && (a.status === 'SUBMITTED' || a.status === 'UNDER_REVIEW');
        const disbursable = canDisburse && a.status === 'APPROVED';
        // Terminal states (REJECTED, DISBURSED) offer no action — show a clear
        // placeholder instead of an empty cell so the column doesn't look broken.
        if (!reviewable && !disbursable) return <span className="muted">—</span>;
        return (
          <div className="row-actions">
            {reviewable && (
              <>
                <button className="sm" onClick={() => review.mutate({ id: a.id, decision: 'APPROVED' })}>Approve</button>
                <button className="sm ghost" onClick={() => review.mutate({ id: a.id, decision: 'REJECTED' })}>Reject</button>
              </>
            )}
            {disbursable && (
              <button className="sm" onClick={() => disburse.mutate(a.id)}>Disburse</button>
            )}
          </div>
        );
      },
    });
  }

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Loan applications</h1>
          <p className="muted">Review submissions, approve and disburse</p>
        </div>
        <select value={status} onChange={(e) => { setStatus(e.target.value); table.setPage(1); }}>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
      </header>
      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        empty="No applications in this stage."
        searchPlaceholder="Search by app no., client or product…"
        server={{
          page: table.page,
          pageSize: table.pageSize,
          totalItems,
          onPageChange: table.setPage,
          sort: table.sort,
          onSortChange: table.onSortChange,
          search: table.search,
          onSearchChange: table.onSearchChange,
        }}
      />
    </>
  );
}
