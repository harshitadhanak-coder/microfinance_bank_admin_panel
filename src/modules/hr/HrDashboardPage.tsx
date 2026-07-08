import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../auth/AuthContext';

interface HrSummary {
  headcount: number;
  presentToday: number;
  onLeaveToday: number;
  pendingLeaves: number;
  pendingEmployeeLoans: number;
}

export default function HrDashboardPage() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['/human-resources/dashboard'],
    queryFn: () => api.get('/human-resources/dashboard').then((r) => r.data.data as HrSummary),
  });

  const s = query.data;
  const attendanceRate = s && s.headcount > 0 ? Math.round((s.presentToday / s.headcount) * 100) : 0;

  const tiles: { label: string; value: number | string; hint?: string; to?: string }[] = [
    { label: 'Active employees', value: s?.headcount ?? '—', hint: 'Across all branches', to: '/employees' },
    { label: 'Present today', value: s?.presentToday ?? '—', hint: `${attendanceRate}% of staff`, to: '/attendance' },
    { label: 'On leave today', value: s?.onLeaveToday ?? '—', hint: 'Approved leave', to: '/leave' },
    { label: 'Pending leave approvals', value: s?.pendingLeaves ?? '—', hint: 'Awaiting decision', to: '/leave' },
    { label: 'Pending loan requests', value: s?.pendingEmployeeLoans ?? '—', hint: 'Staff loans', to: '/employee-loans' },
  ];

  return (
    <>
      <header className="page-head">
        <h1>Dashboard</h1>
        <p className="muted">Welcome back, {user?.fullName?.split(' ')[0] ?? 'there'} — your people at a glance</p>
      </header>

      {query.isLoading ? (
        <div className="panel pad muted">Loading…</div>
      ) : (
        <div className="stat-grid">
          {tiles.map((t) => (
            <Link key={t.label} to={t.to ?? '#'} className="stat stat-link">
              <span className="stat-label">{t.label}</span>
              <span className="stat-value">{t.value}</span>
              {t.hint && <span className="muted sm-text">{t.hint}</span>}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
