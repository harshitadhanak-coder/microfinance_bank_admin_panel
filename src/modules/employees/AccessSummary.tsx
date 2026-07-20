import { Briefcase, Lock, UserCheck } from '../../components/icons';
import { portalForRole, roleLabel } from '../roles/shared';

interface RoleRef { id: string; name: string; displayName: string | null }

/**
 * The three things people confuse on an employee: their job title, their access
 * role, and which app they sign in to. Shown together, once, above every tab so
 * there is a single place that answers all three — and laid out to teach the
 * relationship: designation stands alone, while role → portal is a derivation.
 */
export function AccessSummary({
  designation,
  role,
  /** Role on the login when the employee record itself has none (legacy accounts). */
  inheritedRoleName,
  additionalRoles = [],
}: {
  designation?: string | null;
  role?: RoleRef | null;
  inheritedRoleName?: string | null;
  additionalRoles?: { id: string; name: string; displayName: string | null }[];
}) {
  const effectiveRoleName = role?.name ?? inheritedRoleName ?? null;
  const hasRole = Boolean(role);

  return (
    <section className="access-summary" aria-label="Designation, role and portal">
      <div className="access-item">
        <div className="access-label"><Briefcase size={14} /> Designation</div>
        <div className="access-value">{designation || <span className="muted">—</span>}</div>
        <div className="access-hint">Their job title. Grants no access on its own.</div>
      </div>

      {/* Deliberately NOT an arrow: a job title never feeds into access. */}
      <div className="access-split" aria-hidden="true" />

      <div className="access-item">
        <div className="access-label"><UserCheck size={14} /> Role</div>
        <div className="access-value">
          {hasRole
            ? roleLabel(role!)
            : inheritedRoleName
              ? <>{roleLabel({ name: inheritedRoleName })} <span className="access-warn">inherited</span></>
              : <span className="access-warn">Not set</span>}
        </div>
        <div className="access-hint">
          {hasRole
            ? 'Decides what they can do.'
            : inheritedRoleName
              ? 'From the old login — not set on the employee. Edit to confirm it.'
              : 'No permissions and no sign-in until a role is set.'}
          {additionalRoles.length > 0 && (
            <> <br />+{additionalRoles.length} extra: {additionalRoles.map((r) => roleLabel(r)).join(', ')}</>
          )}
        </div>
      </div>

      <div className="access-arrow" aria-hidden="true">→</div>

      <div className="access-item">
        <div className="access-label"><Lock size={14} /> Portal</div>
        <div className="access-value">
          {effectiveRoleName ? portalForRole(effectiveRoleName) : <span className="access-warn">Cannot sign in</span>}
        </div>
        <div className="access-hint">Where they sign in. Follows the role, never the designation.</div>
      </div>
    </section>
  );
}
