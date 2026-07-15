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
import { BranchDetail, BranchForm, emptyBranchForm } from './shared';

/** Branch — Edit. Prefilled from the branch record. */
export default function BranchEditPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canUpdate = can(user?.role, 'branch:update');

  const [form, setForm] = useState<BranchForm>(emptyBranchForm);
  const [error, setError] = useState('');
  const set = (patch: Partial<BranchForm>) => setForm((f) => ({ ...f, ...patch }));

  const detailQuery = useQuery({
    queryKey: ['/branches', id],
    queryFn: () => api.get(`/branches/${id}`).then((r) => r.data.data as BranchDetail),
  });
  const detail = detailQuery.data;
  useEffect(() => {
    if (!detail) return;
    setForm({ code: detail.code, name: detail.name, addressLine: detail.addressLine ?? '', city: detail.city, state: detail.state });
  }, [detail]);

  const update = useMutation({
    mutationFn: () => api.patch(`/branches/${id}`, form),
    onSuccess: () => {
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/branches') });
      toast.success('Branch updated.');
      navigate(`/branches/${id}`);
    },
    onError: (err) => setError(apiMessage(err, 'Could not update the branch. Check the code is unique and all fields are filled.')),
  });

  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); update.mutate(); };

  if (!canUpdate) return <p className="muted">You do not have permission to edit branches.</p>;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Operations' }, { label: 'Branches', to: '/branches' }, { label: detail?.name ?? 'Branch', to: `/branches/${id}` }, { label: 'Edit' }]}
        title={detail ? `Edit ${detail.name}` : 'Edit branch'}
        subtitle="Update branch details"
      />

      {!detail ? (
        <Card><Skeleton height={20} /><Skeleton height={14} style={{ marginTop: 12 }} /></Card>
      ) : (
        <Form onSubmit={submit}>
          <Card title="Branch details">
            <FormGrid cols={2}>
              <Field label="Code" required><input value={form.code} onChange={(e) => set({ code: e.target.value })} required /></Field>
              <Field label="Name" required><input value={form.name} onChange={(e) => set({ name: e.target.value })} required /></Field>
              <Field label="Address" required full><input value={form.addressLine} onChange={(e) => set({ addressLine: e.target.value })} required /></Field>
              <Field label="City" required><input value={form.city} onChange={(e) => set({ city: e.target.value })} required /></Field>
              <Field label="State" required><input value={form.state} onChange={(e) => set({ state: e.target.value })} required /></Field>
            </FormGrid>
          </Card>

          {error && <div className="error-box">{error}</div>}

          <FormActions>
            <button type="button" className="ghost" onClick={() => navigate(`/branches/${id}`)}>Cancel</button>
            <button type="submit" disabled={update.isPending}>{update.isPending ? <><Loader size={15} /> Saving…</> : 'Save changes'}</button>
          </FormActions>
        </Form>
      )}
    </>
  );
}
