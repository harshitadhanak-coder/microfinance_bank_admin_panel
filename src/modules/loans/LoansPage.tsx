import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { useServerTable } from '../../components/useServerTable';
import { inr } from '../../components/StatCard';
import { useAuth } from '../auth/AuthContext';
import LoanDetailModal from './LoanDetailModal';

interface Loan {
  id: string; loanNumber: string; principalAmount: string; outstandingPrincipal: string;
  installmentAmount: string; status: string; assetClassification: string;
  disbursedAt?: string | null; nextDueDate?: string | null;
  client: { fullName: string; phoneNumber: string };
  loanProduct: { name: string };
  branch: { name: string };
}

const STATUSES = ['', 'ACTIVE', 'CLOSED', 'SETTLED', 'WRITTEN_OFF', 'FORECLOSED'];

const fmtDate = (v?: string | null): string =>
  v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// Short, readable RBI asset-classification labels for the Bucket column.
const BUCKET_LABEL: Record<string, string> = {
  STANDARD: 'Standard',
  SPECIAL_MENTION_0: 'SMA-0',
  SPECIAL_MENTION_1: 'SMA-1',
  SPECIAL_MENTION_2: 'SMA-2',
  NON_PERFORMING: 'NPA',
  WRITTEN_OFF: 'Written off',
};
const bucketLabel = (v: string): string => BUCKET_LABEL[v] ?? v.replaceAll('_', ' ');

export default function LoansPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState('ACTIVE');
  const [detailId, setDetailId] = useState<string | null>(null);
  const table = useServerTable();

  // Branch-scoped users (manager, field officer) only ever see their own
  // branch's loans, so the Branch column is redundant noise for them.
  const branchScoped = !!user?.branchId;

  const url = `/loans?${table.params}${status ? `&status=${status}` : ''}`;
  const { data, isLoading } = useQuery({
    queryKey: [url],
    queryFn: () => api.get(url).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const rows = (data?.data ?? []) as Loan[];
  const totalItems = (data?.pagination?.totalItems ?? 0) as number;

  const columns: Column<Loan>[] = [
    { header: 'Loan no.', render: (l) => <code>{l.loanNumber}</code>, sortKey: 'loanNumber' },
    { header: 'Client', render: (l) => <><strong>{l.client.fullName}</strong><div className="muted sm-text">{l.client.phoneNumber}</div></>, sortKey: 'client' },
    { header: 'Product', render: (l) => l.loanProduct.name, sortKey: 'product' },
    ...(branchScoped ? [] : [{ header: 'Branch', render: (l) => l.branch.name, sortKey: 'branch' } satisfies Column<Loan>]),
    { header: 'Principal', render: (l) => <span className="num">{inr(l.principalAmount)}</span>, sortKey: 'principalAmount' },
    { header: 'Outstanding', render: (l) => <span className="num">{inr(l.outstandingPrincipal)}</span>, sortKey: 'outstandingPrincipal' },
    { header: 'EMI', render: (l) => <span className="num">{inr(l.installmentAmount)}</span>, sortKey: 'installmentAmount' },
    { header: 'Disbursed', render: (l) => fmtDate(l.disbursedAt), sortKey: 'disbursedAt' },
    { header: 'Next due', render: (l) => l.status === 'ACTIVE' ? fmtDate(l.nextDueDate) : '—' },
    { header: 'Bucket', render: (l) => <span className={`pill pill-${l.assetClassification.toLowerCase()}`}>{bucketLabel(l.assetClassification)}</span>, sortKey: 'assetClassification' },
    { header: '', render: (l) => <button type="button" className="sm ghost" onClick={() => setDetailId(l.id)}>View</button> },
  ];

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Loans</h1>
          <p className="muted">{branchScoped ? `Loan book — ${user?.branch?.name ?? 'your branch'}` : 'Loan book across branches'}</p>
        </div>
        <select value={status} onChange={(e) => { setStatus(e.target.value); table.setPage(1); }}>
          {STATUSES.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
        </select>
      </header>
      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        empty="No loans match this filter."
        searchPlaceholder="Search by loan no., client, product or branch…"
        server={{
          page: table.page,
          pageSize: table.pageSize,
          totalItems,
          onPageChange: table.setPage,
          sort: table.sort,
          onSortChange: table.onSortChange,
          search: table.search,
          onSearchChange: table.onSearchChange,
        }}
      />

      {detailId && <LoanDetailModal loanId={detailId} onClose={() => setDetailId(null)} />}
    </>
  );
}
