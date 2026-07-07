import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { useServerTable } from '../../components/useServerTable';
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

  const table = useServerTable();
  const url = `/settlements?${table.params}`;
  const { data, isLoading } = useQuery({
    queryKey: [url],
    queryFn: () => api.get(url).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const rows = (data?.data ?? []) as Settlement[];
  const totalItems = (data?.pagination?.totalItems ?? 0) as number;

  const invalidate = () =>
    qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/settlements') });

  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'APPROVED' | 'REJECTED' }) =>
      api.post(`/settlements/${id}/decision`, { decision }),
    onSuccess: invalidate,
  });

  const complete = useMutation({
    mutationFn: (id: string) => api.post(`/settlements/${id}/complete`),
    onSuccess: invalidate,
  });

  const classify = useMutation({
    mutationFn: () => api.post('/collections/jobs/classify-npa'),
  });

  const columns: Column<Settlement>[] = [
    { header: 'Loan', render: (s) => <code>{s.loan.loanNumber}</code>, sortKey: 'loanNumber' },
    { header: 'Client', render: (s) => s.loan.client.fullName, sortKey: 'client' },
    { header: 'Branch', render: (s) => s.loan.branch.name, sortKey: 'branch' },
    { header: 'Type', render: (s) => s.settlementType.replace('_', ' '), sortKey: 'settlementType' },
    { header: 'Amount', render: (s) => <span className="num">{inr(s.settlementAmount)}</span>, sortKey: 'settlementAmount' },
    { header: 'Waiver', render: (s) => <span className="num">{inr(s.waiverAmount)}</span>, sortKey: 'waiverAmount' },
    { header: 'Status', render: (s) => <span className={`pill pill-${s.status.toLowerCase()}`}>{s.status.replace('_', ' ')}</span>, sortKey: 'status' },
  ];

  if (canDecide || canComplete) {
    columns.push({
      header: 'Actions',
      render: (s) => {
        const decidable = canDecide && s.status === 'PENDING_APPROVAL';
        const completable = canComplete && s.status === 'APPROVED';
        // INITIATED / COMPLETED / REJECTED settlements have no pending action —
        // show a placeholder rather than an empty cell.
        if (!decidable && !completable) return <span className="muted">—</span>;
        return (
          <div className="row-actions">
            {decidable && (
              <>
                <button className="sm" onClick={() => decide.mutate({ id: s.id, decision: 'APPROVED' })}>Approve</button>
                <button className="sm ghost" onClick={() => decide.mutate({ id: s.id, decision: 'REJECTED' })}>Reject</button>
              </>
            )}
            {completable && (
              <button className="sm" onClick={() => complete.mutate(s.id)}>Complete &amp; issue NOC</button>
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
          <h1>Collections &amp; settlements</h1>
          <p className="muted">Settlement approvals and overdue classification</p>
        </div>
        {canClassify && (
          <button className="ghost" onClick={() => classify.mutate()} disabled={classify.isPending}>
            {classify.isPending ? 'Running…' : 'Run NPA classification'}
          </button>
        )}
      </header>
      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        empty="No settlements pending."
        searchPlaceholder="Search by loan no., client or branch…"
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
