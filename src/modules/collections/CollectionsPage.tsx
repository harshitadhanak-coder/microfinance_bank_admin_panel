import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { inr } from '../../components/StatCard';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';

interface Settlement {
  id: string; settlementType: string; status: string; settlementAmount: string; waiverAmount: string;
  loan: { loanNumber: string; client: { fullName: string }; branch: { name: string } };
}

export default function CollectionsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const canDecide = can(user?.role, 'settlement:decide');
  const canComplete = can(user?.role, 'settlement:complete');
  const canClassify = can(user?.role, 'collection:classify');

  const { data, isLoading } = useQuery({
    queryKey: ['settlements'],
    queryFn: () => api.get('/settlements?pageSize=100').then((r) => r.data.data as Settlement[]),
  });

  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'APPROVED' | 'REJECTED' }) =>
      api.post(`/settlements/${id}/decision`, { decision }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settlements'] }),
  });

  const complete = useMutation({
    mutationFn: (id: string) => api.post(`/settlements/${id}/complete`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settlements'] }),
  });

  const classify = useMutation({
    mutationFn: () => api.post('/collections/jobs/classify-npa'),
  });

  const columns: Column<Settlement>[] = [
    { header: 'Loan', render: (s) => <code>{s.loan.loanNumber}</code>, sortValue: (s) => s.loan.loanNumber },
    { header: 'Client', render: (s) => s.loan.client.fullName, sortValue: (s) => s.loan.client.fullName },
    { header: 'Branch', render: (s) => s.loan.branch.name, sortValue: (s) => s.loan.branch.name },
    { header: 'Type', render: (s) => s.settlementType.replace('_', ' '), sortValue: (s) => s.settlementType },
    { header: 'Amount', render: (s) => <span className="num">{inr(s.settlementAmount)}</span>, sortValue: (s) => Number(s.settlementAmount) },
    { header: 'Waiver', render: (s) => <span className="num">{inr(s.waiverAmount)}</span>, sortValue: (s) => Number(s.waiverAmount) },
    { header: 'Status', render: (s) => <span className={`pill pill-${s.status.toLowerCase()}`}>{s.status.replace('_', ' ')}</span>, sortValue: (s) => s.status },
  ];

  if (canDecide || canComplete) {
    columns.push({
      header: 'Actions',
      render: (s) => (
        <div className="row-actions">
          {canDecide && s.status === 'PENDING_APPROVAL' && (
            <>
              <button className="sm" onClick={() => decide.mutate({ id: s.id, decision: 'APPROVED' })}>Approve</button>
              <button className="sm ghost" onClick={() => decide.mutate({ id: s.id, decision: 'REJECTED' })}>Reject</button>
            </>
          )}
          {canComplete && s.status === 'APPROVED' && (
            <button className="sm" onClick={() => complete.mutate(s.id)}>Complete &amp; issue NOC</button>
          )}
        </div>
      ),
    });
  }

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Collections &amp; settlements</h1>
          <p className="muted">Settlement approvals and overdue classification</p>
        </div>
        {canClassify && (
          <button className="ghost" onClick={() => classify.mutate()} disabled={classify.isPending}>
            {classify.isPending ? 'Running…' : 'Run NPA classification'}
          </button>
        )}
      </header>
      <DataTable columns={columns} rows={data ?? []} loading={isLoading} empty="No settlements pending." />
    </>
  );
}
