import { FormEvent, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FilterBar } from '../../components/FilterBar';
import { Badge } from '../../components/Badge';
import { ActionMenu } from '../../components/ActionMenu';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { Check, Ban, HandCoins, Pencil, Plus, Trash2 } from '../../components/icons';
import { inr, titleCase, apiMessage } from '../../lib/format';
import { useToast } from '../../components/Toast';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';

interface EmployeeOption { id: string; fullName: string; employeeCode: string }

type AdvanceStatus = 'PENDING' | 'ACTIVE' | 'RECOVERED' | 'REJECTED';

interface SalaryAdvance {
  id: string;
  amount: string | number;
  monthlyRecovery: string | number;
  outstandingAmount: string | number;
  status: AdvanceStatus;
  reason: string | null;
  createdAt: string;
  employee: { fullName: string; employeeCode: string; branch: { name: string } | null };
}

const STATUS_FILTERS = ['ALL', 'PENDING', 'ACTIVE', 'RECOVERED', 'REJECTED'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const emptyForm = { employeeId: '', amount: '', monthlyRecovery: '', reason: '' };
type Form = typeof emptyForm;

export default function SalaryAdvancesPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [editing, setEditing] = useState<SalaryAdvance | 'new' | null>(null);
  const [deleteFor, setDeleteFor] = useState<SalaryAdvance | null>(null);

  const canManage = can(user?.role, 'salaryAdvance:manage');

  const listUrl = `/human-resources/salary-advances${status === 'ALL' ? '' : `?status=${status}`}`;
  const query = useQuery({
    queryKey: [listUrl],
    queryFn: () => api.get(listUrl).then((r) => r.data.data as SalaryAdvance[]),
    placeholderData: keepPreviousData,
  });

  const refresh = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/human-resources/salary-advances') });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/human-resources/salary-advances/${id}`),
    onSuccess: () => { refresh(); setDeleteFor(null); toast.success('Salary advance deleted.'); },
    onError: (err) => { setDeleteFor(null); toast.error(apiMessage(err, 'Could not delete the advance.')); },
  });

  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'APPROVED' | 'REJECTED' }) =>
      api.post(`/human-resources/salary-advances/${id}/decision`, { decision }),
    onSuccess: (_r, { decision }) => { refresh(); toast.success(`Advance ${decision.toLowerCase()}.`); },
    onError: (err) => toast.error(apiMessage(err, 'Could not record the decision.')),
  });

  const columns: Column<SalaryAdvance>[] = [
    { header: 'Employee', render: (a) => <><strong>{a.employee.fullName}</strong><div className="muted sm-text">{a.employee.employeeCode}</div></>, sortValue: (a) => a.employee.fullName },
    { header: 'Branch', render: (a) => a.employee.branch?.name ?? '—', sortValue: (a) => a.employee.branch?.name ?? '' },
    { header: 'Amount', render: (a) => <span className="num">{inr(a.amount)}</span>, sortValue: (a) => Number(a.amount) },
    { header: 'Monthly recovery', render: (a) => <span className="num">{inr(a.monthlyRecovery)}</span>, sortValue: (a) => Number(a.monthlyRecovery) },
    { header: 'Outstanding', render: (a) => <span className="num">{inr(a.outstandingAmount)}</span>, sortValue: (a) => Number(a.outstandingAmount) },
    { header: 'Status', render: (a) => <Badge status={a.status}>{titleCase(a.status)}</Badge>, sortValue: (a) => a.status },
    { header: 'Reason', render: (a) => a.reason ?? '—' },
  ];

  if (canManage) {
    columns.push({
      header: '',
      render: (a) =>
        a.status === 'PENDING' ? (
          <div className="actions-cell" style={{ gap: 6 }}>
            <button className="ghost sm ok" disabled={decide.isPending} onClick={() => decide.mutate({ id: a.id, decision: 'APPROVED' })}><Check size={14} /> Approve</button>
            <button className="ghost sm danger" disabled={decide.isPending} onClick={() => decide.mutate({ id: a.id, decision: 'REJECTED' })}><Ban size={14} /> Reject</button>
          </div>
        ) : a.status === 'ACTIVE' ? (
          <div className="actions-cell">
            <ActionMenu items={[
              { key: 'edit', label: 'Edit', icon: <Pencil size={15} />, onSelect: () => setEditing(a) },
              { key: 'delete', label: 'Delete', icon: <Trash2 size={15} />, tone: 'danger', separatorBefore: true, onSelect: () => setDeleteFor(a) },
            ]} />
          </div>
        ) : <span className="muted">—</span>,
    });
  }

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Payroll & Finance' }, { label: 'Salary Advances' }]}
        title="Salary Advances"
        subtitle="Staff advances recovered from monthly salary"
        actions={canManage && <button className="btn-lg" onClick={() => setEditing('new')}><Plus size={16} /> New advance</button>}
      />

      <FilterBar chips={status !== 'ALL' ? [{ key: 'status', label: `Status: ${titleCase(status)}`, onRemove: () => setStatus('ALL') }] : []} onReset={status !== 'ALL' ? () => setStatus('ALL') : undefined}>
        <label>Status
          <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="Filter by status">
            {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s === 'ALL' ? 'All statuses' : titleCase(s)}</option>)}
          </select>
        </label>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={query.data ?? []}
        loading={query.isLoading}
        empty="No salary advances found."
        searchPlaceholder="Search by employee or branch…"
      />

      {editing && (
        <SalaryAdvanceFormModal
          advance={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDone={(message) => { setEditing(null); refresh(); toast.success(message); }}
        />
      )}

      {deleteFor && (
        <ConfirmDialog
          tone="danger"
          icon={<Trash2 size={20} />}
          title="Delete salary advance"
          message={<>This removes the advance. Advances already referenced by a payslip cannot be deleted.<br /><span className="muted sm-text">{deleteFor.employee.fullName} · {inr(deleteFor.amount)}</span></>}
          confirmLabel="Delete"
          loading={remove.isPending}
          onConfirm={() => remove.mutate(deleteFor.id)}
          onCancel={() => setDeleteFor(null)}
        />
      )}
    </>
  );
}

