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

/**
 * Targeting is a restriction — "only these branches / departments / roles" —
 * and an empty list means no restriction at all. Ticking every option reads as
 * "everyone", so send it as the empty list: otherwise an announcement aimed at
 * the whole company silently misses anyone who has no department (or branch, or
 * role) recorded against them.
 */
const targetIds = (selected: string[], options: { id: string }[]): string[] =>
  options.length > 0 && selected.length === options.length ? [] : selected;

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
  audience?: Audience;
}
/** How many active users the targeting resolves to, out of the whole headcount. */
interface Audience { matched: number; total: number; isEveryone: boolean }
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

/**
 * Who an announcement actually reaches. Targeting that matches nobody is the
 * one outcome that looks identical to success everywhere else — the row says
 * "Published", the API returns 200 — so it is called out here in full.
 */
function AudienceLabel({ audience }: { audience?: Audience }) {
  if (!audience) return <span className="muted">—</span>;
  if (audience.isEveryone) return <>Everyone <span className="muted sm-text">({audience.total})</span></>;
  if (audience.matched === 0) return <Badge status="REJECTED">Reaches nobody</Badge>;
  return <>{audience.matched} <span className="muted sm-text">of {audience.total}</span></>;
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
    { header: 'Audience', render: (a) => <AudienceLabel audience={a.audience} />, sortValue: (a) => a.audience?.matched ?? 0 },
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

  // Resolved targeting — what will actually be saved, and what the audience
  // preview is asked about, so the two can never disagree.
  const target = {
    branchIds: targetIds(branchIds, branches.data ?? []),
    departmentIds: targetIds(departmentIds, departments.data ?? []),
    roleIds: targetIds(roleIds, roles.data ?? []),
  };
  const audience = useQuery({
    queryKey: ['/human-resources/announcements/audience', target],
    queryFn: () => api.post('/human-resources/announcements/audience', target).then((r) => r.data.data as Audience),
  });

  const save = useMutation({
    mutationFn: async () => {
      const bodyData = {
        title: title.trim(),
        body: body.trim(),
        priority,
        isPinned,
        ...(publishAt ? { publishAt } : {}),
        ...(expiresAt ? { expiresAt } : {}),
        ...target,
      };
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
        {/* Targeting narrows across dimensions and an employee only matches a
            dimension they have a value for, so a plausible-looking selection can
            resolve to nobody. Say so here, while it can still be changed. */}
        <div className="span-all">
          {audience.data?.matched === 0 ? (
            <div className="error-box">
              This targeting reaches <strong>nobody</strong> — the announcement would be published but seen by no one.
              Employees only match a target they have on record, and no employee currently has a department set,
              so any department target excludes everyone. Clear the targeting to reach all {audience.data.total} staff.
            </div>
          ) : (
            <p className="muted sm-text">
              {audience.isLoading || !audience.data
                ? 'Working out who this reaches…'
                : audience.data.isEveryone
                  ? `Reaches everyone — all ${audience.data.total} active staff.`
                  : `Reaches ${audience.data.matched} of ${audience.data.total} active staff.`}
            </p>
          )}
        </div>
        <label className="span-all">Attachment (optional)<input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
        {error && <div className="error-box span-all">{error}</div>}
      </form>
    </Modal>
  );
}
