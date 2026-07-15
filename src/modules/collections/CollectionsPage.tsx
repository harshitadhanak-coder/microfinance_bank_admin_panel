import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FilterBar } from '../../components/FilterBar';
import { ActionMenu } from '../../components/ActionMenu';
import { Drawer } from '../../components/Drawer';
import { Modal } from '../../components/Modal';
import ImportModal from '../../components/ImportModal';
import { useServerTable } from '../../components/useServerTable';
import { useToast } from '../../components/Toast';
import { Banknote, Eye, Pencil, Plus } from '../../components/icons';
import { inr, fmtDate, apiMessage } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import { ActiveLoanOption, PAYMENT_MODES, PaymentMode, PaymentRow, modeLabel } from './shared';

const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

/**
 * Collections — List. The payment ledger split out of the old "Collections &
 * Settlements" mega-page: every recorded collection, with manual record / edit /
 * import. Amounts are always allocated by the backend allocation engine to the
 * oldest unpaid installments — never created directly. Officer-assignment moved
 * to Loans › Assignments; day-end cash verification to Day-End Settlements.
 */
export default function CollectionsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const table = useServerTable({ initialSort: { key: 'collectedAt', direction: 'desc' } });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [recording, setRecording] = useState(false);
  const [editing, setEditing] = useState<PaymentRow | null>(null);
  const [peek, setPeek] = useState<PaymentRow | null>(null);
  const [importing, setImporting] = useState(false);

  const branchScoped = !!user?.branchId;
  const canRecord = can(user?.role, 'collection:record');

  const url = `/collections/payments?${table.params}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`;
  const { data, isLoading } = useQuery({
    queryKey: [url],
    queryFn: () => api.get(url).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const rows = (data?.data ?? []) as PaymentRow[];
  const totalItems = (data?.pagination?.totalItems ?? 0) as number;
  const refresh = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/collections/payments') });

  const columns: Column<PaymentRow>[] = [
    { header: 'Receipt', render: (p) => <a className="cell-link" onClick={() => setPeek(p)}><code>{p.receiptNumber}</code></a>, sortKey: 'receiptNumber' },
    { header: 'Loan', render: (p) => <code>{p.loan.loanNumber}</code>, sortKey: 'loanNumber' },
    { header: 'Client', render: (p) => p.loan.client.fullName, sortKey: 'client' },
    ...(branchScoped ? [] : [{ header: 'Branch', render: (p) => p.loan.branch?.name ?? '—' } satisfies Column<PaymentRow>]),
    { header: 'Amount', render: (p) => <span className="num">{inr(p.amount)}</span>, sortKey: 'amount' },
    { header: 'Mode', render: (p) => modeLabel(p.paymentMode), sortKey: 'paymentMode' },
    { header: 'Collected by', render: (p) => p.collectedByEmployee?.fullName ?? '—' },
    { header: 'Date', render: (p) => fmtDateTime(p.collectedAt), sortKey: 'collectedAt' },
    {
      header: '',
      render: (p) => (
        <div className="actions-cell">
          <ActionMenu
            items={[
              { key: 'view', label: 'View details', icon: <Eye size={15} />, onSelect: () => setPeek(p) },
              ...(canRecord ? [{ key: 'edit', label: 'Edit', icon: <Pencil size={15} />, onSelect: () => setEditing(p) }] : []),
            ]}
          />
        </div>
      ),
    },
  ];

  const chips = [
    ...(from ? [{ key: 'from', label: `From: ${fmtDate(from)}`, onRemove: () => { setFrom(''); table.setPage(1); } }] : []),
    ...(to ? [{ key: 'to', label: `To: ${fmtDate(to)}`, onRemove: () => { setTo(''); table.setPage(1); } }] : []),
  ];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Operations' }, { label: 'Collections' }]}
        title="Collections"
        subtitle={<>Recorded loan repayments{user?.branch ? ` — ${user.branch.name}` : ''}</>}
        actions={canRecord && (
          <>
            <button className="ghost" onClick={() => setImporting(true)}>Import</button>
            <button className="btn-lg" onClick={() => setRecording(true)}><Plus size={16} /> Record payment</button>
          </>
        )}
      />

      <FilterBar chips={chips} onReset={chips.length ? () => { setFrom(''); setTo(''); table.setPage(1); } : undefined}>
        <label>From
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); table.setPage(1); }} aria-label="Collected from date" />
        </label>
        <label>To
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); table.setPage(1); }} aria-label="Collected to date" />
        </label>
      </FilterBar>

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

      {peek && (
        <Drawer
          onClose={() => setPeek(null)}
          title={<code>{peek.receiptNumber}</code>}
          subtitle={`${peek.loan.loanNumber} · ${peek.loan.client.fullName}`}
          footer={<button onClick={() => setPeek(null)}>Close</button>}
        >
          <dl className="detail-list one-col">
            <div><dt>Amount</dt><dd><strong className="num">{inr(peek.amount)}</strong></dd></div>
            <div><dt>Mode</dt><dd>{modeLabel(peek.paymentMode)}</dd></div>
            <div><dt>Loan</dt><dd><code>{peek.loan.loanNumber}</code></dd></div>
            <div><dt>Client</dt><dd>{peek.loan.client.fullName}</dd></div>
            {peek.loan.branch && <div><dt>Branch</dt><dd>{peek.loan.branch.name}</dd></div>}
            <div><dt>Collected by</dt><dd>{peek.collectedByEmployee?.fullName ?? '—'}</dd></div>
            <div><dt>Collected at</dt><dd>{fmtDateTime(peek.collectedAt)}</dd></div>
            <div><dt>Remarks</dt><dd>{peek.remarks || '—'}</dd></div>
          </dl>
          <p className="muted sm-text" style={{ marginTop: '0.75rem' }}>
            The amount was allocated by the collection engine to this loan's oldest unpaid installments.
          </p>
          {canRecord && (
            <div className="row-actions" style={{ marginTop: '0.75rem' }}>
              <button className="sm ghost" onClick={() => { setEditing(peek); setPeek(null); }}><Pencil size={14} /> Edit</button>
            </div>
          )}
        </Drawer>
      )}

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

