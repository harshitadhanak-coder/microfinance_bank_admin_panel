import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Column, DataTable } from '../../components/DataTable';
import { FilterBar } from '../../components/FilterBar';
import { Badge } from '../../components/Badge';
import { Modal, ConfirmDialog } from '../../components/Modal';
import { ActionMenu } from '../../components/ActionMenu';
import { CalendarCheck, Ban, Wallet, Plus, ListChecks, AlertCircle } from '../../components/icons';
import { fmtDate, apiMessage } from '../../lib/format';
import { useToast } from '../../components/Toast';
import {
  leaveApi, leaveKeys, invalidateLeave, isCancellable, requestTypeLabel, currentApprover,
  STATUS_FILTERS, type StatusFilter, type LeaveBalance, type LeaveRequestRow,
  type LeaveTypeDef, type PreviewResult, type ApplyLeaveBody,
} from './leaveShared';

/**
 * My Leave — self-service tab on the Leave page.
 *
 * Employees now APPLY here. Under the legacy module booking was HR-only, so
 * this tab was read-plus-cancel; the ledger module's `/leave/me/requests` is
 * ungated (ownership comes from the caller's own employee record), so applying
 * belongs with the person taking the leave.
 *
 * The apply form is preview-first, which is the whole point of the redesign:
 * before committing you see the per-day charge, which days are free because
 * they are holidays or weekly offs, the balance you will be left with, and who
 * has to approve it. The sandwich rule stops being a month-end argument.
 */

const todayInput = () => new Date().toISOString().slice(0, 10);

