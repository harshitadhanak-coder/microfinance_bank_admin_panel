import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { useServerTable } from '../../components/useServerTable';
import { inr } from '../../components/StatCard';

interface Lead {
  id: string; fullName: string; phoneNumber: string; stage: string; source?: string;
  requestedAmount?: string;
  assignedTo?: { fullName: string } | null;
  branch: { name: string };
}

const STAGE_ORDER = ['NEW', 'CONTACTED', 'SITE_VISIT', 'DOCUMENT_COLLECTED', 'APPLIED', 'CONVERTED', 'DROPPED'];

export default function LeadsPage() {
  const table = useServerTable();

  const { data: funnel } = useQuery({
    queryKey: ['lead-funnel'],
    queryFn: () => api.get('/leads/analytics/funnel').then((r) => r.data.data as { stage: string; count: number }[]),
  });

  const url = `/leads?${table.params}`;
  const { data, isLoading } = useQuery({
    queryKey: [url],
    queryFn: () => api.get(url).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const rows = (data?.data ?? []) as Lead[];
  const totalItems = (data?.pagination?.totalItems ?? 0) as number;

  const funnelMap = new Map((funnel ?? []).map((f) => [f.stage, f.count]));

  const columns: Column<Lead>[] = [
    { header: 'Lead', render: (l) => <><strong>{l.fullName}</strong><div className="muted sm-text">{l.phoneNumber}</div></>, sortKey: 'fullName' },
    { header: 'Branch', render: (l) => l.branch.name, sortKey: 'branch' },
    { header: 'Requested', render: (l) => (l.requestedAmount ? <span className="num">{inr(l.requestedAmount)}</span> : '—'), sortKey: 'requestedAmount' },
    { header: 'Source', render: (l) => l.source ?? '—', sortKey: 'source' },
    { header: 'Assigned to', render: (l) => l.assignedTo?.fullName ?? 'Unassigned', sortKey: 'assignedTo' },
    { header: 'Stage', render: (l) => <span className={`pill pill-${l.stage.toLowerCase()}`}>{l.stage.replaceAll('_', ' ')}</span>, sortKey: 'stage' },
  ];

  return (
    <>
      <header className="page-head">
        <h1>Leads</h1>
        <p className="muted">Field pipeline from capture to conversion</p>
      </header>

      <div className="funnel">
        {STAGE_ORDER.map((s) => (
          <div key={s} className="funnel-step">
            <span className="stat-value">{funnelMap.get(s) ?? 0}</span>
            <span className="muted sm-text">{s.replaceAll('_', ' ')}</span>
          </div>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        empty="No leads captured yet."
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
    </>
  );
}
