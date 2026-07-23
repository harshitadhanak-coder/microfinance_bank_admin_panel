import { FormEvent, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FilterBar } from '../../components/FilterBar';
import { Badge } from '../../components/Badge';
import { ActionMenu } from '../../components/ActionMenu';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { FileSpreadsheet, Pencil, Plus, Trash2, Download } from '../../components/icons';
import { apiMessage, fmtDate, titleCase } from '../../lib/format';
import { downloadFile, uploadFile } from '../../lib/download';
import { useToast } from '../../components/Toast';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';

const CATEGORIES = ['ATTENDANCE', 'LEAVE', 'PAYROLL', 'DRESS_CODE', 'TRAVEL', 'COMPANY', 'IT'] as const;
const label = (c: string) => titleCase(c.replace(/_/g, ' '));

interface PolicyDoc { id: string; fileName: string; fileUrl: string }
interface Policy {
  id: string;
  category: string;
  title: string;
  description: string | null;
  version: number;
  effectiveDate: string;
  isActive: boolean;
  documents?: PolicyDoc[];
}

export default function HrPolicyLibraryPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const toast = useToast();
  const canManage = can(user?.role, 'hrPolicy:manage');

  const [category, setCategory] = useState('ALL');
  const [editing, setEditing] = useState<Policy | 'new' | null>(null);
  const [deleteFor, setDeleteFor] = useState<Policy | null>(null);

  const listUrl = `/human-resources/policies-library${category === 'ALL' ? '' : `?category=${category}`}`;
  const query = useQuery({
    queryKey: [listUrl],
    queryFn: () => api.get(listUrl).then((r) => r.data.data as Policy[]),
    placeholderData: keepPreviousData,
  });
  const refresh = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/human-resources/policies-library') });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/human-resources/policies-library/${id}`),
    onSuccess: () => { refresh(); setDeleteFor(null); toast.success('Policy removed.'); },
    onError: (err) => { setDeleteFor(null); toast.error(apiMessage(err, 'Could not remove the policy.')); },
  });

  const columns: Column<Policy>[] = [
    { header: 'Policy', render: (p) => <><strong>{p.title}</strong>{p.description && <div className="muted sm-text">{p.description}</div>}</>, sortValue: (p) => p.title },
    { header: 'Category', render: (p) => <Badge status="INFO">{label(p.category)}</Badge>, sortValue: (p) => p.category },
    { header: 'Version', render: (p) => <span className="num">v{p.version}</span>, sortValue: (p) => p.version },
    { header: 'Effective', render: (p) => fmtDate(p.effectiveDate), sortValue: (p) => p.effectiveDate },
    { header: 'Status', render: (p) => <Badge status={p.isActive ? 'ACTIVE' : 'INACTIVE'}>{p.isActive ? 'Active' : 'Superseded'}</Badge> },
    { header: 'Document', render: (p) => p.documents?.length ? <button className="ghost sm" onClick={() => downloadFile(`/human-resources/policies-library/${p.id}/download`, p.documents![0].fileName || 'policy.pdf')}><Download size={14} /> PDF</button> : <span className="muted">—</span> },
  ];

  if (canManage) {
    columns.push({
      header: '',
      render: (p) => (
        <div className="actions-cell">
          <ActionMenu items={[
            { key: 'edit', label: 'Edit', icon: <Pencil size={15} />, onSelect: () => setEditing(p) },
            { key: 'del', label: 'Delete', icon: <Trash2 size={15} />, tone: 'danger', separatorBefore: true, onSelect: () => setDeleteFor(p) },
          ]} />
        </div>
      ),
    });
  }

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Human Resources' }, { label: 'HR Policies' }]}
        title="HR Policies"
        subtitle="Company policy documents by category."
        actions={canManage && <button className="btn-lg" onClick={() => setEditing('new')}><Plus size={16} /> New policy</button>}
      />
      <FilterBar chips={category !== 'ALL' ? [{ key: 'cat', label: `Category: ${label(category)}`, onRemove: () => setCategory('ALL') }] : []} onReset={category !== 'ALL' ? () => setCategory('ALL') : undefined}>
        <label>Category
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="ALL">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
          </select>
        </label>
      </FilterBar>
      <DataTable columns={columns} rows={query.data ?? []} loading={query.isLoading} empty="No policies published." searchPlaceholder="Search policies…" />
      {editing && <PolicyForm policy={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={(msg) => { setEditing(null); refresh(); toast.success(msg); }} />}
      {deleteFor && (
        <ConfirmDialog tone="danger" icon={<Trash2 size={20} />} title="Delete policy" message={<>This removes “{deleteFor.title}”.</>} confirmLabel="Delete" loading={remove.isPending} onConfirm={() => remove.mutate(deleteFor.id)} onCancel={() => setDeleteFor(null)} />
      )}
    </>
  );
}

function PolicyForm({ policy, onClose, onDone }: { policy: Policy | null; onClose: () => void; onDone: (msg: string) => void }) {
  const isEdit = policy != null;
  const [category, setCategory] = useState(policy?.category ?? 'COMPANY');
  const [title, setTitle] = useState(policy?.title ?? '');
  const [description, setDescription] = useState(policy?.description ?? '');
  const [effectiveDate, setEffectiveDate] = useState(policy?.effectiveDate?.slice(0, 10) ?? '');
  const [isActive, setIsActive] = useState(policy?.isActive ?? true);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      const body = { category, title: title.trim(), ...(description.trim() ? { description: description.trim() } : {}), isActive, ...(effectiveDate ? { effectiveDate } : {}) };
      const res = isEdit
        ? await api.patch(`/human-resources/policies-library/${policy!.id}`, body)
        : await api.post('/human-resources/policies-library', body);
      const policyId = isEdit ? policy!.id : (res.data.data?.id as string | undefined);
      if (file && policyId) await uploadFile(`/human-resources/policies-library/${policyId}/upload`, file);
    },
    onSuccess: () => onDone(isEdit ? 'Policy updated.' : 'Policy published.'),
    onError: (err) => setError(apiMessage(err, 'Could not save the policy.')),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); save.mutate(); };

  return (
    <Modal
      size="md" onClose={onClose} icon={<FileSpreadsheet size={20} />}
      title={isEdit ? 'Edit policy' : 'New policy'}
      subtitle="Attach the PDF from the Document Center after saving"
      footer={<>
        <button type="button" className="ghost" onClick={onClose}>Cancel</button>
        <button type="submit" form="policy-form" disabled={save.isPending || !title.trim() || !effectiveDate}>{save.isPending ? 'Saving…' : 'Save'}</button>
      </>}
    >
      <form id="policy-form" className="form-grid" onSubmit={submit}>
        <label>Category<select value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}</select></label>
        <label>Effective date<input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} required /></label>
        <label className="span-all">Title<input value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
        <label className="span-all">Description<textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} /></label>
        <label className="span-all">Policy PDF<input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
        <label className="checkbox span-all"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Active (visible to employees)</label>
        {error && <div className="error-box span-all">{error}</div>}
      </form>
    </Modal>
  );
}