// ── Record a manual payment ─────────────────────────────────────────────────
function RecordPaymentModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [loanId, setLoanId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [collectedAt, setCollectedAt] = useState('');
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');

  const { data: loans } = useQuery({
    queryKey: ['/loans', 'active-options'],
    queryFn: () => api.get('/loans?status=ACTIVE&pageSize=100&sortBy=loanNumber&sortOrder=asc').then((r) => r.data.data as ActiveLoanOption[]),
  });

  const record = useMutation({
    mutationFn: () => api.post('/collections/payments/manual', {
      loanId, amount: Number(amount), paymentMode,
      collectedAt: collectedAt || undefined, remarks: remarks.trim() || undefined,
    }),
    onSuccess: () => { toast.success('Payment recorded.'); onDone(); },
    onError: (err) => setError(apiMessage(err, 'Could not record the payment.')),
  });

  const disabled = !loanId || !amount || Number(amount) <= 0 || record.isPending;

  return (
    <Modal
      size="md"
      onClose={onClose}
      icon={<Banknote size={20} />}
      title="Record payment"
      subtitle="Recorded against the loan's assigned field officer. The amount is allocated to the oldest unpaid installments."
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button type="button" disabled={disabled} onClick={() => { setError(''); record.mutate(); }}>
            {record.isPending ? 'Recording…' : 'Record payment'}
          </button>
        </>
      }
    >
      <div className="form-grid">
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
          <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}>
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
    </Modal>
  );
}

// ── Edit a collection (mode + remarks only; amount is immutable) ─────────────
function EditPaymentModal({ payment, onClose, onDone }: { payment: PaymentRow; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(payment.paymentMode as PaymentMode);
  const [remarks, setRemarks] = useState(payment.remarks ?? '');
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: () => api.patch(`/collections/payments/${payment.id}`, { paymentMode, remarks: remarks.trim() }),
    onSuccess: () => { toast.success('Collection updated.'); onDone(); },
    onError: (err) => setError(apiMessage(err, 'Could not update the collection.')),
  });

  return (
    <Modal
      size="md"
      onClose={onClose}
      icon={<Banknote size={20} />}
      title={`Edit collection ${payment.receiptNumber}`}
      subtitle={`${payment.loan.loanNumber} · ${payment.loan.client.fullName} · ${inr(payment.amount)}. The amount cannot be edited.`}
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button type="button" disabled={save.isPending} onClick={() => { setError(''); save.mutate(); }}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      <label>Payment mode
        <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}>
          {PAYMENT_MODES.map((m) => <option key={m} value={m}>{modeLabel(m)}</option>)}
        </select>
      </label>
      <label>Remarks
        <input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Add a note" />
      </label>
      {error && <div className="error-box">{error}</div>}
    </Modal>
  );
}
