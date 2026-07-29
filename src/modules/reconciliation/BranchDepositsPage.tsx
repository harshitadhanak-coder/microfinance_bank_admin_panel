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
import { Ban, Banknote, CheckCircle, Landmark, Pencil, Plus, RotateCcw, Target, Wallet } from '../../components/icons';
import { inr, fmtDate, isoLocalDate, apiMessage } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { can, canAccessModule } from '../auth/permissions';
import {
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
  const [restoring, setRestoring] = useState<BankDeposit | null>(null);
  const [editingTarget, setEditingTarget] = useState(false);

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

  const restore = useMutation({
    mutationFn: (id: string) => api.post(`/reconciliation/deposits/${id}/restore`),
    onSuccess: (res) => { toast.success(res.data?.message ?? 'Deposit restored.'); setRestoring(null); void refresh(); },
    onError: (err) => { setRestoring(null); toast.error(apiMessage(err, 'Could not restore the deposit.')); },
  });

  if (!allowed) return <p className="muted">You do not have permission to view bank deposits.</p>;

  const rows = (data?.data ?? []) as BankDeposit[];
  const totalItems = (data?.pagination?.totalItems ?? 0) as number;

  const columns: Column<BankDeposit>[] = [
    { header: 'Deposit date', render: (d) => fmtDate(d.depositDate), sortKey: 'depositDate' },
    ...(branchScoped ? [] : [{ header: 'Branch', render: (d) => d.branch?.name ?? '—' } satisfies Column<BankDeposit>]),
    { header: 'Bank', render: (d) => <Badge tone="neutral">{d.bank}</Badge> },
    {
      header: 'Amount',
      render: (d) => (
        <span className={`num${d.status === 'CANCELLED' ? ' amount-voided' : ''}`}>
          <strong>{inr(d.amount)}</strong>
        </span>
      ),
    },
    // The day's cash book, read straight down the rows: what came in, what has
    // been banked so far, and what is still in hand after this entry. A voided
    // entry banks nothing, so it leaves the running position untouched.
    {
      header: 'Total collection',
      render: (d) => (d.dayCollection
        ? <span className="num">{inr(d.dayCollection)}</span>
        : <span className="muted sm-text" title="No approved settlement covers this day yet.">—</span>),
    },
    {
      header: 'Deposited',
      render: (d) => (d.status === 'CANCELLED' || d.runningDeposited == null
        ? <span className="muted sm-text">{d.status === 'CANCELLED' ? 'Excluded' : '—'}</span>
        : <span className="num">{inr(d.runningDeposited)}</span>),
    },
    {
      header: 'Closing',
      render: (d) => {
        if (d.status === 'CANCELLED' || d.runningClosing == null) return <span className="muted sm-text">—</span>;
        if (!d.dayCollection) return <span className="muted sm-text">—</span>;
        const over = d.runningClosing < -0.005;
        return (
          <span className={`num dep-closing${over ? ' over' : d.runningClosing > 0.005 ? ' open' : ' done'}`}>
            {inr(d.runningClosing)}
          </span>
        );
      },
    },
    { header: 'Slip no.', render: (d) => d.slipNumber ?? <span className="muted sm-text">—</span> },
    { header: 'Reference', render: (d) => d.reference ?? <span className="muted sm-text">—</span> },
    {
      header: 'Status',
      render: (d) => (
        <span className="dep-status-cell">
          <Badge tone={DEPOSIT_STATUS_TONE[d.status]}>{DEPOSIT_STATUS_LABEL[d.status]}</Badge>
          {d.status === 'CANCELLED' && d.cancelReason && (
            <span className="muted sm-text dep-void-reason" title={d.cancelReason}>{d.cancelReason}</span>
          )}
        </span>
      ),
    },
    { header: 'Recorded', render: (d) => <span className="muted sm-text">{fmtDateTime(d.createdAt)}</span> },
    {
      header: '',
      render: (d) => {
        if (!canManage || d.status === 'RECONCILED') return null;
        return (
          <div className="actions-cell">
            <ActionMenu items={d.status === 'CANCELLED'
              ? [{ key: 'restore', label: 'Restore deposit', icon: <RotateCcw size={15} />, onSelect: () => setRestoring(d) }]
              : [
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

      <DepositProgressPanel
        summary={summary.data}
        loading={summary.isLoading}
        onEditTarget={canManage && from === to ? () => setEditingTarget(true) : undefined}
      />

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
          dayRemaining={form.mode === 'create' ? summary.data?.cashBook.closing : undefined}
          onClose={() => setForm(null)}
          onSaved={(opts) => { void refresh(); if (!opts?.keepOpen) setForm(null); }}
        />
      )}

      {editingTarget && (
        <DepositTargetModal
          businessDate={from || today}
          current={summary.data?.target}
          branchScoped={branchScoped}
          onClose={() => setEditingTarget(false)}
          onSaved={() => { setEditingTarget(false); void refresh(); }}
        />
      )}

      {cancelling && (
        <VoidDepositModal
          deposit={cancelling}
          onClose={() => setCancelling(null)}
          onVoided={() => { setCancelling(null); void refresh(); }}
        />
      )}

      {restoring && (
        <ConfirmDialog
          icon={<RotateCcw size={20} />}
          title="Restore this deposit?"
          message={`This puts the ${inr(restoring.amount)} ${restoring.bank} deposit dated ${fmtDate(restoring.depositDate)} back in transit. Its amount counts towards the day's total again, so the remaining drops by ${inr(restoring.amount)}.`}
          confirmLabel="Restore deposit"
          loading={restore.isPending}
          onConfirm={() => restore.mutate(restoring.id)}
          onCancel={() => setRestoring(null)}
        />
      )}
    </>
  );
}

// ── DB-computed deposit progress ─────────────────────────────────────────────
function DepositProgressPanel({
  summary, loading, onEditTarget,
}: {
  summary?: DepositSettlementSummary;
  loading: boolean;
  /** Set only when the window is a single day the manager may declare a target for. */
  onEditTarget?: () => void;
}) {
  if (!summary) {
    return (
      <section className="panel pad deposit-progress">
        <p className="muted">{loading ? 'Loading deposit progress…' : 'Deposit progress is unavailable.'}</p>
      </section>
    );
  }

  const { status, target, cancelled, cashBook } = summary;
  const declared = target?.source === 'DECLARED';
  const pct = cashBook.totalCollection > 0
    ? Math.min(100, Math.round((cashBook.deposited / cashBook.totalCollection) * 100))
    : cashBook.deposited > 0 ? 100 : 0;
  const over = cashBook.closing < -0.005;
  const noTarget = cashBook.totalCollection <= 0;
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
          <p className="muted sm-text">
            {scopeLabel} · {summary.approvedSettlements} approved settlement{summary.approvedSettlements === 1 ? '' : 's'} · {entryLabel}
            {cancelled?.count ? ` · ${cancelled.count} voided (${inr(cancelled.amount)} excluded)` : ''}
          </p>
          <p className="muted sm-text dp-identity">
            collection {inr(cashBook.collection)}
            {cashBook.hospicash ? ` + hospicash ${inr(cashBook.hospicash)}` : ''}
            {' '}− deposited {inr(cashBook.deposited)} = <b>closing {inr(cashBook.closing)}</b>
          </p>
        </div>
        <div className="dp-head-actions">
          {/*
            The collection figure is normally automatic. The manual entry is only
            offered as the fallback for a day no approved settlement covers, or
            to correct/clear a figure already entered by hand.
          */}
          {onEditTarget && (declared || target.derivedAmount <= 0) && (
            <button type="button" className="ghost sm" onClick={onEditTarget}>
              <Target size={15} /> {declared ? 'Edit collection' : 'Enter collection'}
            </button>
          )}
          <Badge tone={DEPOSIT_SETTLEMENT_STATUS_TONE[status]} dot>{DEPOSIT_SETTLEMENT_STATUS_LABEL[status]}</Badge>
        </div>
      </header>

      <div className="dp-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Deposited vs expected">
        <div className={`dp-bar-fill${over ? ' over' : ''}${status === 'COMPLETED' && !over ? ' done' : ''}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="dp-caption muted sm-text">
        {noTarget
          ? 'No approved day-end settlement covers this window yet, so there is no collection to bank against.'
          : over
            ? `Over-deposited by ${inr(Math.abs(cashBook.closing))} — more has been banked than the day collected.`
            : `${pct}% of the collection banked${cashBook.closing > 0.005 ? ` — ${inr(cashBook.closing)} still in hand` : ''}.`}
      </p>

      {/*
        The cash book reads left to right on the identity the Branch Closing
        Report uses: opening + collection + hospicash − deposited = closing.
      */}
      <div className="dp-metrics">
        <DepositMetric
          icon={<Wallet size={18} />}
          label="Total collection"
          value={inr(cashBook.totalCollection)}
          hint={declared
            ? (target.days > 1 ? `entered for ${target.days} days` : 'entered manually')
            : `collected by ${summary.approvedSettlements} approved settlement${summary.approvedSettlements === 1 ? '' : 's'}`}
        />
        <DepositMetric icon={<Banknote size={18} />} label="Deposited" value={inr(cashBook.deposited)} hint={entryLabel} tone="accent" />
        <DepositMetric
          icon={<CheckCircle size={18} />}
          label="Closing"
          value={inr(cashBook.closing)}
          hint={cashBook.closing > 0.005 ? 'cash in hand, still to bank' : cashBook.closing < -0.005 ? 'banked more than collected' : 'fully deposited'}
          tone={cashBook.closing > 0.005 ? 'warn' : 'ok'}
        />
        <DepositMetric label="Status" value={DEPOSIT_SETTLEMENT_STATUS_LABEL[status]} hint={`${summary.reconciled.count} reconciled · ${summary.inTransit.count} in transit`} />
      </div>

      {/*
        No per-bank expected/remaining strip here. Which bank the branch pays
        into is the manager's choice at the counter, not a target to hit — the
        officers' per-bank split describes their own intent, so comparing the two
        produced a "remaining" no deposit could ever clear.
      */}
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

// ── The day's cash-to-deposit target ─────────────────────────────────────────
/**
 * Manual fallback for the day's total collection. Normally this figure is
 * derived from the approved day-end settlements and needs no entry at all —
 * this dialog exists for a date no approved settlement covers. Saving zero
 * clears the manual figure and hands the day back to the settlements.
 */
function DepositTargetModal({
  businessDate, current, branchScoped, onClose, onSaved,
}: {
  businessDate: string;
  current?: DepositSettlementSummary['target'];
  branchScoped: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const declared = current?.source === 'DECLARED';
  const [amount, setAmount] = useState(declared ? String(current!.amount) : '');
  const [notes, setNotes] = useState(current?.notes ?? '');
  const [error, setError] = useState('');

  const branches = useQuery({
    queryKey: ['/branches', 'target-options'],
    enabled: !branchScoped,
    queryFn: () => api.get('/branches?pageSize=100').then((r) => r.data.data as BranchRef[]),
  });
  const [branchId, setBranchId] = useState('');

  const save = useMutation({
    mutationFn: () => api.put('/reconciliation/deposits/target', {
      branchId: branchScoped ? undefined : branchId,
      businessDate,
      amount: Number(amount || 0),
      notes: notes.trim() || undefined,
    }),
    onSuccess: (res) => { toast.success(res.data?.message ?? 'Target saved.'); onSaved(); },
    onError: (err) => setError(apiMessage(err, 'Could not save the target.')),
  });

  const invalid = save.isPending || amount === '' || (!branchScoped && !branchId);

  return (
    <Modal
      size="md"
      onClose={onClose}
      icon={<Target size={20} />}
      title="Total collection to bank"
      subtitle={`The cash the branch has to bank on ${fmtDate(businessDate)}. Normally derived from the approved day-end settlements — enter it by hand only when none covers this date.`}
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button type="button" disabled={invalid} onClick={() => { setError(''); save.mutate(); }}>
            {save.isPending ? 'Saving…' : 'Save target'}
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
        <label className="span-all">Total collection (₹)
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="50000"
            data-autofocus
          />
        </label>
        <label className="span-all">Notes (optional)
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Where this figure comes from" />
        </label>
      </div>
      <p className="muted sm-text">
        {current && current.derivedAmount > 0
          ? `The approved settlements for this window come to ${inr(current.derivedAmount)} — entering a figure here overrides that.`
          : 'No approved day-end settlement covers this date yet.'}
        {' '}Save 0 to clear it and go back to the settlement figure.
      </p>
      {error && <div className="error-box">{error}</div>}
    </Modal>
  );
}

// ── Void a deposit (with an audited reason) ──────────────────────────────────
/**
 * Voiding keeps the entry and its figures — it only stops counting towards the
 * day's deposited total, which returns its amount to the remaining. The reason
 * is mandatory and shown on the cancelled row, so the day's audit trail says
 * why the slip was dropped. A voided entry can be restored later.
 */
function VoidDepositModal({
  deposit, onClose, onVoided,
}: {
  deposit: BankDeposit;
  onClose: () => void;
  onVoided: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const cancel = useMutation({
    mutationFn: () => api.post(`/reconciliation/deposits/${deposit.id}/cancel`, { reason: reason.trim() }),
    onSuccess: (res) => { toast.success(res.data?.message ?? 'Deposit voided.'); onVoided(); },
    onError: (err) => setError(apiMessage(err, 'Could not void the deposit.')),
  });

  const invalid = cancel.isPending || reason.trim().length < 3;

  return (
    <Modal
      size="md"
      onClose={onClose}
      icon={<Ban size={20} />}
      title="Void this deposit?"
      subtitle={`${inr(deposit.amount)} into ${deposit.bank} on ${fmtDate(deposit.depositDate)}${deposit.slipNumber ? ` · slip ${deposit.slipNumber}` : ''}`}
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="danger" disabled={invalid} onClick={() => { setError(''); cancel.mutate(); }}>
            {cancel.isPending ? 'Voiding…' : 'Void deposit'}
          </button>
        </>
      }
    >
      <p className="muted sm-text">
        The entry is kept for the audit trail but stops counting towards the day&rsquo;s total, so {inr(deposit.amount)} goes
        back into the remaining. You can restore it later.
      </p>
      <div className="form-grid">
        <label className="span-all">Reason for voiding
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Entered twice — duplicate of slip 3466"
            data-autofocus
          />
        </label>
      </div>
      {error && <div className="error-box">{error}</div>}
    </Modal>
  );
}

// ── Record / edit a consolidated branch deposit ──────────────────────────────
function DepositFormModal({
  editing, branchScoped, defaultDate, dayRemaining, onClose, onSaved,
}: {
  editing: BankDeposit | null;
  branchScoped: boolean;
  defaultDate: string;
  /** Still to bank in the current window — offered as the amount on a new entry. */
  dayRemaining?: number;
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
  const remainingLeft = !isEdit && dayRemaining != null ? dayRemaining : 0;

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
          {/* Banking the day in several pay-ins is normal, so the balance left
              is offered as one click rather than made the manager work it out. */}
          {remainingLeft > 0.005 && (
            <span className="muted sm-text field-hint">
              Closing {inr(remainingLeft)} still in hand ·{' '}
              <button type="button" className="link-btn" onClick={() => setAmount(String(remainingLeft))}>deposit it all</button>
            </span>
          )}
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
