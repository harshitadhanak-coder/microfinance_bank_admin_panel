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
import { Eye, Pencil, Plus } from '../../components/icons';
import { inr, fmtDate } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import {
  EmployeeLoanRow, EMPLOYEE_LOAN_STATUSES, EmployeeLoanStatusFilter, empLoanStatusLabel,
} from './employeeLoanShared';

/** Employee Loans — List. Browse/scan; apply, review and repay live on the detail page. */
export default function EmployeeLoansPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const table = useServerTable();
  const [status, setStatus] = useState<EmployeeLoanStatusFilter>('ALL');

  const canManage = can(user?.role, 'employeeLoan:manage');

  const listUrl = `/employee-loans?${table.params}${status === 'ALL' ? '' : `&status=${status}`}`;
  const listQuery = useQuery({
    queryKey: [listUrl],
    queryFn: () => api.get(listUrl).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const rows = (listQuery.data?.data ?? []) as EmployeeLoanRow[];
  const totalItems = (listQuery.data?.pagination?.totalItems ?? 0) as number;

  const open = (id: string) => navigate(`/employee-loans/${id}`);

  const columns: Column<EmployeeLoanRow>[] = [
    { header: 'Loan #', render: (l) => <a className="cell-link" onClick={() => open(l.id)}><code>{l.loanNumber}</code></a>, sortKey: 'loanNumber' },
    { header: 'Employee', render: (l) => <><strong>{l.employee.fullName}</strong><div className="muted sm-text">{l.employee.employeeCode}</div></>, sortKey: 'employee' },
    { header: 'Branch', render: (l) => l.employee.branch?.name ?? '—', sortKey: 'branch' },
    { header: 'Principal', render: (l) => <span className="num">{inr(l.principalAmount)}</span>, sortKey: 'principalAmount' },
    { header: 'Rate', render: (l) => `${Number(l.annualInterestRate)}%`, sortKey: 'annualInterestRate' },
    { header: 'Tenure', render: (l) => `${l.tenureMonths} mo`, sortKey: 'tenureMonths' },
    { header: 'Monthly', render: (l) => <span className="num">{inr(l.monthlyDeduction)}</span>, sortKey: 'monthlyDeduction' },
    { header: 'Outstanding', render: (l) => <span className="num">{inr(l.outstandingAmount)}</span>, sortKey: 'outstandingAmount' },
    { header: 'Requested', render: (l) => fmtDate(l.requestedAt), sortKey: 'requestedAt' },
    { header: 'Status', render: (l) => <Badge status={l.status}>{empLoanStatusLabel(l.status)}</Badge>, sortKey: 'status' },
    {
      header: '',
      render: (l) => (
        <div className="actions-cell">
          <ActionMenu items={[
            { key: 'view', label: 'View details', icon: <Eye size={15} />, onSelect: () => open(l.id) },
            ...(canManage && l.status === 'PENDING' ? [{ key: 'edit', label: 'Edit', icon: <Pencil size={15} />, onSelect: () => navigate(`/employee-loans/${l.id}?edit=1`) }] : []),
          ]} />
        </div>
      ),
    },
  ];

  const statusChips = status !== 'ALL'
    ? [{ key: 'status', label: `Status: ${empLoanStatusLabel(status)}`, onRemove: () => { setStatus('ALL'); table.setPage(1); } }]
    : [];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Payroll & Finance' }, { label: 'Employee Loans' }]}
        title="Employee Loans"
        subtitle="Staff loans repaid via monthly salary deduction"
        actions={canManage && <button className="btn-lg" onClick={() => navigate('/employee-loans/new')}><Plus size={16} /> New loan request</button>}
      />

      <FilterBar chips={statusChips} onReset={statusChips.length ? () => { setStatus('ALL'); table.setPage(1); } : undefined}>
        <label>Status
          <select value={status} onChange={(e) => { setStatus(e.target.value as EmployeeLoanStatusFilter); table.setPage(1); }} aria-label="Filter by status">
            {EMPLOYEE_LOAN_STATUSES.map((s) => <option key={s} value={s}>{s === 'ALL' ? 'All statuses' : empLoanStatusLabel(s)}</option>)}
          </select>
        </label>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        loading={listQuery.isLoading}
        empty="No employee loans found."
        searchPlaceholder="Search by employee, loan number or branch…"
        server={{
          page: table.page, pageSize: table.pageSize, totalItems,
          onPageChange: table.setPage, sort: table.sort, onSortChange: table.onSortChange,
          search: table.search, onSearchChange: table.onSearchChange,
        }}
      />
    </>
  );
}