export default function MyLeave() {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [applying, setApplying] = useState(false);
  const [pendingCancel, setPendingCancel] = useState<LeaveRequestRow | null>(null);

  const listQuery = useQuery({ queryKey: leaveKeys.myRequests, queryFn: () => leaveApi.myRequests() });
  const balancesQuery = useQuery({ queryKey: leaveKeys.myBalances, queryFn: leaveApi.myBalances });
  const typesQuery = useQuery({ queryKey: leaveKeys.types, queryFn: leaveApi.listTypes });

  const rows = useMemo(
    () => (listQuery.data?.items ?? []).filter((l) => status === 'ALL' || l.status === status),
    [listQuery.data, status],
  );
  // Untracked types (LWP) have no balance to show.
  const trackedBalances = (balancesQuery.data?.balances ?? []).filter((b) => b.isPaid);

  const refresh = () => invalidateLeave(qc);

  const cancel = useMutation({
    mutationFn: (id: string) => leaveApi.cancelMine(id),
    onSuccess: () => { toast.success('Leave request cancelled.'); setPendingCancel(null); refresh(); },
    onError: (err) => { toast.error(apiMessage(err, 'Could not cancel the request.')); setPendingCancel(null); },
  });

  const columns: Column<LeaveRequestRow>[] = [
    { header: 'Request', render: (l) => <span className="mono sm-text">{l.requestNo}</span>, sortValue: (l) => l.requestNo },
    { header: 'Type', render: (l) => requestTypeLabel(l.lines), sortValue: (l) => requestTypeLabel(l.lines) },
    { header: 'From', render: (l) => fmtDate(l.fromDate), sortValue: (l) => l.fromDate },
    { header: 'To', render: (l) => fmtDate(l.toDate), sortValue: (l) => l.toDate },
    { header: 'Days', render: (l) => <span className="num">{Number(l.totalDays)}</span>, sortValue: (l) => Number(l.totalDays) },
    { header: 'Reason', render: (l) => l.reason ?? '—' },
    { header: 'With', render: (l) => currentApprover(l) },
    { header: 'Status', render: (l) => <Badge status={l.status} />, sortValue: (l) => l.status },
    {
      header: '',
      render: (l) => {
        const items = isCancellable(l)
          ? [{ key: 'cancel', label: 'Cancel request', icon: <Ban size={15} />, tone: 'danger' as const, onSelect: () => setPendingCancel(l) }]
          : [];
        return <div className="actions-cell">{items.length ? <ActionMenu items={items} /> : <span className="muted sm-text">—</span>}</div>;
      },
    },
  ];

  return (
    <>
      {trackedBalances.length > 0 && (
        <section className="panel pad" style={{ marginBottom: '1rem' }}>
          <div className="panel-head" style={{ marginBottom: '0.6rem' }}>
            <h2><Wallet size={16} /> My leave balances{trackedBalances[0] ? ` · ${trackedBalances[0].periodLabel}` : ''}</h2>
          </div>
          <div className="bal-chips">
            {trackedBalances.map((b) => (
              <div key={b.leaveTypeId} className={`bal-chip${b.available <= 1 ? ' bal-low' : ''}`}>
                <div className="bal-type">{b.name}</div>
                <div className="bal-avail">{b.available}</div>
                <div className="bal-sub">
                  used {b.used} / {b.opening + b.accrued}
                  {b.pending > 0 ? ` · ${b.pending} on hold` : ''}
                </div>
                {b.expiringSoon > 0 && (
                  <div className="bal-sub" style={{ color: 'var(--warn, #b45309)' }}>{b.expiringSoon} expiring soon</div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <FilterBar>
        <label>Status
          <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="Filter by status">
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>{s === 'ALL' ? 'All statuses' : s.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => setApplying(true)} disabled={!typesQuery.data?.length}>
          <Plus size={15} /> Apply for leave
        </button>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        loading={listQuery.isLoading}
        empty="You have no leave records yet."
        searchPlaceholder="Search my leave…"
      />

      {applying && (
        <ApplyLeaveModal
          types={typesQuery.data ?? []}
          balances={trackedBalances}
          onClose={() => setApplying(false)}
          onDone={() => { setApplying(false); refresh(); }}
        />
      )}

      {pendingCancel && (
        <ConfirmDialog
          icon={<Ban size={20} />}
          tone="danger"
          title="Cancel leave request?"
          message={<>
            {requestTypeLabel(pendingCancel.lines)} leave for {fmtDate(pendingCancel.fromDate)} – {fmtDate(pendingCancel.toDate)} will be cancelled.
            {pendingCancel.status === 'APPROVED'
              ? ' Days you have not yet taken are credited back; days already past stay consumed.'
              : ' The days held against your balance are released.'}
          </>}
          confirmLabel="Cancel request"
          loading={cancel.isPending}
          onConfirm={() => cancel.mutate(pendingCancel.id)}
          onCancel={() => setPendingCancel(null)}
        />
      )}
    </>
  );
}

// ── Apply, preview-first ─────────────────────────────────────────────────

export function ApplyLeaveModal({
  types, balances, employeeId, onBehalf, onClose, onDone,
}: {
  types: LeaveTypeDef[];
  balances: LeaveBalance[];
  /** Set together with onBehalf when HR books for someone else. */
  employeeId?: string;
  onBehalf?: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [leaveTypeId, setLeaveTypeId] = useState(types[0]?.id ?? '');
  const [fromDate, setFromDate] = useState(todayInput());
  const [toDate, setToDate] = useState(todayInput());
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  const body = (): ApplyLeaveBody => ({
    ...(employeeId ? { employeeId } : {}),
    lines: [{ leaveTypeId, fromDate, toDate }],
    reason: reason.trim(),
  });

  const ready = Boolean(leaveTypeId && fromDate && toDate && reason.trim().length >= 3 && toDate >= fromDate);

  // Debounced dry run. Every change re-asks the backend rather than
  // approximating the rules here — the day count depends on the holiday
  // calendar, the employee's shift and the sandwich rule, none of which the
  // browser can know.
  const previewMutation = useMutation({
    mutationFn: () => leaveApi.preview(body()),
    onSuccess: (result) => { setPreview(result); setError(''); },
    onError: (err) => { setPreview(null); setError(apiMessage(err, 'Could not preview this request.')); },
  });

  useEffect(() => {
    if (!ready) { setPreview(null); return; }
    const timer = setTimeout(() => previewMutation.mutate(), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaveTypeId, fromDate, toDate, reason, ready]);

  const submit_ = useMutation({
    mutationFn: () => (onBehalf ? leaveApi.applyOnBehalf(body()) : leaveApi.apply(body())),
    onSuccess: () => { toast.success('Leave request submitted.'); onDone(); },
    onError: (err) => setError(apiMessage(err, 'Could not submit the leave request.')),
  });

  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); submit_.mutate(); };
  const blocked = preview ? !preview.canSubmit : true;
  const balance = balances.find((b) => b.leaveTypeId === leaveTypeId);

  return (
    <Modal
      size="lg" onClose={onClose} icon={<CalendarCheck size={20} />}
      title={onBehalf ? 'Record leave for an employee' : 'Apply for leave'}
      subtitle="The breakdown below is exactly what will be charged."
      footer={<>
        <button type="button" className="ghost" onClick={onClose} disabled={submit_.isPending}>Cancel</button>
        <button type="submit" form="apply-leave-form" disabled={submit_.isPending || blocked}>
          {submit_.isPending ? 'Submitting…' : 'Submit request'}
        </button>
      </>}
    >
      <form id="apply-leave-form" className="form-grid" onSubmit={submit}>
        <label className="span-all">Leave type
          <select value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)}>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isPaid ? '' : ' (unpaid)'}</option>)}
          </select>
        </label>
        <label>From<input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); if (toDate < e.target.value) setToDate(e.target.value); }} required /></label>
        <label>To<input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} required /></label>
        <label className="span-all">Reason
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} minLength={3} required placeholder="Why you need this leave" />
        </label>

        {balance && (
          <div className="span-all muted sm-text">
            {balance.name}: {balance.available} available{balance.pending > 0 ? `, ${balance.pending} already on hold` : ''}.
          </div>
        )}

        <div className="span-all">
          {previewMutation.isPending && <div className="muted sm-text">Checking…</div>}
          {preview && <PreviewPanel preview={preview} />}
        </div>

        {error && <div className="error-box span-all">{error}</div>}
      </form>
    </Modal>
  );
}

