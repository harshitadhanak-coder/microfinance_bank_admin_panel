import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FilterBar } from '../../components/FilterBar';
import { Badge } from '../../components/Badge';
import { ActionMenu } from '../../components/ActionMenu';
import { ConfirmDialog } from '../../components/Modal';
import { useServerTable } from '../../components/useServerTable';
import { useToast } from '../../components/Toast';
import { Eye, Pencil, Plus, Trash2 } from '../../components/icons';
import { titleCase, apiMessage } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { can, canListAllBranches } from '../auth/permissions';
import { BranchRow, BRANCH_STATUSES } from './shared';

/**
 * Branches — List. Pure browse/scan: create moved to /branches/new, per-branch
 * detail (staff, performance) to /branches/:id. Cross-branch roles see every
 * branch (server-paged); a branch-scoped user sees only their own.
 */
export default function BranchesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [status, setStatus] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<BranchRow | null>(null);
  const [error, setError] = useState('');

  const listAll = canListAllBranches(user?.role);
  const canCreate = can(user?.role, 'branch:create');
  const canUpdate = can(user?.role, 'branch:update');
  const canDelete = can(user?.role, 'branch:delete');

  const table = useServerTable();

  const listUrl = `/branches?${table.params}${status ? `&status=${status}` : ''}`;
  const listQuery = useQuery({
    queryKey: [listUrl],
    enabled: listAll,
    queryFn: () => api.get(listUrl).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const singleQuery = useQuery({
    queryKey: ['branch', user?.branchId],
    enabled: !listAll && !!user?.branchId,
    queryFn: () => api.get(`/branches/${user!.branchId}`).then((r) => [r.data.data as BranchRow]),
  });

  const rows = (listAll ? listQuery.data?.data : singleQuery.data) as BranchRow[] | undefined;
  const totalItems = (listQuery.data?.pagination?.totalItems ?? 0) as number;
  const isLoading = listAll ? listQuery.isLoading : singleQuery.isLoading;

  const invalidate = () =>
    qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/branches') || q.queryKey[0] === 'branch' });

  const deleteBranch = useMutation({
    mutationFn: (id: string) => api.delete(`/branches/${id}`),
    onSuccess: () => { invalidate(); setDeleteTarget(null); toast.success('Branch deleted.'); },
    onError: (err) => { setDeleteTarget(null); setError(apiMessage(err, 'Could not delete the branch.')); },
  });

  const open = (id: string) => navigate(`/branches/${id}`);

  const columns: Column<BranchRow>[] = [
    { header: 'Code', render: (b) => <code>{b.code}</code>, sortKey: 'code' },
    { header: 'Branch', render: (b) => <a className="cell-link" onClick={() => open(b.id)}>{b.name}</a>, sortKey: 'name' },
    { header: 'Location', render: (b) => `${b.city}, ${b.state}`, sortKey: 'city' },
    { header: 'Manager', render: (b) => b.manager?.fullName ?? '—', sortKey: 'manager' },
    { header: 'Clients', render: (b) => <span className="num">{b._count?.clients ?? 0}</span>, sortKey: 'clients' },
    { header: 'Loans', render: (b) => <span className="num">{b._count?.loans ?? 0}</span>, sortKey: 'loans' },
    { header: 'Status', render: (b) => <Badge status={b.status} />, sortKey: 'status' },
    {
      header: '',
      render: (b) => (
        <div className="actions-cell">
          <ActionMenu
            items={[
              { key: 'view', label: 'View branch', icon: <Eye size={15} />, onSelect: () => open(b.id) },
              ...(canUpdate ? [{ key: 'edit', label: 'Edit', icon: <Pencil size={15} />, onSelect: () => navigate(`/branches/${b.id}/edit`) }] : []),
              ...(canDelete ? [{ key: 'delete', label: 'Delete', icon: <Trash2 size={15} />, tone: 'danger' as const, separatorBefore: true, onSelect: () => { setError(''); setDeleteTarget(b); } }] : []),
            ]}
          />
        </div>
      ),
    },
  ];

  const statusChips = status
    ? [{ key: 'status', label: `Status: ${titleCase(status)}`, onRemove: () => { setStatus(''); table.setPage(1); } }]
    : [];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Operations' }, { label: 'Branches' }]}
        title="Branches"
        subtitle="All operating branches in the network"
        actions={canCreate && <button className="btn-lg" onClick={() => navigate('/branches/new')}><Plus size={16} /> Add branch</button>}
      />

      {listAll && (
        <FilterBar chips={statusChips} onReset={statusChips.length ? () => { setStatus(''); table.setPage(1); } : undefined}>
          <label>Status
            <select value={status} onChange={(e) => { setStatus(e.target.value); table.setPage(1); }} aria-label="Filter by branch status">
              {BRANCH_STATUSES.map((s) => <option key={s} value={s}>{s ? titleCase(s) : 'All statuses'}</option>)}
            </select>
          </label>
        </FilterBar>
      )}

      {error && <div className="error-box">{error}</div>}

      <DataTable
        columns={columns}
        rows={rows ?? []}
        loading={isLoading}
        empty="No branches match this filter."
        searchPlaceholder="Search by code, name, city or manager…"
        server={listAll ? {
          page: table.page, pageSize: table.pageSize, totalItems,
          onPageChange: table.setPage, sort: table.sort, onSortChange: table.onSortChange,
          search: table.search, onSearchChange: table.onSearchChange,
        } : undefined}
      />

      {deleteTarget && (
        <ConfirmDialog
          tone="danger"
          icon={<Trash2 size={20} />}
          title={`Delete ${deleteTarget.name}?`}
          message={`This permanently removes branch ${deleteTarget.code}. It is blocked if the branch still has clients, loans or staff.`}
          confirmLabel="Delete branch"
          loading={deleteBranch.isPending}
          onConfirm={() => deleteBranch.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}
