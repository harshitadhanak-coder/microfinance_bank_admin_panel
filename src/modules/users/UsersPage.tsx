import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FilterBar } from '../../components/FilterBar';
import { Badge } from '../../components/Badge';
import { ActionMenu } from '../../components/ActionMenu';
import { useServerTable } from '../../components/useServerTable';
import { Eye, Lock } from '../../components/icons';
import { fmtDate } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { EmployeeRow, STATUS_FILTERS, statusLabel } from '../employees/shared';

/**
 * User Management — accounts directory. Every staff member is a potential login;
 * this is the home for credential administration. Each row opens the employee's
 * Account & Access tab (send/reset credentials, lock/unlock, login history).
 *
 * Note: inline per-account state (active / locked / temp-password) awaits a
 * backend accounts-list endpoint — until then the state lives on the Account tab.
 */
export default function UsersPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const table = useServerTable();
  const [status, setStatus] = useState('');

  const listUrl = `/employees?${table.params}${status ? `&status=${status}` : ''}`;
  const listQuery = useQuery({
    queryKey: [listUrl, 'users'],
    queryFn: () => api.get(listUrl).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const rows = (listQuery.data?.data ?? []) as EmployeeRow[];
  const totalItems = (listQuery.data?.pagination?.totalItems ?? 0) as number;

  const account = (id: string) => navigate(`/employees/${id}?tab=account`);

  const columns: Column<EmployeeRow>[] = [
    { header: 'Code', render: (e) => <code>{e.employeeCode}</code>, sortKey: 'employeeCode' },
    { header: 'Name', render: (e) => <a className="cell-link" onClick={() => account(e.id)}>{e.fullName}</a>, sortKey: 'fullName' },
    { header: 'Designation', render: (e) => e.designation, sortKey: 'designation' },
    { header: 'Branch', render: (e) => e.branch?.name ?? '—', sortKey: 'branch' },
    { header: 'Email', render: (e) => e.email ?? <span className="muted">—</span> },
    { header: 'Joined', render: (e) => fmtDate(e.joiningDate), sortKey: 'joiningDate' },
    { header: 'Status', render: (e) => <Badge status={e.employmentStatus} />, sortKey: 'employmentStatus' },
    {
      header: '',
      render: (e) => (
        <div className="actions-cell">
          <ActionMenu items={[
            { key: 'account', label: 'Manage account', icon: <Lock size={15} />, onSelect: () => account(e.id) },
            { key: 'profile', label: 'View profile', icon: <Eye size={15} />, onSelect: () => navigate(`/employees/${e.id}`) },
          ]} />
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
        breadcrumb={[{ label: 'Administration' }, { label: 'User Management' }]}
        title="User Management"
        subtitle="Staff login accounts — send credentials, reset passwords, lock/unlock and review sign-in history"
      />

      <div className="info-box" style={{ marginBottom: '1rem' }}>
        Only Branch Managers among staff sign into this admin panel; Field Officers and Accountants use the Field Officer app.
        {user?.branchId ? '' : ' Credentials are managed per employee from the Account & Access tab.'}
      </div>

      <FilterBar chips={statusChips} onReset={statusChips.length ? () => { setStatus(''); table.setPage(1); } : undefined}>
        <label>Status
          <select value={status} onChange={(e) => { setStatus(e.target.value); table.setPage(1); }} aria-label="Filter by employment status">
            {STATUS_FILTERS.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
        </label>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        loading={listQuery.isLoading}
        empty="No staff accounts match this filter."
        searchPlaceholder="Search by name, code, designation or branch…"
        server={{
          page: table.page, pageSize: table.pageSize, totalItems,
          onPageChange: table.setPage, sort: table.sort, onSortChange: table.onSortChange,
          search: table.search, onSearchChange: table.onSearchChange,
        }}
      />
    </>
  );
}
