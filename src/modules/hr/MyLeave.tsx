import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { FilterBar } from '../../components/FilterBar';
import { Badge } from '../../components/Badge';
import { Modal, ConfirmDialog } from '../../components/Modal';
import { ActionMenu } from '../../components/ActionMenu';
import { CalendarCheck, Pencil, Plus, Trash2, Ban, Wallet } from '../../components/icons';
import { fmtDate, titleCase, apiMessage } from '../../lib/format';
import { useToast } from '../../components/Toast';

/**
 * My Leave — self-service tab on the Leave page. Every admin-panel employee
 * (Branch Manager, HR, Accountant, Operations, …) applies for and tracks their
 * own leave here. Applying is self-service — the backend routes (POST
 * /human-resources/leaves, /leaves/me, /leaves/balances/me) carry no role guard
 * and enforce ownership in the service — so this tab needs no permission gate.
 * The team review/decide surface stays on the List tab.
 */

interface MyLeaveRow {
  id: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  numberOfDays: string | number;
  reason?: string | null;
  status: string;
}

interface LeaveBalance {
  leaveType: string;
  isPaid: boolean;
  annualEntitlement: number;
  opening: number;
  accrued: number;
  used: number;
  available: number;
}
interface BalancesResponse { year: number; balances: LeaveBalance[] }

const LEAVE_TYPES = ['CASUAL', 'SICK', 'EARNED', 'UNPAID', 'MATERNITY', 'PATERNITY'] as const;
type LeaveType = (typeof LEAVE_TYPES)[number];
const STATUS_FILTERS = ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const isPending = (status: string) => status === 'PENDING';
/** An ISO timestamp → the yyyy-mm-dd a <input type="date"> expects. */
const toDateInput = (iso: string) => iso.slice(0, 10);

const emptyForm = { leaveType: 'CASUAL' as LeaveType, fromDate: '', toDate: '', reason: '' };
type LeaveForm = typeof emptyForm;

