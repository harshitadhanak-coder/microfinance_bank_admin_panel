import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FilterBar } from '../../components/FilterBar';
import { StatCard } from '../../components/StatCard';
import { Badge } from '../../components/Badge';
import { ActionMenu } from '../../components/ActionMenu';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { useServerTable } from '../../components/useServerTable';
import { useToast } from '../../components/Toast';
import { Ban, Eye, Landmark, Plus } from '../../components/icons';
import { inr, fmtDate, isoLocalDate, apiMessage } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { can, canAccessModule } from '../auth/permissions';
import {
  BankDeposit,
  BranchRef,
  DEPOSIT_BANKS,
  DEPOSIT_STATUS_LABEL,
  DEPOSIT_STATUS_TONE,
  DepositBank,
  ReconciliationSummary,
} from './reconShared';

const STATUS_OPTIONS: { id: BankDeposit['status']; name: string }[] = [
  { id: 'DEPOSITED', name: 'In transit' },
  { id: 'RECONCILED', name: 'Reconciled' },
  { id: 'CANCELLED', name: 'Cancelled' },
];

/**
 * Bank Deposits (stage 5). The branch manager records ONE consolidated deposit
 * per bank once the day's approved cash is paid in. Each deposit starts "in
 * transit" and is confirmed on the Bank Reconciliation screen when a matching
 * statement credit is found.
 */
