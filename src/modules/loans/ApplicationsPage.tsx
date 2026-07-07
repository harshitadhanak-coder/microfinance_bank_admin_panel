import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { inr } from '../../components/StatCard';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';

interface Application {
  id: string; applicationNumber: string; requestedAmount: string; tenureMonths: number; status: string;
  client: { fullName: string };
  loanProduct: { name: string };
}

const STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'DISBURSED'];

export default function ApplicationsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [status, setStatus] = useState('SUBMITTED');

  const canReview = can(user?.role, 'application:review');
  const canDisburse = can(user?.role, 'application:disburse');

  const { data, isLoading } = useQuery({
    queryKey: ['applications', status],
    queryFn: () => api.get(`/loans/applications?pageSize=100&status=${status}`).then((r) => r.data.data as Application[]),
  });

  const review = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'APPROVED' | 'REJECTED' }) =>
      api.post(`/loans/applications/${id}/review`, { decision }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['applications'] }),
  });

  const disburse = useMutation({
    mutationFn: (id: string) => {
      const firstDue = new Date();
      firstDue.setMonth(firstDue.getMonth() + 1);
      return api.post(`/loans/applications/${id}/disburse`, { firstDueDate: firstDue.toISOString() });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['applications'] });
      qc.invalidateQueries({ queryKey: ['loans'] });
    },
  });

  const columns: Column<Application>[] = [
    { header: 'App no.', render: (a) => <code>{a.applicationNumber}</code>, sortValue: (a) => a.applicationNumber },
    { header: 'Client', render: (a) => <strong>{a.client.fullName}</strong>, sortValue: (a) => a.client.fullName },
    { header: 'Product', render: (a) => a.loanProduct.name, sortValue: (a) => a.loanProduct.name },
    { header: 'Amount', render: (a) => <span className="num">{inr(a.requestedAmount)}</span>, sortValue: (a) => Number(a.requestedAmount) },
    { header: 'Tenure', render: (a) => `${a.tenureMonths} mo`, sortValue: (a) => a.tenureMonths },
  ];

  if (canReview || canDisburse) {
    columns.push({
      header: 'Actions',
      render: (a) => (
        <div className="row-actions">
          {canReview && (a.status === 'SUBMITTED' || a.status === 'UNDER_REVIEW') && (
            <>
              <button className="sm" onClick={() => review.mutate({ id: a.id, decision: 'APPROVED' })}>Approve</button>
              <button className="sm ghost" onClick={() => review.mutate({ id: a.id, decision: 'REJECTED' })}>Reject</button>
            </>
          )}
          {canDisburse && a.status === 'APPROVED' && (
            <button className="sm" onClick={() => disburse.mutate(a.id)}>Disburse</button>
          )}
        </div>
      ),
    });
  }

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Loan applications</h1>
          <p className="muted">Review submissions, approve and disburse</p>
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
      </header>
      <DataTable columns={columns} rows={data ?? []} loading={isLoading} empty="No applications in this stage." />
    </>
  );
}
