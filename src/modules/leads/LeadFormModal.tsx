import { FormEvent, useState } from 'react';
import { AxiosError } from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';

interface BranchOption { id: string; name: string; code: string }
interface EmployeeOption { id: string; fullName: string; designation: string; branchId?: string | null }

export interface LeadFormLead {
  id: string;
  fullName: string;
  phoneNumber: string;
  location?: string | null;
  purpose?: string | null;
  requestedAmount?: string | null;
  source?: string | null;
  nextFollowUpAt?: string | null;
}

const apiMessage = (err: unknown, fallback: string): string =>
  (err instanceof AxiosError && err.response?.data?.message) || fallback;

/** Drops empty strings so optional fields are omitted rather than sent blank. */
const compact = (o: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null));

/**
 * Create / edit form for a lead. Branch-scoped users (manager, field officer)
 * capture leads into their own branch automatically; cross-branch roles pick
 * the branch. Assignment at capture is offered only to roles allowed to assign.
 */
export default function LeadFormModal({ lead, onClose }: { lead?: LeadFormLead | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isEdit = !!lead;
  const canAssign = can(user?.role, 'lead:assign');
  const needsBranchChoice = !isEdit && !user?.branchId;

  const [form, setForm] = useState({
    fullName: lead?.fullName ?? '',
    phoneNumber: lead?.phoneNumber ?? '',
    requestedAmount: lead?.requestedAmount ?? '',
    purpose: lead?.purpose ?? '',
    source: lead?.source ?? '',
    location: lead?.location ?? '',
    nextFollowUpAt: lead?.nextFollowUpAt ? lead.nextFollowUpAt.slice(0, 10) : '',
    branchId: user?.branchId ?? '',
    assignedToId: '',
  });
  const [error, setError] = useState('');

  const branchesQuery = useQuery({
    queryKey: ['/branches', 'options'],
    queryFn: () => api.get('/branches?pageSize=100').then((r) => r.data.data as BranchOption[]),
    enabled: needsBranchChoice,
  });

  const employeesQuery = useQuery({
    queryKey: ['/employees', 'options'],
    queryFn: () => api.get('/employees?pageSize=100').then((r) => r.data.data as EmployeeOption[]),
    enabled: !isEdit && canAssign,
  });
  const assignees = (employeesQuery.data ?? []).filter(
    (e) => !form.branchId || e.branchId === form.branchId,
  );

  const save = useMutation({
    mutationFn: () => {
      const shared = {
        fullName: form.fullName,
        phoneNumber: form.phoneNumber,
        requestedAmount: form.requestedAmount === '' ? undefined : Number(form.requestedAmount),
        purpose: form.purpose,
        source: form.source,
        location: form.location,
      };
      if (isEdit) {
        return api.patch(`/leads/${lead!.id}`, compact({
          ...shared,
          nextFollowUpAt: form.nextFollowUpAt ? new Date(form.nextFollowUpAt).toISOString() : undefined,
        }));
      }
      return api.post('/leads', compact({
        ...shared,
        branchId: form.branchId,
        assignedToId: canAssign ? form.assignedToId : undefined,
      }));
    },
    onSuccess: () => {
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/leads') });
      qc.invalidateQueries({ queryKey: ['lead-funnel'] });
      onClose();
    },
    onError: (err) => setError(apiMessage(err, 'Could not save the lead.')),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!isEdit && !form.branchId) { setError('Please choose a branch.'); return; }
    save.mutate();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{isEdit ? 'Edit lead' : 'New lead'}</h2>
          <p className="muted">{isEdit ? 'Correct the captured details.' : 'Capture a prospective borrower for follow-up.'}</p>
        </header>

        <form className="form-grid" onSubmit={submit}>
          <label>Full name<input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required minLength={2} /></label>
          <label>Phone<input value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} required placeholder="+91…" /></label>
          <label>Requested amount (₹)<input type="number" min={0} step="0.01" value={form.requestedAmount} onChange={(e) => setForm({ ...form, requestedAmount: e.target.value })} /></label>
          <label>Purpose<input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="e.g. Working capital" /></label>
          <label>Source<input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="e.g. Referral, Field visit" /></label>
          <label>Location<input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label>

          {isEdit && (
            <label>Next follow-up<input type="date" value={form.nextFollowUpAt} onChange={(e) => setForm({ ...form, nextFollowUpAt: e.target.value })} /></label>
          )}

          {needsBranchChoice && (
            <label>Branch
              <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value, assignedToId: '' })} required>
                <option value="">— Select branch —</option>
                {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
              </select>
            </label>
          )}

          {!isEdit && canAssign && (
            <label>Assign to
              <select value={form.assignedToId} onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}>
                <option value="">— Unassigned —</option>
                {assignees.map((e) => <option key={e.id} value={e.id}>{e.fullName} · {e.designation}</option>)}
              </select>
            </label>
          )}

          {error && <div className="error-box span-all">{error}</div>}
          <div className="span-all row-actions">
            <button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Capture lead'}</button>
            <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
