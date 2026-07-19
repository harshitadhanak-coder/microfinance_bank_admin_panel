import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { Badge } from '../../components/Badge';
import { Card } from '../../components/Card';
import { useToast } from '../../components/Toast';
import { Loader } from '../../components/icons';
import { apiMessage } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import { PermissionGroup, RoleDetail, roleLabel, scopeLabel, scopeTone } from './shared';

const setsEqual = (a: Set<string>, b: Set<string>): boolean =>
  a.size === b.size && [...a].every((v) => b.has(v));

/**
 * Permission matrix — the core RBAC screen. Modules (grouped sections) ×
 * actions (checkboxes), with a select-all-per-module toggle and a sticky
 * dirty-state save bar. Idempotent bulk save via PUT /roles/:id/permissions.
 * Super Admin is a wildcard, so its matrix is informational only.
 */
export default function RolePermissionMatrixPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = can(user?.role, 'role:manage');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initial, setInitial] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  const roleQuery = useQuery({
    queryKey: ['/roles', id],
    queryFn: () => api.get(`/roles/${id}`).then((r) => r.data.data as RoleDetail),
  });
  const catalogQuery = useQuery({
    queryKey: ['/permissions'],
    queryFn: () => api.get('/permissions').then((r) => r.data.data as PermissionGroup[]),
  });
  const grantsQuery = useQuery({
    queryKey: ['/roles', id, 'permissions'],
    queryFn: () => api.get(`/roles/${id}/permissions`).then((r) => r.data.data.permissionCodes as string[]),
  });

  useEffect(() => {
    if (grantsQuery.data) {
      const next = new Set(grantsQuery.data);
      setSelected(next);
      setInitial(new Set(next));
    }
  }, [grantsQuery.data]);

  const groups = catalogQuery.data ?? [];
  const isWildcard = roleQuery.data?.name === 'SUPER_ADMIN';
  const dirty = !setsEqual(selected, initial);
  const editable = canManage && !isWildcard;

  const toggle = (code: string) => {
    if (!editable) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  const toggleModule = (group: PermissionGroup, on: boolean) => {
    if (!editable) return;
    setSelected((prev) => {
      const next = new Set(prev);
      group.permissions.forEach((p) => { if (on) next.add(p.code); else next.delete(p.code); });
      return next;
    });
  };

  const totalSelected = selected.size;

  const save = useMutation({
    mutationFn: () => api.put(`/roles/${id}/permissions`, { permissionCodes: [...selected] }),
    onSuccess: (res) => {
      const codes = new Set(res.data.data.permissionCodes as string[]);
      setSelected(codes);
      setInitial(new Set(codes));
      setError('');
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/roles') });
      toast.success('Role permissions updated successfully.');
    },
    onError: (err) => setError(apiMessage(err, 'Could not save the permissions.')),
  });

  const loading = roleQuery.isLoading || catalogQuery.isLoading || grantsQuery.isLoading;
  const role = roleQuery.data;

  const moduleState = useMemo(() => {
    const map = new Map<string, { total: number; on: number }>();
    for (const g of groups) {
      const on = g.permissions.filter((p) => selected.has(p.code)).length;
      map.set(g.module, { total: g.permissions.length, on });
    }
    return map;
  }, [groups, selected]);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Administration' }, { label: 'Settings', to: '/settings' }, { label: 'Roles & permissions', to: '/settings/roles' }, { label: role ? roleLabel(role) : 'Permissions' }]}
        title={role ? roleLabel(role) : 'Permissions'}
        badge={role && <Badge tone={role.isSystem ? 'neutral' : 'brass'}>{role.isSystem ? 'System' : 'Custom'}</Badge>}
        meta={role && <Badge tone={scopeTone(role.scopeType)}>{scopeLabel(role.scopeType)} scope</Badge>}
        subtitle={<>Toggle the actions this role may perform. {totalSelected} permission{totalSelected === 1 ? '' : 's'} selected.</>}
        actions={(
          <>
            <button className="ghost" onClick={() => navigate('/settings/roles')}>Back</button>
            {editable && (
              <button disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? <><Loader size={15} /> Saving…</> : dirty ? 'Save changes' : 'Saved'}
              </button>
            )}
          </>
        )}
      />

      {isWildcard && (
        <div className="info-box">Super Admin holds every permission implicitly — this matrix is informational and cannot be changed.</div>
      )}
      {!canManage && !isWildcard && (
        <div className="info-box">You have read-only access to this matrix.</div>
      )}
      {error && <div className="error-box">{error}</div>}

      {loading ? (
        <Card><p className="muted">Loading permission catalog…</p></Card>
      ) : (
        <div className="perm-matrix">
          {groups.map((group) => {
            const state = moduleState.get(group.module) ?? { total: 0, on: 0 };
            const allOn = state.on === state.total && state.total > 0;
            const someOn = state.on > 0 && !allOn;
            return (
              <Card
                key={group.module}
                title={
                  <span className="perm-module-head">
                    {group.label}
                    <Badge tone={allOn ? 'success' : someOn ? 'warning' : 'neutral'} count={state.on} />
                  </span>
                }
                action={editable && (
                  <label className="perm-select-all">
                    <input
                      type="checkbox"
                      checked={allOn}
                      ref={(el) => { if (el) el.indeterminate = someOn; }}
                      onChange={(e) => toggleModule(group, e.target.checked)}
                    />
                    Select all
                  </label>
                )}
              >
                <div className="perm-actions">
                  {group.permissions.map((p) => (
                    <label key={p.code} className={`perm-chk${selected.has(p.code) ? ' on' : ''}`}>
                      <input
                        type="checkbox"
                        checked={selected.has(p.code)}
                        disabled={!editable}
                        onChange={() => toggle(p.code)}
                      />
                      <span>{p.displayName?.split('—').pop()?.trim() || p.action}</span>
                      <code className="muted sm-text">{p.code}</code>
                    </label>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
