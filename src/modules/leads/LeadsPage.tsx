import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { inr } from '../../components/StatCard';

interface Lead {
  id: string; fullName: string; phoneNumber: string; stage: string; source?: string;
  requestedAmount?: string;
  assignedTo?: { fullName: string } | null;
  branch: { name: string };
}

const STAGE_ORDER = ['NEW', 'CONTACTED', 'SITE_VISIT', 'DOCUMENT_COLLECTED', 'APPLIED', 'CONVERTED', 'DROPPED'];

export default function LeadsPage() {
  const { data: funnel } = useQuery({
    queryKey: ['lead-funnel'],
    queryFn: () => api.get('/leads/analytics/funnel').then((r) => r.data.data as { stage: string; count: number }[]),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['leads'],
    queryFn: () => api.get('/leads?pageSize=100').then((r) => r.data.data as Lead[]),
  });

  const funnelMap = new Map((funnel ?? []).map((f) => [f.stage, f.count]));

  const columns: Column<Lead>[] = [
    { header: 'Lead', render: (l) => <><strong>{l.fullName}</strong><div className="muted sm-text">{l.phoneNumber}</div></>, sortValue: (l) => `${l.fullName} ${l.phoneNumber}` },
    { header: 'Branch', render: (l) => l.branch.name, sortValue: (l) => l.branch.name },
    { header: 'Requested', render: (l) => (l.requestedAmount ? <span className="num">{inr(l.requestedAmount)}</span> : '—'), sortValue: (l) => (l.requestedAmount ? Number(l.requestedAmount) : null) },
    { header: 'Source', render: (l) => l.source ?? '—', sortValue: (l) => l.source ?? '' },
    { header: 'Assigned to', render: (l) => l.assignedTo?.fullName ?? 'Unassigned', sortValue: (l) => l.assignedTo?.fullName ?? '' },
    { header: 'Stage', render: (l) => <span className={`pill pill-${l.stage.toLowerCase()}`}>{l.stage.replaceAll('_', ' ')}</span>, sortValue: (l) => l.stage },
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

      <DataTable columns={columns} rows={data ?? []} loading={isLoading} empty="No leads captured yet." />
    </>
  );
}
