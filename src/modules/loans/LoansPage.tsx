import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { useServerTable } from '../../components/useServerTable';
import { inr } from '../../components/StatCard';
import ImportModal from '../../components/ImportModal';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import LoanDetailModal from './LoanDetailModal';

interface Loan {
  id: string; loanNumber: string; principalAmount: string; outstandingPrincipal: string;
  installmentAmount: string; status: string; assetClassification: string;
  disbursedAt?: string | null; nextDueDate?: string | null;
  client: { fullName: string; phoneNumber: string };
  loanProduct: { name: string };
  branch: { name: string };
  assignedOfficer?: { id: string; fullName: string } | null;
}
interface ClientOption { id: string; fullName: string; clientCode: string; kycStatus: string; isBlacklisted: boolean; branchId: string }
interface ProductOption { id: string; name: string; minimumAmount: string; maximumAmount: string; minimumTenureMonths: number; maximumTenureMonths: number }
interface EmployeeOption { id: string; fullName: string; designation: string | null; branchId?: string | null }

const STATUSES = ['', 'ACTIVE', 'CLOSED', 'SETTLED', 'WRITTEN_OFF', 'FORECLOSED'];

const fmtDate = (v?: string | null): string =>
  v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const apiMessage = (err: unknown, fallback: string): string =>
  (axios.isAxiosError(err) && err.response?.data?.message) || fallback;

const BUCKET_LABEL: Record<string, string> = {
  STANDARD: 'Standard', SPECIAL_MENTION_0: 'SMA-0', SPECIAL_MENTION_1: 'SMA-1',
  SPECIAL_MENTION_2: 'SMA-2', NON_PERFORMING: 'NPA', WRITTEN_OFF: 'Written off',
};
const bucketLabel = (v: string): string => BUCKET_LABEL[v] ?? v.replaceAll('_', ' ');

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Active', CLOSED: 'Closed', SETTLED: 'Settled',
  WRITTEN_OFF: 'Written off', FORECLOSED: 'Foreclosed',
};
const statusLabel = (v: string): string => STATUS_LABEL[v] ?? v.replaceAll('_', ' ');

export default function LoansPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState('ACTIVE');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Loan | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const table = useServerTable();
  const queryClient = useQueryClient();

  const branchScoped = !!user?.branchId;
  const canCreate = can(user?.role, 'loan:create');
  const canEdit = can(user?.role, 'loan:edit');

  const url = `/loans?${table.params}${status ? `&status=${status}` : ''}`;
  const { data, isLoading } = useQuery({
    queryKey: [url],
    queryFn: () => api.get(url).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const rows = (data?.data ?? []) as Loan[];
  const totalItems = (data?.pagination?.totalItems ?? 0) as number;

  const refresh = () => queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/loans') });

  const columns: Column<Loan>[] = [
    { header: 'Loan no.', render: (l) => <code>{l.loanNumber}</code>, sortKey: 'loanNumber' },
    { header: 'Client', render: (l) => <><strong>{l.client.fullName}</strong><div className="muted sm-text">{l.client.phoneNumber}</div></>, sortKey: 'client' },
    { header: 'Product', render: (l) => l.loanProduct.name, sortKey: 'product' },
    { header: 'Status', render: (l) => <span className={`pill pill-${l.status.toLowerCase()}`}>{statusLabel(l.status)}</span>, sortKey: 'status' },
    ...(branchScoped ? [] : [{ header: 'Branch', render: (l) => l.branch.name, sortKey: 'branch' } satisfies Column<Loan>]),
    { header: 'Principal', render: (l) => <span className="num">{inr(l.principalAmount)}</span>, sortKey: 'principalAmount' },
    { header: 'Outstanding', render: (l) => <span className="num">{inr(l.outstandingPrincipal)}</span>, sortKey: 'outstandingPrincipal' },
    { header: 'EMI', render: (l) => <span className="num">{inr(l.installmentAmount)}</span>, sortKey: 'installmentAmount' },
    { header: 'Officer', render: (l) => l.assignedOfficer?.fullName ?? <span className="muted">Unassigned</span> },
    { header: 'Disbursed', render: (l) => fmtDate(l.disbursedAt), sortKey: 'disbursedAt' },
    { header: 'Bucket', render: (l) => <span className={`pill pill-${l.assetClassification.toLowerCase()}`}>{bucketLabel(l.assetClassification)}</span>, sortKey: 'assetClassification' },
    {
      header: '', render: (l) => (
        <div className="row-actions">
          <button type="button" className="sm ghost" onClick={() => setDetailId(l.id)}>View</button>
          {canEdit && <button type="button" className="sm ghost" onClick={() => setEditing(l)}>Edit</button>}
        </div>
      ),
    },
  ];

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Loans</h1>
          <p className="muted">{branchScoped ? `Loan book — ${user?.branch?.name ?? 'your branch'}` : 'Loan book across branches'}</p>
        </div>
        <div className="row-actions">
          <select value={status} onChange={(e) => { setStatus(e.target.value); table.setPage(1); }}>
            {STATUSES.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
          </select>
          {canCreate && <button type="button" className="ghost" onClick={() => setShowImport(true)}>Import</button>}
          {canCreate && <button type="button" onClick={() => setShowCreate(true)}>New loan</button>}
        </div>
      </header>
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

      {detailId && <LoanDetailModal loanId={detailId} onClose={() => setDetailId(null)} />}
      {showCreate && <NewLoanModal onClose={() => setShowCreate(false)} onDone={() => { setShowCreate(false); refresh(); }} />}
      {editing && <EditLoanModal loan={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); refresh(); }} />}
      {showImport && (
        <ImportModal
          title="Import loans"
          endpoint="/loans/import"
          templateName="loans-template.csv"
          columns={[
            { field: 'clientCode', header: 'clientCode', example: 'CL-ABC12-3456', required: true },
            { field: 'productName', header: 'productName', example: 'Micro Business Loan', required: true },
            { field: 'requestedAmount', header: 'requestedAmount', example: '50000', required: true, numeric: true },
            { field: 'tenureMonths', header: 'tenureMonths', example: '12', required: true, numeric: true },
            { field: 'purpose', header: 'purpose', example: 'Working capital' },
            { field: 'officerCode', header: 'officerCode', example: 'EMP-XXXX-0000' },
          ]}
          onClose={() => setShowImport(false)}
          onDone={refresh}
        />
      )}
    </>
  );
}

