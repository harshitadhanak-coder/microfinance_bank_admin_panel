import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { inr, StatCard } from '../../components/StatCard';
import { useAuth } from '../auth/AuthContext';
import { canListAllBranches, canViewHqDashboard } from '../auth/permissions';

interface HqDashboard {
  activeLoanCount: number;
  outstandingPrincipal: string | number;
  totalDisbursed: string | number;
  collectedToday: string | number;
  assetClassification: { classification: string; loanCount: number; outstandingPrincipal: string | number }[];
  branchPerformance: { branchId: string; activeLoanCount: number; outstandingPrincipal: string | number }[];
  leadFunnel: { stage: string; count: number }[];
}

interface BranchDashboard {
  activeLoanCount: number;
  outstandingPrincipal: string | number;
  overdueInstallmentCount: number;
  pendingCollectionAmount: string | number;
  collectedToday: string | number;
}

interface BranchDetail {
  code: string; name: string; city: string; state: string; zone?: string | null;
  status: string; creditLimit?: string | number | null;
  manager?: { fullName: string } | null;
  _count?: { clients: number; loans: number; employees: number; leads: number };
}

interface ActiveLoan { id: string; assetClassification: string; outstandingPrincipal: string | number }

const STAGE_ORDER = ['NEW', 'CONTACTED', 'SITE_VISIT', 'DOCUMENT_COLLECTED', 'APPLIED', 'CONVERTED', 'DROPPED'];

/** Severity order for asset classification buckets (best → worst). */
const CLASS_ORDER = ['STANDARD', 'SPECIAL_MENTION_1', 'SPECIAL_MENTION_2', 'SPECIAL_MENTION_3', 'SUB_STANDARD', 'DOUBTFUL', 'NON_PERFORMING', 'LOSS'];

