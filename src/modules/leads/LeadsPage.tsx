import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { useServerTable } from '../../components/useServerTable';
import { inr } from '../../components/StatCard';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import LeadFormModal, { LeadFormLead } from './LeadFormModal';
import LeadDetailModal from './LeadDetailModal';

interface Lead extends LeadFormLead {
  stage: string;
  assignedTo?: { fullName: string } | null;
  branch: { name: string };
}

const STAGE_ORDER = ['NEW', 'CONTACTED', 'SITE_VISIT', 'DOCUMENT_COLLECTED', 'APPLIED', 'CONVERTED', 'DROPPED'];

export default function LeadsPage() {
  const { user } = useAuth();
  const [stage, setStage] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [formLead, setFormLead] = useState<LeadFormLead | null | 'new'>(null);
  const table = useServerTable();

  const canCreate = can(user?.role, 'lead:create');

  const { data: funnel } = useQuery({
    queryKey: ['lead-funnel'],
    queryFn: () => api.get('/leads/analytics/funnel').then((r) => r.data.data as { stage: string; count: number }[]),
  });

  const url = `/leads?${table.params}${stage ? `&stage=${stage}` : ''}`;
  const { data, isLoading } = useQuery({
    queryKey: [url],
    queryFn: () => api.get(url).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const rows = (data?.data ?? []) as Lead[];
  const totalItems = (data?.pagination?.totalItems ?? 0) as number;

  const funnelMap = new Map((funnel ?? []).map((f) => [f.stage, f.count]));
  const pickStage = (s: string) => { setStage(stage === s ? '' : s); table.setPage(1); };

  const columns: Column<Lead>[] = [
    { header: 'Lead', render: (l) => <><strong>{l.fullName}</strong><div className="muted sm-text">{l.phoneNumber}</div></>, sortKey: 'fullName' },
    { header: 'Branch', render: (l) => l.branch.name, sortKey: 'branch' },
    { header: 'Requested', render: (l) => (l.requestedAmount ? <span className="num">{inr(l.requestedAmount)}</span> : '—'), sortKey: 'requestedAmount' },
    { header: 'Source', render: (l) => l.source ?? '—', sortKey: 'source' },
    { header: 'Assigned to', render: (l) => l.assignedTo?.fullName ?? 'Unassigned', sortKey: 'assignedTo' },
    { header: 'Stage', render: (l) => <span className={`pill pill-${l.stage.toLowerCase()}`}>{l.stage.replaceAll('_', ' ')}</span>, sortKey: 'stage' },
    { header: '', render: (l) => <button type="button" className="sm ghost" onClick={() => setDetailId(l.id)}>Open</button> },
  ];

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Leads</h1>
          <p className="muted">Field pipeline from capture to conversion</p>
        </div>
        <div className="row-actions">
          <select value={stage} onChange={(e) => { setStage(e.target.value); table.setPage(1); }} aria-label="Filter by stage">
            <option value="">All stages</option>
            {STAGE_ORDER.map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
          </select>
          {canCreate && <button onClick={() => setFormLead('new')}>New lead</button>}
        </div>
      </header>

      <div className="funnel">
        {STAGE_ORDER.map((s) => (
          <div
            key={s}
            role="button"
            tabIndex={0}
            className="funnel-step"
            onClick={() => pickStage(s)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') pickStage(s); }}
            style={{ cursor: 'pointer', outline: stage === s ? '2px solid var(--brass)' : undefined }}
            title={stage === s ? 'Clear stage filter' : `Show only ${s.replaceAll('_', ' ')} leads`}
          >
            <span className="stat-value">{funnelMap.get(s) ?? 0}</span>
            <span className="muted sm-text">{s.replaceAll('_', ' ')}</span>
          </div>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        empty={stage ? 'No leads in this stage.' : 'No leads captured yet.'}
        searchPlaceholder="Search by name, phone, source or branch…"
        server={{
          page: table.page,
          pageSize: table.pageSize,
          totalItems,
          onPageChange: table.setPage,
          sort: table.sort,
          onSortChange: table.onSortChange,
          search: table.search,
          onSearchChange: table.onSearchChange,
        }}
      />

      {detailId && (
        <LeadDetailModal
          leadId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={(lead) => { setDetailId(null); setFormLead(lead); }}
        />
      )}
      {formLead && (
        <LeadFormModal
          lead={formLead === 'new' ? null : formLead}
          onClose={() => setFormLead(null)}
        />
      )}
    </>
  );
}