// ── New loan (quick-create: application → approve → disburse) ────────────────
function NewLoanModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [clientId, setClientId] = useState('');
  const [loanProductId, setLoanProductId] = useState('');
  const [requestedAmount, setRequestedAmount] = useState('');
  const [tenureMonths, setTenureMonths] = useState('12');
  const [purpose, setPurpose] = useState('');
  const [assignedOfficerId, setAssignedOfficerId] = useState('');
  const [firstDueDate, setFirstDueDate] = useState('');
  const [error, setError] = useState('');

  const { data: clients } = useQuery({
    queryKey: ['/clients', 'loan-options'],
    queryFn: () => api.get('/clients?pageSize=100').then((r) => r.data.data as ClientOption[]),
  });
  const { data: products } = useQuery({
    queryKey: ['/loans/products'],
    queryFn: () => api.get('/loans/products').then((r) => r.data.data as ProductOption[]),
  });
  const { data: employees } = useQuery({
    queryKey: ['/employees', 'loan-options'],
    queryFn: () => api.get('/employees?pageSize=100').then((r) => r.data.data as EmployeeOption[]),
  });

  // Only KYC-verified, non-blacklisted clients are eligible (backend enforces this too).
  const eligibleClients = useMemo(
    () => (clients ?? []).filter((c) => c.kycStatus === 'VERIFIED' && !c.isBlacklisted),
    [clients],
  );
  const selectedClient = eligibleClients.find((c) => c.id === clientId);
  const selectedProduct = (products ?? []).find((p) => p.id === loanProductId);
  // Officers in the selected client's branch (falls back to all if branch unknown).
  const officerOptions = useMemo(
    () => (employees ?? []).filter((e) => !selectedClient || !e.branchId || e.branchId === selectedClient.branchId),
    [employees, selectedClient],
  );

  const create = useMutation({
    mutationFn: () =>
      api.post('/loans', {
        clientId, loanProductId,
        requestedAmount: Number(requestedAmount),
        tenureMonths: Number(tenureMonths),
        purpose: purpose.trim() || undefined,
        assignedOfficerId: assignedOfficerId || undefined,
        firstDueDate: firstDueDate || undefined,
      }),
    onSuccess: onDone,
    onError: (err) => setError(apiMessage(err, 'Could not create the loan.')),
  });

  const disabled = !clientId || !loanProductId || !requestedAmount || !tenureMonths || create.isPending;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head" style={{ width: '100%' }}>
          <h2>New loan</h2>
          <button type="button" className="ghost sm" onClick={onClose}>Close</button>
        </div>
        <p className="muted sm-text" style={{ margin: 0 }}>Creates the application, approves and disburses it in one step. Only KYC-verified clients are eligible.</p>

        <div className="form-grid" style={{ marginTop: '0.4rem' }}>
          <label className="span-all">Client
            <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Select a client</option>
              {eligibleClients.map((c) => <option key={c.id} value={c.id}>{c.fullName} · {c.clientCode}</option>)}
            </select>
          </label>
          <label>Product
            <select value={loanProductId} onChange={(e) => setLoanProductId(e.target.value)}>
              <option value="">Select a product</option>
              {(products ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label>Amount (₹)
            <input inputMode="numeric" value={requestedAmount} onChange={(e) => setRequestedAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="50000" />
          </label>
          <label>Tenure (months)
            <input inputMode="numeric" value={tenureMonths} onChange={(e) => setTenureMonths(e.target.value.replace(/[^0-9]/g, ''))} />
          </label>
          <label>Field officer (optional)
            <select value={assignedOfficerId} onChange={(e) => setAssignedOfficerId(e.target.value)}>
              <option value="">Assign later</option>
              {officerOptions.map((e) => <option key={e.id} value={e.id}>{e.fullName}{e.designation ? ` · ${e.designation}` : ''}</option>)}
            </select>
          </label>
          <label>First EMI due (optional)
            <input type="date" value={firstDueDate} onChange={(e) => setFirstDueDate(e.target.value)} />
          </label>
          <label className="span-all">Purpose (optional)
            <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Working capital" />
          </label>
        </div>

        {selectedProduct && (
          <p className="muted sm-text" style={{ margin: 0 }}>
            {selectedProduct.name}: ₹{Number(selectedProduct.minimumAmount).toLocaleString('en-IN')}–₹{Number(selectedProduct.maximumAmount).toLocaleString('en-IN')}, {selectedProduct.minimumTenureMonths}–{selectedProduct.maximumTenureMonths} months.
          </p>
        )}
        {error && <div className="error-box">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button type="button" disabled={disabled} onClick={() => { setError(''); create.mutate(); }}>
            {create.isPending ? 'Creating…' : 'Create loan'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit loan (officer + purpose only — never the financials) ───────────────
function EditLoanModal({ loan, onClose, onDone }: { loan: Loan; onClose: () => void; onDone: () => void }) {
  const [assignedOfficerId, setAssignedOfficerId] = useState(loan.assignedOfficer?.id ?? '');
  const [purpose, setPurpose] = useState('');
  const [error, setError] = useState('');

  const { data: employees } = useQuery({
    queryKey: ['/employees', 'loan-options'],
    queryFn: () => api.get('/employees?pageSize=100').then((r) => r.data.data as EmployeeOption[]),
  });

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/loans/${loan.id}`, {
        assignedOfficerId: assignedOfficerId || undefined,
        purpose: purpose.trim() || undefined,
      }),
    onSuccess: onDone,
    onError: (err) => setError(apiMessage(err, 'Could not update the loan.')),
  });

  const nothingToSave = !assignedOfficerId && purpose.trim() === '';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head" style={{ width: '100%' }}>
          <h2>Edit loan {loan.loanNumber}</h2>
          <button type="button" className="ghost sm" onClick={onClose}>Close</button>
        </div>
        <p className="muted sm-text" style={{ margin: 0 }}>Customer: {loan.client.fullName}. Financial terms cannot be changed after disbursal.</p>

        <label style={{ marginTop: '0.5rem' }}>Field officer
          <select value={assignedOfficerId} onChange={(e) => setAssignedOfficerId(e.target.value)}>
            <option value="">Unassigned</option>
            {(employees ?? []).map((e) => <option key={e.id} value={e.id}>{e.fullName}{e.designation ? ` · ${e.designation}` : ''}</option>)}
          </select>
        </label>
        <label>Purpose
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Leave blank to keep unchanged" />
        </label>

        {error && <div className="error-box">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button type="button" disabled={save.isPending || nothingToSave} onClick={() => { setError(''); save.mutate(); }}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