// ── Create / edit form ──────────────────────────────────────────────────────
function SalaryAdvanceFormModal({ advance, onClose, onDone }: { advance: SalaryAdvance | null; onClose: () => void; onDone: (message: string) => void }) {
  const isEdit = advance != null;
  const [form, setForm] = useState<Form>(
    advance
      ? { employeeId: '', amount: String(Number(advance.amount)), monthlyRecovery: String(Number(advance.monthlyRecovery)), reason: advance.reason ?? '' }
      : emptyForm,
  );
  const [error, setError] = useState('');

  const employeesQuery = useQuery({
    queryKey: ['/employees', 'salary-advance-options'],
    queryFn: () => api.get('/employees?pageSize=200').then((r) => r.data.data as EmployeeOption[]),
    enabled: !isEdit,
  });

  const save = useMutation({
    mutationFn: () => {
      if (isEdit) {
        return api.patch(`/human-resources/salary-advances/${advance!.id}`, {
          amount: Number(form.amount),
          monthlyRecovery: Number(form.monthlyRecovery),
          reason: form.reason.trim(),
        });
      }
      return api.post('/human-resources/salary-advances', {
        employeeId: form.employeeId,
        amount: Number(form.amount),
        monthlyRecovery: Number(form.monthlyRecovery),
        ...(form.reason.trim() ? { reason: form.reason.trim() } : {}),
      });
    },
    onSuccess: () => onDone(isEdit ? 'Salary advance updated.' : 'Salary advance created.'),
    onError: (err) => setError(apiMessage(err, 'Could not save the advance.')),
  });

  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); save.mutate(); };
  const disabled = (!isEdit && !form.employeeId) || !form.amount || !form.monthlyRecovery || save.isPending;

  return (
    <Modal
      size="md"
      onClose={onClose}
      icon={<HandCoins size={20} />}
      title={isEdit ? 'Edit salary advance' : 'New salary advance'}
      subtitle={isEdit ? `${advance!.employee.fullName} · ${advance!.employee.employeeCode}` : 'Advance recovered from monthly salary'}
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="salary-advance-form" disabled={disabled}>{save.isPending ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <form id="salary-advance-form" className="form-grid" onSubmit={submit}>
        {!isEdit && (
          <label className="span-all">Employee
            <select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} required>
              <option value="">— Select employee —</option>
              {employeesQuery.data?.map((e) => <option key={e.id} value={e.id}>{e.fullName} ({e.employeeCode})</option>)}
            </select>
          </label>
        )}
        <label>Amount<input type="number" min="1" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></label>
        <label>Monthly recovery<input type="number" min="1" step="0.01" value={form.monthlyRecovery} onChange={(e) => setForm({ ...form, monthlyRecovery: e.target.value })} required /></label>
        <label className="span-all">Reason<input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="optional" /></label>
        {error && <div className="error-box span-all">{error}</div>}
      </form>
    </Modal>
  );
}
