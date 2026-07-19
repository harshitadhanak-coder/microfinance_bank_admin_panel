import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { ArrowRight, CalendarCheck, Lock } from '../../components/icons';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';

/**
 * Settings — Hub. One home for admin configuration currently scattered or
 * code-only: HR Policy (accrual, workweek, punch/payroll rules) and a read-only
 * Roles & permissions view.
 */
export default function SettingsHubPage() {
  const { user } = useAuth();
  const canPolicy = can(user?.role, 'master:manage');

  const tiles: { to: string; icon: ReactNode; title: string; desc: string; show: boolean }[] = [
    { to: '/settings/hr-policy', icon: <CalendarCheck size={20} />, title: 'HR Policy', desc: 'Attendance rules (office hours, grace, workweek) and payroll rates (PF, ESI, professional tax).', show: canPolicy },
    { to: '/settings/roles', icon: <Lock size={20} />, title: 'Roles & permissions', desc: 'Create roles, configure their permission matrix, set data scope, and manage assignments.', show: true },
  ].filter((t) => t.show);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Administration' }, { label: 'Settings' }]}
        title="Settings"
        subtitle="Organization configuration and access model"
      />
      <div className="hub-grid">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to} className="hub-tile">
            <span className="hub-tile-icon">{t.icon}</span>
            <div className="hub-tile-body">
              <div className="hub-tile-head"><h3>{t.title}</h3></div>
              <p className="muted sm-text">{t.desc}</p>
            </div>
            <ArrowRight size={16} className="hub-tile-go" />
          </Link>
        ))}
      </div>
    </>
  );
}
