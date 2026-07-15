import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { Badge } from '../../components/Badge';
import { ActionMenu, ActionItem } from '../../components/ActionMenu';
import { ConfirmDialog } from '../../components/Modal';
import { useServerTable } from '../../components/useServerTable';
import { useToast } from '../../components/Toast';
import { Check, FileSpreadsheet, Loader, X } from '../../components/icons';
import { inr, titleCase, apiMessage } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import { SettlementOffer } from './shared';

type Pending =
  | { kind: 'decision'; offer: SettlementOffer; decision: 'APPROVED' | 'REJECTED' }
  | { kind: 'complete'; offer: SettlementOffer };

/**
 * Settlement Offers — loan work-out settlements (waiver/settlement offers) and
 * NPA classification, for HQ & accounts. Reached from Day-End Settlements; kept
 * distinct from day-end cash reconciliation.
 */
export default function SettlementOffersPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const table = useServerTable();
  const [pending, setPending] = useState<Pending | null>(null);

  const canDecide = can(user?.role, 'settlement:decide');
  const canComplete = can(user?.role, 'settlement:complete');
  const canClassify = can(user?.role, 'collection:classify');

  const url = `/settlements?${table.params}`;
  const { data, isLoading } = useQuery({
    queryKey: [url],
    queryFn: () => api.get(url).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const rows = (data?.data ?? []) as SettlementOffer[];
  const totalItems = (data?.pagination?.totalItems ?? 0) as number;
  const invalidate = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/settlements') });

  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'APPROVED' | 'REJECTED' }) => api.post(`/settlements/${id}/decision`, { decision }),
    onSuccess: (_d, v) => { toast.success(v.decision === 'APPROVED' ? 'Settlement offer approved.' : 'Settlement offer rejected.'); setPending(null); void invalidate(); },
    onError: (err) => { setPending(null); toast.error(apiMessage(err, 'Could not record the settlement decision.')); },
  });
  const complete = useMutation({
    mutationFn: (id: string) => api.post(`/settlements/${id}/complete`),
    onSuccess: () => { toast.success('Settlement completed and closure notice issued.'); setPending(null); void invalidate(); },
    onError: (err) => { setPending(null); toast.error(apiMessage(err, 'Could not complete the settlement.')); },
  });
  const classify = useMutation({
    mutationFn: () => api.post('/collections/jobs/classify-npa'),
    onSuccess: () => toast.success('Overdue and asset classification completed.'),
    onError: (err) => toast.error(apiMessage(err, 'Could not run the NPA classification.')),
  });

  const columns: Column<SettlementOffer>[] = [
    { header: 'Loan', render: (s) => <code>{s.loan.loanNumber}</code>, sortKey: 'loanNumber' },
    { header: 'Client', render: (s) => s.loan.client.fullName, sortKey: 'client' },
    { header: 'Branch', render: (s) => s.loan.branch.name, sortKey: 'branch' },
    { header: 'Type', render: (s) => titleCase(s.settlementType), sortKey: 'settlementType' },
    { header: 'Amount', render: (s) => <span className="num">{inr(s.settlementAmount)}</span>, sortKey: 'settlementAmount' },
    { header: 'Waiver', render: (s) => <span className="num">{inr(s.waiverAmount)}</span>, sortKey: 'waiverAmount' },
    { header: 'Status', render: (s) => <Badge status={s.status} />, sortKey: 'status' },
  ];

  if (canDecide || canComplete) {
    columns.push({
      header: '',
      render: (s) => {
        const decidable = canDecide && s.status === 'PENDING_APPROVAL';
        const completable = canComplete && s.status === 'APPROVED';
        if (!decidable && !completable) return <span className="muted">—</span>;
        const items: ActionItem[] = [];
        if (decidable) {
          items.push({ key: 'approve', label: 'Approve', icon: <Check size={15} />, onSelect: () => setPending({ kind: 'decision', offer: s, decision: 'APPROVED' }) });
          items.push({ key: 'reject', label: 'Reject', icon: <X size={15} />, tone: 'danger', onSelect: () => setPending({ kind: 'decision', offer: s, decision: 'REJECTED' }) });
        }
        if (completable) items.push({ key: 'complete', label: 'Complete & issue NOC', icon: <Check size={15} />, separatorBefore: decidable, onSelect: () => setPending({ kind: 'complete', offer: s }) });
        return <div className="actions-cell"><ActionMenu items={items} /></div>;
      },
    });
  }

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Operations' }, { label: 'Day-End Settlements', to: '/settlements' }, { label: 'Settlement offers' }]}
        title="Settlement offers"
        subtitle="Loan work-out settlements and NPA classification"
        actions={canClassify && (
          <button className="ghost" disabled={classify.isPending} onClick={() => classify.mutate()}>
            {classify.isPending ? <><Loader size={15} /> Running…</> : <><FileSpreadsheet size={15} /> Run NPA classification</>}
          </button>
        )}
      />

      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        empty="No settlement offers pending."
        searchPlaceholder="Search by loan no., client or branch…"
        server={{
          page: table.page, pageSize: table.pageSize, totalItems,
          onPageChange: table.setPage, sort: table.sort, onSortChange: table.onSortChange,
          search: table.search, onSearchChange: table.onSearchChange,
        }}
      />

      {pending?.kind === 'decision' && (
        <ConfirmDialog
          tone={pending.decision === 'REJECTED' ? 'danger' : 'default'}
          icon={pending.decision === 'REJECTED' ? <X size={20} /> : <Check size={20} />}
          title={pending.decision === 'APPROVED' ? 'Approve settlement offer?' : 'Reject settlement offer?'}
          message={`Loan ${pending.offer.loan.loanNumber} · ${pending.offer.loan.client.fullName} — settlement ${inr(pending.offer.settlementAmount)} (waiver ${inr(pending.offer.waiverAmount)}).`}
          confirmLabel={pending.decision === 'APPROVED' ? 'Approve' : 'Reject'}
          loading={decide.isPending}
          onConfirm={() => decide.mutate({ id: pending.offer.id, decision: pending.decision })}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.kind === 'complete' && (
        <ConfirmDialog
          icon={<Check size={20} />}
          title="Complete settlement?"
          message={`This closes loan ${pending.offer.loan.loanNumber} under the approved settlement and issues a closure notice (NOC). This cannot be undone.`}
          confirmLabel="Complete & issue NOC"
          loading={complete.isPending}
          onConfirm={() => complete.mutate(pending.offer.id)}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  );
}
