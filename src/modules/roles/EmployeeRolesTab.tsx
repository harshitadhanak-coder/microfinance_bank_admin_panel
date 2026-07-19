import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { useToast } from '../../components/Toast';
import { Check, Loader, Plus, Trash2 } from '../../components/icons';
import { apiMessage, fmtDate } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import { EmployeeRoleAssignment, RoleOption, roleLabel, scopeLabel, scopeTone } from './shared';

/**
 * Employee → roles tab. Shows the multi-role assignments (active + history),
 * lets a manager assign an additional role, mark one primary (mirrored into the
 * login/token), and revoke. Effective permissions are the union of all active
 * roles; the primary role drives the portal the employee signs in to.
 */
export default function EmployeeRolesTab({ employeeId }: { employeeId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const canAssign = can(user?.role, 'role:assign');

  const [roleId, setRoleId] = useState('');
  const [makePrimary, setMakePrimary] = useState(false);
  const [error, setError] = useState('');

  const listKey = ['/employees', employeeId, 'roles'] as const;
  const assignmentsQuery = useQuery({
    queryKey: listKey,
    queryFn: () => api.get(`/employees/${employeeId}/roles`).then((r) => r.data.data as EmployeeRoleAssignment[]),
  });
  const optionsQuery = useQuery({
    queryKey: ['/roles/options'],
    queryFn: () => api.get('/roles/options').then((r) => r.data.data as RoleOption[]),
    enabled: canAssign,
  });

  const assignments = assignmentsQuery.data ?? [];
  const active = assignments.filter((a) => !a.revokedAt);
  const history = assignments.filter((a) => a.revokedAt);
  const activeRoleIds = useMemo(() => new Set(active.map((a) => a.roleId)), [active]);
  const assignableOptions = (optionsQuery.data ?? []).filter((o) => !activeRoleIds.has(o.id));

  const refresh = () => qc.invalidateQueries({ queryKey: listKey });
  const clearError = () => setError('');

  const assign = useMutation({
    mutationFn: () => api.post(`/employees/${employeeId}/roles`, { roleId, isPrimary: makePrimary }),
    onSuccess: () => { refresh(); setRoleId(''); setMakePrimary(false); clearError(); toast.success('Role assigned to the employee.'); },
    onError: (err) => setError(apiMessage(err, 'Could not assign the role.')),
  });
  const setPrimary = useMutation({
    mutationFn: (rid: string) => api.patch(`/employees/${employeeId}/roles/primary`, { roleId: rid }),
    onSuccess: () => { refresh(); clearError(); toast.success('Primary role updated.'); },
    onError: (err) => setError(apiMessage(err, 'Could not update the primary role.')),
  });
  const revoke = useMutation({
    mutationFn: (rid: string) => api.delete(`/employees/${employeeId}/roles/${rid}`),
    onSuccess: () => { refresh(); clearError(); toast.success('Role removed from the employee.'); },
    onError: (err) => setError(apiMessage(err, 'Could not remove the role.')),
  });

  return (
    <>
      {error && <div className="error-box">{error}</div>}

      {canAssign && (
        <Card title="Assign a role">
          <div className="assign-row">
            <label>Role
              <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                <option value="">Select a role…</option>
                {assignableOptions.map((o) => (
                  <option key={o.id} value={o.id}>{roleLabel(o)}{o.isSystem ? '' : ' (custom)'} · {scopeLabel(o.scopeType)}</option>
                ))}
              </select>
            </label>
            <label className="chk-inline">
              <input type="checkbox" checked={makePrimary} onChange={(e) => setMakePrimary(e.target.checked)} />
              Set as primary (drives login &amp; portal)
            </label>
            <button disabled={!roleId || assign.isPending} onClick={() => { clearError(); assign.mutate(); }}>
              {assign.isPending ? <><Loader size={15} /> Assigning…</> : <><Plus size={15} /> Assign</>}
            </button>
          </div>
          {assignableOptions.length === 0 && optionsQuery.data && (
            <p className="muted sm-text">All available roles are already assigned.</p>
          )}
        </Card>
      )}

      <Card title="Active roles">
        {assignmentsQuery.isLoading ? (
          <p className="muted">Loading…</p>
        ) : active.length === 0 ? (
          <EmptyState variant="no-data" title="No roles assigned" message="This employee inherits only their primary login role. Assign roles to grant additional permissions." />
        ) : (
          <div className="table-scroll">
            <table className="perm-table">
              <thead>
                <tr><th>Role</th><th>Scope</th><th>Primary</th><th>Assigned</th><th></th></tr>
              </thead>
              <tbody>
                {active.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{roleLabel(a.role)}</strong>
                      {!a.role.isActive && <Badge tone="danger">Inactive</Badge>}
                    </td>
                    <td><Badge tone={scopeTone(a.role.scopeType)}>{scopeLabel(a.role.scopeType)}</Badge></td>
                    <td>{a.isPrimary ? <Badge tone="success" dot>Primary</Badge> : <span className="muted">—</span>}</td>
                    <td className="muted sm-text">{fmtDate(a.assignedAt)}</td>
                    <td className="ta-right">
                      {canAssign && (
                        <div className="row-btns">
                          {!a.isPrimary && (
                            <button className="ghost sm" disabled={setPrimary.isPending} onClick={() => { clearError(); setPrimary.mutate(a.roleId); }}>
                              <Check size={14} /> Make primary
                            </button>
                          )}
                          {!a.isPrimary && (
                            <button className="ghost sm danger" disabled={revoke.isPending} onClick={() => { clearError(); revoke.mutate(a.roleId); }}>
                              <Trash2 size={14} /> Remove
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {active.some((a) => a.isPrimary) && (
          <p className="muted sm-text">The primary role cannot be removed directly — make another role primary first.</p>
        )}
      </Card>

      {history.length > 0 && (
        <Card title="Revoked history">
          <div className="table-scroll">
            <table className="perm-table">
              <thead><tr><th>Role</th><th>Assigned</th><th>Revoked</th></tr></thead>
              <tbody>
                {history.map((a) => (
                  <tr key={a.id} className="muted">
                    <td>{roleLabel(a.role)}</td>
                    <td className="sm-text">{fmtDate(a.assignedAt)}</td>
                    <td className="sm-text">{a.revokedAt ? fmtDate(a.revokedAt) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
