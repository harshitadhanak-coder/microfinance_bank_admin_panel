import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { useServerTable } from '../../components/useServerTable';
import { ConfirmDialog } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { Badge } from '../../components/Badge';
import { FilterBar } from '../../components/FilterBar';
import { ActionMenu } from '../../components/ActionMenu';
import { useToast } from '../../components/Toast';
import { Eye, Pencil, Plus, Trash2 } from '../../components/icons';
import { fmtDate, apiMessage } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import { EmployeeRow, STATUS_FILTERS, statusLabel } from './shared';

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
  const [deleteTarget, setDeleteTarget] = useState<EmployeeRow | null>(null);
  const [error, setError] = useState('');

  const canCreate = can(user?.role, 'employee:create');
  const canManage = can(user?.role, 'employee:update');

  const listUrl = `/employees?${table.params}${status ? `&status=${status}` : ''}`;
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
    { header: 'Designation', render: (e) => e.designation, sortKey: 'designation' },
    { header: 'Branch', render: (e) => e.branch?.name ?? '—', sortKey: 'branch' },
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

  const statusChips = status
    ? [{ key: 'status', label: `Status: ${statusLabel(status)}`, onRemove: () => { setStatus(''); table.setPage(1); } }]
    : [];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Human Resources' }, { label: 'Employees' }]}
        title="Employees"
        subtitle="Staff profiles — personal details, branch, KYC documents and salary"
        actions={canCreate && (
          <button className="btn-lg" onClick={() => navigate('/employees/new')}><Plus size={16} /> Add employee</button>
        )}
      />

      <FilterBar chips={statusChips} onReset={statusChips.length ? () => { setStatus(''); table.setPage(1); } : undefined}>
        <label>Status
          <select value={status} onChange={(e) => { setStatus(e.target.value); table.setPage(1); }} aria-label="Filter by employment status">
            {STATUS_FILTERS.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
        </label>
      </FilterBar>

      {error && <div className="error-box">{error}</div>}

      <DataTable
        columns={columns}
        rows={rows}
        loading={listQuery.isLoading}
        empty="No employees match this filter."
        searchPlaceholder="Search by name, code, designation or branch…"
        server={{
          page: table.page, pageSize: table.pageSize, totalItems,
          onPageChange: table.setPage, sort: table.sort, onSortChange: table.onSortChange,
          search: table.search, onSearchChange: table.onSearchChange,
        }}
      />

      {deleteTarget && (
        <ConfirmDialog
          tone="danger"
          icon={<Trash2 size={20} />}
          title={`Delete ${deleteTarget.fullName}?`}
          message="This permanently removes the employee's profile, salary structure and KYC records. It is blocked if the employee has loans, attendance, payroll or an active branch posting."
          confirmLabel="Delete employee"
          loading={deleteEmployee.isPending}
          onConfirm={() => deleteEmployee.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}
