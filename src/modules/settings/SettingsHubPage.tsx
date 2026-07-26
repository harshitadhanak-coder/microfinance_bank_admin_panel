import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { ArrowRight, Lock } from '../../components/icons';

/**
 * Settings — Hub. One home for admin configuration. HR Policy was removed from
 * the menu per request (the attendance/payroll rules screen stays routable at
 * /settings/hr-policy by direct URL); the hub now surfaces the RBAC editor.
 */
export default function SettingsHubPage() {
  const tiles: { to: string; icon: ReactNode; title: string; desc: string }[] = [
    { to: '/settings/roles', icon: <Lock size={20} />, title: 'Roles & permissions', desc: 'Create roles, configure their permission matrix, set data scope, and manage assignments.' },
  ];

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
