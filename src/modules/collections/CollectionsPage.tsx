import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { useServerTable } from '../../components/useServerTable';
import { inr } from '../../components/StatCard';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';

// ── Shared types ────────────────────────────────────────────────────────────
interface CollectionLoan {
  id: string;
  loanNumber: string;
  outstandingPrincipal: string;
  installmentAmount: string;
  status: string;
  nextDueDate?: string | null;
  client: { fullName: string; phoneNumber: string };
  assignedOfficer: { id: string; fullName: string } | null;
}
interface Employee { id: string; fullName: string; employeeCode: string; designation: string | null }
interface DayEndSettlement {
  id: string;
  businessDate: string;
  totalCashCollected: string;
  totalCashDeposited: string;
  varianceAmount: string;
  approvedById: string | null;
  employee: { fullName: string; employeeCode: string; branch: { name: string } | null };
}
interface SettlementOffer {
  id: string; settlementType: string; status: string; settlementAmount: string; waiverAmount: string;
  loan: { loanNumber: string; client: { fullName: string }; branch: { name: string } };
}

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const apiMessage = (err: unknown, fallback: string): string =>
  (axios.isAxiosError(err) && err.response?.data?.message) || fallback;

type Tab = 'collections' | 'verification' | 'offers';

/**
 * Collections & Settlements — the branch manager's one screen for field-officer
 * oversight:
 *   • Collections   — assign each active loan to a field officer for collection.
 *   • Verification  — accept each officer's day-end cash against the expected total.
 *   • Offers        — approve/complete settlement offers and run NPA classification
 *                     (HQ & accounts only).
 */
export default function CollectionsPage() {
  const { user } = useAuth();

  const canLink = can(user?.role, 'loan:link');
  const canVerify = can(user?.role, 'settlement:verify');
  const canDecide = can(user?.role, 'settlement:decide');
  const canComplete = can(user?.role, 'settlement:complete');
  const canClassify = can(user?.role, 'collection:classify');
  const showOffers = canDecide || canComplete || canClassify;

  const [tab, setTab] = useState<Tab>('collections');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'collections', label: 'Collections' },
    { key: 'verification', label: 'Settlement verification' },
    ...(showOffers ? [{ key: 'offers' as Tab, label: 'Settlement offers' }] : []),
  ];

  return (
    <>
      <header className="page-head">
        <h1>Collections &amp; Settlements</h1>
        <p className="muted">
          Assign loans to field officers and verify their day-end cash.
          {user?.branch ? ` — ${user.branch.name}` : ''}
        </p>
      </header>

      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.key} type="button" className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'collections' && <CollectionsTab canLink={canLink} />}
      {tab === 'verification' && <VerificationTab canVerify={canVerify} branchScoped={!!user?.branchId} />}
      {tab === 'offers' && showOffers && (
        <OffersTab canDecide={canDecide} canComplete={canComplete} canClassify={canClassify} />
      )}
    </>
  );
}

