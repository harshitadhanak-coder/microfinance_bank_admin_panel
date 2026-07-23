import { FormEvent, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { Badge } from '../../components/Badge';
import { ActionMenu } from '../../components/ActionMenu';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { MultiSelect } from '../../components/MultiSelect';
import { AlertCircle, Pencil, Plus, Trash2, Check } from '../../components/icons';
import { apiMessage, fmtDate, titleCase } from '../../lib/format';
import { uploadFile } from '../../lib/download';
import { useToast } from '../../components/Toast';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;

interface Announcement {
  id: string;
  title: string;
  body: string;
  priority: string;
  publishAt: string | null;
  expiresAt: string | null;
  isPinned: boolean;
  isPublished?: boolean;
  createdAt?: string;
  isRead?: boolean;
  branches?: { branchId: string }[];
  departments?: { departmentId: string }[];
  roles?: { roleId: string }[];
}
interface Opt { id: string; name: string }

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const canManage = can(user?.role, 'announcement:manage');
  return canManage ? <ManageView /> : <ViewerFeed />;
}

// ── Viewer feed (everyone) ──
function ViewerFeed() {
  const query = useQuery({
    queryKey: ['/human-resources/announcements'],
    queryFn: () => api.get('/human-resources/announcements').then((r) => r.data.data as Announcement[]),
  });
  return (
    <>
      <PageHeader breadcrumb={[{ label: 'Human Resources' }, { label: 'Announcements' }]} title="Announcements" subtitle="Company announcements for you." />
      <div className="feed">
        {query.isLoading ? <p className="muted">Loading…</p> : !query.data?.length ? <p className="muted">No announcements right now.</p> : query.data.map((a) => (
          <div key={a.id} className={`card feed-item ${a.isPinned ? 'pinned' : ''}`} style={{ padding: 14, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {a.isPinned && <Badge status="INFO">Pinned</Badge>}
              <Badge status={a.priority === 'URGENT' || a.priority === 'HIGH' ? 'REJECTED' : 'INFO'}>{titleCase(a.priority)}</Badge>
              <strong>{a.title}</strong>
              <span className="muted sm-text" style={{ marginLeft: 'auto' }}>{fmtDate(a.publishAt ?? a.createdAt)}</span>
            </div>
            <p style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{a.body}</p>
          </div>
        ))}
      </div>
    </>
  );
}

// ── Management (HR) ──
function ManageView() {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null);
  const [deleteFor, setDeleteFor] = useState<Announcement | null>(null);

  const query = useQuery({
    queryKey: ['/human-resources/announcements/manage'],
    queryFn: () => api.get('/human-resources/announcements/manage').then((r) => r.data.data as Announcement[]),
    placeholderData: keepPreviousData,
  });
  const refresh = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/human-resources/announcements') });

  const mutate = (fn: () => Promise<unknown>, ok: string) => {
    fn().then(() => { refresh(); toast.success(ok); }).catch((err) => toast.error(apiMessage(err, 'Action failed.')));
  };

  const columns: Column<Announcement>[] = [
    { header: 'Title', render: (a) => <><strong>{a.title}</strong>{a.isPinned && <span className="pill pill-info"> Pinned</span>}</>, sortValue: (a) => a.title },
    { header: 'Priority', render: (a) => <Badge status={a.priority === 'URGENT' || a.priority === 'HIGH' ? 'REJECTED' : 'INFO'}>{titleCase(a.priority)}</Badge>, sortValue: (a) => a.priority },
    { header: 'Status', render: (a) => <Badge status={a.isPublished ? 'APPROVED' : 'PENDING'}>{a.isPublished ? 'Published' : 'Draft'}</Badge>, sortValue: (a) => String(a.isPublished) },
    { header: 'Publish', render: (a) => a.publishAt ? fmtDate(a.publishAt) : '—' },
    { header: 'Expires', render: (a) => a.expiresAt ? fmtDate(a.expiresAt) : '—' },
    {
      header: '',
      render: (a) => (
        <div className="actions-cell">
          <ActionMenu items={[
            ...(!a.isPublished ? [{ key: 'pub', label: 'Publish', icon: <Check size={15} />, onSelect: () => mutate(() => api.post(`/human-resources/announcements/${a.id}/publish`), 'Published & broadcast.') }] : []),
            { key: 'pin', label: a.isPinned ? 'Unpin' : 'Pin', onSelect: () => mutate(() => api.post(`/human-resources/announcements/${a.id}/pin`, { isPinned: !a.isPinned }), 'Updated.') },
            { key: 'edit', label: 'Edit', icon: <Pencil size={15} />, onSelect: () => setEditing(a) },
            { key: 'del', label: 'Delete', icon: <Trash2 size={15} />, tone: 'danger', separatorBefore: true, onSelect: () => setDeleteFor(a) },
          ]} />
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Human Resources' }, { label: 'Announcements' }]}
        title="Announcements"
        subtitle="Create, target and publish company-wide announcements."
        actions={<button className="btn-lg" onClick={() => setEditing('new')}><Plus size={16} /> New announcement</button>}
      />
      <DataTable columns={columns} rows={query.data ?? []} loading={query.isLoading} empty="No announcements yet." searchPlaceholder="Search announcements…" />
      {editing && <AnnouncementForm announcement={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={(msg) => { setEditing(null); refresh(); toast.success(msg); }} />}
      {deleteFor && (
        <ConfirmDialog tone="danger" icon={<Trash2 size={20} />} title="Delete announcement" message={<>This permanently removes “{deleteFor.title}”.</>} confirmLabel="Delete" onConfirm={() => { mutate(() => api.delete(`/human-resources/announcements/${deleteFor.id}`), 'Deleted.'); setDeleteFor(null); }} onCancel={() => setDeleteFor(null)} />
      )}
    </>
  );
}

function AnnouncementForm({ announcement, onClose, onDone }: { announcement: Announcement | null; onClose: () => void; onDone: (msg: string) => void }) {
  const isEdit = announcement != null;
  const [title, setTitle] = useState(announcement?.title ?? '');
  const [body, setBody] = useState(announcement?.body ?? '');
  const [priority, setPriority] = useState(announcement?.priority ?? 'NORMAL');
  const [isPinned, setIsPinned] = useState(announcement?.isPinned ?? false);
  const [publishAt, setPublishAt] = useState(announcement?.publishAt?.slice(0, 10) ?? '');
  const [expiresAt, setExpiresAt] = useState(announcement?.expiresAt?.slice(0, 10) ?? '');
  const [branchIds, setBranchIds] = useState<string[]>(announcement?.branches?.map((b) => b.branchId) ?? []);
  const [departmentIds, setDepartmentIds] = useState<string[]>(announcement?.departments?.map((d) => d.departmentId) ?? []);
  const [roleIds, setRoleIds] = useState<string[]>(announcement?.roles?.map((r) => r.roleId) ?? []);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');

  const branches = useQuery({ queryKey: ['/branches', 'ann'], queryFn: () => api.get('/branches').then((r) => r.data.data as Opt[]) });
  const departments = useQuery({ queryKey: ['/masters/departments', 'ann'], queryFn: () => api.get('/masters/departments').then((r) => (r.data.data as { id: string; name: string }[]).map((d) => ({ id: d.id, name: d.name }))) });
  const roles = useQuery({ queryKey: ['/roles/options', 'ann'], queryFn: () => api.get('/roles/options').then((r) => (r.data.data as { id: string; displayName?: string; name: string }[]).map((x) => ({ id: x.id, name: x.displayName ?? x.name }))) });

  const save = useMutation({
    mutationFn: async () => {
      const bodyData = { title: title.trim(), body: body.trim(), priority, isPinned, ...(publishAt ? { publishAt } : {}), ...(expiresAt ? { expiresAt } : {}), branchIds, departmentIds, roleIds };
      const res = isEdit
        ? await api.patch(`/human-resources/announcements/${announcement!.id}`, bodyData)
        : await api.post('/human-resources/announcements', bodyData);
      const annId = isEdit ? announcement!.id : (res.data.data?.id as string | undefined);
      if (file && annId) await uploadFile(`/human-resources/announcements/${annId}/attachments/upload`, file);
    },
    onSuccess: () => onDone(isEdit ? 'Announcement updated.' : 'Announcement created (draft). Publish it to broadcast.'),
    onError: (err) => setError(apiMessage(err, 'Could not save the announcement.')),
  });

  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); save.mutate(); };

  return (
    <Modal
      size="lg" onClose={onClose} icon={<AlertCircle size={20} />}
      title={isEdit ? 'Edit announcement' : 'New announcement'}
      subtitle="Leave all targeting empty to reach everyone"
      footer={<>
        <button type="button" className="ghost" onClick={onClose}>Cancel</button>
        <button type="submit" form="ann-form" disabled={save.isPending || !title.trim() || !body.trim()}>{save.isPending ? 'Saving…' : 'Save'}</button>
      </>}
    >
      <form id="ann-form" className="form-grid" onSubmit={submit}>
        <label className="span-all">Title<input value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
        <label className="span-all">Message<textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} required /></label>
        <label>Priority<select value={priority} onChange={(e) => setPriority(e.target.value)}>{PRIORITIES.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}</select></label>
        <label className="checkbox"><input type="checkbox" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} /> Pin to top</label>
        <label>Publish at<input type="date" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} /></label>
        <label>Expires at<input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></label>
        <label className="span-all">Target branches<MultiSelect options={branches.data ?? []} selected={branchIds} onChange={setBranchIds} allLabel="All branches" noun="branch" /></label>
        <label className="span-all">Target departments<MultiSelect options={departments.data ?? []} selected={departmentIds} onChange={setDepartmentIds} allLabel="All departments" noun="department" /></label>
        <label className="span-all">Target roles<MultiSelect options={roles.data ?? []} selected={roleIds} onChange={setRoleIds} allLabel="All roles" noun="role" /></label>
        <label className="span-all">Attachment (optional)<input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
        {error && <div className="error-box span-all">{error}</div>}
      </form>
    </Modal>
  );
}
