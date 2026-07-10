import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { useServerTable } from '../../components/useServerTable';
import { inr } from '../../components/StatCard';
import ImportModal from '../../components/ImportModal';
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
interface PaymentRow {
  id: string; receiptNumber: string; amount: string; paymentMode: string; collectedAt: string; remarks: string | null;
  loan: { loanNumber: string; client: { fullName: string }; branch: { name: string } | null };
  collectedByEmployee: { fullName: string } | null;
}
interface ActiveLoanOption { id: string; loanNumber: string; client: { fullName: string }; assignedOfficer?: { fullName: string } | null }

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
const PAYMENT_MODES = ['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE'] as const;
const modeLabel = (m: string) => m.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const apiMessage = (err: unknown, fallback: string): string =>
  (axios.isAxiosError(err) && err.response?.data?.message) || fallback;

type Tab = 'collections' | 'payments' | 'verification' | 'offers';

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
  const canRecord = can(user?.role, 'collection:record');
  const showOffers = canDecide || canComplete || canClassify;

  const [tab, setTab] = useState<Tab>('collections');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'collections', label: 'Collections' },
    ...(canRecord ? [{ key: 'payments' as Tab, label: 'Payments' }] : []),
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
      {tab === 'payments' && canRecord && <PaymentsTab branchScoped={!!user?.branchId} />}
      {tab === 'verification' && <VerificationTab canVerify={canVerify} branchScoped={!!user?.branchId} />}
      {tab === 'offers' && showOffers && (
        <OffersTab canDecide={canDecide} canComplete={canComplete} canClassify={canClassify} />
      )}
    </>
  );
}

