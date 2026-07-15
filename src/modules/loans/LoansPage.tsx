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
import { Eye, FileSpreadsheet, Pencil, Plus, UserCheck } from '../../components/icons';
import { inr, fmtDate } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import { LOAN_STATUSES, LoanRow, bucketLabel, loanStatusLabel } from './shared';

/**
 * Loans — List. A pure browse/scan surface. Quick-create moved to /loans/new,
 * bulk import to /loans/import, and the full loan workspace to /loans/:id, so the
 * list no longer mixes creation or a detail modal into the table.
 */
export default function LoansPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [status, setStatus] = useState('ACTIVE');
  const table = useServerTable();

  const branchScoped = !!user?.branchId;
  const canCreate = can(user?.role, 'loan:create');
  const canEdit = can(user?.role, 'loan:edit');

  const url = `/loans?${table.params}${status ? `&status=${status}` : ''}`;
  const { data, isLoading } = useQuery({
    queryKey: [url],
    queryFn: () => api.get(url).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const rows = (data?.data ?? []) as LoanRow[];
  const totalItems = (data?.pagination?.totalItems ?? 0) as number;

  const open = (id: string) => navigate(`/loans/${id}`);

  const columns: Column<LoanRow>[] = [
    { header: 'Loan no.', render: (l) => <a className="cell-link" onClick={() => open(l.id)}><code>{l.loanNumber}</code></a>, sortKey: 'loanNumber' },
    { header: 'Client', render: (l) => <><strong>{l.client.fullName}</strong><div className="muted sm-text">{l.client.phoneNumber}</div></>, sortKey: 'client' },
    { header: 'Product', render: (l) => l.loanProduct.name, sortKey: 'product' },
    { header: 'Status', render: (l) => <Badge status={l.status}>{loanStatusLabel(l.status)}</Badge>, sortKey: 'status' },
    ...(branchScoped ? [] : [{ header: 'Branch', render: (l) => l.branch.name, sortKey: 'branch' } satisfies Column<LoanRow>]),
    { header: 'Principal', render: (l) => <span className="num">{inr(l.principalAmount)}</span>, sortKey: 'principalAmount' },
    { header: 'Outstanding', render: (l) => <span className="num">{inr(l.outstandingPrincipal)}</span>, sortKey: 'outstandingPrincipal' },
    { header: 'EMI', render: (l) => <span className="num">{inr(l.installmentAmount)}</span>, sortKey: 'installmentAmount' },
    { header: 'Officer', render: (l) => l.assignedOfficer?.fullName ?? <span className="muted">Unassigned</span> },
    { header: 'Disbursed', render: (l) => fmtDate(l.disbursedAt), sortKey: 'disbursedAt' },
    { header: 'Bucket', render: (l) => <Badge status={l.assetClassification}>{bucketLabel(l.assetClassification)}</Badge>, sortKey: 'assetClassification' },
    {
      header: '',
      render: (l) => (
        <div className="actions-cell">
          <ActionMenu
            items={[
              { key: 'view', label: 'View loan', icon: <Eye size={15} />, onSelect: () => open(l.id) },
              ...(canEdit ? [{ key: 'officer', label: 'Assign / edit', icon: <Pencil size={15} />, onSelect: () => navigate(`/loans/${l.id}?tab=officer`) }] : []),
            ]}
          />
        </div>
      ),
    },
  ];

  const statusChips = status
    ? [{ key: 'status', label: `Status: ${loanStatusLabel(status)}`, onRemove: () => { setStatus(''); table.setPage(1); } }]
    : [];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Operations' }, { label: 'Loans' }]}
        title="Loans"
        subtitle={branchScoped ? `Loan book — ${user?.branch?.name ?? 'your branch'}` : 'Loan book across branches'}
        actions={(
          <>
            <button className="ghost" onClick={() => navigate('/loans/applications')}><FileSpreadsheet size={15} /> Applications</button>
            {can(user?.role, 'loan:link') && <button className="ghost" onClick={() => navigate('/loans/assignments')}><UserCheck size={15} /> Assignments</button>}
            {canCreate && <button className="ghost" onClick={() => navigate('/loans/import')}>Import</button>}
            {canCreate && <button className="btn-lg" onClick={() => navigate('/loans/new')}><Plus size={16} /> New loan</button>}
          </>
        )}
      />

      <FilterBar chips={statusChips} onReset={statusChips.length ? () => { setStatus(''); table.setPage(1); } : undefined}>
        <label>Status
          <select value={status} onChange={(e) => { setStatus(e.target.value); table.setPage(1); }} aria-label="Filter by loan status">
            {LOAN_STATUSES.map((s) => <option key={s} value={s}>{s ? loanStatusLabel(s) : 'All statuses'}</option>)}
          </select>
        </label>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        empty="No loans match this filter."
        searchPlaceholder="Search by loan no., client, product or branch…"
        server={{
          page: table.page, pageSize: table.pageSize, totalItems,
          onPageChange: table.setPage, sort: table.sort, onSortChange: table.onSortChange,
          search: table.search, onSearchChange: table.onSearchChange,
        }}
      />
    </>
  );
}
