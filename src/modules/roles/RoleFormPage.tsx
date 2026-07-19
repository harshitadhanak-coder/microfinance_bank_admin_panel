import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/Card';
import { Form, FormGrid, Field, FormActions } from '../../components/Form';
import { useToast } from '../../components/Toast';
import { Loader } from '../../components/icons';
import { apiMessage } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import { RoleDetail, SCOPE_OPTIONS, ScopeType } from './shared';

interface FormState {
  displayName: string;
  key: string;
  description: string;
  scopeType: ScopeType;
}

const emptyForm: FormState = { displayName: '', key: '', description: '', scopeType: 'BRANCH' };

const slugify = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * Create or edit a custom role. System roles are read-only (the backend rejects
 * edits); this page refuses to edit them. The stable `key` slug auto-derives
 * from the display name and can be overridden.
 */
export default function RoleFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = can(user?.role, 'role:manage');

  const [form, setForm] = useState<FormState>(emptyForm);
  const [keyTouched, setKeyTouched] = useState(false);
  const [error, setError] = useState('');
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const roleQuery = useQuery({
    queryKey: ['/roles', id],
    queryFn: () => api.get(`/roles/${id}`).then((r) => r.data.data as RoleDetail),
    enabled: isEdit,
  });

  useEffect(() => {
    if (roleQuery.data) {
      setForm({
        displayName: roleQuery.data.displayName ?? '',
        key: roleQuery.data.key ?? '',
        description: roleQuery.data.description ?? '',
        scopeType: roleQuery.data.scopeType,
      });
      setKeyTouched(true);
    }
  }, [roleQuery.data]);

  const effectiveKey = keyTouched ? slugify(form.key) : slugify(form.displayName);

  const save = useMutation({
    mutationFn: (f: FormState) => {
      const body = {
        displayName: f.displayName.trim(),
        key: effectiveKey || undefined,
        description: f.description.trim() || undefined,
        scopeType: f.scopeType,
      };
      return isEdit ? api.patch(`/roles/${id}`, body) : api.post('/roles', body);
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/roles') });
      toast.success(isEdit ? 'Role updated successfully.' : 'Role created successfully.');
      const newId = (res.data?.data?.id as string | undefined) ?? id;
      navigate(newId ? `/settings/roles/${newId}/permissions` : '/settings/roles');
    },
    onError: (err) => setError(apiMessage(err, 'Could not save the role.')),
  });

  const submit = (ev: FormEvent) => { ev.preventDefault(); setError(''); save.mutate(form); };

  if (!canManage) return <p className="muted">You do not have permission to manage roles.</p>;
  if (isEdit && roleQuery.data?.isSystem) {
    return (
      <>
        <PageHeader breadcrumb={[{ label: 'Settings', to: '/settings' }, { label: 'Roles & permissions', to: '/settings/roles' }, { label: 'Edit' }]} title="System role" />
        <Card>
          <p className="muted">Built-in system roles cannot be renamed. You can still configure their permission matrix.</p>
          <FormActions>
            <button className="ghost" onClick={() => navigate('/settings/roles')}>Back to roles</button>
            <button onClick={() => navigate(`/settings/roles/${id}/permissions`)}>Configure permissions</button>
          </FormActions>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Administration' }, { label: 'Settings', to: '/settings' }, { label: 'Roles & permissions', to: '/settings/roles' }, { label: isEdit ? 'Edit role' : 'New role' }]}
        title={isEdit ? 'Edit role' : 'New role'}
        subtitle="Custom roles are assembled from permissions via the matrix after saving"
      />
      <Form onSubmit={submit}>
        <Card title="Role details">
          <FormGrid cols={2}>
            <Field label="Display name" required full>
              <input
                value={form.displayName}
                onChange={(e) => set({ displayName: e.target.value })}
                placeholder="e.g. Branch Collection Lead"
                required
                maxLength={80}
              />
            </Field>
            <Field label="Key" help={<>Stable identifier used internally. Auto-generated: <code>{effectiveKey || '—'}</code></>}>
              <input
                value={form.key}
                onChange={(e) => { setKeyTouched(true); set({ key: e.target.value }); }}
                placeholder="auto from display name"
                maxLength={60}
              />
            </Field>
            <Field label="Data scope" required help="Default breadth of records this role can see">
              <select value={form.scopeType} onChange={(e) => set({ scopeType: e.target.value as ScopeType })}>
                {SCOPE_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Description" full>
              <textarea
                value={form.description}
                onChange={(e) => set({ description: e.target.value })}
                rows={2}
                maxLength={255}
                placeholder="What is this role responsible for?"
              />
            </Field>
          </FormGrid>
        </Card>

        {error && <div className="error-box">{error}</div>}

        <FormActions>
          <button type="button" className="ghost" onClick={() => navigate('/settings/roles')}>Cancel</button>
          <button type="submit" disabled={save.isPending || !form.displayName.trim()}>
            {save.isPending ? <><Loader size={15} /> Saving…</> : isEdit ? 'Save role' : 'Create role'}
          </button>
        </FormActions>
      </Form>
    </>
  );
}
