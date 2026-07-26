import { useState } from 'react';
import { Briefcase, Check, Loader, Lock, Pencil, UserCheck, X } from '../../components/icons';
import { portalForRole, roleLabel } from '../roles/shared';

interface RoleRef { id: string; name: string; displayName: string | null }
interface DesignationOpt { id: string; name: string; code: string }
interface RoleOpt { id: string; name: string; displayName: string | null }

/**
 * The three things people confuse on an employee: their job title, their access
 * role, and which app they sign in to. Shown together, once, above every tab so
 * there is a single place that answers all three — and laid out to teach the
 * relationship: designation stands alone, while role → portal is a derivation.
 *
 * For HR / Super Admin (`canEdit`) each card edits inline. Designation and role
 * are real fields; portal has none — it is derived from the role — so its pencil
 * opens the role editor and its value previews live as the role changes.
 */
export function AccessSummary({
  designation,
  role,
  /** Role on the login when the employee record itself has none (legacy accounts). */
  inheritedRoleName,
  additionalRoles = [],
  canEdit = false,
  designationId,
  roleId,
  designationOptions = [],
  roleOptions = [],
  onSave,
  saving = false,
}: {
  designation?: string | null;
  role?: RoleRef | null;
  inheritedRoleName?: string | null;
  additionalRoles?: { id: string; name: string; displayName: string | null }[];
  /** HR / Super Admin: turns each card into an inline editor. */
  canEdit?: boolean;
  designationId?: string | null;
  roleId?: string | null;
  designationOptions?: DesignationOpt[];
  roleOptions?: RoleOpt[];
  /** Persists a change; rejects to keep the editor open (parent surfaces the error). */
  onSave?: (patch: { designationId?: string; roleId?: string }) => Promise<unknown>;
  saving?: boolean;
}) {
  const [editing, setEditing] = useState<'designation' | 'role' | null>(null);
  const [draft, setDraft] = useState('');

  const startEdit = (field: 'designation' | 'role', currentId?: string | null) => {
    setEditing(field);
    setDraft(currentId ?? '');
  };
  const cancel = () => { setEditing(null); setDraft(''); };
  const save = async () => {
    if (!onSave) return;
    try {
      await onSave(editing === 'designation' ? { designationId: draft } : { roleId: draft });
      setEditing(null); setDraft('');
    } catch { /* parent toasts; leave the editor open to retry */ }
  };

  // While the role is being edited, the portal previews the draft role's portal.
  const draftRoleName = editing === 'role' ? roleOptions.find((r) => r.id === draft)?.name ?? null : null;
  const effectiveRoleName = editing === 'role' ? draftRoleName : (role?.name ?? inheritedRoleName ?? null);
  const hasRole = Boolean(role);

  /** Save / cancel controls shared by the two inline editors. */
  const editControls = (
    <>
      <button type="button" className="icon-btn" title="Save" disabled={saving || !draft} onClick={save}>
        {saving ? <Loader size={14} /> : <Check size={14} />}
      </button>
      <button type="button" className="icon-btn" title="Cancel" disabled={saving} onClick={cancel}><X size={14} /></button>
    </>
  );

  return (
    <section className="access-summary" aria-label="Designation, role and portal">
      <div className="access-item">
        <div className="access-label">
          <Briefcase size={14} /> Designation
          {canEdit && editing !== 'designation' && (
            <button type="button" className="icon-btn access-edit" title="Edit designation" onClick={() => startEdit('designation', designationId)}><Pencil size={13} /></button>
          )}
        </div>
        {editing === 'designation' ? (
          <div className="access-edit-row">
            <select value={draft} autoFocus onChange={(e) => setDraft(e.target.value)}>
              <option value="">— Select —</option>
              {designationOptions.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
            </select>
            {editControls}
          </div>
        ) : (
          <div className="access-value">{designation || <span className="muted">—</span>}</div>
        )}
        <div className="access-hint">Their job title. Grants no access on its own.</div>
      </div>

      {/* Deliberately NOT an arrow: a job title never feeds into access. */}
      <div className="access-split" aria-hidden="true" />

      <div className="access-item">
        <div className="access-label">
          <UserCheck size={14} /> Role
          {canEdit && editing !== 'role' && (
            <button type="button" className="icon-btn access-edit" title="Edit role" onClick={() => startEdit('role', roleId)}><Pencil size={13} /></button>
          )}
        </div>
        {editing === 'role' ? (
          <div className="access-edit-row">
            <select value={draft} autoFocus onChange={(e) => setDraft(e.target.value)}>
              <option value="">— Select a role —</option>
              {roleOptions.map((r) => <option key={r.id} value={r.id}>{roleLabel(r)} — {portalForRole(r.name)}</option>)}
            </select>
            {editControls}
          </div>
        ) : (
          <div className="access-value">
            {hasRole
              ? roleLabel(role!)
              : inheritedRoleName
                ? <>{roleLabel({ name: inheritedRoleName })} <span className="access-warn">inherited</span></>
                : <span className="access-warn">Not set</span>}
          </div>
        )}
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
        <div className="access-label">
          <Lock size={14} /> Portal
          {canEdit && editing !== 'role' && (
            <button type="button" className="icon-btn access-edit" title="Portal follows the role — edit the role" onClick={() => startEdit('role', roleId)}><Pencil size={13} /></button>
          )}
        </div>
        <div className="access-value">
          {effectiveRoleName ? portalForRole(effectiveRoleName) : <span className="access-warn">Cannot sign in</span>}
        </div>
        <div className="access-hint">Where they sign in. Follows the role, never the designation.</div>
      </div>
    </section>
  );
}
