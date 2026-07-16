import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FilterBar } from '../../components/FilterBar';
import { StatCard } from '../../components/StatCard';
import { inr, fmtDate } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { canAccessModule } from '../auth/permissions';

interface SettlementRow {
  id: string;
  statementDate: string;
  day: number;
  branchName: string;
  isTotal: boolean;
  settlementAmount: string | number;
  hospicash: string | number;
  openingBalance: string | number;
  totalCollection: string | number;
  axisDeposit: string | number;
  sbiDeposit: string | number;
  hdfcDeposit: string | number;
  totalDeposit: string | number;
  closingBalance: string | number;
  branch: { name: string; code: string } | null;
}
interface SettlementResponse {
  items: SettlementRow[];
  page: number; pageSize: number; totalItems: number; totalPages: number;
  view: 'BRANCH' | 'TOTAL';
  totals: { settlementAmount: string | number; totalCollection: string | number; totalDeposit: string | number; closingBalance: string | number };
}

/**
 * Collections — Settlement. The client's bank-deposit settlement summary from
 * the imported workbook's "Cash Book": opening balance → total collection →
 * bank deposits (AXIS / SBI / HDFC) → closing balance, per branch per day, with
 * a daily "all branches" grand-total view. Distinct from internal loan
 * settlements and the Day-End officer settlement.
 */
export default function CollectionSettlementPage() {
  const { user } = useAuth();
  const [view, setView] = useState<'BRANCH' | 'TOTAL'>('BRANCH');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const pageSize = 25;

  const allowed = canAccessModule(user?.role, 'collectionSettlement');

  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize), view });
  if (search && view === 'BRANCH') qs.set('search', search);
  const listUrl = `/collections/import/settlement?${qs.toString()}`;
  const listQuery = useQuery({
    queryKey: [listUrl],
    enabled: allowed,
    queryFn: () => api.get(listUrl).then((r) => r.data.data as SettlementResponse),
    placeholderData: keepPreviousData,
  });

  if (!allowed) return <p className="muted">You do not have permission to view settlement data.</p>;

  const rows = listQuery.data?.items ?? [];
  const totalItems = listQuery.data?.totalItems ?? 0;
  const t = listQuery.data?.totals;

  const money = (v: string | number) => <span className="num">{inr(v as number)}</span>;

  const columns: Column<SettlementRow>[] = [
    { header: 'Date', render: (r) => fmtDate(r.statementDate) },
    ...(view === 'BRANCH'
      ? [{ header: 'Branch', render: (r: SettlementRow) => r.branch?.name ?? r.branchName } as Column<SettlementRow>]
      : []),
    { header: 'Settlement', render: (r) => money(r.settlementAmount) },
    { header: 'Opening', render: (r) => money(r.openingBalance) },
    { header: 'Collection', render: (r) => money(r.totalCollection) },
    { header: 'AXIS', render: (r) => money(r.axisDeposit) },
    { header: 'SBI', render: (r) => money(r.sbiDeposit) },
    { header: 'HDFC', render: (r) => money(r.hdfcDeposit) },
    { header: 'Total Deposit', render: (r) => money(r.totalDeposit) },
    { header: 'Closing', render: (r) => money(r.closingBalance) },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Operations' }, { label: 'Collections', to: '/collections' }, { label: 'Settlement' }]}
        title="Collection settlement"
        subtitle="Bank-deposit settlement from the imported workbook: opening → collection → deposits (AXIS/SBI/HDFC) → closing, per branch per day."
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
        <StatCard label={`Total collection (${view === 'TOTAL' ? 'daily totals' : 'branch rows'})`} value={t ? inr(t.totalCollection as number) : '—'} />
        <StatCard label="Total deposit" value={t ? inr(t.totalDeposit as number) : '—'} />
        <StatCard label="Closing (sum)" value={t ? inr(t.closingBalance as number) : '—'} />
      </div>

      <FilterBar>
        <label>View
          <select value={view} onChange={(e) => { setView(e.target.value as 'BRANCH' | 'TOTAL'); setPage(1); }} aria-label="Settlement view">
            <option value="BRANCH">Per branch</option>
            <option value="TOTAL">Daily totals (all branches)</option>
          </select>
        </label>
        {view === 'BRANCH' && (
          <label>Branch
            <input type="search" value={search} placeholder="Filter by branch…" onChange={(e) => { setSearch(e.target.value); setPage(1); }} aria-label="Filter by branch" />
          </label>
        )}
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        loading={listQuery.isLoading}
        searchable={false}
        empty="No settlement rows yet. Import a collection workbook (the Cash Book sheet) to populate this."
        server={{
          page, pageSize, totalItems,
          onPageChange: setPage,
          sort: null, onSortChange: () => {},
          search: '', onSearchChange: () => {},
        }}
      />
    </>
  );
}