function AssetQualityTable({ rows }: { rows: { classification: string; loanCount: number; outstandingPrincipal: string | number }[] }) {
  if (!rows.length) return <p className="muted sm-text">No active loans yet.</p>;
  return (
    <table className="plain">
      <tbody>
        {rows.map((b) => (
          <tr key={b.classification}>
            <td><span className={`pill pill-${b.classification.toLowerCase()}`}>{b.classification.replaceAll('_', '-')}</span></td>
            <td>{b.loanCount} loans</td>
            <td className="num">{inr(b.outstandingPrincipal)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LeadFunnel({ rows }: { rows: { stage: string; count: number }[] }) {
  const map = new Map(rows.map((f) => [f.stage, f.count]));
  return (
    <div className="funnel">
      {STAGE_ORDER.map((s) => (
        <div key={s} className="funnel-step">
          <span className="stat-value">{map.get(s) ?? 0}</span>
          <span className="muted sm-text">{s.replaceAll('_', ' ')}</span>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  return canViewHqDashboard(user?.role)
    ? <HeadquartersDashboard />
    : <BranchDashboardView branchId={user?.branchId ?? null} branchName={user?.branch?.name} />;
}

/** Organisation-wide view for HQ / super admin / accountant. */
function HeadquartersDashboard() {
  const { user } = useAuth();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['hq-dashboard'],
    queryFn: () => api.get('/headquarters/dashboard').then((r) => r.data.data as HqDashboard),
  });

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    enabled: canListAllBranches(user?.role),
    queryFn: () => api.get('/branches?pageSize=100').then((r) => r.data.data as { id: string; name: string }[]),
  });

  const branchNames = new Map((branches ?? []).map((b) => [b.id, b.name]));

  if (isLoading) return <div className="panel pad muted">Loading dashboard…</div>;
  if (isError) return <div className="panel pad error-box">Could not load the dashboard. Please try again.</div>;
  if (!data) return null;

  const assetRows = [...(data.assetClassification ?? [])].sort(
    (a, b) => CLASS_ORDER.indexOf(a.classification) - CLASS_ORDER.indexOf(b.classification),
  );

  return (
    <>
      <header className="page-head">
        <h1>Portfolio overview</h1>
        <p className="muted">Live position across all branches</p>
      </header>

      <div className="stat-grid">
        <StatCard label="Active loans" value={data.activeLoanCount} />
        <StatCard label="Outstanding" value={inr(data.outstandingPrincipal)} />
        <StatCard label="Total disbursed" value={inr(data.totalDisbursed)} />
        <StatCard label="Collected today" value={inr(data.collectedToday)} />
      </div>

      <section className="two-col">
        <div className="panel pad">
          <h2>Asset quality</h2>
          <AssetQualityTable rows={assetRows} />
        </div>
        <div className="panel pad">
          <h2>Branch performance</h2>
          <table className="plain">
            <tbody>
              {(data.branchPerformance ?? []).map((b) => (
                <tr key={b.branchId}>
                  <td>{branchNames.get(b.branchId) ?? b.branchId}</td>
                  <td>{b.activeLoanCount} loans</td>
                  <td className="num">{inr(b.outstandingPrincipal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2>Lead pipeline</h2>
        <LeadFunnel rows={data.leadFunnel ?? []} />
      </section>
    </>
  );
}

/** Single-branch operational snapshot for branch manager / field officer. */
function BranchDashboardView({ branchId, branchName }: { branchId: string | null; branchName?: string }) {
  const enabled = !!branchId;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['branch-dashboard', branchId],
    enabled,
    queryFn: () => api.get(`/branches/${branchId}/dashboard`).then((r) => r.data.data as BranchDashboard),
  });

  const { data: detail } = useQuery({
    queryKey: ['branch-detail', branchId],
    enabled,
    queryFn: () => api.get(`/branches/${branchId}`).then((r) => r.data.data as BranchDetail),
  });

  const { data: loans } = useQuery({
    queryKey: ['branch-active-loans', branchId],
    enabled,
    queryFn: () => api.get('/loans?pageSize=100&status=ACTIVE').then((r) => r.data.data as ActiveLoan[]),
  });

  const { data: funnel } = useQuery({
    queryKey: ['branch-lead-funnel', branchId],
    enabled,
    queryFn: () => api.get('/leads/analytics/funnel').then((r) => r.data.data as { stage: string; count: number }[]),
  });

  if (!branchId) return <div className="panel pad error-box">No branch is assigned to your account.</div>;
  if (isLoading) return <div className="panel pad muted">Loading dashboard…</div>;
  if (isError) return <div className="panel pad error-box">Could not load the dashboard. Please try again.</div>;
  if (!data) return null;

  // Group this branch's active loans into asset-quality buckets.
  const bucketMap = new Map<string, { classification: string; loanCount: number; outstandingPrincipal: number }>();
  for (const loan of loans ?? []) {
    const bucket = bucketMap.get(loan.assetClassification) ?? { classification: loan.assetClassification, loanCount: 0, outstandingPrincipal: 0 };
    bucket.loanCount += 1;
    bucket.outstandingPrincipal += Number(loan.outstandingPrincipal);
    bucketMap.set(loan.assetClassification, bucket);
  }
  const assetRows = [...bucketMap.values()].sort(
    (a, b) => CLASS_ORDER.indexOf(a.classification) - CLASS_ORDER.indexOf(b.classification),
  );

  const title = branchName ?? detail?.name;

  return (
    <>
      <header className="page-head">
        <h1>{title ? `${title} overview` : 'Branch overview'}</h1>
        <p className="muted">Live position for your branch</p>
      </header>

      <div className="stat-grid">
        <StatCard label="Active loans" value={data.activeLoanCount} />
        <StatCard label="Outstanding" value={inr(data.outstandingPrincipal)} />
        <StatCard label="Overdue installments" value={data.overdueInstallmentCount} />
        <StatCard label="Pending collection" value={inr(data.pendingCollectionAmount)} />
        <StatCard label="Collected today" value={inr(data.collectedToday)} />
      </div>

      <section className="two-col">
        <div className="panel pad">
          <h2>Asset quality</h2>
          <AssetQualityTable rows={assetRows} />
        </div>
        <div className="panel pad">
          <h2>Branch snapshot</h2>
          <div className="snapshot-grid">
            <div><span className="muted sm-text">Code</span><strong>{detail?.code ?? '—'}</strong></div>
            <div><span className="muted sm-text">Status</span><strong>{detail ? <span className={`pill pill-${detail.status.toLowerCase()}`}>{detail.status}</span> : '—'}</strong></div>
            <div><span className="muted sm-text">Manager</span><strong>{detail?.manager?.fullName ?? '—'}</strong></div>
            <div><span className="muted sm-text">Zone</span><strong>{detail?.zone ?? '—'}</strong></div>
            <div><span className="muted sm-text">Location</span><strong>{detail ? `${detail.city}, ${detail.state}` : '—'}</strong></div>
            <div><span className="muted sm-text">Credit limit</span><strong>{detail?.creditLimit != null ? inr(detail.creditLimit) : '—'}</strong></div>
            <div><span className="muted sm-text">Clients</span><strong>{detail?._count?.clients ?? '—'}</strong></div>
            <div><span className="muted sm-text">Staff</span><strong>{detail?._count?.employees ?? '—'}</strong></div>
          </div>
        </div>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2>Lead pipeline</h2>
        <LeadFunnel rows={funnel ?? []} />
      </section>
    </>
  );
}