export default function MyLeave() {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MyLeaveRow | null>(null);
  const [pendingCancel, setPendingCancel] = useState<MyLeaveRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MyLeaveRow | null>(null);

  const listQuery = useQuery({
    queryKey: ['/human-resources/leaves/me'],
    queryFn: () => api.get('/human-resources/leaves/me?pageSize=100').then((r) => r.data.data as MyLeaveRow[]),
  });
  const balancesQuery = useQuery({
    queryKey: ['/human-resources/leaves/balances/me'],
    queryFn: () => api.get('/human-resources/leaves/balances/me').then((r) => r.data.data as BalancesResponse),
  });

  const rows = useMemo(
    () => (listQuery.data ?? []).filter((l) => status === 'ALL' || l.status === status),
    [listQuery.data, status],
  );
  const paidBalances = (balancesQuery.data?.balances ?? []).filter((b) => b.isPaid);

  const refresh = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/human-resources/leaves') });

  const openApply = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (leave: MyLeaveRow) => { setEditing(leave); setFormOpen(true); };

  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/human-resources/leaves/${id}/cancel`),
    onSuccess: () => { toast.success('Leave request cancelled.'); setPendingCancel(null); refresh(); },
    onError: (err) => { toast.error(apiMessage(err, 'Could not cancel the request.')); setPendingCancel(null); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/human-resources/leaves/${id}`),
    onSuccess: () => { toast.success('Leave request deleted.'); setPendingDelete(null); refresh(); },
    onError: (err) => { toast.error(apiMessage(err, 'Could not delete the request.')); setPendingDelete(null); },
  });

  const columns: Column<MyLeaveRow>[] = [
    { header: 'Type', render: (l) => titleCase(l.leaveType), sortValue: (l) => l.leaveType },
    { header: 'From', render: (l) => fmtDate(l.fromDate), sortValue: (l) => l.fromDate },
    { header: 'To', render: (l) => fmtDate(l.toDate), sortValue: (l) => l.toDate },
    { header: 'Days', render: (l) => <span className="num">{l.numberOfDays}</span>, sortValue: (l) => Number(l.numberOfDays) },
    { header: 'Reason', render: (l) => l.reason ?? '—' },
    { header: 'Status', render: (l) => <Badge status={l.status} />, sortValue: (l) => l.status },
    {
      header: '',
      render: (l) => {
        const items = [
          ...(isPending(l.status)
            ? [
                { key: 'edit', label: 'Edit', icon: <Pencil size={15} />, onSelect: () => openEdit(l) },
                { key: 'cancel', label: 'Cancel request', icon: <Ban size={15} />, tone: 'danger' as const, onSelect: () => setPendingCancel(l) },
                { key: 'delete', label: 'Delete', icon: <Trash2 size={15} />, tone: 'danger' as const, separatorBefore: true, onSelect: () => setPendingDelete(l) },
              ]
            : []),
          ...(l.status === 'APPROVED'
            ? [{ key: 'cancel', label: 'Cancel request', icon: <Ban size={15} />, tone: 'danger' as const, onSelect: () => setPendingCancel(l) }]
            : []),
        ];
        return <div className="actions-cell">{items.length ? <ActionMenu items={items} /> : <span className="muted sm-text">—</span>}</div>;
      },
    },
  ];

  return (
    <>
      {paidBalances.length > 0 && (
        <section className="panel pad" style={{ marginBottom: '1rem' }}>
          <div className="panel-head" style={{ marginBottom: '0.6rem' }}>
            <h2><Wallet size={16} /> My leave balances{balancesQuery.data ? ` · ${balancesQuery.data.year}` : ''}</h2>
          </div>
          <div className="bal-chips">
            {paidBalances.map((b) => (
              <div key={b.leaveType} className={`bal-chip${b.available <= 1 ? ' bal-low' : ''}`}>
                <div className="bal-type">{titleCase(b.leaveType)}</div>
                <div className="bal-avail">{b.available}</div>
                <div className="bal-sub">used {b.used} / {b.opening + b.accrued}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <FilterBar actions={<button type="button" onClick={openApply}><Plus size={15} /> Apply for leave</button>}>
        <label>Status
          <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="Filter by status">
            {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s === 'ALL' ? 'All statuses' : titleCase(s)}</option>)}
          </select>
        </label>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        loading={listQuery.isLoading}
        empty="You have no leave requests yet. Use “Apply for leave” to submit one."
        searchPlaceholder="Search my leave…"
      />

      {formOpen && (
        <ApplyLeaveModal
          editing={editing}
          balances={paidBalances}
          onClose={() => setFormOpen(false)}
          onDone={() => { setFormOpen(false); refresh(); }}
        />
      )}

      {pendingCancel && (
        <ConfirmDialog
          icon={<Ban size={20} />}
          tone="danger"
          title="Cancel leave request?"
          message={<>Your {titleCase(pendingCancel.leaveType)} leave for {fmtDate(pendingCancel.fromDate)} – {fmtDate(pendingCancel.toDate)} will be marked cancelled.{pendingCancel.status === 'APPROVED' ? ' Any consumed balance is restored.' : ''}</>}
          confirmLabel="Cancel request"
          loading={cancel.isPending}
          onConfirm={() => cancel.mutate(pendingCancel.id)}
          onCancel={() => setPendingCancel(null)}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          icon={<Trash2 size={20} />}
          tone="danger"
          title="Delete leave request?"
          message={<>Your {titleCase(pendingDelete.leaveType)} leave for {fmtDate(pendingDelete.fromDate)} – {fmtDate(pendingDelete.toDate)} will be permanently removed. This cannot be undone.</>}
          confirmLabel="Delete request"
          loading={remove.isPending}
          onConfirm={() => remove.mutate(pendingDelete.id)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}

// ── Apply / edit own leave ───────────────────────────────────────────────────
function ApplyLeaveModal({
  editing, balances, onClose, onDone,
}: {
  editing: MyLeaveRow | null;
  balances: LeaveBalance[];
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<LeaveForm>(
    editing
      ? { leaveType: editing.leaveType as LeaveType, fromDate: toDateInput(editing.fromDate), toDate: toDateInput(editing.toDate), reason: editing.reason ?? '' }
      : emptyForm,
  );
  const [error, setError] = useState('');

  const payload = () => ({
    leaveType: form.leaveType,
    fromDate: form.fromDate,
    toDate: form.toDate,
    ...(form.reason.trim() ? { reason: form.reason.trim() } : {}),
  });

  const save = useMutation({
    mutationFn: () => (editing
      ? api.patch(`/human-resources/leaves/${editing.id}`, payload())
      : api.post('/human-resources/leaves', payload())),
    onSuccess: () => { toast.success(editing ? 'Leave request updated.' : 'Leave request submitted. HR will review it.'); onDone(); },
    onError: (err) => setError(apiMessage(err, 'Could not save the leave request.')),
  });

  // Best-effort client-side balance check; the backend remains the source of truth.
  const requestedDays = useMemo(() => {
    if (!form.fromDate || !form.toDate) return 0;
    const from = new Date(form.fromDate);
    const to = new Date(form.toDate);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return 0;
    return Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
  }, [form.fromDate, form.toDate]);
  const selectedBalance = balances.find((b) => b.leaveType === form.leaveType);
  const overBalance = Boolean(selectedBalance?.isPaid && requestedDays > selectedBalance.available);

  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); save.mutate(); };
  const disabled = save.isPending || !form.fromDate || !form.toDate || overBalance;

  return (
    <Modal
      size="md" onClose={onClose} icon={<CalendarCheck size={20} />}
      title={editing ? 'Edit leave request' : 'Apply for leave'}
      subtitle={editing ? 'Only pending requests can be changed.' : 'Your branch manager / HR reviews every request.'}
      footer={<>
        <button type="button" className="ghost" onClick={onClose} disabled={save.isPending}>Cancel</button>
        <button type="submit" form="my-leave-form" disabled={disabled}>{save.isPending ? 'Saving…' : editing ? 'Update request' : 'Submit request'}</button>
      </>}
    >
      <form id="my-leave-form" className="form-grid" onSubmit={submit}>
        <label className="span-all">Leave type
          <select value={form.leaveType} onChange={(e) => setForm({ ...form, leaveType: e.target.value as LeaveType })}>
            {LEAVE_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
          </select>
        </label>
        <label>From<input type="date" value={form.fromDate} onChange={(e) => setForm({ ...form, fromDate: e.target.value })} required /></label>
        <label>To<input type="date" value={form.toDate} min={form.fromDate || undefined} onChange={(e) => setForm({ ...form, toDate: e.target.value })} required /></label>
        <label className="span-all">Reason<input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} maxLength={255} placeholder="optional" /></label>
        {overBalance && selectedBalance && (
          <div className="error-box span-all">
            {requestedDays} {requestedDays === 1 ? 'day' : 'days'} requested but only {selectedBalance.available} {titleCase(selectedBalance.leaveType)} {selectedBalance.available === 1 ? 'day' : 'days'} available. Reduce the range or pick another type.
          </div>
        )}
        {error && <div className="error-box span-all">{error}</div>}
      </form>
    </Modal>
  );
}
