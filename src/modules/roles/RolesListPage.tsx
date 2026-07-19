import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { useServerTable } from '../../components/useServerTable';
import { ConfirmDialog } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { Badge } from '../../components/Badge';
import { ActionMenu } from '../../components/ActionMenu';
import { useToast } from '../../components/Toast';
import { Ban, Check, ListChecks, Pencil, Plus } from '../../components/icons';
import { apiMessage } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import { RoleRow, roleLabel, scopeLabel, scopeTone } from './shared';

/**
 * Roles list — the RBAC administration home. Replaces the old read-only matrix
 * with a live, API-backed directory: display name, key, type (System/Custom),
 * data scope, permission + member counts, and an active toggle. Managing roles
 * (create/edit/configure/activate) is HQ / Super Admin only; everyone with
 * settings access may view.
 */
export default function RolesListPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const table = useServerTable();
  const canManage = can(user?.role, 'role:manage');

  const [statusTarget, setStatusTarget] = useState<RoleRow | null>(null);
  const [error, setError] = useState('');

  const listUrl = `/roles?${table.params}`;
  const listQuery = useQuery({
    queryKey: [listUrl],
    queryFn: () => api.get(listUrl).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const rows = (listQuery.data?.data ?? []) as RoleRow[];
  const totalItems = (listQuery.data?.pagination?.totalItems ?? 0) as number;

  const refresh = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/roles') });

  const setStatus = useMutation({
    mutationFn: (target: RoleRow) => api.patch(`/roles/${target.id}/status`, { isActive: !target.isActive }),
    onSuccess: (_res, target) => {
      refresh();
      setStatusTarget(null);
      setError('');
      toast.success(target.isActive ? 'Role deactivated.' : 'Role activated.');
    },
    onError: (err) => { setStatusTarget(null); setError(apiMessage(err, 'Could not change the role status.')); },
  });

  const columns: Column<RoleRow>[] = [
    {
      header: 'Role',
      sortKey: 'displayName',
      render: (r) => (
        <div>
          <a className="cell-link" onClick={() => navigate(`/settings/roles/${r.id}/permissions`)}>{roleLabel(r)}</a>
          {r.key && <div className="muted sm-text"><code>{r.key}</code></div>}
        </div>
      ),
    },
    { header: 'Type', render: (r) => <Badge tone={r.isSystem ? 'neutral' : 'brass'}>{r.isSystem ? 'System' : 'Custom'}</Badge> },
    { header: 'Scope', sortKey: 'scopeType', render: (r) => <Badge tone={scopeTone(r.scopeType)}>{scopeLabel(r.scopeType)}</Badge> },
    { header: 'Permissions', render: (r) => <span className="num ta-right">{r._count?.permissions ?? 0}</span> },
    { header: 'Members', render: (r) => <span className="num ta-right">{r._count?.users ?? 0}</span> },
    { header: 'Status', sortKey: 'isActive', render: (r) => <Badge status={r.isActive ? 'ACTIVE' : 'INACTIVE'} /> },
    {
      header: '',
      render: (r) => (
        <div className="actions-cell">
          <ActionMenu
            items={[
              { key: 'perms', label: 'Configure permissions', icon: <ListChecks size={15} />, onSelect: () => navigate(`/settings/roles/${r.id}/permissions`) },
              ...(canManage && !r.isSystem
                ? [{ key: 'edit', label: 'Edit role', icon: <Pencil size={15} />, onSelect: () => navigate(`/settings/roles/${r.id}/edit`) }]
                : []),
              ...(canManage && !r.isSystem
                ? [{
                    key: 'status',
                    label: r.isActive ? 'Deactivate' : 'Activate',
                    icon: r.isActive ? <Ban size={15} /> : <Check size={15} />,
                    tone: (r.isActive ? 'danger' : 'default') as 'default' | 'danger',
                    separatorBefore: true,
                    onSelect: () => setStatusTarget(r),
                  }]
                : []),
            ]}
          />
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Administration' }, { label: 'Settings', to: '/settings' }, { label: 'Roles & permissions' }]}
        title="Roles & permissions"
        subtitle="Define roles, configure their permission matrix, and control data scope"
        actions={canManage && (
          <button className="btn-lg" onClick={() => navigate('/settings/roles/new')}><Plus size={15} /> New role</button>
        )}
      />

      {error && <div className="error-box">{error}</div>}

      <DataTable
        columns={columns}
        rows={rows}
        loading={listQuery.isLoading}
        empty="No roles match this search."
        searchPlaceholder="Search roles by name or key…"
        server={{
          page: table.page, pageSize: table.pageSize, totalItems,
          onPageChange: table.setPage, sort: table.sort, onSortChange: table.onSortChange,
          search: table.search, onSearchChange: table.onSearchChange,
        }}
      />

      {statusTarget && (
        <ConfirmDialog
          tone={statusTarget.isActive ? 'danger' : 'info'}
          icon={statusTarget.isActive ? <Ban size={20} /> : <Check size={20} />}
          title={`${statusTarget.isActive ? 'Deactivate' : 'Activate'} ${roleLabel(statusTarget)}?`}
          message={statusTarget.isActive
            ? 'Members will keep the role until reassigned, but it will no longer be offered for new assignments.'
            : 'The role will be available for assignment again.'}
          confirmLabel={statusTarget.isActive ? 'Deactivate role' : 'Activate role'}
          loading={setStatus.isPending}
          onConfirm={() => setStatus.mutate(statusTarget)}
          onCancel={() => setStatusTarget(null)}
        />
      )}
    </>
  );
}
