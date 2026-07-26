import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { ConfirmDialog } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { Ban, Check, Loader, Plus, Trash2 } from '../../components/icons';
import { apiMessage, fmtDate, inr, titleCase } from '../../lib/format';
import { InlineEditField } from './InlineEditField';

type AdvanceStatus = 'PENDING' | 'ACTIVE' | 'RECOVERED' | 'REJECTED';

interface SalaryAdvance {
  id: string;
  amount: string | number;
  monthlyRecovery: string | number;
  outstandingAmount: string | number;
  status: AdvanceStatus;
  reason: string | null;
  createdAt: string;
}

const emptyForm = { amount: '', monthlyRecovery: '', reason: '' };

/**
 * Employee → Salary tab: the staff-advance ledger for one employee. HR can add
 * an advance, approve / reject a pending request, and inline-edit or delete an
 * active one — the same actions as the standalone Salary Advances screen, scoped
 * to this person so the "advance recovery" line on the pay breakdown can be
 * managed from where it is shown. Editable amounts/recovery use the same
 * double-click inline editor as the Overview profile fields.
 */
export default function EmployeeSalaryAdvances({ employeeId, canManage }: { employeeId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [deleteFor, setDeleteFor] = useState<SalaryAdvance | null>(null);

  const query = useQuery({
    queryKey: ['/human-resources/salary-advances', employeeId],
    queryFn: () => api.get(`/human-resources/salary-advances?employeeId=${employeeId}`).then((r) => r.data.data as SalaryAdvance[]),
  });
  const advances = query.data ?? [];

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['/human-resources/salary-advances', employeeId] });
    // The pay breakdown's "advance recovery" line is derived on the employee
    // record, so it has to refetch too.
    qc.invalidateQueries({ queryKey: ['/employees', employeeId] });
  };

  const create = useMutation({
    mutationFn: () => api.post('/human-resources/salary-advances', {
      employeeId,
      amount: Number(form.amount),
      monthlyRecovery: Number(form.monthlyRecovery),
      ...(form.reason.trim() ? { reason: form.reason.trim() } : {}),
    }),
    onSuccess: () => { setAdding(false); setForm(emptyForm); setError(''); refresh(); toast.success('Salary advance created.'); },
    onError: (err) => setError(apiMessage(err, 'Could not create the advance.')),
  });

  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'APPROVED' | 'REJECTED' }) =>
      api.post(`/human-resources/salary-advances/${id}/decision`, { decision }),
    onSuccess: (_r, { decision }) => { refresh(); toast.success(`Advance ${decision.toLowerCase()}.`); },
    onError: (err) => toast.error(apiMessage(err, 'Could not record the decision.')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/human-resources/salary-advances/${id}`),
    onSuccess: () => { setDeleteFor(null); refresh(); toast.success('Salary advance deleted.'); },
    onError: (err) => { setDeleteFor(null); toast.error(apiMessage(err, 'Could not delete the advance.')); },
  });

  // Per-field inline save for an active advance (amount / monthly recovery /
  // reason). Rejects on error so the inline editor stays open to retry.
  const patchAdvance = (id: string, field: 'amount' | 'monthlyRecovery' | 'reason') => (value: string) =>
    api.patch(`/human-resources/salary-advances/${id}`, { [field]: field === 'reason' ? value : Number(value) })
      .then((r) => { refresh(); toast.success('Advance updated.'); return r; })
      .catch((err) => { toast.error(apiMessage(err, 'Could not update the advance.')); throw err; });

  const submitAdd = (e: FormEvent) => {
    e.preventDefault(); setError('');
    if (!form.amount || !form.monthlyRecovery) { setError('Amount and monthly recovery are required.'); return; }
    create.mutate();
  };

  return (
    <Card
      title="Salary advances"
      action={canManage && !adding && (
        <button className="sm" onClick={() => { setForm(emptyForm); setError(''); setAdding(true); }}><Plus size={14} /> Add advance</button>
      )}
    >
      {canManage && adding && (
        <form className="form-grid" onSubmit={submitAdd} style={{ marginBottom: '1rem' }}>
          <label>Amount<input type="number" min="1" step="0.01" value={form.amount} autoFocus onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></label>
          <label>Monthly recovery<input type="number" min="1" step="0.01" value={form.monthlyRecovery} onChange={(e) => setForm({ ...form, monthlyRecovery: e.target.value })} required /></label>
          <label className="span-all">Reason<input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="optional" /></label>
          {error && <div className="error-box span-all">{error}</div>}
          <div className="span-all row-actions" style={{ justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button type="button" className="ghost sm" onClick={() => { setAdding(false); setError(''); }}>Cancel</button>
            <button type="submit" className="sm" disabled={create.isPending}>{create.isPending ? <><Loader size={14} /> Saving…</> : 'Create advance'}</button>
          </div>
        </form>
      )}

      {query.isLoading ? (
        <p className="muted">Loading advances…</p>
      ) : advances.length === 0 ? (
        <EmptyState variant="no-data" title="No salary advances" message={canManage ? 'Add an advance to recover it from monthly salary.' : undefined} />
      ) : (
        <div className="advance-list">
          {advances.map((a) => {
            const editable = canManage && a.status === 'ACTIVE';
            return (
              <div key={a.id} className="advance-item">
                <div className="advance-head">
                  <Badge status={a.status}>{titleCase(a.status)}</Badge>
                  <span className="muted sm-text">Added {fmtDate(a.createdAt)}</span>
                  {editable && (
                    <button type="button" className="sm ghost danger advance-delete" onClick={() => setDeleteFor(a)}><Trash2 size={13} /> Delete</button>
                  )}
                </div>
                <dl className="detail-list one-col">
                  <InlineEditField label="Amount" kind="number" value={String(Number(a.amount))}
                    display={<span className="num">{inr(a.amount)}</span>} canEdit={editable} onSave={patchAdvance(a.id, 'amount')} />
                  <InlineEditField label="Monthly recovery" kind="number" value={String(Number(a.monthlyRecovery))}
                    display={<span className="num">{inr(a.monthlyRecovery)}</span>} canEdit={editable} onSave={patchAdvance(a.id, 'monthlyRecovery')} />
                  <div><dt>Outstanding</dt><dd className="num">{inr(a.outstandingAmount)}</dd></div>
                  <InlineEditField label="Reason" value={a.reason ?? ''} canEdit={editable} onSave={patchAdvance(a.id, 'reason')} />
                </dl>
                {canManage && a.status === 'PENDING' && (
                  <div className="row-actions" style={{ gap: '0.5rem', marginTop: '0.6rem' }}>
                    <button type="button" className="sm ok" disabled={decide.isPending} onClick={() => decide.mutate({ id: a.id, decision: 'APPROVED' })}><Check size={14} /> Approve</button>
                    <button type="button" className="sm ghost danger" disabled={decide.isPending} onClick={() => decide.mutate({ id: a.id, decision: 'REJECTED' })}><Ban size={14} /> Reject</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {deleteFor && (
        <ConfirmDialog
          tone="danger" icon={<Trash2 size={20} />} title="Delete salary advance"
          message={<>This removes the advance. Advances already referenced by a payslip cannot be deleted.<br /><span className="muted sm-text">{inr(deleteFor.amount)} · monthly {inr(deleteFor.monthlyRecovery)}</span></>}
          confirmLabel="Delete" loading={remove.isPending}
          onConfirm={() => remove.mutate(deleteFor.id)}
          onCancel={() => setDeleteFor(null)}
        />
      )}
    </Card>
  );
}