export default function BranchDepositsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const table = useServerTable({ pageSize: 20 });
  const [bank, setBank] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [recording, setRecording] = useState(false);
  const [cancelling, setCancelling] = useState<BankDeposit | null>(null);

  const allowed = canAccessModule(user?.role, 'bankDeposits');
  const canManage = can(user?.role, 'reconcile:manage');
  const branchScoped = !!user?.branchId;

  const filterQs = `${bank ? `&bank=${bank}` : ''}${status ? `&status=${status}` : ''}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`;
  const url = `/reconciliation/deposits?${table.params}${filterQs}`;
  const { data, isLoading } = useQuery({
    queryKey: [url],
    enabled: allowed,
    queryFn: () => api.get(url).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const summary = useQuery({
    queryKey: ['/reconciliation/summary'],
    enabled: allowed,
    queryFn: () => api.get('/reconciliation/summary').then((r) => r.data.data as ReconciliationSummary),
  });

  const refresh = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/reconciliation') });

  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/reconciliation/deposits/${id}/cancel`),
    onSuccess: (res) => { toast.success(res.data?.message ?? 'Deposit cancelled.'); setCancelling(null); void refresh(); },
    onError: (err) => { setCancelling(null); toast.error(apiMessage(err, 'Could not cancel the deposit.')); },
  });

  if (!allowed) return <p className="muted">You do not have permission to view bank deposits.</p>;

  const rows = (data?.data ?? []) as BankDeposit[];
  const totalItems = (data?.pagination?.totalItems ?? 0) as number;
  const s = summary.data;

  const columns: Column<BankDeposit>[] = [
    { header: 'Deposit date', render: (d) => fmtDate(d.depositDate), sortKey: 'depositDate' },
    ...(branchScoped ? [] : [{ header: 'Branch', render: (d) => d.branch?.name ?? '—' } satisfies Column<BankDeposit>]),
    { header: 'Bank', render: (d) => <Badge tone="neutral">{d.bank}</Badge> },
    { header: 'Amount', render: (d) => <span className="num"><strong>{inr(d.amount)}</strong></span> },
    { header: 'Slip no.', render: (d) => d.slipNumber ?? <span className="muted sm-text">—</span> },
    { header: 'Reference', render: (d) => d.reference ?? <span className="muted sm-text">—</span> },
    { header: 'Status', render: (d) => <Badge tone={DEPOSIT_STATUS_TONE[d.status]}>{DEPOSIT_STATUS_LABEL[d.status]}</Badge> },
    {
      header: '',
      render: (d) => {
        if (!canManage || d.status !== 'DEPOSITED') return null;
        return (
          <div className="actions-cell">
            <ActionMenu items={[{ key: 'cancel', label: 'Cancel deposit', icon: <Ban size={15} />, tone: 'danger', onSelect: () => setCancelling(d) }]} />
          </div>
        );
      },
    },
  ];

  const chips = [
    ...(bank ? [{ key: 'bank', label: `Bank: ${bank}`, onRemove: () => setBank('') }] : []),
    ...(status ? [{ key: 'status', label: `Status: ${DEPOSIT_STATUS_LABEL[status as BankDeposit['status']] ?? status}`, onRemove: () => setStatus('') }] : []),
    ...(from ? [{ key: 'from', label: `From: ${fmtDate(from)}`, onRemove: () => setFrom('') }] : []),
    ...(to ? [{ key: 'to', label: `To: ${fmtDate(to)}`, onRemove: () => setTo('') }] : []),
  ];
  const resetAll = () => { setBank(''); setStatus(''); setFrom(''); setTo(''); table.setPage(1); };

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Operations' }, { label: 'Bank Deposits' }]}
        title="Bank Deposits"
        subtitle={<>Consolidated branch deposits into SBI / HDFC / AXIS{user?.branch ? ` — ${user.branch.name}` : ''}</>}
        actions={canManage && <button className="btn-lg" onClick={() => setRecording(true)}><Plus size={16} /> Record deposit</button>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
        <StatCard label="In transit" value={s ? inr(s.inTransit.amount) : '—'} hint={s ? `${s.inTransit.count} deposit(s) awaiting the bank statement` : undefined} />
        <StatCard label="Reconciled" value={s ? inr(s.reconciled.amount) : '—'} hint={s ? `${s.reconciled.count} confirmed by the bank` : undefined} />
        <StatCard label="Unmatched credits" value={s ? inr(s.unmatchedLines.amount) : '—'} hint={s ? `${s.unmatchedLines.count} statement line(s)` : undefined} />
        <StatCard label="Oldest in transit" value={s ? `${s.oldestInTransitDays} day(s)` : '—'} hint="Deposit not yet on a statement" />
      </div>

      <FilterBar chips={chips} onReset={chips.length ? resetAll : undefined}>
        <label>Bank
          <select value={bank} onChange={(e) => { setBank(e.target.value); table.setPage(1); }}>
            <option value="">All banks</option>
            {DEPOSIT_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        <label>Status
          <select value={status} onChange={(e) => { setStatus(e.target.value); table.setPage(1); }}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <label>From
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); table.setPage(1); }} aria-label="Deposit from date" />
        </label>
        <label>To
          <input type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); table.setPage(1); }} aria-label="Deposit to date" />
        </label>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        searchable={false}
        empty="No bank deposits recorded yet. Record the day's consolidated deposit once the cash is paid into the bank."
        server={{
          page: table.page, pageSize: table.pageSize, totalItems,
          onPageChange: table.setPage, sort: table.sort, onSortChange: table.onSortChange,
          search: table.search, onSearchChange: table.onSearchChange,
        }}
      />

      {recording && <RecordDepositModal branchScoped={branchScoped} onClose={() => setRecording(false)} onDone={() => { setRecording(false); void refresh(); }} />}

      {cancelling && (
        <ConfirmDialog
          icon={<Ban size={20} />}
          tone="danger"
          title="Cancel this deposit?"
          message={`This voids the ${inr(cancelling.amount)} ${cancelling.bank} deposit dated ${fmtDate(cancelling.depositDate)}. Only an unreconciled deposit can be cancelled.`}
          confirmLabel="Cancel deposit"
          loading={cancel.isPending}
          onConfirm={() => cancel.mutate(cancelling.id)}
          onCancel={() => setCancelling(null)}
        />
      )}
    </>
  );
}

// ── Record a consolidated branch deposit ─────────────────────────────────────
function RecordDepositModal({ branchScoped, onClose, onDone }: { branchScoped: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [branchId, setBranchId] = useState('');
  const [bank, setBank] = useState<DepositBank>('SBI');
  const [depositDate, setDepositDate] = useState(isoLocalDate(new Date()));
  const [amount, setAmount] = useState('');
  const [slipNumber, setSlipNumber] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  // Cross-branch roles pick the branch; branch-scoped users are pinned server-side.
  const branches = useQuery({
    queryKey: ['/branches', 'deposit-options'],
    enabled: !branchScoped,
    queryFn: () => api.get('/branches?pageSize=100').then((r) => r.data.data as BranchRef[]),
  });

  const record = useMutation({
    mutationFn: () => api.post('/reconciliation/deposits', {
      branchId: branchScoped ? undefined : branchId,
      bank,
      depositDate,
      amount: Number(amount),
      slipNumber: slipNumber.trim() || undefined,
      reference: reference.trim() || undefined,
      notes: notes.trim() || undefined,
    }),
    onSuccess: () => { toast.success('Bank deposit recorded.'); onDone(); },
    onError: (err) => setError(apiMessage(err, 'Could not record the deposit.')),
  });

  const disabled = record.isPending || !amount || Number(amount) <= 0 || !depositDate || (!branchScoped && !branchId);

  return (
    <Modal
      size="md"
      onClose={onClose}
      icon={<Landmark size={20} />}
      title="Record bank deposit"
      subtitle="One consolidated deposit per bank. It stays 'in transit' until the bank statement confirms it."
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button type="button" disabled={disabled} onClick={() => { setError(''); record.mutate(); }}>
            {record.isPending ? 'Recording…' : 'Record deposit'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        {!branchScoped && (
          <label className="span-all">Branch
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">Select a branch</option>
              {(branches.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}{b.code ? ` (${b.code})` : ''}</option>)}
            </select>
          </label>
        )}
        <label>Bank
          <select value={bank} onChange={(e) => setBank(e.target.value as DepositBank)}>
            {DEPOSIT_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        <label>Deposit date
          <input type="date" value={depositDate} max={isoLocalDate(new Date())} onChange={(e) => setDepositDate(e.target.value)} />
        </label>
        <label>Amount (₹)
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="100000" data-autofocus />
        </label>
        <label>Deposit slip no.
          <input value={slipNumber} onChange={(e) => setSlipNumber(e.target.value)} placeholder="e.g. 4477" />
        </label>
        <label className="span-all">Reference / UTR (optional)
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="The narration you expect on the statement" />
        </label>
        <label className="span-all">Notes (optional)
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth noting" />
        </label>
      </div>
      {error && <div className="error-box">{error}</div>}
    </Modal>
  );
}
