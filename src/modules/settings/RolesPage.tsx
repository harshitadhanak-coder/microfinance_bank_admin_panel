import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/Card';
import { Check } from '../../components/icons';
import { titleCase } from '../../lib/format';
import { ACTION_ROLES, MODULES, Role } from '../auth/permissions';

/** Roles shown as matrix columns, in a sensible authority order. */
const ROLES: Role[] = ['SUPER_ADMIN', 'HEADQUARTERS_ADMIN', 'HUMAN_RESOURCES_ADMIN', 'ACCOUNTANT', 'BRANCH_MANAGER', 'FIELD_OFFICER'];
const roleShort = (r: Role) => r.split('_').map((w) => w[0]).join('');

/** SUPER_ADMIN implicitly has everything (mirrors can()/canAccessModule). */
const has = (allowed: readonly Role[], role: Role) => role === 'SUPER_ADMIN' || allowed.includes(role);

const Cell = ({ on }: { on: boolean }) => (on ? <span className="perm-yes" title="Allowed"><Check size={14} /></span> : <span className="muted" aria-label="Not allowed">—</span>);

/**
 * Settings — Roles & permissions (read-only). A live view of the front-end
 * access model in `permissions.ts`, which mirrors the backend rules: which roles
 * open each module, and which roles may perform each in-page action. Phase-1
 * read-only; editing is a later phase.
 */
export default function RolesPage() {
  const actionKeys = Object.keys(ACTION_ROLES) as (keyof typeof ACTION_ROLES)[];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Administration' }, { label: 'Settings', to: '/settings' }, { label: 'Roles & permissions' }]}
        title="Roles & permissions"
        subtitle="Read-only view of the access model — mirrors the backend authorization rules"
      />

      <Card title="Module access" className="card-flush">
        <div className="table-scroll">
          <table className="perm-table">
            <thead>
              <tr>
                <th>Module</th>
                {ROLES.map((r) => <th key={r} className="ta-center" title={titleCase(r)}>{roleShort(r)}</th>)}
              </tr>
            </thead>
            <tbody>
              {MODULES.map((m) => (
                <tr key={m.key}>
                  <td><strong>{m.label}</strong>{m.hidden ? <span className="muted sm-text"> · via flow</span> : ''}</td>
                  {ROLES.map((r) => <td key={r} className="ta-center"><Cell on={has(m.roles, r)} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Action permissions" className="card-flush">
        <div className="table-scroll">
          <table className="perm-table">
            <thead>
              <tr>
                <th>Action</th>
                {ROLES.map((r) => <th key={r} className="ta-center" title={titleCase(r)}>{roleShort(r)}</th>)}
              </tr>
            </thead>
            <tbody>
              {actionKeys.map((key) => (
                <tr key={key}>
                  <td><code>{key}</code></td>
                  {ROLES.map((r) => <td key={r} className="ta-center"><Cell on={has(ACTION_ROLES[key], r)} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="muted sm-text">
        Legend: {ROLES.map((r) => `${roleShort(r)} = ${titleCase(r)}`).join(' · ')}
      </p>
    </>
  );
}
