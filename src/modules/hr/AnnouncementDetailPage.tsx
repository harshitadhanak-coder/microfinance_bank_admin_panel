import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { Card, StatCard } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { ConfirmDialog } from '../../components/Modal';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { Check, Download, Pencil, Trash2, Users } from '../../components/icons';
import { apiMessage, fmtDate, titleCase } from '../../lib/format';
import { downloadFile } from '../../lib/download';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';

/**
 * Announcement — detail (`/announcements/:id`).
 *
 * The list could only ever show a truncated row and an edit modal, so the two
 * questions that actually matter about a published notice — who was it aimed at,
 * and who has read it — had nowhere to live. This page answers both: the full
 * body as written, the visibility window, the targeting resolved to names, and
 * the read receipts.
 */

interface Named { id: string; name: string }
interface Attachment { id: string; fileName: string }

interface AnnouncementDetail {
  id: string;
  title: string;
  body: string;
  priority: string;
  publishAt: string | null;
  startDate: string | null;
  expiresAt: string | null;
  isPinned: boolean;
  isPublished: boolean;
  createdAt: string;
  createdByName: string | null;
  audience: { matched: number; total: number; isEveryone: boolean };
  targets: { branches: Named[]; departments: Named[]; roles: Named[] };
  documents?: Attachment[];
  /** How many staff have opened it. The per-person roster is deliberately not exposed. */
  readCount: number;
}

const priorityTone = (p: string) => (p === 'URGENT' || p === 'HIGH' ? 'REJECTED' : 'INFO');

/** One targeting dimension as a row of pills, or an explicit "no restriction". */
function TargetRow({ label, items, noun }: { label: string; items: Named[]; noun: string }) {
  return (
    <div className="ann-target-row">
      <span className="muted sm-text">{label}</span>
      {items.length === 0 ? (
        <span className="muted">All {noun} — no restriction</span>
      ) : (
        <div className="ann-pills">{items.map((i) => <span key={i.id} className="pill pill-info">{i.name}</span>)}</div>
      )}
    </div>
  );
}

