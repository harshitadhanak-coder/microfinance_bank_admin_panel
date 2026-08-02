import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { Card, StatCard } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Column, DataTable } from '../../components/DataTable';
import { EmptyState } from '../../components/EmptyState';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { Check, Download, FileSpreadsheet, Pencil, Users } from '../../components/icons';
import { apiMessage, fmtDate, titleCase } from '../../lib/format';
import { downloadFile } from '../../lib/download';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';

/**
 * HR Policy — detail (`/hr-policies/:id`).
 *
 * The library list can show a row and a download button; it cannot show the
 * version chain a policy sits in, nor who has acknowledged it — which is the
 * whole reason a policy is published rather than emailed. This page carries
 * both, plus the employee's own Acknowledge action.
 */

const label = (c: string) => titleCase(c.replace(/_/g, ' '));

interface PolicyDoc { id: string; fileName: string }
interface VersionRef { id: string; version: number; title: string; isActive?: boolean }
interface Acknowledgement {
  employeeId: string;
  fullName: string;
  employeeCode: string;
  branch: string | null;
  acknowledgedAt: string;
}

interface PolicyDetail {
  id: string;
  category: string;
  title: string;
  description: string | null;
  version: number;
  effectiveDate: string;
  isActive: boolean;
  createdAt: string;
  documents?: PolicyDoc[];
  replaces: VersionRef | null;
  replacedBy: VersionRef[];
  acknowledgements: Acknowledgement[];
  acknowledgementSummary: { acknowledged: number; activeEmployees: number; viewerHasAcknowledged: boolean };
}

interface VersionRow { id: string; version: number; title: string; effectiveDate: string; isActive: boolean }

