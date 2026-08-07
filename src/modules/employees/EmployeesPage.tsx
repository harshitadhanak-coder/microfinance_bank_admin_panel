import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { useServerTable } from '../../components/useServerTable';
import { ConfirmDialog } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { PageBar } from '../../components/PageBar';
import { Badge } from '../../components/Badge';
import { FilterBar } from '../../components/FilterBar';
import { ExportButton } from '../../components/ExportButton';
import { ActionMenu } from '../../components/ActionMenu';
import { useToast } from '../../components/Toast';
import { Eye, Pencil, Plus, Search, Trash2, X } from '../../components/icons';
import { fmtDate, apiMessage } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import { EmployeeRow, STATUS_FILTERS, portalForRole, statusLabel, useEmployeeMasters } from './shared';
import { roleLabel } from '../roles/shared';

/**
 * Employees — List. A pure browse/scan surface: the create form now lives at
 * /employees/new and the full profile at /employees/:id, so this page no longer
 * mixes a create form or a detail modal into the list.
 */
export default function EmployeesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const table = useServerTable();
  const [status, setStatus] = useState('');
  const [designationId, setDesignationId] = useState('');
  const [roleId, setRoleId] = useState('');
  // The list has always shown a Branch column but had no way to filter by it.
  // The API already honours ?branchId for cross-branch roles (a branch-scoped
  // user stays pinned to their own branch regardless), so this only widens what
  // HR/HQ can narrow to — never what anyone can see.
  const [branchId, setBranchId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<EmployeeRow | null>(null);
  const [error, setError] = useState('');

  const canCreate = can(user?.role, 'employee:create');
  const canManage = can(user?.role, 'employee:update');

  const masters = useEmployeeMasters(canManage);

  const listUrl = `/employees?${table.params}${status ? `&status=${status}` : ''}`
    + `${designationId ? `&designationId=${designationId}` : ''}`
    + `${roleId ? `&roleId=${roleId}` : ''}`
    + `${branchId ? `&branchId=${branchId}` : ''}`;
  const listQuery = useQuery({
    queryKey: [listUrl],
    queryFn: () => api.get(listUrl).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const rows = (listQuery.data?.data ?? []) as EmployeeRow[];
  const totalItems = (listQuery.data?.pagination?.totalItems ?? 0) as number;

  const refresh = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/employees') });

  const deleteEmployee = useMutation({
    mutationFn: (id: string) => api.delete(`/employees/${id}`),
    onSuccess: () => { refresh(); setDeleteTarget(null); setError(''); toast.success('Employee deleted successfully.'); },
    onError: (err) => { setDeleteTarget(null); setError(apiMessage(err, 'This employee could not be deleted.')); },
  });

  const open = (id: string) => navigate(`/employees/${id}`);

  const columns: Column<EmployeeRow>[] = [
    { header: 'Code', render: (e) => <code>{e.employeeCode}</code>, sortKey: 'employeeCode' },
    { header: 'Name', render: (e) => <a className="cell-link" onClick={() => open(e.id)}>{e.fullName}</a>, sortKey: 'fullName' },
    { header: 'Designation', render: (e) => e.designationRef?.name ?? e.designation, sortKey: 'designation' },
    {
      header: 'Role',
      sortKey: 'role',
      render: (e) => (e.role
        ? <span title={portalForRole(e.role.name)}>{roleLabel(e.role)}</span>
        : <span className="muted">Not set</span>),
    },
    { header: 'Branch', render: (e) => e.branch?.name ?? '—', sortKey: 'branch' },
    { header: 'Branch Manager', render: (e) => e.branch?.manager?.fullName ?? '—' },
    { header: 'Phone', render: (e) => e.phoneNumber },
    { header: 'Joined', render: (e) => fmtDate(e.joiningDate), sortKey: 'joiningDate' },
    { header: 'Status', render: (e) => <Badge status={e.employmentStatus} />, sortKey: 'employmentStatus' },
    {
      header: '',
      render: (e) => (
        <div className="actions-cell">
          <ActionMenu
            items={[
              { key: 'view', label: 'View profile', icon: <Eye size={15} />, onSelect: () => open(e.id) },
              ...(canManage ? [{ key: 'edit', label: 'Edit', icon: <Pencil size={15} />, onSelect: () => navigate(`/employees/${e.id}/edit`) }] : []),
              ...(canManage ? [{ key: 'delete', label: 'Delete', icon: <Trash2 size={15} />, tone: 'danger' as const, separatorBefore: true, onSelect: () => { setError(''); setDeleteTarget(e); } }] : []),
            ]}
          />
        </div>
      ),
    },
  ];

  const resetFilters = () => { setStatus(''); setDesignationId(''); setRoleId(''); setBranchId(''); table.setPage(1); };
  const filterChips = [
    ...(status ? [{ key: 'status', label: `Status: ${statusLabel(status)}`, onRemove: () => { setStatus(''); table.setPage(1); } }] : []),
    ...(branchId ? [{
      key: 'branch',
      label: `Branch: ${masters.branches.find((b) => b.id === branchId)?.name ?? branchId}`,
      onRemove: () => { setBranchId(''); table.setPage(1); },
    }] : []),
    ...(designationId ? [{
      key: 'designation',
      label: `Designation: ${masters.designations.find((d) => d.id === designationId)?.name ?? designationId}`,
      onRemove: () => { setDesignationId(''); table.setPage(1); },
    }] : []),
    ...(roleId ? [{
      key: 'role',
      label: `Role: ${roleId === 'NONE' ? 'Not set' : roleLabel(masters.roles.find((r) => r.id === roleId) ?? { name: roleId })}`,
      onRemove: () => { setRoleId(''); table.setPage(1); },
    }] : []),
  ];

  // Search field for the toolbar — same control the DataTable used to render
  // above the table, relocated into the page toolbar and wired to the shared
  // server-table search state so behaviour is unchanged.
  const searchField = (
    <div className="table-search">
      <Search size={16} />
      <input
        value={table.search}
        onChange={(e) => table.onSearchChange(e.target.value)}
        placeholder="Search by name, code, designation or branch…"
        aria-label="Search employees"
      />
      {table.search && (
        <button type="button" className="table-search-clear" onClick={() => table.onSearchChange('')} aria-label="Clear search"><X size={14} /></button>
      )}
    </div>
  );

  return (
    <>
      {/* Global header surface carries only the breadcrumb trail (plus the
          standard alerts + account chrome) — see PageBar. */}
      <PageBar breadcrumb={[{ label: 'Dashboard', to: '/' }, { label: 'Human Resources' }, { label: 'Employees' }]} />

      {/* `emp-list` scopes this page's premium visual polish (toolbar card, table
          density, colour hierarchy) so none of it leaks into other modules that
          share the FilterBar / DataTable components. */}
      <div className="emp-list">
        {/* Page title with the primary action aligned to its right, then a single
            compact toolbar (search · filters), then the table. */}
        <PageHeader
          title="Employees"
          actions={(
            <>
              {/* Exports the whole filtered directory, not the page on screen —
                  the same filters, search and branch scope as the list. */}
              <ExportButton
                url="/employees/export"
                fileBase="Employees"
                params={{ status, designationId, roleId, branchId, search: table.search }}
              />
              {canCreate && (
                <button className="btn-lg" onClick={() => navigate('/employees/new')}><Plus size={16} /> Add employee</button>
              )}
            </>
          )}
        />

        <FilterBar
        chips={filterChips}
        onReset={filterChips.length ? resetFilters : undefined}
        search={searchField}
      >
        <label>Status
          <select value={status} onChange={(e) => { setStatus(e.target.value); table.setPage(1); }} aria-label="Filter by employment status">
            {STATUS_FILTERS.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
        </label>
        {/* Only cross-branch roles get the branch list at all; a branch-scoped
            user is pinned server-side and has nothing to choose between. */}
        {masters.branches.length > 0 && (
          <label>Branch
            <select value={branchId} onChange={(e) => { setBranchId(e.target.value); table.setPage(1); }} aria-label="Filter by branch">
              <option value="">All branches</option>
              {masters.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
        <label>Designation
          <select value={designationId} onChange={(e) => { setDesignationId(e.target.value); table.setPage(1); }} aria-label="Filter by designation">
            <option value="">All designations</option>
            {masters.designations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <label>Role
          <select value={roleId} onChange={(e) => { setRoleId(e.target.value); table.setPage(1); }} aria-label="Filter by role">
            <option value="">All roles</option>
            {/* Surfaces the employees left without a role by the split, so they
                can be found and assigned one rather than sitting unnoticed. */}
            <option value="NONE">Not set</option>
            {masters.roles.map((r) => <option key={r.id} value={r.id}>{roleLabel(r)}</option>)}
          </select>
        </label>
      </FilterBar>

        {error && <div className="error-box">{error}</div>}

        <DataTable
          columns={columns}
          rows={rows}
          loading={listQuery.isLoading}
          empty="No employees match this filter."
          searchable={false}
          server={{
            page: table.page, pageSize: table.pageSize, totalItems,
            onPageChange: table.setPage, sort: table.sort, onSortChange: table.onSortChange,
            search: table.search, onSearchChange: table.onSearchChange,
          }}
        />
      </div>

      {deleteTarget && (
        <DeleteEmployeeDialog
          employee={deleteTarget}
          loading={deleteEmployee.isPending}
          onConfirm={() => deleteEmployee.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}

// ── Delete confirmation ──────────────────────────────────────────────────
interface DeletionImpact {
  fullName: string;
  employmentStatus: string;
  separated: boolean;
  /** Why the delete would be refused. Empty when it can go ahead. */
  blockers: string[];
  /** Destroyed permanently. */
  removes: { label: string; count: number }[];
  /** Row kept, link to this employee cleared. */
  detaches: { label: string; count: number }[];
  /** The sign-in account deleted with them, if they had one. */
  loginAccount: { email: string; status: string; role: string } | null;
  purges: boolean;
  needsSeparation: boolean;
  canDelete: boolean;
}

/**
 * Deleting a separated employee erases their attendance, leave and payroll for
 * good, so the dialog states the actual counts before the operator commits
 * instead of describing the rules in the abstract. It also refuses up front
 * when something blocks the delete, so the reason is read rather than
 * discovered from a failed request.
 */
function DeleteEmployeeDialog({
  employee, loading, onConfirm, onCancel,
}: {
  employee: EmployeeRow;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const impactQuery = useQuery({
    queryKey: ['/employees', employee.id, 'deletion-impact'],
    queryFn: () => api.get(`/employees/${employee.id}/deletion-impact`).then((r) => r.data.data as DeletionImpact),
  });
  const impact = impactQuery.data;

  const line = (r: { label: string; count: number }) => `${r.count} ${r.label.toLowerCase()}`;

  /**
   * The login always goes with the employee, whether or not there is any HR
   * history — so it is stated on every variant of this dialog rather than only
   * on the purge one.
   */
  const loginNote = impact?.loginAccount && (
    <>
      <br /><br />
      Their login <strong>{impact.loginAccount.email}</strong> is deleted too — password, active
      sessions, login history and any pending reset link. They will not be able to sign in again.
    </>
  );

  const message = impactQuery.isLoading ? 'Checking what this would remove…'
    : !impact ? 'Could not check what this would remove. Try again.'
    : impact.blockers.length > 0 ? <>{impact.blockers[0]}</>
    : impact.needsSeparation ? (
      <>
        This employee still has HR records ({impact.removes.map(line).join(', ')}) and is on the rolls as{' '}
        <strong>{statusLabel(impact.employmentStatus)}</strong>.
        <br /><br />
        Mark them as separated first — deleting a separated employee removes those records with them.
      </>
    ) : impact.purges ? (
      <>
        <strong>{impact.fullName}</strong> is separated, so deleting them <strong>permanently erases</strong>:
        <br />{impact.removes.map(line).join(' · ')}
        {impact.detaches.length > 0 && (
          <><br /><br />Kept, with the link to this employee cleared: {impact.detaches.map(line).join(' · ')}.</>
        )}
        {loginNote}
        <br /><br />This cannot be undone.
      </>
    ) : (
      <>
        This removes <strong>{impact.fullName}</strong>’s profile, salary structure and KYC records.
        No attendance, leave or payroll history is attached.
        {loginNote}
        <br /><br /><span className="sm-text">This cannot be undone.</span>
      </>
    );

  return (
    <ConfirmDialog
      tone="danger"
      icon={<Trash2 size={20} />}
      title={impact?.purges ? `Delete ${employee.fullName} and all their records?` : `Delete ${employee.fullName}?`}
      message={message}
      confirmLabel={impact?.purges ? 'Delete everything' : 'Delete employee'}
      loading={loading}
      confirmDisabled={impactQuery.isLoading || !impact?.canDelete}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
