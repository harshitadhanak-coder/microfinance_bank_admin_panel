import { FormEvent, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/Card';
import { Form, FormGrid, Field, FormActions } from '../../components/Form';
import { useToast } from '../../components/Toast';
import { Loader } from '../../components/icons';
import { apiMessage } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import { BranchForm, emptyBranchForm } from './shared';

/** Branch — Create. The former inline-above-the-list form, now a dedicated page. */
export default function BranchCreatePage() {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canCreate = can(user?.role, 'branch:create');

  const [form, setForm] = useState<BranchForm>(emptyBranchForm);
  const [error, setError] = useState('');
  const set = (patch: Partial<BranchForm>) => setForm((f) => ({ ...f, ...patch }));

  const create = useMutation({
    mutationFn: () => api.post('/branches', form),
    onSuccess: (res) => {
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/branches') });
      toast.success('Branch created.');
      const id = res.data?.data?.id as string | undefined;
      navigate(id ? `/branches/${id}` : '/branches');
    },
    onError: (err) => setError(apiMessage(err, 'Could not create the branch. Check the code is unique and all fields are filled.')),
  });

  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); create.mutate(); };

  if (!canCreate) return <p className="muted">You do not have permission to add branches.</p>;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Operations' }, { label: 'Branches', to: '/branches' }, { label: 'New branch' }]}
        title="Add branch"
        subtitle="Register a new operating branch"
      />

      <Form onSubmit={submit}>
        <Card title="Branch details">
          <FormGrid cols={2}>
            <Field label="Code" required help="Unique branch code"><input value={form.code} onChange={(e) => set({ code: e.target.value })} placeholder="BR-SRT-001" required /></Field>
            <Field label="Name" required><input value={form.name} onChange={(e) => set({ name: e.target.value })} required /></Field>
            <Field label="Address" required full><input value={form.addressLine} onChange={(e) => set({ addressLine: e.target.value })} required /></Field>
            <Field label="City" required><input value={form.city} onChange={(e) => set({ city: e.target.value })} required /></Field>
            <Field label="State" required><input value={form.state} onChange={(e) => set({ state: e.target.value })} required /></Field>
          </FormGrid>
        </Card>

        {error && <div className="error-box">{error}</div>}

        <FormActions>
          <button type="button" className="ghost" onClick={() => navigate('/branches')}>Cancel</button>
          <button type="submit" disabled={create.isPending}>{create.isPending ? <><Loader size={15} /> Saving…</> : 'Save branch'}</button>
        </FormActions>
      </Form>
    </>
  );
}