export default function HrPolicyDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const canManage = can(user?.role, 'hrPolicy:manage');

  const detailUrl = `/human-resources/policies-library/${id}`;
  const { data, isLoading, isError } = useQuery({
    queryKey: [detailUrl],
    queryFn: () => api.get(detailUrl).then((r) => r.data.data as PolicyDetail),
    enabled: !!id,
  });

  const versionsQuery = useQuery({
    queryKey: [`${detailUrl}/versions`],
    queryFn: () => api.get(`${detailUrl}/versions`).then((r) => r.data.data as VersionRow[]),
    enabled: !!id,
  });

  const acknowledge = useMutation({
    mutationFn: () => api.post(`${detailUrl}/acknowledge`),
    onSuccess: () => {
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/human-resources/policies-library') });
      toast.success('Policy acknowledged.');
    },
    onError: (err) => toast.error(apiMessage(err, 'Could not record your acknowledgement.')),
  });

  const ackColumns: Column<Acknowledgement & { id: string }>[] = [
    { header: 'Employee', render: (a) => <strong>{a.fullName}</strong>, sortValue: (a) => a.fullName },
    { header: 'Code', render: (a) => <code>{a.employeeCode}</code>, sortValue: (a) => a.employeeCode },
    { header: 'Branch', render: (a) => a.branch ?? '—', sortValue: (a) => a.branch ?? '' },
    { header: 'Acknowledged on', render: (a) => fmtDate(a.acknowledgedAt), sortValue: (a) => a.acknowledgedAt },
  ];

  const versionColumns: Column<VersionRow>[] = [
    { header: 'Version', render: (v) => <strong className="num">v{v.version}</strong>, sortValue: (v) => v.version },
    { header: 'Title', render: (v) => (v.id === id ? <>{v.title} <span className="pill pill-info">This version</span></> : <a className="cell-link" onClick={() => navigate(`/hr-policies/${v.id}`)}>{v.title}</a>) },
    { header: 'Effective', render: (v) => fmtDate(v.effectiveDate), sortValue: (v) => v.effectiveDate },
    { header: 'Status', render: (v) => <Badge status={v.isActive ? 'ACTIVE' : 'INACTIVE'}>{v.isActive ? 'Active' : 'Superseded'}</Badge> },
  ];

  if (isLoading) {
    return (
      <>
        <PageHeader breadcrumb={[{ label: 'Human Resources' }, { label: 'HR Policies', to: '/hr-policies' }, { label: 'Loading…' }]} title="Policy" />
        <div style={{ display: 'grid', gap: 12 }}><Skeleton height={80} /><Skeleton height={160} /><Skeleton height={120} /></div>
      </>
    );
  }
  if (isError || !data) {
    return (
      <>
        <PageHeader breadcrumb={[{ label: 'Human Resources' }, { label: 'HR Policies', to: '/hr-policies' }, { label: 'Not found' }]} title="Policy" />
        <EmptyState variant="no-data" title="Policy not found" message="It may have been removed." />
      </>
    );
  }

  const summary = data.acknowledgementSummary;
  const pending = Math.max(0, summary.activeEmployees - summary.acknowledged);
  const ackPct = summary.activeEmployees > 0 ? Math.round((summary.acknowledged / summary.activeEmployees) * 100) : 0;
  const document = data.documents?.[0];
  // A superseded policy is read-only history: acknowledging it would record
  // agreement to text that is no longer in force.
  const supersededBy = data.replacedBy.find((r) => r.isActive) ?? data.replacedBy[0];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Human Resources' }, { label: 'HR Policies', to: '/hr-policies' }, { label: data.title }]}
        title={data.title}
        subtitle={data.description ?? undefined}
        meta={(
          <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
            <Badge status="INFO">{label(data.category)}</Badge>
            <Badge status={data.isActive ? 'ACTIVE' : 'INACTIVE'}>{data.isActive ? 'Active' : 'Superseded'}</Badge>
            <span className="pill pill-info">v{data.version}</span>
          </span>
        )}
        actions={(
          <>
            <button type="button" className="ghost" onClick={() => navigate('/hr-policies')}>Back</button>
            {document && (
              <button type="button" className="ghost" onClick={() => downloadFile(`${detailUrl}/download`, document.fileName || 'policy.pdf')}>
                <Download size={15} /> Download PDF
              </button>
            )}
            {canManage && (
              <button type="button" className="ghost" onClick={() => navigate(`/hr-policies?edit=${data.id}`)}><Pencil size={15} /> Edit</button>
            )}
            {data.isActive && (
              <button
                type="button"
                className="btn-lg"
                disabled={acknowledge.isPending || summary.viewerHasAcknowledged}
                title={summary.viewerHasAcknowledged ? 'You have already acknowledged this policy' : 'Record that you have read and understood this policy'}
                onClick={() => acknowledge.mutate()}
              >
                <Check size={16} /> {summary.viewerHasAcknowledged ? 'Acknowledged' : acknowledge.isPending ? 'Saving…' : 'Acknowledge'}
              </button>
            )}
          </>
        )}
      />

      {!data.isActive && supersededBy && (
        <div className="error-box" style={{ marginBottom: '1rem' }}>
          This version has been superseded by{' '}
          <a className="cell-link" onClick={() => navigate(`/hr-policies/${supersededBy.id}`)}><strong>v{supersededBy.version} — {supersededBy.title}</strong></a>.
          It is kept for the record; staff should follow the current version.
        </div>
      )}

      <div className="stat-grid" style={{ marginBottom: '1rem' }}>
        <StatCard label="Acknowledged" value={String(summary.acknowledged)} hint={`${ackPct}% of ${summary.activeEmployees} active staff`} icon={<Users size={18} />} tone="success" />
        <StatCard label="Pending" value={String(pending)} tone={pending > 0 ? 'warning' : 'success'} />
        <StatCard label="Effective from" value={fmtDate(data.effectiveDate)} tone="info" />
        <StatCard label="Version" value={`v${data.version}`} hint={data.replaces ? `Replaced v${data.replaces.version}` : 'First version'} tone="brass" />
      </div>

      <div className="detail-cols">
        <Card title="Policy document">
          {document ? (
            <div className="policy-doc">
              <FileSpreadsheet size={28} />
              <div>
                <strong>{document.fileName || 'policy.pdf'}</strong>
                <div className="muted sm-text">Effective {fmtDate(data.effectiveDate)} · v{data.version}</div>
              </div>
              <button type="button" className="ghost sm" onClick={() => downloadFile(`${detailUrl}/download`, document.fileName || 'policy.pdf')}>
                <Download size={14} /> Download
              </button>
            </div>
          ) : (
            <EmptyState
              variant="no-data"
              title="No document attached"
              message={canManage ? 'Edit this policy to upload the PDF.' : 'The PDF has not been uploaded yet.'}
            />
          )}
          {data.description && <p style={{ whiteSpace: 'pre-wrap', marginTop: 14 }}>{data.description}</p>}
        </Card>

        <Card title="Version history">
          {versionsQuery.isLoading ? (
            <Skeleton height={120} />
          ) : (versionsQuery.data?.length ?? 0) <= 1 ? (
            <p className="muted">This is the only version of this policy.</p>
          ) : (
            <DataTable
              columns={versionColumns}
              rows={versionsQuery.data ?? []}
              empty="No version history."
              searchable={false}
              pageSize={0}
            />
          )}
        </Card>
      </div>

      <Card title={`Acknowledgements (${summary.acknowledged})`} className="stack-top">
        {data.acknowledgements.length === 0 ? (
          <EmptyState variant="no-data" title="No acknowledgements yet" message="Staff acknowledgements appear here as they confirm they have read the policy." />
        ) : (
          <DataTable
            columns={ackColumns}
            rows={data.acknowledgements.map((a) => ({ ...a, id: a.employeeId }))}
            empty="No acknowledgements."
            searchPlaceholder="Search by employee, code or branch…"
            pageSize={15}
          />
        )}
      </Card>
    </>
  );
}
