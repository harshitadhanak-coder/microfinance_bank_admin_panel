import { FormEvent, useState } from 'react';
import { AxiosError } from 'axios';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { useServerTable } from '../../components/useServerTable';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { CheckCircle, Eye, HandCoins, Landmark, Pencil, X } from '../../components/icons';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';

interface EmployeeOption { id: string; fullName: string; employeeCode: string }

interface EmployeeLoan {
  id: string;
  loanNumber: string;
  principalAmount: string;
  annualInterestRate: string;
  tenureMonths: number;
  monthlyDeduction: string;
  outstandingAmount: string;
  purpose?: string | null;
  decisionNote?: string | null;
  status: string;
  requestedAt: string;
  disbursedAt?: string | null;
  closedAt?: string | null;
  employee: { fullName: string; employeeCode: string; designation: string; branch?: { name: string } | null };
}

const STATUS_FILTERS = ['ALL', 'PENDING', 'APPROVED', 'DISBURSED', 'CLOSED', 'REJECTED'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const emptyForm = { employeeId: '', principalAmount: '', annualInterestRate: '12', tenureMonths: '12', purpose: '' };
type Form = typeof emptyForm;

const inr = (v?: string | number | null): string =>
  v == null || v === '' ? '—' : `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtDate = (v?: string | null): string =>
  v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const apiMessage = (err: unknown, fallback: string): string =>
  (err instanceof AxiosError && err.response?.data?.message) || fallback;
const statusLabel = (s: string): string => s.charAt(0) + s.slice(1).toLowerCase();

// Confirmable stage transitions and how each is presented to the operator.
type StageAction = 'APPROVE' | 'REJECT' | 'DISBURSE' | 'CLOSE';
const STAGE_META: Record<StageAction, { title: string; message: string; confirmLabel: string; tone: 'success' | 'danger' | 'warn' | 'info' }> = {
  APPROVE: { title: 'Approve loan request', message: 'The loan will move to Approved and can then be disbursed.', confirmLabel: 'Approve', tone: 'success' },
  REJECT: { title: 'Reject loan request', message: 'The request will be rejected and can no longer be processed.', confirmLabel: 'Reject', tone: 'danger' },
  DISBURSE: { title: 'Disburse loan', message: 'This opens the outstanding balance and begins monthly salary deduction.', confirmLabel: 'Disburse', tone: 'info' },
  CLOSE: { title: 'Close loan', message: 'This settles the loan, zeroes the outstanding balance and stops further deductions.', confirmLabel: 'Close loan', tone: 'warn' },
};

export default function EmployeeLoansPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const table = useServerTable();
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm);
  const [viewLoan, setViewLoan] = useState<EmployeeLoan | null>(null);
  const [editLoan, setEditLoan] = useState<EmployeeLoan | null>(null);
  const [repayFor, setRepayFor] = useState<EmployeeLoan | null>(null);
  const [repayAmount, setRepayAmount] = useState('');
  const [stage, setStage] = useState<{ loan: EmployeeLoan; action: StageAction } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const canManage = can(user?.role, 'employeeLoan:manage');

  const listUrl = `/employee-loans?${table.params}${status === 'ALL' ? '' : `&status=${status}`}`;
  const listQuery = useQuery({
    queryKey: [listUrl],
    queryFn: () => api.get(listUrl).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const rows = (listQuery.data?.data ?? []) as EmployeeLoan[];
  const totalItems = (listQuery.data?.pagination?.totalItems ?? 0) as number;

  const employeesQuery = useQuery({
    queryKey: ['/employees', 'loan-options'],
    queryFn: () => api.get('/employees?pageSize=100').then((r) => r.data.data as EmployeeOption[]),
    enabled: showForm,
  });

  const refresh = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/employee-loans') });
  const flash = (text: string) => { setNotice(text); setError(''); };

  const apply = useMutation({
    mutationFn: (f: Form) =>
      api.post('/employee-loans', {
        employeeId: f.employeeId,
        principalAmount: Number(f.principalAmount),
        annualInterestRate: Number(f.annualInterestRate),
        tenureMonths: Number(f.tenureMonths),
        ...(f.purpose ? { purpose: f.purpose } : {}),
      }),
    onSuccess: () => { refresh(); setShowForm(false); setForm(emptyForm); flash('Loan request submitted.'); },
    onError: (err) => setError(apiMessage(err, 'Could not submit the loan request.')),
  });

  const stageMutation = useMutation({
    mutationFn: ({ loan, action }: { loan: EmployeeLoan; action: StageAction }) => {
      switch (action) {
        case 'APPROVE': return api.post(`/employee-loans/${loan.id}/decision`, { decision: 'APPROVED' });
        case 'REJECT': return api.post(`/employee-loans/${loan.id}/decision`, { decision: 'REJECTED' });
        case 'DISBURSE': return api.post(`/employee-loans/${loan.id}/disburse`);
        case 'CLOSE': return api.post(`/employee-loans/${loan.id}/close`);
      }
    },
    onSuccess: (_d, variables) => {
      refresh();
      setStage(null);
      flash(`Loan ${variables.loan.loanNumber} ${variables.action === 'REJECT' ? 'rejected' : variables.action === 'CLOSE' ? 'closed' : variables.action === 'DISBURSE' ? 'disbursed' : 'approved'}.`);
    },
    onError: (err) => { setStage(null); setNotice(''); setError(apiMessage(err, 'Could not complete the action.')); },
  });

  const repay = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) => api.post(`/employee-loans/${id}/repayment`, { amount }),
    onSuccess: () => { refresh(); setRepayFor(null); setRepayAmount(''); flash('Repayment recorded.'); },
    onError: (err) => setError(apiMessage(err, 'Could not record the repayment.')),
  });

  const submitApply = (e: FormEvent) => { e.preventDefault(); setError(''); apply.mutate(form); };
  const submitRepay = (e: FormEvent) => { e.preventDefault(); setError(''); if (repayFor) repay.mutate({ id: repayFor.id, amount: Number(repayAmount) }); };

  const columns: Column<EmployeeLoan>[] = [
    { header: 'Loan #', render: (l) => <code>{l.loanNumber}</code>, sortKey: 'loanNumber' },
    { header: 'Employee', render: (l) => <><strong>{l.employee.fullName}</strong><div className="muted sm-text">{l.employee.employeeCode}</div></>, sortKey: 'employee' },
    { header: 'Branch', render: (l) => l.employee.branch?.name ?? '—', sortKey: 'branch' },
    { header: 'Principal', render: (l) => <span className="num">{inr(l.principalAmount)}</span>, sortKey: 'principalAmount' },
    { header: 'Rate', render: (l) => `${Number(l.annualInterestRate)}%`, sortKey: 'annualInterestRate' },
    { header: 'Tenure', render: (l) => `${l.tenureMonths} mo`, sortKey: 'tenureMonths' },
    { header: 'Monthly', render: (l) => <span className="num">{inr(l.monthlyDeduction)}</span>, sortKey: 'monthlyDeduction' },
    { header: 'Outstanding', render: (l) => <span className="num">{inr(l.outstandingAmount)}</span>, sortKey: 'outstandingAmount' },
    { header: 'Requested', render: (l) => fmtDate(l.requestedAt), sortKey: 'requestedAt' },
    { header: 'Status', render: (l) => <span className={`pill pill-${l.status.toLowerCase()}`}>{statusLabel(l.status)}</span>, sortKey: 'status' },
    {
      header: 'Actions',
      render: (l) => {
        const busy = stageMutation.isPending;
        return (
          <div className="row-actions">
            <button type="button" className="icon-btn" title="View" aria-label="View" onClick={() => { setNotice(''); setError(''); setViewLoan(l); }}>
              <Eye size={16} />
            </button>
            {canManage && l.status === 'PENDING' && (
              <>
                <button type="button" className="icon-btn" title="Edit" aria-label="Edit" onClick={() => { setNotice(''); setError(''); setEditLoan(l); }}>
                  <Pencil size={16} />
                </button>
                <button type="button" className="sm ghost" disabled={busy} onClick={() => { setNotice(''); setError(''); setStage({ loan: l, action: 'APPROVE' }); }}>Approve</button>
                <button type="button" className="sm ghost danger" disabled={busy} onClick={() => { setNotice(''); setError(''); setStage({ loan: l, action: 'REJECT' }); }}>Reject</button>
              </>
            )}
            {canManage && l.status === 'APPROVED' && (
              <button type="button" className="sm ghost" disabled={busy} onClick={() => { setNotice(''); setError(''); setStage({ loan: l, action: 'DISBURSE' }); }}>Disburse</button>
            )}
            {canManage && l.status === 'DISBURSED' && (
              <>
                <button type="button" className="sm ghost" onClick={() => { setNotice(''); setError(''); setRepayFor(l); setRepayAmount(''); }}>Record repayment</button>
                <button type="button" className="sm ghost" disabled={busy} onClick={() => { setNotice(''); setError(''); setStage({ loan: l, action: 'CLOSE' }); }}>Close</button>
              </>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Employee Loans</h1>
          <p className="muted">Staff loans repaid via monthly salary deduction</p>
        </div>
        {canManage && <button onClick={() => { setShowForm((v) => !v); setError(''); setNotice(''); }}>{showForm ? 'Close' : 'New loan request'}</button>}
      </header>

      {showForm && (
        <form className="panel pad form-grid" onSubmit={submitApply}>
          <label>Employee
            <select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} required>
              <option value="">— Select employee —</option>
              {employeesQuery.data?.map((e) => <option key={e.id} value={e.id}>{e.fullName} ({e.employeeCode})</option>)}
            </select>
          </label>
          <label>Principal amount<input type="number" min="1" value={form.principalAmount} onChange={(e) => setForm({ ...form, principalAmount: e.target.value })} required /></label>
          <label>Interest rate (% p.a.)<input type="number" min="0" max="100" step="0.01" value={form.annualInterestRate} onChange={(e) => setForm({ ...form, annualInterestRate: e.target.value })} required /></label>
          <label>Tenure (months)<input type="number" min="1" max="120" value={form.tenureMonths} onChange={(e) => setForm({ ...form, tenureMonths: e.target.value })} required /></label>
          <label className="span-all">Purpose<input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="optional" /></label>
          {error && <div className="error-box span-all">{error}</div>}
          <div className="span-all row-actions">
            <button type="submit" disabled={apply.isPending}>Submit request</button>
            <button type="button" className="ghost" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="filter-row">
        {STATUS_FILTERS.map((sName) => (
          <button key={sName} type="button" className={`sm ${status === sName ? '' : 'ghost'}`} onClick={() => { setStatus(sName); table.setPage(1); }}>
            {sName === 'ALL' ? 'All' : statusLabel(sName)}
          </button>
        ))}
      </div>

      {notice && !showForm && <div className="success-box">{notice}</div>}
      {error && !showForm && <div className="error-box">{error}</div>}

      <DataTable
        columns={columns}
        rows={rows}
        loading={listQuery.isLoading}
        empty="No employee loans found."
        searchPlaceholder="Search by employee, loan number or branch…"
        server={{
          page: table.page, pageSize: table.pageSize, totalItems,
          onPageChange: table.setPage, sort: table.sort, onSortChange: table.onSortChange,
          search: table.search, onSearchChange: table.onSearchChange,
        }}
      />

      {viewLoan && <ViewEmployeeLoanModal loan={viewLoan} onClose={() => setViewLoan(null)} />}

      {editLoan && (
        <EditEmployeeLoanModal
          loan={editLoan}
          onClose={() => setEditLoan(null)}
          onDone={() => { setEditLoan(null); refresh(); flash('Loan request updated.'); }}
        />
      )}

      {stage && (
        <ConfirmDialog
          tone={STAGE_META[stage.action].tone}
          icon={stage.action === 'REJECT' ? <X size={20} /> : stage.action === 'DISBURSE' ? <Landmark size={20} /> : stage.action === 'CLOSE' ? <HandCoins size={20} /> : <CheckCircle size={20} />}
          title={STAGE_META[stage.action].title}
          message={<>{STAGE_META[stage.action].message}<br /><span className="muted sm-text">{stage.loan.loanNumber} · {stage.loan.employee.fullName}</span></>}
          confirmLabel={STAGE_META[stage.action].confirmLabel}
          loading={stageMutation.isPending}
          onConfirm={() => stageMutation.mutate(stage)}
          onCancel={() => setStage(null)}
        />
      )}

      {repayFor && (
        <Modal
          size="md"
          onClose={() => setRepayFor(null)}
          icon={<HandCoins size={20} />}
          title="Record repayment"
          subtitle={`${repayFor.employee.fullName} · outstanding ${inr(repayFor.outstandingAmount)}`}
          footer={
            <>
              <button type="button" className="ghost" onClick={() => setRepayFor(null)}>Cancel</button>
              <button type="submit" form="employee-loan-repay" disabled={repay.isPending}>{repay.isPending ? 'Saving…' : 'Save'}</button>
            </>
          }
        >
          <form id="employee-loan-repay" onSubmit={submitRepay}>
            <label>Amount
              <input type="number" min="1" max={Number(repayFor.outstandingAmount)} step="0.01" value={repayAmount} onChange={(e) => setRepayAmount(e.target.value)} required />
            </label>
            {error && <div className="error-box" style={{ marginTop: '0.75rem' }}>{error}</div>}
          </form>
        </Modal>
      )}
    </>
  );
}

// ── View (read-only detail) ─────────────────────────────────────────────────
function ViewEmployeeLoanModal({ loan, onClose }: { loan: EmployeeLoan; onClose: () => void }) {
  return (
    <Modal
      size="md"
      onClose={onClose}
      icon={<Landmark size={20} />}
      title={`Loan ${loan.loanNumber}`}
      subtitle={<>{loan.employee.fullName} · <code>{loan.employee.employeeCode}</code></>}
      headerAside={<span className={`pill pill-${loan.status.toLowerCase()}`}>{statusLabel(loan.status)}</span>}
      footer={<button onClick={onClose}>Close</button>}
    >
      <dl className="detail-list">
        <div><dt>Employee</dt><dd>{loan.employee.fullName} · {loan.employee.designation}</dd></div>
        <div><dt>Branch</dt><dd>{loan.employee.branch?.name ?? '—'}</dd></div>
        <div><dt>Principal</dt><dd>{inr(loan.principalAmount)}</dd></div>
        <div><dt>Interest rate</dt><dd>{Number(loan.annualInterestRate)}% p.a.</dd></div>
        <div><dt>Tenure</dt><dd>{loan.tenureMonths} months</dd></div>
        <div><dt>Monthly deduction</dt><dd>{inr(loan.monthlyDeduction)}</dd></div>
        <div><dt>Outstanding</dt><dd><strong>{inr(loan.outstandingAmount)}</strong></dd></div>
        <div><dt>Requested</dt><dd>{fmtDate(loan.requestedAt)}</dd></div>
        <div><dt>Disbursed</dt><dd>{fmtDate(loan.disbursedAt)}</dd></div>
        <div><dt>Closed</dt><dd>{fmtDate(loan.closedAt)}</dd></div>
        <div><dt>Purpose</dt><dd>{loan.purpose ?? '—'}</dd></div>
        <div><dt>Remarks</dt><dd>{loan.decisionNote ?? '—'}</dd></div>
      </dl>
    </Modal>
  );
}

// ── Edit (pending loans only) ───────────────────────────────────────────────
function EditEmployeeLoanModal({ loan, onClose, onDone }: { loan: EmployeeLoan; onClose: () => void; onDone: () => void }) {
  const [principalAmount, setPrincipalAmount] = useState(String(Number(loan.principalAmount)));
  const [annualInterestRate, setAnnualInterestRate] = useState(String(Number(loan.annualInterestRate)));
  const [tenureMonths, setTenureMonths] = useState(String(loan.tenureMonths));
  const [purpose, setPurpose] = useState(loan.purpose ?? '');
  const [remarks, setRemarks] = useState(loan.decisionNote ?? '');
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/employee-loans/${loan.id}`, {
        principalAmount: Number(principalAmount),
        annualInterestRate: Number(annualInterestRate),
        tenureMonths: Number(tenureMonths),
        purpose: purpose.trim(),
        remarks: remarks.trim(),
      }),
    onSuccess: onDone,
    onError: (err) => setError(apiMessage(err, 'Could not update the loan.')),
  });

  const disabled = !principalAmount || !annualInterestRate || !tenureMonths || save.isPending;

  return (
    <Modal
      size="md"
      onClose={onClose}
      icon={<Pencil size={20} />}
      title={`Edit loan ${loan.loanNumber}`}
      subtitle="Only pending requests can be edited. Employee, loan number and branch are fixed."
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button type="button" disabled={disabled} onClick={() => { setError(''); save.mutate(); }}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      <dl className="detail-list" style={{ marginBottom: '1rem' }}>
        <div><dt>Employee</dt><dd>{loan.employee.fullName} · <code>{loan.employee.employeeCode}</code></dd></div>
        <div><dt>Loan number</dt><dd><code>{loan.loanNumber}</code></dd></div>
        <div><dt>Branch</dt><dd>{loan.employee.branch?.name ?? '—'}</dd></div>
      </dl>
      <div className="form-grid">
        <label>Principal amount<input type="number" min="1" value={principalAmount} onChange={(e) => setPrincipalAmount(e.target.value)} required /></label>
        <label>Interest rate (% p.a.)<input type="number" min="0" max="100" step="0.01" value={annualInterestRate} onChange={(e) => setAnnualInterestRate(e.target.value)} required /></label>
        <label>Tenure (months)<input type="number" min="1" max="120" value={tenureMonths} onChange={(e) => setTenureMonths(e.target.value)} required /></label>
        <label className="span-all">Purpose<input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="optional" /></label>
        <label className="span-all">Remarks<input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="optional" /></label>
      </div>
      {error && <div className="error-box">{error}</div>}
    </Modal>
  );
}
