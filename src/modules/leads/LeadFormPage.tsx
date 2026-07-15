import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/Card';
import { Form, FormGrid, Field, FormActions } from '../../components/Form';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { Loader } from '../../components/icons';
import { apiMessage } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import { BranchOption, EmployeeOption, LeadDetail } from './shared';

const empty = {
  fullName: '', phoneNumber: '', requestedAmount: '', purpose: '', source: '', location: '',
  nextFollowUpAt: '', branchId: '', assignedToId: '',
};
type LeadForm = typeof empty;

/** Drops empty strings so optional fields are omitted rather than sent blank. */
const compact = (o: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null));

/**
 * Lead — Create / Edit. One page for both routes: `/leads/new` captures a new
 * prospect, `/leads/:id/edit` corrects a captured lead. Branch-scoped users
 * capture into their own branch; cross-branch roles choose the branch.
 */
export default function LeadFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();

  const canCreate = can(user?.role, 'lead:create');
  const canUpdate = can(user?.role, 'lead:update');
  const canAssign = can(user?.role, 'lead:assign');
  const needsBranchChoice = !isEdit && !user?.branchId;

  const [form, setForm] = useState<LeadForm>({ ...empty, branchId: user?.branchId ?? '' });
  const [error, setError] = useState('');
  const set = (patch: Partial<LeadForm>) => setForm((f) => ({ ...f, ...patch }));

  // Edit: prefill from the lead record.
  const detailQuery = useQuery({
    queryKey: ['/leads', id],
    queryFn: () => api.get(`/leads/${id}`).then((r) => r.data.data as LeadDetail),
    enabled: isEdit,
  });
  const detail = detailQuery.data;
  useEffect(() => {
    if (!detail) return;
    setForm((f) => ({
      ...f,
      fullName: detail.fullName, phoneNumber: detail.phoneNumber,
      requestedAmount: detail.requestedAmount != null ? String(detail.requestedAmount) : '',
      purpose: detail.purpose ?? '', source: detail.source ?? '', location: detail.location ?? '',
      nextFollowUpAt: detail.nextFollowUpAt ? detail.nextFollowUpAt.slice(0, 10) : '',
    }));
  }, [detail]);

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
  const assignees = (employeesQuery.data ?? []).filter((e) => !form.branchId || e.branchId === form.branchId);

  const save = useMutation({
    mutationFn: () => {
      const shared = {
        fullName: form.fullName, phoneNumber: form.phoneNumber,
        requestedAmount: form.requestedAmount === '' ? undefined : Number(form.requestedAmount),
        purpose: form.purpose, source: form.source, location: form.location,
      };
      if (isEdit) {
        return api.patch(`/leads/${id}`, compact({
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
    onSuccess: (res) => {
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/leads') });
      qc.invalidateQueries({ queryKey: ['lead-funnel'] });
      toast.success(isEdit ? 'Lead updated.' : 'Lead captured.');
      const newId = (res.data?.data?.id as string | undefined) ?? id;
      navigate(newId ? `/leads/${newId}` : '/leads');
    },
    onError: (err) => setError(apiMessage(err, 'Could not save the lead.')),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!isEdit && !form.branchId) { setError('Please choose a branch.'); return; }
    save.mutate();
  };

  if (isEdit ? !canUpdate : !canCreate) return <p className="muted">You do not have permission to {isEdit ? 'edit' : 'capture'} leads.</p>;
  if (isEdit && !detail) return <Card><Skeleton height={20} /><Skeleton height={14} style={{ marginTop: 12 }} /></Card>;

  return (
    <>
      <PageHeader
        breadcrumb={isEdit
          ? [{ label: 'Operations' }, { label: 'Leads', to: '/leads' }, { label: detail?.fullName ?? 'Lead', to: `/leads/${id}` }, { label: 'Edit' }]
          : [{ label: 'Operations' }, { label: 'Leads', to: '/leads' }, { label: 'New lead' }]}
        title={isEdit ? `Edit ${detail?.fullName ?? 'lead'}` : 'New lead'}
        subtitle={isEdit ? 'Correct the captured details' : 'Capture a prospective borrower for follow-up'}
      />

      <Form onSubmit={submit}>
        <Card title="Lead details">
          <FormGrid cols={2}>
            <Field label="Full name" required><input value={form.fullName} onChange={(e) => set({ fullName: e.target.value })} required minLength={2} /></Field>
            <Field label="Phone" required><input value={form.phoneNumber} onChange={(e) => set({ phoneNumber: e.target.value })} required placeholder="+91…" /></Field>
            <Field label="Requested amount (₹)"><input type="number" min={0} step="0.01" value={form.requestedAmount} onChange={(e) => set({ requestedAmount: e.target.value })} /></Field>
            <Field label="Purpose"><input value={form.purpose} onChange={(e) => set({ purpose: e.target.value })} placeholder="e.g. Working capital" /></Field>
            <Field label="Source"><input value={form.source} onChange={(e) => set({ source: e.target.value })} placeholder="e.g. Referral, Field visit" /></Field>
            <Field label="Location"><input value={form.location} onChange={(e) => set({ location: e.target.value })} /></Field>
            {isEdit && (
              <Field label="Next follow-up"><input type="date" value={form.nextFollowUpAt} onChange={(e) => set({ nextFollowUpAt: e.target.value })} /></Field>
            )}
            {needsBranchChoice && (
              <Field label="Branch" required>
                <select value={form.branchId} onChange={(e) => set({ branchId: e.target.value, assignedToId: '' })} required>
                  <option value="">— Select branch —</option>
                  {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
                </select>
              </Field>
            )}
            {!isEdit && canAssign && (
              <Field label="Assign to">
                <select value={form.assignedToId} onChange={(e) => set({ assignedToId: e.target.value })}>
                  <option value="">— Unassigned —</option>
                  {assignees.map((e) => <option key={e.id} value={e.id}>{e.fullName} · {e.designation}</option>)}
                </select>
              </Field>
            )}
          </FormGrid>
        </Card>

        {error && <div className="error-box">{error}</div>}

        <FormActions>
          <button type="button" className="ghost" onClick={() => navigate(isEdit ? `/leads/${id}` : '/leads')}>Cancel</button>
          <button type="submit" disabled={save.isPending}>{save.isPending ? <><Loader size={15} /> Saving…</> : isEdit ? 'Save changes' : 'Capture lead'}</button>
        </FormActions>
      </Form>
    </>
  );
}
