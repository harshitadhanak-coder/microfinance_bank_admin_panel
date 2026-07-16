import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FilterBar } from '../../components/FilterBar';
import { Badge, BadgeTone } from '../../components/Badge';
import { StatCard } from '../../components/StatCard';
import { useServerTable } from '../../components/useServerTable';
import { inr, fmtDate, titleCase } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { canAccessModule } from '../auth/permissions';

interface RecordRow {
  id: string;
  transactionId: string;
  loanAccountNumber: string;
  urn: string | null;
  customerName: string;
  amount: string | number;
  collectionDate: string;
  servicingBranchRaw: string;
  executiveCode: string;
  status: 'COLLECTED' | 'REJECTED';
  branch: { name: string; code: string } | null;
  collectedByEmployee: { fullName: string; employeeCode: string } | null;
}
interface RecordsResponse {
  items: RecordRow[];
  page: number; pageSize: number; totalItems: number; totalPages: number;
  totalAmount: string | number;
}

const STATUS_TONE: Record<string, BadgeTone> = { COLLECTED: 'success', REJECTED: 'warning' };
const STATUSES = ['', 'COLLECTED', 'REJECTED'];

/**
 * Collections — Records. Browsable, searchable view of the imported external
 * (Business-Correspondent) collection ledger — the rows loaded via Import
 * Collections. These are NOT internal loan payments (the client file carries no
 * loan master), so they live in their own ledger and are surfaced here.
 */
export default function CollectionRecordsPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState('');
  const table = useServerTable({ pageSize: 20 });

  const allowed = canAccessModule(user?.role, 'collectionRecords');

  const listUrl = `/collections/import/records?${table.params}${status ? `&status=${status}` : ''}`;
  const listQuery = useQuery({
    queryKey: [listUrl],
    enabled: allowed,
    queryFn: () => api.get(listUrl).then((r) => r.data.data as RecordsResponse),
    placeholderData: keepPreviousData,
  });

  if (!allowed) return <p className="muted">You do not have permission to view collection records.</p>;

  const rows = listQuery.data?.items ?? [];
  const totalItems = listQuery.data?.totalItems ?? 0;
  const totalAmount = listQuery.data?.totalAmount ?? 0;

  const columns: Column<RecordRow>[] = [
    { header: 'Date', render: (r) => fmtDate(r.collectionDate) },
    { header: 'Txn Id', render: (r) => <code className="sm-text">{r.transactionId}</code> },
    { header: 'Customer', render: (r) => r.customerName },
    { header: 'Account', render: (r) => <span className="sm-text">{r.loanAccountNumber}</span> },
    { header: 'URN', render: (r) => <span className="sm-text">{r.urn ?? '—'}</span> },
    { header: 'Amount', render: (r) => <span className="num">{inr(r.amount as number)}</span> },
    { header: 'Branch', render: (r) => r.branch?.name ?? <span className="muted sm-text">{r.servicingBranchRaw} (unmatched)</span> },
    { header: 'Officer', render: (r) => r.collectedByEmployee?.fullName ?? <span className="muted sm-text">{r.executiveCode} (unmatched)</span> },
    { header: 'Status', render: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge> },
  ];

  const chips = status
    ? [{ key: 'status', label: `Status: ${titleCase(status)}`, onRemove: () => { setStatus(''); table.setPage(1); } }]
    : [];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Operations' }, { label: 'Collections', to: '/collections' }, { label: 'Records' }]}
        title="Collection records"
        subtitle="Imported client (Business-Correspondent) collection ledger. Separate from internal loan payments."
      />

      <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
        <StatCard label="Records (filtered)" value={totalItems.toLocaleString('en-IN')} />
        <StatCard label="Total amount (filtered)" value={inr(totalAmount as number)} />
      </div>

      <FilterBar chips={chips} onReset={chips.length ? () => { setStatus(''); table.setPage(1); } : undefined}>
        <label>Status
          <select value={status} onChange={(e) => { setStatus(e.target.value); table.setPage(1); }} aria-label="Filter by status">
            {STATUSES.map((s) => <option key={s} value={s}>{s ? titleCase(s) : 'All statuses'}</option>)}
          </select>
        </label>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        loading={listQuery.isLoading}
        empty="No collection records match this filter."
        searchPlaceholder="Search by transaction id, account, URN, customer or officer…"
        server={{
          page: table.page, pageSize: table.pageSize, totalItems,
          onPageChange: table.setPage, sort: table.sort, onSortChange: table.onSortChange,
          search: table.search, onSearchChange: table.onSearchChange,
        }}
      />
    </>
  );
}
