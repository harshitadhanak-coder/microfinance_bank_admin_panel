import { ReactNode, useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FilterBar } from '../../components/FilterBar';
import { Badge } from '../../components/Badge';
import { ActionMenu } from '../../components/ActionMenu';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { useServerTable } from '../../components/useServerTable';
import { useToast } from '../../components/Toast';
import { Ban, Banknote, CheckCircle, Landmark, Pencil, Plus, Wallet } from '../../components/icons';
import { inr, fmtDate, isoLocalDate, apiMessage } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { can, canAccessModule } from '../auth/permissions';
import {
  BANK_TOTAL_KEY,
  BankDeposit,
  BranchRef,
  DEPOSIT_BANKS,
  DEPOSIT_SETTLEMENT_STATUS_LABEL,
  DEPOSIT_SETTLEMENT_STATUS_TONE,
  DEPOSIT_STATUS_LABEL,
  DEPOSIT_STATUS_TONE,
  DepositBank,
  DepositSettlementSummary,
} from './reconShared';

const STATUS_OPTIONS: { id: BankDeposit['status']; name: string }[] = [
  { id: 'DEPOSITED', name: 'In transit' },
  { id: 'RECONCILED', name: 'Reconciled' },
  { id: 'CANCELLED', name: 'Cancelled' },
];

/** Compact date + time for the "Recorded" column (chronological audit trail). */
const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';

type DepositForm = { mode: 'create' } | { mode: 'edit'; deposit: BankDeposit };

/**
 * Bank Deposits (stage 5). The branch manager records each consolidated pay-in
 * once the day's approved cash reaches the bank. The DB-computed progress panel
 * shows what the branch is due to bank (from approved day-end settlements), what
 * has been deposited, and what remains — recomputed server-side on every add,
 * edit or void so the totals are always the latest and survive a page refresh.
 */