// ── Payments: collection ledger + record / edit / import ────────────────────
function PaymentsTab({ branchScoped }: { branchScoped: boolean }) {
  const queryClient = useQueryClient();
  const table = useServerTable({ initialSort: { key: 'collectedAt', direction: 'desc' } });
  const [recording, setRecording] = useState(false);
  const [editing, setEditing] = useState<PaymentRow | null>(null);
  const [importing, setImporting] = useState(false);

  const url = `/collections/payments?${table.params}`;
  const { data, isLoading } = useQuery({
    queryKey: [url],
    queryFn: () => api.get(url).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const rows = (data?.data ?? []) as PaymentRow[];
  const totalItems = (data?.pagination?.totalItems ?? 0) as number;
  const refresh = () => queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/collections/payments') });

  const columns: Column<PaymentRow>[] = [
    { header: 'Receipt', render: (p) => <code>{p.receiptNumber}</code>, sortKey: 'receiptNumber' },
    { header: 'Loan', render: (p) => <code>{p.loan.loanNumber}</code>, sortKey: 'loanNumber' },
    { header: 'Client', render: (p) => p.loan.client.fullName, sortKey: 'client' },
    ...(branchScoped ? [] : [{ header: 'Branch', render: (p) => p.loan.branch?.name ?? '—' } satisfies Column<PaymentRow>]),
    { header: 'Amount', render: (p) => <span className="num">{inr(p.amount)}</span>, sortKey: 'amount' },
    { header: 'Mode', render: (p) => modeLabel(p.paymentMode), sortKey: 'paymentMode' },
    { header: 'Collected by', render: (p) => p.collectedByEmployee?.fullName ?? '—' },
    { header: 'Date', render: (p) => fmtDateTime(p.collectedAt), sortKey: 'collectedAt' },
    { header: '', render: (p) => <button type="button" className="sm ghost" onClick={() => setEditing(p)}>Edit</button> },
  ];

  return (
    <>
      <div className="row" style={{ justifyContent: 'flex-end', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <button type="button" className="ghost" onClick={() => setImporting(true)}>Import</button>
        <button type="button" onClick={() => setRecording(true)}>Record payment</button>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        empty="No collections recorded yet."
        searchPlaceholder="Search by receipt, loan, client or officer…"
        server={{
          page: table.page, pageSize: table.pageSize, totalItems,
          onPageChange: table.setPage, sort: table.sort, onSortChange: table.onSortChange,
          search: table.search, onSearchChange: table.onSearchChange,
        }}
      />

      {recording && <RecordPaymentModal onClose={() => setRecording(false)} onDone={() => { setRecording(false); refresh(); }} />}
      {editing && <EditPaymentModal payment={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); refresh(); }} />}
      {importing && (
        <ImportModal
          title="Import collections"
          endpoint="/collections/payments/import"
          templateName="collections-template.csv"
          columns={[
            { field: 'loanNumber', header: 'loanNumber', example: 'LN-ABC12-3456', required: true },
            { field: 'amount', header: 'amount', example: '2500', required: true, numeric: true },
            { field: 'paymentMode', header: 'paymentMode', example: 'CASH', required: true },
            { field: 'collectedAt', header: 'collectedAt', example: '2026-07-10' },
            { field: 'remarks', header: 'remarks', example: 'EMI collection' },
          ]}
          onClose={() => setImporting(false)}
          onDone={refresh}
        />
      )}
    </>
  );
}

function RecordPaymentModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [loanId, setLoanId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<(typeof PAYMENT_MODES)[number]>('CASH');
  const [collectedAt, setCollectedAt] = useState('');
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');

  const { data: loans } = useQuery({
    queryKey: ['/loans', 'active-options'],
    queryFn: () => api.get('/loans?status=ACTIVE&pageSize=100&sortBy=loanNumber&sortOrder=asc').then((r) => r.data.data as ActiveLoanOption[]),
  });

  const record = useMutation({
    mutationFn: () =>
      api.post('/collections/payments/manual', {
        loanId,
        amount: Number(amount),
        paymentMode,
        collectedAt: collectedAt || undefined,
        remarks: remarks.trim() || undefined,
      }),
    onSuccess: onDone,
    onError: (err) => setError(apiMessage(err, 'Could not record the payment.')),
  });

  const disabled = !loanId || !amount || Number(amount) <= 0 || record.isPending;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head" style={{ width: '100%' }}>
          <h2>Record payment</h2>
          <button type="button" className="ghost sm" onClick={onClose}>Close</button>
        </div>
        <p className="muted sm-text" style={{ margin: 0 }}>Recorded against the loan's assigned field officer. Amount is allocated to the oldest unpaid installments.</p>

        <div className="form-grid" style={{ marginTop: '0.4rem' }}>
          <label className="span-all">Loan
            <select value={loanId} onChange={(e) => setLoanId(e.target.value)}>
              <option value="">Select an active loan</option>
              {(loans ?? []).map((l) => (
                <option key={l.id} value={l.id}>{l.loanNumber} · {l.client.fullName}{l.assignedOfficer ? ` · ${l.assignedOfficer.fullName}` : ''}</option>
              ))}
            </select>
          </label>
          <label>Amount (₹)
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="2500" />
          </label>
          <label>Mode
            <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as (typeof PAYMENT_MODES)[number])}>
              {PAYMENT_MODES.map((m) => <option key={m} value={m}>{modeLabel(m)}</option>)}
            </select>
          </label>
          <label>Date (optional)
            <input type="date" value={collectedAt} onChange={(e) => setCollectedAt(e.target.value)} />
          </label>
          <label>Remarks (optional)
            <input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="EMI collection" />
          </label>
        </div>

        {error && <div className="error-box">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button type="button" disabled={disabled} onClick={() => { setError(''); record.mutate(); }}>
            {record.isPending ? 'Recording…' : 'Record payment'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditPaymentModal({ payment, onClose, onDone }: { payment: PaymentRow; onClose: () => void; onDone: () => void }) {
  const [paymentMode, setPaymentMode] = useState<(typeof PAYMENT_MODES)[number]>(payment.paymentMode as (typeof PAYMENT_MODES)[number]);
  const [remarks, setRemarks] = useState(payment.remarks ?? '');
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: () => api.patch(`/collections/payments/${payment.id}`, { paymentMode, remarks: remarks.trim() }),
    onSuccess: onDone,
    onError: (err) => setError(apiMessage(err, 'Could not update the collection.')),
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head" style={{ width: '100%' }}>
          <h2>Edit collection {payment.receiptNumber}</h2>
          <button type="button" className="ghost sm" onClick={onClose}>Close</button>
        </div>
        <p className="muted sm-text" style={{ margin: 0 }}>
          {payment.loan.loanNumber} · {payment.loan.client.fullName} · {inr(payment.amount)}. The amount cannot be edited.
        </p>

        <label style={{ marginTop: '0.5rem' }}>Payment mode
          <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as (typeof PAYMENT_MODES)[number])}>
            {PAYMENT_MODES.map((m) => <option key={m} value={m}>{modeLabel(m)}</option>)}
          </select>
        </label>
        <label>Remarks
          <input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Add a note" />
        </label>

        {error && <div className="error-box">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button type="button" disabled={save.isPending} onClick={() => { setError(''); save.mutate(); }}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
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
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);
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
    onSuccess: (_data, variables) => {
      setBanner({ ok: true, text: variables.decision === 'APPROVED' ? 'Settlement offer approved.' : 'Settlement offer rejected.' });
      void invalidate();
    },
    onError: (err) => setBanner({ ok: false, text: apiMessage(err, 'Could not record the settlement decision.') }),
  });
  const complete = useMutation({
    mutationFn: (id: string) => api.post(`/settlements/${id}/complete`),
    onSuccess: () => {
      setBanner({ ok: true, text: 'Settlement completed and closure notice issued.' });
      void invalidate();
    },
    onError: (err) => setBanner({ ok: false, text: apiMessage(err, 'Could not complete the settlement.') }),
  });
  const classify = useMutation({
    mutationFn: () => api.post('/collections/jobs/classify-npa'),
    onSuccess: () => setBanner({ ok: true, text: 'Overdue and asset classification completed.' }),
    onError: (err) => setBanner({ ok: false, text: apiMessage(err, 'Could not run the NPA classification.') }),
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
          <button className="ghost" onClick={() => { setBanner(null); classify.mutate(); }} disabled={classify.isPending}>
            {classify.isPending ? 'Running…' : 'Run NPA classification'}
          </button>
        </div>
      )}
      {banner && <div className={banner.ok ? 'success-box' : 'error-box'} style={{ marginBottom: '1rem' }}>{banner.text}</div>}
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
