import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FilterBar } from '../../components/FilterBar';
import { Badge } from '../../components/Badge';
import { ActionMenu } from '../../components/ActionMenu';
import { ConfirmDialog } from '../../components/Modal';
import { useServerTable } from '../../components/useServerTable';
import { useToast } from '../../components/Toast';
import { Check, X, Landmark } from '../../components/icons';
import { inr, fmtDate, titleCase, apiMessage } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import { APPLICATION_STATUSES } from './shared';

interface Application {
  id: string; applicationNumber: string; requestedAmount: string; tenureMonths: number; status: string;
  leadId?: string | null;
  createdAt: string;
  client: { fullName: string };
  loanProduct: { name: string };
}

/**
 * Loan Applications — List. Now a first-class, nav-visible page (previously a
 * hidden route). Review submissions, approve/reject, and disburse approved
 * applications — disbursal is a guarded action with a confirmation.
 */
export default function ApplicationsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const [status, setStatus] = useState('SUBMITTED');
  const [disburseTarget, setDisburseTarget] = useState<Application | null>(null);
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

  const invalidate = (prefix: string) => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith(prefix) });

  const review = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'APPROVED' | 'REJECTED' }) =>
      api.post(`/loans/applications/${id}/review`, { decision }),
    onSuccess: (_res, vars) => { invalidate('/loans/applications'); toast.success(`Application ${vars.decision === 'APPROVED' ? 'approved' : 'rejected'}.`); },
    onError: (err) => toast.error(apiMessage(err, 'Could not record the decision.')),
  });

  const disburse = useMutation({
    mutationFn: (id: string) => {
      const firstDue = new Date();
      firstDue.setMonth(firstDue.getMonth() + 1);
      return api.post(`/loans/applications/${id}/disburse`, { firstDueDate: firstDue.toISOString() });
    },
    onSuccess: () => { invalidate('/loans'); setDisburseTarget(null); toast.success('Loan disbursed.'); },
    onError: (err) => { setDisburseTarget(null); toast.error(apiMessage(err, 'Could not disburse this loan.')); },
  });

  const columns: Column<Application>[] = [
    { header: 'App no.', render: (a) => <><code>{a.applicationNumber}</code>{a.leadId && <div className="muted sm-text">from lead</div>}</>, sortKey: 'applicationNumber' },
    { header: 'Client', render: (a) => <strong>{a.client.fullName}</strong>, sortKey: 'client' },
    { header: 'Product', render: (a) => a.loanProduct.name, sortKey: 'product' },
    { header: 'Amount', render: (a) => <span className="num">{inr(a.requestedAmount)}</span>, sortKey: 'requestedAmount' },
    { header: 'Tenure', render: (a) => `${a.tenureMonths} mo`, sortKey: 'tenureMonths' },
    { header: 'Status', render: (a) => <Badge status={a.status} />, sortKey: 'status' },
    { header: 'Submitted', render: (a) => fmtDate(a.createdAt), sortKey: 'submittedAt' },
  ];

  if (canReview || canDisburse) {
    columns.push({
      header: '',
      render: (a) => {
        const reviewable = canReview && (a.status === 'SUBMITTED' || a.status === 'UNDER_REVIEW');
        const disbursable = canDisburse && a.status === 'APPROVED';
        if (!reviewable && !disbursable) return <span className="muted">—</span>;
        return (
          <div className="actions-cell">
            <ActionMenu
              items={[
                ...(reviewable ? [
                  { key: 'approve', label: 'Approve', icon: <Check size={15} />, onSelect: () => review.mutate({ id: a.id, decision: 'APPROVED' }) },
                  { key: 'reject', label: 'Reject', icon: <X size={15} />, tone: 'danger' as const, onSelect: () => review.mutate({ id: a.id, decision: 'REJECTED' }) },
                ] : []),
                ...(disbursable ? [
                  { key: 'disburse', label: 'Disburse', icon: <Landmark size={15} />, separatorBefore: reviewable, onSelect: () => setDisburseTarget(a) },
                ] : []),
              ]}
            />
          </div>
        );
      },
    });
  }

  const statusChip = [{ key: 'status', label: `Stage: ${titleCase(status)}`, onRemove: () => { setStatus('SUBMITTED'); table.setPage(1); } }];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Operations' }, { label: 'Loans', to: '/loans' }, { label: 'Applications' }]}
        title="Loan applications"
        subtitle="Review submissions, approve and disburse"
      />

      <FilterBar chips={status !== 'SUBMITTED' ? statusChip : []} onReset={status !== 'SUBMITTED' ? () => { setStatus('SUBMITTED'); table.setPage(1); } : undefined}>
        <label>Stage
          <select value={status} onChange={(e) => { setStatus(e.target.value); table.setPage(1); }} aria-label="Filter by application stage">
            {APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
          </select>
        </label>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        empty="No applications in this stage."
        searchPlaceholder="Search by app no., client or product…"
        server={{
          page: table.page, pageSize: table.pageSize, totalItems,
          onPageChange: table.setPage, sort: table.sort, onSortChange: table.onSortChange,
          search: table.search, onSearchChange: table.onSearchChange,
        }}
      />

      {disburseTarget && (
        <ConfirmDialog
          icon={<Landmark size={20} />}
          title={`Disburse ${disburseTarget.applicationNumber}?`}
          message={`This creates and disburses a loan of ${inr(disburseTarget.requestedAmount)} for ${disburseTarget.client.fullName} over ${disburseTarget.tenureMonths} months. The first EMI falls due one month from today. This action cannot be undone.`}
          confirmLabel="Disburse loan"
          loading={disburse.isPending}
          onConfirm={() => disburse.mutate(disburseTarget.id)}
          onCancel={() => setDisburseTarget(null)}
        />
      )}
    </>
  );
}
