import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
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

  const { data, isLoading } = useQuery({
    queryKey: ['loans', status],
    queryFn: () => api.get(`/loans?pageSize=100${status ? `&status=${status}` : ''}`).then((r) => r.data.data as Loan[]),
  });

  const columns: Column<Loan>[] = [
    { header: 'Loan no.', render: (l) => <code>{l.loanNumber}</code>, sortValue: (l) => l.loanNumber },
    { header: 'Client', render: (l) => <><strong>{l.client.fullName}</strong><div className="muted sm-text">{l.client.phoneNumber}</div></>, sortValue: (l) => `${l.client.fullName} ${l.client.phoneNumber}` },
    { header: 'Product', render: (l) => l.loanProduct.name, sortValue: (l) => l.loanProduct.name },
    { header: 'Branch', render: (l) => l.branch.name, sortValue: (l) => l.branch.name },
    { header: 'Principal', render: (l) => <span className="num">{inr(l.principalAmount)}</span>, sortValue: (l) => Number(l.principalAmount) },
    { header: 'Outstanding', render: (l) => <span className="num">{inr(l.outstandingPrincipal)}</span>, sortValue: (l) => Number(l.outstandingPrincipal) },
    { header: 'EMI', render: (l) => <span className="num">{inr(l.installmentAmount)}</span>, sortValue: (l) => Number(l.installmentAmount) },
    { header: 'Bucket', render: (l) => <span className={`pill pill-${l.assetClassification.toLowerCase()}`}>{l.assetClassification.replace('_', '-')}</span>, sortValue: (l) => l.assetClassification },
  ];

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Loans</h1>
          <p className="muted">Loan book across branches</p>
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
        </select>
      </header>
      <DataTable columns={columns} rows={data ?? []} loading={isLoading} empty="No loans match this filter." />
    </>
  );
}