export default function BranchDepositsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const table = useServerTable({ pageSize: 20 });
  const today = isoLocalDate(new Date());
  const [bank, setBank] = useState('');
  const [status, setStatus] = useState('');
  // The deposit "settlement" is a day: default the window to today so the
  // progress panel and the list both frame today's banking. The manager can
  // widen the range to review history.
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [form, setForm] = useState<DepositForm | null>(null);
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

  const rangeQs = [from ? `from=${from}` : '', to ? `to=${to}` : ''].filter(Boolean).join('&');
  const summaryUrl = `/reconciliation/deposits/summary${rangeQs ? `?${rangeQs}` : ''}`;
  const summary = useQuery({
    queryKey: [summaryUrl],
    enabled: allowed,
    queryFn: () => api.get(summaryUrl).then((r) => r.data.data as DepositSettlementSummary),
    placeholderData: keepPreviousData,
  });

  // Every mutation invalidates the whole /reconciliation surface — list AND
  // summary — so the DB stays the single source of truth and the panel refreshes
  // the instant a deposit is added, edited or voided (no page reload).
  const refresh = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/reconciliation') });

  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/reconciliation/deposits/${id}/cancel`),
    onSuccess: (res) => { toast.success(res.data?.message ?? 'Deposit voided.'); setCancelling(null); void refresh(); },
    onError: (err) => { setCancelling(null); toast.error(apiMessage(err, 'Could not void the deposit.')); },
  });

  if (!allowed) return <p className="muted">You do not have permission to view bank deposits.</p>;

  const rows = (data?.data ?? []) as BankDeposit[];
  const totalItems = (data?.pagination?.totalItems ?? 0) as number;

  const columns: Column<BankDeposit>[] = [
    { header: 'Deposit date', render: (d) => fmtDate(d.depositDate), sortKey: 'depositDate' },
    ...(branchScoped ? [] : [{ header: 'Branch', render: (d) => d.branch?.name ?? '—' } satisfies Column<BankDeposit>]),
    { header: 'Bank', render: (d) => <Badge tone="neutral">{d.bank}</Badge> },
    { header: 'Amount', render: (d) => <span className="num"><strong>{inr(d.amount)}</strong></span> },
    { header: 'Slip no.', render: (d) => d.slipNumber ?? <span className="muted sm-text">—</span> },
    { header: 'Reference', render: (d) => d.reference ?? <span className="muted sm-text">—</span> },
    { header: 'Status', render: (d) => <Badge tone={DEPOSIT_STATUS_TONE[d.status]}>{DEPOSIT_STATUS_LABEL[d.status]}</Badge> },
    { header: 'Recorded', render: (d) => <span className="muted sm-text">{fmtDateTime(d.createdAt)}</span> },
    {
      header: '',
      render: (d) => {
        if (!canManage || d.status !== 'DEPOSITED') return null;
        return (
          <div className="actions-cell">
            <ActionMenu items={[
              { key: 'edit', label: 'Edit deposit', icon: <Pencil size={15} />, onSelect: () => setForm({ mode: 'edit', deposit: d }) },
              { key: 'void', label: 'Void deposit', icon: <Ban size={15} />, tone: 'danger', separatorBefore: true, onSelect: () => setCancelling(d) },
            ]} />
          </div>
        );
      },
    },
  ];

  const chips = [
    ...(bank ? [{ key: 'bank', label: `Bank: ${bank}`, onRemove: () => setBank('') }] : []),
    ...(status ? [{ key: 'status', label: `Status: ${DEPOSIT_STATUS_LABEL[status as BankDeposit['status']] ?? status}`, onRemove: () => setStatus('') }] : []),
  ];
  const resetAll = () => { setBank(''); setStatus(''); setFrom(today); setTo(today); table.setPage(1); };

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Operations' }, { label: 'Bank Deposits' }]}
        title="Bank Deposits"
        subtitle={<>Consolidated branch deposits into SBI / HDFC / AXIS{user?.branch ? ` — ${user.branch.name}` : ''}</>}
        actions={canManage && <button className="btn-lg" onClick={() => setForm({ mode: 'create' })}><Plus size={16} /> Record deposit</button>}
      />

      <DepositProgressPanel summary={summary.data} loading={summary.isLoading} />

      <FilterBar chips={chips} onReset={chips.length || from !== today || to !== today ? resetAll : undefined}>
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
          <input type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); table.setPage(1); }} aria-label="Deposit from date" />
        </label>
        <label>To
          <input type="date" value={to} min={from || undefined} max={today} onChange={(e) => { setTo(e.target.value); table.setPage(1); }} aria-label="Deposit to date" />
        </label>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        searchable={false}
        empty="No bank deposits in this window. Record the day's consolidated deposit once the cash is paid into the bank."
        server={{
          page: table.page, pageSize: table.pageSize, totalItems,
          onPageChange: table.setPage, sort: table.sort, onSortChange: table.onSortChange,
          search: table.search, onSearchChange: table.onSearchChange,
        }}
      />

      {form && (
        <DepositFormModal
          editing={form.mode === 'edit' ? form.deposit : null}
          branchScoped={branchScoped}
          defaultDate={from || today}
          onClose={() => setForm(null)}
          onSaved={(opts) => { void refresh(); if (!opts?.keepOpen) setForm(null); }}
        />
      )}

      {cancelling && (
        <ConfirmDialog
          icon={<Ban size={20} />}
          tone="danger"
          title="Void this deposit?"
          message={`This voids (deletes) the ${inr(cancelling.amount)} ${cancelling.bank} deposit dated ${fmtDate(cancelling.depositDate)} and updates the totals. Only an unreconciled deposit can be voided.`}
          confirmLabel="Void deposit"
          loading={cancel.isPending}
          onConfirm={() => cancel.mutate(cancelling.id)}
          onCancel={() => setCancelling(null)}
        />
      )}
    </>
  );
}

// ── DB-computed deposit progress ─────────────────────────────────────────────
function DepositProgressPanel({ summary, loading }: { summary?: DepositSettlementSummary; loading: boolean }) {
  if (!summary) {
    return (
      <section className="panel pad deposit-progress">
        <p className="muted">{loading ? 'Loading deposit progress…' : 'Deposit progress is unavailable.'}</p>
      </section>
    );
  }

  const { expected, deposited, remaining, status } = summary;
  const pct = expected.total > 0
    ? Math.min(100, Math.round((deposited.total / expected.total) * 100))
    : deposited.total > 0 ? 100 : 0;
  const over = remaining.total < -0.005;
  const noTarget = expected.total <= 0 && deposited.total > 0;
  const scopeLabel = summary.scope.isToday
    ? 'Today'
    : summary.scope.from && summary.scope.to && summary.scope.from !== summary.scope.to
      ? `${fmtDate(summary.scope.from)} – ${fmtDate(summary.scope.to)}`
      : fmtDate(summary.scope.from ?? summary.scope.to);
  const entryLabel = `${summary.entryCount} deposit ${summary.entryCount === 1 ? 'entry' : 'entries'}`;

  return (
    <section className="panel pad deposit-progress">
      <header className="dp-head">
        <div>
          <h2 className="dp-title"><Landmark size={18} /> Deposit progress</h2>
          <p className="muted sm-text">{scopeLabel} · {summary.approvedSettlements} approved settlement{summary.approvedSettlements === 1 ? '' : 's'} · {entryLabel}</p>
        </div>
        <Badge tone={DEPOSIT_SETTLEMENT_STATUS_TONE[status]} dot>{DEPOSIT_SETTLEMENT_STATUS_LABEL[status]}</Badge>
      </header>

      <div className="dp-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Deposited vs expected">
        <div className={`dp-bar-fill${over ? ' over' : ''}${status === 'COMPLETED' && !over ? ' done' : ''}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="dp-caption muted sm-text">
        {noTarget
          ? 'No approved settlement in this window — deposits recorded without an expected target.'
          : over
            ? `Over-deposited by ${inr(Math.abs(remaining.total))} versus the expected amount.`
            : `${pct}% of the expected amount banked.`}
      </p>

      <div className="dp-metrics">
        <DepositMetric icon={<Wallet size={18} />} label="Total to deposit" value={inr(expected.total)} hint="expected from approved settlements" />
        <DepositMetric icon={<Banknote size={18} />} label="Total deposited" value={inr(deposited.total)} hint={entryLabel} tone="accent" />
        <DepositMetric icon={<CheckCircle size={18} />} label="Remaining" value={inr(Math.max(0, remaining.total))} hint={remaining.total > 0.005 ? 'still to bank' : 'fully deposited'} tone={remaining.total > 0.005 ? 'warn' : 'ok'} />
        <DepositMetric label="Status" value={DEPOSIT_SETTLEMENT_STATUS_LABEL[status]} hint={`${summary.reconciled.count} reconciled · ${summary.inTransit.count} in transit`} />
      </div>

      <div className="dp-banks">
        {DEPOSIT_BANKS.map((b) => {
          const key = BANK_TOTAL_KEY[b];
          const exp = expected[key];
          const dep = deposited[key];
          const rem = remaining[key];
          const bpct = exp > 0 ? Math.min(100, Math.round((dep / exp) * 100)) : dep > 0 ? 100 : 0;
          return (
            <div key={b} className="dp-bank">
              <div className="dp-bank-head"><strong>{b}</strong><span className="muted sm-text">{bpct}%</span></div>
              <div className="dp-bar dp-bar-sm"><div className="dp-bar-fill" style={{ width: `${bpct}%` }} /></div>
              <div className="dp-bank-figs">
                <span>Expected <b className="num">{inr(exp)}</b></span>
                <span>Deposited <b className="num">{inr(dep)}</b></span>
                <span className={rem > 0.005 ? 'dp-rem-open' : ''}>Remaining <b className="num">{inr(Math.max(0, rem))}</b></span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DepositMetric({
  icon, label, value, hint, tone,
}: {
  icon?: ReactNode; label: string; value: string; hint?: string; tone?: 'accent' | 'ok' | 'warn';
}) {
  return (
    <div className={`dp-metric${tone ? ` dp-metric-${tone}` : ''}`}>
      <span className="dp-metric-top">
        {icon && <span className="dp-metric-icon" aria-hidden="true">{icon}</span>}
        <span className="dp-metric-label">{label}</span>
      </span>
      <span className="dp-metric-value num">{value}</span>
      {hint && <span className="muted sm-text">{hint}</span>}
    </div>
  );
}

// ── Record / edit a consolidated branch deposit ──────────────────────────────
function DepositFormModal({
  editing, branchScoped, defaultDate, onClose, onSaved,
}: {
  editing: BankDeposit | null;
  branchScoped: boolean;
  defaultDate: string;
  onClose: () => void;
  onSaved: (opts?: { keepOpen?: boolean }) => void;
}) {
  const toast = useToast();
  const isEdit = !!editing;
  const [branchId, setBranchId] = useState('');
  const [bank, setBank] = useState<DepositBank>(editing?.bank ?? 'SBI');
  const [depositDate, setDepositDate] = useState(editing ? isoLocalDate(new Date(editing.depositDate)) : defaultDate);
  const [amount, setAmount] = useState(editing ? String(Number(editing.amount)) : '');
  const [slipNumber, setSlipNumber] = useState(editing?.slipNumber ?? '');
  const [reference, setReference] = useState(editing?.reference ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [error, setError] = useState('');
  const amountRef = useRef<HTMLInputElement>(null);

  // Cross-branch roles pick the branch on create; branch-scoped users are pinned
  // server-side, and an edit never re-targets the branch.
  const branches = useQuery({
    queryKey: ['/branches', 'deposit-options'],
    enabled: !branchScoped && !isEdit,
    queryFn: () => api.get('/branches?pageSize=100').then((r) => r.data.data as BranchRef[]),
  });

  const save = useMutation({
    mutationFn: ({ keepOpen }: { keepOpen: boolean }) => {
      const payload = {
        bank,
        depositDate,
        amount: Number(amount),
        slipNumber: slipNumber.trim() || undefined,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      const request = isEdit
        ? api.patch(`/reconciliation/deposits/${editing.id}`, payload)
        : api.post('/reconciliation/deposits', { branchId: branchScoped ? undefined : branchId, ...payload });
      return request.then(() => ({ keepOpen }));
    },
    onSuccess: ({ keepOpen }) => {
      toast.success(isEdit ? 'Bank deposit updated.' : 'Bank deposit recorded.');
      if (isEdit || !keepOpen) { onSaved(); return; }
      // Keep the dialog open for the next pay-in: clear the entry-specific fields
      // (keep bank + date) and refresh the totals behind the dialog.
      setAmount(''); setSlipNumber(''); setReference(''); setNotes(''); setError('');
      onSaved({ keepOpen: true });
      amountRef.current?.focus();
    },
    onError: (err) => setError(apiMessage(err, 'Could not save the deposit.')),
  });

  const invalid = save.isPending || !amount || Number(amount) <= 0 || !depositDate || (!isEdit && !branchScoped && !branchId);

  return (
    <Modal
      size="md"
      onClose={onClose}
      icon={<Landmark size={20} />}
      title={isEdit ? 'Edit bank deposit' : 'Record bank deposit'}
      subtitle={isEdit
        ? 'Correct an in-transit deposit. A reconciled entry is locked.'
        : "One consolidated deposit per pay-in. Totals update the moment it's saved."}
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          {!isEdit && (
            <button type="button" className="ghost" disabled={invalid} onClick={() => { setError(''); save.mutate({ keepOpen: true }); }}>
              Record &amp; add another
            </button>
          )}
          <button type="button" disabled={invalid} onClick={() => { setError(''); save.mutate({ keepOpen: false }); }}>
            {save.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Record deposit'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        {!branchScoped && (
          <label className="span-all">Branch
            {isEdit
              ? <input value={editing.branch?.name ?? '—'} readOnly disabled />
              : (
                <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  <option value="">Select a branch</option>
                  {(branches.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}{b.code ? ` (${b.code})` : ''}</option>)}
                </select>
              )}
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
          <input ref={amountRef} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="100000" data-autofocus />
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
