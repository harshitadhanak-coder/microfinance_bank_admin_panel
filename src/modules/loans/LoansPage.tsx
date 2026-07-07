import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { useServerTable } from '../../components/useServerTable';
import { inr } from '../../components/StatCard';

interface Loan {
  id: string; loanNumber: string; principalAmount: string; outstandingPrincipal: string;
  installmentAmount: string; status: string; assetClassification: string;
  client: { fullName: string; phoneNumber: string };
  loanProduct: { name: string };
  branch: { name: string };
}

const STATUSES = ['', 'ACTIVE', 'CLOSED', 'SETTLED', 'WRITTEN_OFF', 'FORECLOSED'];

export default function LoansPage() {
  const [status, setStatus] = useState('ACTIVE');
  const table = useServerTable();

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
    { header: 'Branch', render: (l) => l.branch.name, sortKey: 'branch' },
    { header: 'Principal', render: (l) => <span className="num">{inr(l.principalAmount)}</span>, sortKey: 'principalAmount' },
    { header: 'Outstanding', render: (l) => <span className="num">{inr(l.outstandingPrincipal)}</span>, sortKey: 'outstandingPrincipal' },
    { header: 'EMI', render: (l) => <span className="num">{inr(l.installmentAmount)}</span>, sortKey: 'installmentAmount' },
    { header: 'Bucket', render: (l) => <span className={`pill pill-${l.assetClassification.toLowerCase()}`}>{l.assetClassification.replace('_', '-')}</span>, sortKey: 'assetClassification' },
  ];

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Loans</h1>
          <p className="muted">Loan book across branches</p>
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
    </>
  );
}