// ── Collections: active loans + assign field officer ────────────────────────
function CollectionsTab({ canLink }: { canLink: boolean }) {
  const queryClient = useQueryClient();
  const table = useServerTable({ initialSort: { key: 'loanNumber', direction: 'asc' } });
  const [assignFor, setAssignFor] = useState<CollectionLoan | null>(null);

  const url = `/loans?${table.params}&status=ACTIVE`;
  const { data, isLoading } = useQuery({
    queryKey: [url],
    queryFn: () => api.get(url).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const rows = (data?.data ?? []) as CollectionLoan[];
  const totalItems = (data?.pagination?.totalItems ?? 0) as number;

  const { data: employees } = useQuery({
    queryKey: ['/employees', 'options'],
    queryFn: () => api.get('/employees?pageSize=100').then((r) => r.data.data as Employee[]),
    enabled: canLink,
  });

  const columns: Column<CollectionLoan>[] = [
    { header: 'Loan no.', render: (l) => <code>{l.loanNumber}</code>, sortKey: 'loanNumber' },
    { header: 'Client', render: (l) => <><strong>{l.client.fullName}</strong><div className="muted sm-text">{l.client.phoneNumber}</div></>, sortKey: 'client' },
    { header: 'Outstanding', render: (l) => <span className="num">{inr(l.outstandingPrincipal)}</span>, sortKey: 'outstandingPrincipal' },
    { header: 'EMI', render: (l) => <span className="num">{inr(l.installmentAmount)}</span>, sortKey: 'installmentAmount' },
    { header: 'Next due', render: (l) => fmtDate(l.nextDueDate) },
    {
      header: 'Field officer',
      render: (l) =>
        l.assignedOfficer
          ? <span className="pill pill-approved">{l.assignedOfficer.fullName}</span>
          : <span className="pill pill-new">Unassigned</span>,
    },
    ...(canLink
      ? [{ header: '', render: (l: CollectionLoan) => <button type="button" className="sm ghost" onClick={() => setAssignFor(l)}>{l.assignedOfficer ? 'Reassign' : 'Assign'}</button> } satisfies Column<CollectionLoan>]
      : []),
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        empty="No active loans to collect yet."
        searchPlaceholder="Search by loan no. or client…"
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

      {assignFor && (
        <AssignModal
          loan={assignFor}
          employees={employees ?? []}
          onClose={() => setAssignFor(null)}
          onDone={() => {
            setAssignFor(null);
            void queryClient.invalidateQueries({ queryKey: [url] });
          }}
        />
      )}
    </>
  );
}

function AssignModal({
  loan,
  employees,
  onClose,
  onDone,
}: {
  loan: CollectionLoan;
  employees: Employee[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [officerId, setOfficerId] = useState(loan.assignedOfficer?.id ?? '');
  const [error, setError] = useState('');

  const assign = useMutation({
    mutationFn: () => api.patch(`/loans/${loan.id}/assign-officer`, { assignedOfficerId: officerId }),
    onSuccess: onDone,
    onError: (err) => setError(apiMessage(err, 'Could not assign the loan.')),
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head" style={{ width: '100%' }}>
          <h2>Assign loan {loan.loanNumber}</h2>
          <button type="button" className="ghost sm" onClick={onClose}>Close</button>
        </div>
        <p className="muted sm-text" style={{ margin: 0 }}>Customer: {loan.client.fullName}</p>

        <label style={{ marginTop: '0.6rem' }}>
          Field officer
          <select value={officerId} onChange={(e) => setOfficerId(e.target.value)}>
            <option value="">Select a field officer</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.fullName}{e.designation ? ` · ${e.designation}` : ''}</option>
            ))}
          </select>
        </label>

        {error && <div className="error-box" style={{ marginTop: '0.6rem' }}>{error}</div>}

        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button type="button" disabled={!officerId || assign.isPending} onClick={() => { setError(''); assign.mutate(); }}>
            {assign.isPending ? 'Assigning…' : 'Assign loan'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Settlement verification: day-end cash ───────────────────────────────────
function VerificationTab({ canVerify, branchScoped }: { canVerify: boolean; branchScoped: boolean }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('PENDING');
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);

  const url = `/collections/settlements${status ? `?status=${status}` : ''}`;
  const { data, isLoading } = useQuery({
    queryKey: [url],
    queryFn: () => api.get(url).then((r) => r.data.data as DayEndSettlement[]),
  });
  const rows = data ?? [];

  const accept = useMutation({
    mutationFn: (id: string) => api.post(`/collections/settlements/${id}/accept`),
    onSuccess: () => {
      setBanner({ ok: true, text: 'Settlement accepted and locked for that officer.' });
      void queryClient.invalidateQueries({ queryKey: [url] });
    },
    onError: (err) => setBanner({ ok: false, text: apiMessage(err, 'Could not accept the settlement.') }),
  });

  const statusPill = (s: DayEndSettlement) => {
    if (!s.approvedById) {
      return Number(s.varianceAmount) !== 0
        ? <span className="pill pill-rejected">Discrepancy</span>
        : <span className="pill pill-new">Pending</span>;
    }
    return <span className="pill pill-approved">Accepted</span>;
  };

  const columns: Column<DayEndSettlement>[] = [
    { header: 'Field officer', render: (s) => <><strong>{s.employee.fullName}</strong><div className="muted sm-text">{s.employee.employeeCode}</div></>, sortValue: (s) => s.employee.fullName },
    ...(branchScoped ? [] : [{ header: 'Branch', render: (s) => s.employee.branch?.name ?? '—', sortValue: (s) => s.employee.branch?.name ?? '' } satisfies Column<DayEndSettlement>]),
    { header: 'Date', render: (s) => fmtDate(s.businessDate), sortValue: (s) => new Date(s.businessDate) },
    { header: 'Expected cash', render: (s) => <span className="num">{inr(s.totalCashCollected)}</span>, sortValue: (s) => Number(s.totalCashCollected) },
    { header: 'Declared', render: (s) => <span className="num">{inr(s.totalCashDeposited)}</span>, sortValue: (s) => Number(s.totalCashDeposited) },
    {
      header: 'Difference',
      render: (s) => {
        const v = Number(s.varianceAmount);
        const cls = v === 0 ? '' : v > 0 ? 'pill pill-rejected' : 'pill pill-sma_0';
        const text = v === 0 ? '—' : v > 0 ? `Short ${inr(Math.abs(v))}` : `Excess ${inr(Math.abs(v))}`;
        return v === 0 ? <span className="muted">—</span> : <span className={cls}>{text}</span>;
      },
      sortValue: (s) => Number(s.varianceAmount),
    },
    { header: 'Status', render: (s) => statusPill(s) },
    ...(canVerify
      ? [{
          header: '',
          render: (s: DayEndSettlement) =>
            s.approvedById
              ? <span className="muted sm-text">Locked</span>
              : <button type="button" className="sm" disabled={accept.isPending} onClick={() => { setBanner(null); accept.mutate(s.id); }}>Accept</button>,
        } satisfies Column<DayEndSettlement>]
      : []),
  ];

  return (
    <>
      <div className="row" style={{ justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="PENDING">Pending</option>
          <option value="ACCEPTED">Accepted</option>
          <option value="">All</option>
        </select>
      </div>

      {banner && <div className={banner.ok ? 'success-box' : 'error-box'} style={{ marginBottom: '1rem' }}>{banner.text}</div>}

      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        empty={status === 'PENDING' ? 'No settlements waiting to be verified.' : 'No settlements found.'}
        searchPlaceholder="Search by field officer…"
      />
    </>
  );
}

// ── Settlement offers + NPA classification (HQ & accounts) ──────────────────
function OffersTab({ canDecide, canComplete, canClassify }: { canDecide: boolean; canComplete: boolean; canClassify: boolean }) {
  const qc = useQueryClient();
  const table = useServerTable();
  const url = `/settlements?${table.params}`;
  const { data, isLoading } = useQuery({
    queryKey: [url],
    queryFn: () => api.get(url).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const rows = (data?.data ?? []) as SettlementOffer[];
  const totalItems = (data?.pagination?.totalItems ?? 0) as number;

  const invalidate = () =>
    qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/settlements') });

  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'APPROVED' | 'REJECTED' }) =>
      api.post(`/settlements/${id}/decision`, { decision }),
    onSuccess: invalidate,
  });
  const complete = useMutation({
    mutationFn: (id: string) => api.post(`/settlements/${id}/complete`),
    onSuccess: invalidate,
  });
  const classify = useMutation({
    mutationFn: () => api.post('/collections/jobs/classify-npa'),
  });

  const columns: Column<SettlementOffer>[] = [
    { header: 'Loan', render: (s) => <code>{s.loan.loanNumber}</code>, sortKey: 'loanNumber' },
    { header: 'Client', render: (s) => s.loan.client.fullName, sortKey: 'client' },
    { header: 'Branch', render: (s) => s.loan.branch.name, sortKey: 'branch' },
    { header: 'Type', render: (s) => s.settlementType.replace('_', ' '), sortKey: 'settlementType' },
    { header: 'Amount', render: (s) => <span className="num">{inr(s.settlementAmount)}</span>, sortKey: 'settlementAmount' },
    { header: 'Waiver', render: (s) => <span className="num">{inr(s.waiverAmount)}</span>, sortKey: 'waiverAmount' },
    { header: 'Status', render: (s) => <span className={`pill pill-${s.status.toLowerCase()}`}>{s.status.replace('_', ' ')}</span>, sortKey: 'status' },
  ];

  if (canDecide || canComplete) {
    columns.push({
      header: 'Actions',
      render: (s) => {
        const decidable = canDecide && s.status === 'PENDING_APPROVAL';
        const completable = canComplete && s.status === 'APPROVED';
        if (!decidable && !completable) return <span className="muted">—</span>;
        return (
          <div className="row-actions">
            {decidable && (
              <>
                <button className="sm" onClick={() => decide.mutate({ id: s.id, decision: 'APPROVED' })}>Approve</button>
                <button className="sm ghost" onClick={() => decide.mutate({ id: s.id, decision: 'REJECTED' })}>Reject</button>
              </>
            )}
            {completable && (
              <button className="sm" onClick={() => complete.mutate(s.id)}>Complete &amp; issue NOC</button>
            )}
          </div>
        );
      },
    });
  }

  return (
    <>
      {canClassify && (
        <div className="row" style={{ justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
          <button className="ghost" onClick={() => classify.mutate()} disabled={classify.isPending}>
            {classify.isPending ? 'Running…' : 'Run NPA classification'}
          </button>
        </div>
      )}
      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        empty="No settlement offers pending."
        searchPlaceholder="Search by loan no., client or branch…"
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
