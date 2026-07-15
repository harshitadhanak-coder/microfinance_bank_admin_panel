import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FilterBar } from '../../components/FilterBar';
import { Badge } from '../../components/Badge';
import { ActionMenu } from '../../components/ActionMenu';
import { useServerTable } from '../../components/useServerTable';
import { Eye, Pencil, Plus } from '../../components/icons';
import { inr } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import { LeadRow, STAGE_ORDER, stageLabel } from './shared';

/** Leads — List. Pipeline funnel + server list; detail/create are now pages. */
export default function LeadsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stage, setStage] = useState('');
  const table = useServerTable();

  const canCreate = can(user?.role, 'lead:create');
  const canUpdate = can(user?.role, 'lead:update');

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
  const rows = (data?.data ?? []) as LeadRow[];
  const totalItems = (data?.pagination?.totalItems ?? 0) as number;

  const funnelMap = new Map((funnel ?? []).map((f) => [f.stage, f.count]));
  const pickStage = (s: string) => { setStage(stage === s ? '' : s); table.setPage(1); };
  const open = (id: string) => navigate(`/leads/${id}`);

  const columns: Column<LeadRow>[] = [
    { header: 'Lead', render: (l) => <a className="cell-link" onClick={() => open(l.id)}><strong>{l.fullName}</strong><div className="muted sm-text">{l.phoneNumber}</div></a>, sortKey: 'fullName' },
    { header: 'Branch', render: (l) => l.branch.name, sortKey: 'branch' },
    { header: 'Requested', render: (l) => (l.requestedAmount ? <span className="num">{inr(l.requestedAmount)}</span> : '—'), sortKey: 'requestedAmount' },
    { header: 'Source', render: (l) => l.source ?? '—', sortKey: 'source' },
    { header: 'Assigned to', render: (l) => l.assignedTo?.fullName ?? <span className="muted">Unassigned</span>, sortKey: 'assignedTo' },
    { header: 'Stage', render: (l) => <Badge status={l.stage} />, sortKey: 'stage' },
    {
      header: '',
      render: (l) => (
        <div className="actions-cell">
          <ActionMenu
            items={[
              { key: 'open', label: 'Open lead', icon: <Eye size={15} />, onSelect: () => open(l.id) },
              ...(canUpdate && l.stage !== 'CONVERTED' && l.stage !== 'DROPPED'
                ? [{ key: 'edit', label: 'Edit', icon: <Pencil size={15} />, onSelect: () => navigate(`/leads/${l.id}/edit`) }]
                : []),
            ]}
          />
        </div>
      ),
    },
  ];

  const stageChips = stage
    ? [{ key: 'stage', label: `Stage: ${stageLabel(stage)}`, onRemove: () => { setStage(''); table.setPage(1); } }]
    : [];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Operations' }, { label: 'Leads' }]}
        title="Leads"
        subtitle="Field pipeline from capture to conversion"
        actions={canCreate && <button className="btn-lg" onClick={() => navigate('/leads/new')}><Plus size={16} /> New lead</button>}
      />

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
            title={stage === s ? 'Clear stage filter' : `Show only ${stageLabel(s)} leads`}
          >
            <span className="stat-value">{funnelMap.get(s) ?? 0}</span>
            <span className="muted sm-text">{stageLabel(s)}</span>
          </div>
        ))}
      </div>

      <FilterBar chips={stageChips} onReset={stageChips.length ? () => { setStage(''); table.setPage(1); } : undefined}>
        <label>Stage
          <select value={stage} onChange={(e) => { setStage(e.target.value); table.setPage(1); }} aria-label="Filter by stage">
            <option value="">All stages</option>
            {STAGE_ORDER.map((s) => <option key={s} value={s}>{stageLabel(s)}</option>)}
          </select>
        </label>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        empty={stage ? 'No leads in this stage.' : 'No leads captured yet.'}
        searchPlaceholder="Search by name, phone, source or branch…"
        server={{
          page: table.page, pageSize: table.pageSize, totalItems,
          onPageChange: table.setPage, sort: table.sort, onSortChange: table.onSortChange,
          search: table.search, onSearchChange: table.onSearchChange,
        }}
      />
    </>
  );
}