export default function AnnouncementDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const canManage = can(user?.role, 'announcement:manage');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const detailUrl = `/human-resources/announcements/${id}`;
  const { data, isLoading, isError } = useQuery({
    queryKey: [detailUrl],
    queryFn: () => api.get(detailUrl).then((r) => r.data.data as AnnouncementDetail),
    enabled: !!id,
  });

  const refresh = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/human-resources/announcements') });

  const act = useMutation({
    mutationFn: (input: { path: string; body?: unknown }) => api.post(`${detailUrl}${input.path}`, input.body ?? {}),
    onSuccess: () => { refresh(); toast.success('Updated.'); },
    onError: (err) => toast.error(apiMessage(err, 'Action failed.')),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(detailUrl),
    onSuccess: () => { refresh(); toast.success('Announcement deleted.'); navigate('/announcements'); },
    onError: (err) => { setDeleteOpen(false); toast.error(apiMessage(err, 'Could not delete the announcement.')); },
  });

  if (isLoading) {
    return (
      <>
        <PageHeader breadcrumb={[{ label: 'Human Resources' }, { label: 'Announcements', to: '/announcements' }, { label: 'Loading…' }]} title="Announcement" />
        <div style={{ display: 'grid', gap: 12 }}><Skeleton height={80} /><Skeleton height={160} /><Skeleton height={120} /></div>
      </>
    );
  }
  if (isError || !data) {
    return (
      <>
        <PageHeader breadcrumb={[{ label: 'Human Resources' }, { label: 'Announcements', to: '/announcements' }, { label: 'Not found' }]} title="Announcement" />
        <EmptyState variant="no-data" title="Announcement not found" message="It may have been deleted." />
      </>
    );
  }

  // Read rate is only meaningful against the audience the targeting resolves to
  // — not headcount — so a notice aimed at one branch is not scored against all.
  const reach = data.audience.isEveryone ? data.audience.total : data.audience.matched;
  const readPct = reach > 0 ? Math.round((data.readCount / reach) * 100) : 0;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Human Resources' }, { label: 'Announcements', to: '/announcements' }, { label: data.title }]}
        title={data.title}
        subtitle={<>Created {fmtDate(data.createdAt)}{data.createdByName ? ` by ${data.createdByName}` : ''}</>}
        meta={(
          <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
            <Badge status={data.isPublished ? 'APPROVED' : 'PENDING'}>{data.isPublished ? 'Published' : 'Draft'}</Badge>
            <Badge status={priorityTone(data.priority)}>{titleCase(data.priority)}</Badge>
            {data.isPinned && <Badge status="INFO">Pinned</Badge>}
          </span>
        )}
        actions={(
          <>
            <button type="button" className="ghost" onClick={() => navigate('/announcements')}>Back</button>
            {canManage && (
              <>
                <button type="button" className="ghost" onClick={() => act.mutate({ path: '/pin', body: { isPinned: !data.isPinned } })} disabled={act.isPending}>
                  {data.isPinned ? 'Unpin' : 'Pin to top'}
                </button>
                <button type="button" className="ghost danger" onClick={() => setDeleteOpen(true)}><Trash2 size={15} /> Delete</button>
                <button type="button" className="ghost" onClick={() => navigate('/announcements?edit=' + data.id)}><Pencil size={15} /> Edit</button>
                {!data.isPublished && (
                  <button type="button" className="btn-lg" disabled={act.isPending} onClick={() => act.mutate({ path: '/publish' })}>
                    <Check size={16} /> Publish &amp; broadcast
                  </button>
                )}
              </>
            )}
          </>
        )}
      />

      <div className="stat-grid" style={{ marginBottom: '1rem' }}>
        <StatCard label="Reaches" value={data.audience.isEveryone ? `Everyone (${data.audience.total})` : `${data.audience.matched} of ${data.audience.total}`} icon={<Users size={18} />} tone={data.audience.matched === 0 ? 'danger' : 'brass'} />
        <StatCard label="Read" value={`${data.readCount}`} hint={reach > 0 ? `${readPct}% of those it reaches` : undefined} tone="success" />
        <StatCard label="Starts" value={data.startDate ? fmtDate(data.startDate) : 'Immediately'} tone="info" />
        <StatCard label="Ends" value={data.expiresAt ? fmtDate(data.expiresAt) : 'No end date'} tone="info" />
      </div>

      {/* Targeting that matches nobody looks identical to success everywhere
          else, so it is called out here in full rather than left to be inferred
          from a zero. */}
      {data.audience.matched === 0 && !data.audience.isEveryone && (
        <div className="error-box" style={{ marginBottom: '1rem' }}>
          This targeting reaches <strong>nobody</strong>. Employees only match a target they have on record — clear the
          targeting to reach all {data.audience.total} active staff.
        </div>
      )}

      <div className="detail-cols">
        <Card title="Message">
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{data.body}</p>
          {!!data.documents?.length && (
            <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {data.documents.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className="ghost sm"
                  onClick={() => downloadFile(`${detailUrl}/attachments/${d.id}/download`, d.fileName || 'attachment')}
                >
                  <Download size={14} /> {d.fileName || 'Attachment'}
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card title="Visibility &amp; targeting">
          <dl className="detail-list one-col">
            <div><dt>Published on</dt><dd>{data.publishAt ? fmtDate(data.publishAt) : '—'}</dd></div>
            <div><dt>Visible from</dt><dd>{data.startDate ? fmtDate(data.startDate) : 'As soon as published'}</dd></div>
            <div><dt>Visible until</dt><dd>{data.expiresAt ? fmtDate(data.expiresAt) : 'No end date'}</dd></div>
          </dl>
          <div className="ann-targets">
            <TargetRow label="Branches" items={data.targets.branches} noun="branches" />
            <TargetRow label="Departments" items={data.targets.departments} noun="departments" />
            <TargetRow label="Roles" items={data.targets.roles} noun="roles" />
          </div>
        </Card>
      </div>

      {deleteOpen && (
        <ConfirmDialog
          tone="danger"
          icon={<Trash2 size={20} />}
          title="Delete announcement"
          message={<>This permanently removes “{data.title}” and its read receipts.</>}
          confirmLabel="Delete"
          loading={remove.isPending}
          onConfirm={() => remove.mutate()}
          onCancel={() => setDeleteOpen(false)}
        />
      )}
    </>
  );
}
