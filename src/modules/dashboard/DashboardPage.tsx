import { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { DonutChart, ChartLegend, LineChart, type Slice } from '../../components/Charts';
import { PageHeader } from '../../components/PageHeader';
import { TableSkeleton } from '../../components/Skeleton';
import {
  AlertCircle, ArrowDown, ArrowUp, Banknote, Landmark, ListChecks, Target, UserCheck, Wallet,
} from '../../components/icons';
import { useAuth } from '../auth/AuthContext';

// ── Types (mirror /dashboard/overview) ───────────────────────────────────────
interface Kpi { value: number; previous?: number }
interface Par30Kpi { value: number; amount: number; accounts: number; accountsPrev: number }
interface BranchRow { branchId: string; branch: string; target: number; collected: number; cash: number; upi: number; achievementPct: number; belowTarget: boolean }
interface ApprovalRow { id: string; type: string; reference: string; requestedBy: string; branch: string; requestedAt: string; status: string }
interface RiskRow { id: string; loanNumber: string; customer: string; branch: string; outstanding: number; daysOverdue: number; parCategory: string; officer: string }
interface AlertRow { severity: 'critical' | 'warning' | 'info'; title: string; detail: string }
interface ActivityRow { type: string; description: string; at: string; tone: 'green' | 'blue' | 'info' }

interface Overview {
  scope: 'ORGANISATION' | 'BRANCH';
  generatedAt: string;
  kpis: {
    activeLoans: Kpi; outstanding: Kpi; collectedToday: Kpi;
    collectionEfficiency: Kpi; par30: Par30Kpi; activeBorrowers: Kpi;
  };
  portfolioTrend: { month: string; outstanding: number }[];
  collectionVsTarget: { target: number; collected: number };
  portfolioQuality: { key: string; label: string; loanCount: number; outstanding: number }[];
  branchCollections: BranchRow[];
  pendingApprovals: ApprovalRow[];
  highRiskLoans: RiskRow[];
  alerts: AlertRow[];
  recentActivities: ActivityRow[];
}

// ── Formatting ────────────────────────────────────────────────────────────────
const inr0 = (n: number | string) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(n));
/** Compact Indian currency: ₹37.9L, ₹1.2Cr. */
const inrCompact = (n: number): string => {
  const v = Number(n);
  if (Math.abs(v) >= 1e7) return `₹${(v / 1e7).toFixed(2)}Cr`;
  if (Math.abs(v) >= 1e5) return `₹${(v / 1e5).toFixed(2)}L`;
  return inr0(v);
};
const pct = (n: number) => `${Number(n).toFixed(1)}%`;
const dateShort = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
const relTime = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};
const humanCategory = (c: string) => c.replace('SPECIAL_MENTION_', 'SMA-').replace('NON_PERFORMING', 'NPA').replace('STANDARD', 'Standard').replaceAll('_', ' ');

/** Delta chip: percentage change vs a previous value, coloured by whether the move is good. */
function Delta({ value, previous, goodDir }: { value: number; previous?: number; goodDir: 'up' | 'down' }) {
  if (previous == null || previous === 0) return <span className="kpi-delta flat">vs prev · —</span>;
  const change = ((value - previous) / Math.abs(previous)) * 100;
  const up = change >= 0;
  const isGood = (goodDir === 'up') === up;
  if (Math.abs(change) < 0.05) return <span className="kpi-delta flat">no change</span>;
  return (
    <span className={`kpi-delta ${isGood ? 'good' : 'bad'}`}>
      {up ? <ArrowUp size={12} /> : <ArrowDown size={12} />}{Math.abs(change).toFixed(1)}%
    </span>
  );
}