/** The dry-run result: charge, blockers, warnings and the approval chain. */
function PreviewPanel({ preview }: { preview: PreviewResult }) {
  const days = preview.lines.flatMap((l) => l.days);
  const charged = days.filter((d) => d.chargeable);
  const free = days.filter((d) => !d.chargeable);

  return (
    <div className="panel pad" style={{ marginTop: '0.5rem' }}>
      <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
        <div>
          <div className="muted sm-text">Days charged</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 600 }}>{preview.totalChargedDays}</div>
        </div>
        {preview.balance && (
          <div>
            <div className="muted sm-text">Balance after</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 600 }}>{preview.balance.afterRequest}</div>
          </div>
        )}
        {free.length > 0 && (
          <div>
            <div className="muted sm-text">Not charged</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 600 }}>{free.length}</div>
          </div>
        )}
      </div>

      {free.length > 0 && (
        <p className="muted sm-text" style={{ marginBottom: '0.5rem' }}>
          Free: {free.map((d) => `${d.date.slice(5)} (${d.dayClass.toLowerCase().replace(/_/g, ' ')})`).join(', ')}
        </p>
      )}

      {charged.some((d) => d.chargeReason) && (
        <p className="muted sm-text" style={{ marginBottom: '0.5rem' }}>
          {charged.filter((d) => d.chargeReason).map((d) => `${d.date.slice(5)}: ${d.chargeReason?.toLowerCase().replace(/_/g, ' ')}`).join(' · ')}
        </p>
      )}

      {preview.lines.length > 1 && (
        <p className="sm-text" style={{ marginBottom: '0.5rem' }}>
          Split across {preview.lines.map((l) => `${l.quantity}d ${l.leaveTypeCode}${l.isAutoConverted ? ' (auto)' : ''}`).join(' + ')}.
        </p>
      )}

      {preview.violations.map((v) => (
        <div key={v.code} className="error-box" style={{ marginBottom: '0.4rem' }}>
          <AlertCircle size={14} /> {v.message}
        </div>
      ))}
      {preview.warnings.map((w) => (
        <div key={w.code} className="muted sm-text" style={{ marginBottom: '0.3rem' }}>
          <AlertCircle size={13} /> {w.message}
        </div>
      ))}

      {preview.approvalChain.length > 0 && (
        <p className="sm-text" style={{ marginTop: '0.5rem' }}>
          <ListChecks size={14} /> Approval: {preview.approvalChain.map((s) => s.approverName).join(' → ')}
        </p>
      )}
    </div>
  );
}