const QUALITY_COLORS: Record<string, string> = {
  STANDARD: '#1d7a4f', SPECIAL_MENTION_0: '#a36a10', SPECIAL_MENTION_1: '#b8791b', SPECIAL_MENTION_2: '#a85418', NON_PERFORMING: '#b3392f',
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: () => api.get('/dashboard/overview').then((r) => r.data.data as Overview),
  });

  if (isError) return <div className="panel pad error-box">Could not load the dashboard. Please try again.</div>;

  const title = data?.scope === 'BRANCH' ? `${user?.branch?.name ?? 'Branch'} operations` : 'Operations overview';
  const k = data?.kpis;
  const trend = data?.portfolioTrend ?? [];
  const qualitySlices: Slice[] = (data?.portfolioQuality ?? []).map((q) => ({ label: q.label, value: q.loanCount, color: QUALITY_COLORS[q.key] }));
  const totalLoans = qualitySlices.reduce((s, q) => s + q.value, 0);
  const cvt = data?.collectionVsTarget ?? { target: 0, collected: 0 };
  const cvtMax = Math.max(1, cvt.target, cvt.collected);

  return (
    <div className="dash">
      <PageHeader
        breadcrumb={[{ label: 'Overview' }, { label: 'Dashboard' }]}
        title={title}
        subtitle={data ? `Live position · updated ${relTime(data.generatedAt)}` : 'Loading live position…'}
      />

      {/* KPI ROW — each tile drills through to its source list */}
      <section className="dash-kpis">
        <KpiTile icon={<Landmark size={16} />} label="Active Loans" to="/loans" value={k ? k.activeLoans.value.toLocaleString('en-IN') : '—'}
          delta={k && <Delta value={k.activeLoans.value} previous={k.activeLoans.previous} goodDir="up" />} loading={isLoading} />
        <KpiTile icon={<Wallet size={16} />} tone="brass" label="Outstanding Portfolio" to="/loans" value={k ? inrCompact(k.outstanding.value) : '—'}
          delta={k && <Delta value={k.outstanding.value} previous={k.outstanding.previous} goodDir="up" />} loading={isLoading} />
        <KpiTile icon={<Banknote size={16} />} tone="green" label="Today's Collection" to="/collections" value={k ? inrCompact(k.collectedToday.value) : '—'}
          delta={k && <Delta value={k.collectedToday.value} previous={k.collectedToday.previous} goodDir="up" />} loading={isLoading} />
        <KpiTile icon={<Target size={16} />} label="Collection Efficiency" to="/collections" value={k ? pct(k.collectionEfficiency.value) : '—'}
          delta={k && <Delta value={k.collectionEfficiency.value} previous={k.collectionEfficiency.previous} goodDir="up" />} loading={isLoading} />
        <KpiTile icon={<AlertCircle size={16} />} tone={k && k.par30.value >= 10 ? 'red' : 'amber'} label="PAR > 30 Days" to="/loans" value={k ? pct(k.par30.value) : '—'}
          sub={k ? `${inrCompact(k.par30.amount)} · ${k.par30.accounts} acct` : undefined}
          delta={k && <Delta value={k.par30.accounts} previous={k.par30.accountsPrev} goodDir="down" />} loading={isLoading} />
        <KpiTile icon={<UserCheck size={16} />} label="Active Borrowers" to="/loans" value={k ? k.activeBorrowers.value.toLocaleString('en-IN') : '—'}
          delta={k && <Delta value={k.activeBorrowers.value} previous={k.activeBorrowers.previous} goodDir="up" />} loading={isLoading} />
      </section>

      {/* CHARTS */}
      <section className="dash-charts">
        <div className="chart-card">
          <div className="chart-card-head"><h2>Portfolio Trend</h2><span className="muted sm-text">{trend.length ? inrCompact(trend[trend.length - 1].outstanding) : ''} · 12 months</span></div>
          {isLoading ? <ChartPlaceholder /> : <LineChart points={trend.map((t) => t.outstanding)} labels={trend.map((t) => t.month)} height={150} />}
        </div>
        <div className="chart-card">
          <div className="chart-card-head"><h2>Collection vs Target</h2><span className={`ach-badge ${cvt.collected >= cvt.target && cvt.target > 0 ? 'good' : 'warn'}`}>{cvt.target > 0 ? pct((cvt.collected / cvt.target) * 100) : '—'}</span></div>
          {isLoading ? <ChartPlaceholder /> : (
            <div className="cvt">
              <div className="cvt-bars">
                <div className="cvt-col"><span className="cvt-val">{inrCompact(cvt.target)}</span><span className="cvt-fill target" style={{ height: `${(cvt.target / cvtMax) * 100}%` }} /><span className="cvt-label">Target</span></div>
                <div className="cvt-col"><span className="cvt-val">{inrCompact(cvt.collected)}</span><span className={`cvt-fill collected ${cvt.collected < cvt.target ? 'short' : ''}`} style={{ height: `${(cvt.collected / cvtMax) * 100}%` }} /><span className="cvt-label">Collected</span></div>
              </div>
            </div>
          )}
        </div>
        <div className="chart-card">
          <div className="chart-card-head"><h2>Portfolio Quality</h2></div>
          {isLoading ? <ChartPlaceholder /> : (
            <div className="pq">
              <DonutChart data={qualitySlices} size={116} thickness={16} centerValue={totalLoans} centerLabel="loans" />
              <ChartLegend data={qualitySlices} />
            </div>
          )}
        </div>
      </section>

      {/* MAIN: tables + alerts side panel */}
      <div className="dash-main">
        <div className="dash-col">
          {/* Table 1 — Branch collection */}
          <div className="op-card">
            <div className="op-head"><h2><ListChecks size={16} /> Today's Branch Collection</h2></div>
            {isLoading ? <TableSkeleton rows={4} columns={7} /> : (
              <div className="op-scroll">
                <table className="op-table">
                  <thead><tr><th>Branch</th><th className="r">Target</th><th className="r">Collected</th><th className="r">Achieve</th><th className="r">Cash</th><th className="r">UPI</th><th>Status</th></tr></thead>
                  <tbody>
                    {(data?.branchCollections ?? []).map((b) => (
                      <tr key={b.branchId} className={b.belowTarget ? 'row-warn' : ''}>
                        <td><strong>{b.branch}</strong></td>
                        <td className="r num">{b.target ? inr0(b.target) : '—'}</td>
                        <td className="r num">{inr0(b.collected)}</td>
                        <td className="r num">{b.target ? pct(b.achievementPct) : '—'}</td>
                        <td className="r num">{inr0(b.cash)}</td>
                        <td className="r num">{inr0(b.upi)}</td>
                        <td>{b.target === 0 ? <span className="tag neutral">No dues</span> : b.belowTarget ? <span className="tag warn">Below target</span> : <span className="tag good">On track</span>}</td>
                      </tr>
                    ))}
                    {!data?.branchCollections.length && <tr><td colSpan={7} className="muted center">No branch data.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Table 2 — Pending approvals */}
          <div className="op-card">
            <div className="op-head"><h2><AlertCircle size={16} /> Pending Approvals</h2><span className="count-badge">{data?.pendingApprovals.length ?? 0}</span></div>
            {isLoading ? <TableSkeleton rows={4} columns={6} /> : (
              <div className="op-scroll">
                <table className="op-table">
                  <thead><tr><th>Type</th><th>Reference</th><th>Requested By</th><th>Branch</th><th>Date</th><th></th></tr></thead>
                  <tbody>
                    {(data?.pendingApprovals ?? []).slice(0, 8).map((a) => (
                      <tr key={`${a.type}-${a.id}`}>
                        <td><span className={`tag type-${a.type.split(' ')[0].toLowerCase()}`}>{a.type}</span></td>
                        <td className="muted sm-text">{a.reference}</td>
                        <td>{a.requestedBy}</td>
                        <td className="muted">{a.branch}</td>
                        <td className="muted sm-text">{dateShort(a.requestedAt)}</td>
                        <td className="r"><Link className="op-action" to={approvalLink(a.type)}>Review</Link></td>
                      </tr>
                    ))}
                    {!data?.pendingApprovals.length && <tr><td colSpan={6} className="muted center">Nothing awaiting approval.</td></tr>}
                  </tbody>
                </table>
                {(data?.pendingApprovals.length ?? 0) > 8 && <p className="op-more muted sm-text">+{(data!.pendingApprovals.length - 8)} more pending</p>}
              </div>
            )}
          </div>

          {/* Table 3 — High risk loans */}
          <div className="op-card">
            <div className="op-head"><h2><AlertCircle size={16} /> High Risk Loans</h2></div>
            {isLoading ? <TableSkeleton rows={4} columns={6} /> : (
              <div className="op-scroll">
                <table className="op-table">
                  <thead><tr><th>Customer</th><th>Branch</th><th className="r">Outstanding</th><th className="r">Days Overdue</th><th>PAR</th><th>Officer</th></tr></thead>
                  <tbody>
                    {(data?.highRiskLoans ?? []).map((l) => (
                      <tr key={l.id}>
                        <td><strong>{l.customer}</strong><div className="muted sm-text">{l.loanNumber}</div></td>
                        <td className="muted">{l.branch}</td>
                        <td className="r num">{inr0(l.outstanding)}</td>
                        <td className="r num">{l.daysOverdue > 0 ? `${l.daysOverdue}d` : '—'}</td>
                        <td><span className={`risk-badge ${riskClass(l.parCategory, l.daysOverdue)}`}>{humanCategory(l.parCategory)}</span></td>
                        <td className="muted">{l.officer}</td>
                      </tr>
                    ))}
                    {!data?.highRiskLoans.length && <tr><td colSpan={6} className="muted center">No loans need attention.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Alerts side panel */}
        <aside className="dash-aside">
          <div className="op-card alerts-panel">
            <div className="op-head"><h2><AlertCircle size={16} /> Alerts</h2><span className="count-badge">{data?.alerts.length ?? 0}</span></div>
            <ul className="alert-list">
              {isLoading && <li className="muted sm-text pad-sm">Loading…</li>}
              {data?.alerts.map((a, i) => (
                <li key={i} className={`alert-item ${a.severity}`}>
                  <span className="alert-dot" />
                  <div><strong>{a.title}</strong><span className="muted sm-text">{a.detail}</span></div>
                </li>
              ))}
              {data && !data.alerts.length && <li className="muted sm-text pad-sm">All clear — no operational alerts.</li>}
            </ul>
          </div>
        </aside>
      </div>

      {/* Recent activities timeline */}
      <div className="op-card">
        <div className="op-head"><h2>Recent Activity</h2></div>
        {isLoading ? <TableSkeleton rows={4} columns={2} /> : (
          <ul className="op-timeline">
            {(data?.recentActivities ?? []).map((a, i) => (
              <li key={i} className={`tl-item tone-${a.tone}`}>
                <span className="tl-dot" />
                <span className="tl-type">{a.type}</span>
                <span className="tl-desc muted">{a.description}</span>
                <span className="tl-time muted sm-text">{relTime(a.at)}</span>
              </li>
            ))}
            {data && !data.recentActivities.length && <li className="muted sm-text pad-sm">No recent activity.</li>}
          </ul>
        )}
      </div>
    </div>
  );
}

function KpiTile({ icon, label, value, delta, sub, tone, loading, to }: {
  icon: ReactNode; label: string; value: string; delta?: ReactNode; sub?: string; tone?: 'brass' | 'green' | 'amber' | 'red'; loading?: boolean; to?: string;
}) {
  const inner = (
    <>
      <div className="kpi-tile-head">
        <span className={`kpi-icon ${tone ?? ''}`}>{icon}</span>
        <span className="kpi-label">{label}</span>
      </div>
      <span className="kpi-value">{loading ? '…' : value}</span>
      <div className="kpi-foot">{delta}{sub && <span className="kpi-sub muted">{sub}</span>}</div>
    </>
  );
  return to ? <Link to={to} className="kpi-tile kpi-tile-link">{inner}</Link> : <div className="kpi-tile">{inner}</div>;
}

function ChartPlaceholder() { return <div className="chart-ph" aria-hidden />; }

function approvalLink(type: string): string {
  if (type === 'Loan Approval') return '/loans';
  if (type === 'Employee Loan') return '/employee-loans';
  if (type === 'Leave Request') return '/leave';
  return '/';
}
function riskClass(category: string, daysOverdue: number): string {
  if (category === 'NON_PERFORMING' || daysOverdue > 90) return 'critical';
  if (category === 'SPECIAL_MENTION_2' || daysOverdue > 60) return 'warn';
  return 'caution';
}
