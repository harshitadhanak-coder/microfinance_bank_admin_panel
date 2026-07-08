import { FormEvent, useState } from 'react';
import { AxiosError } from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
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
  status: string;
  employee: { fullName: string; employeeCode: string; designation: string; branch?: { name: string } | null };
}

const STATUS_FILTERS = ['ALL', 'PENDING', 'APPROVED', 'DISBURSED', 'CLOSED', 'REJECTED'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const emptyForm = { employeeId: '', principalAmount: '', annualInterestRate: '12', tenureMonths: '12', purpose: '' };
type Form = typeof emptyForm;

const inr = (v?: string | number | null): string =>
  v == null || v === '' ? '—' : `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const apiMessage = (err: unknown, fallback: string): string =>
  (err instanceof AxiosError && err.response?.data?.message) || fallback;

export default function EmployeeLoansPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm);
  const [repayFor, setRepayFor] = useState<EmployeeLoan | null>(null);
  const [repayAmount, setRepayAmount] = useState('');
  const [error, setError] = useState('');

  const canManage = can(user?.role, 'employeeLoan:manage');

  const listUrl = `/employee-loans?pageSize=100${status === 'ALL' ? '' : `&status=${status}`}`;
  const listQuery = useQuery({
    queryKey: [listUrl],
    queryFn: () => api.get(listUrl).then((r) => r.data.data as EmployeeLoan[]),
  });

  const employeesQuery = useQuery({
    queryKey: ['/employees', 'loan-options'],
    queryFn: () => api.get('/employees?pageSize=100').then((r) => r.data.data as EmployeeOption[]),
    enabled: showForm,
  });

  const invalidate = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/employee-loans') });

  const apply = useMutation({
    mutationFn: (f: Form) =>
      api.post('/employee-loans', {
        employeeId: f.employeeId,
        principalAmount: Number(f.principalAmount),
        annualInterestRate: Number(f.annualInterestRate),
        tenureMonths: Number(f.tenureMonths),
        ...(f.purpose ? { purpose: f.purpose } : {}),
      }),
    onSuccess: () => { invalidate(); setShowForm(false); setForm(emptyForm); setError(''); },
    onError: (err) => setError(apiMessage(err, 'Could not submit the loan request.')),
  });

  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'APPROVED' | 'REJECTED' }) =>
      api.post(`/employee-loans/${id}/decision`, { decision }),
    onSuccess: invalidate,
    onError: (err) => setError(apiMessage(err, 'Could not record the decision.')),
  });

  const disburse = useMutation({
    mutationFn: (id: string) => api.post(`/employee-loans/${id}/disburse`),
    onSuccess: invalidate,
    onError: (err) => setError(apiMessage(err, 'Could not disburse the loan.')),
  });

  const repay = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) => api.post(`/employee-loans/${id}/repayment`, { amount }),
    onSuccess: () => { invalidate(); setRepayFor(null); setRepayAmount(''); },
    onError: (err) => setError(apiMessage(err, 'Could not record the repayment.')),
  });

  const submitApply = (e: FormEvent) => { e.preventDefault(); setError(''); apply.mutate(form); };
  const submitRepay = (e: FormEvent) => { e.preventDefault(); setError(''); if (repayFor) repay.mutate({ id: repayFor.id, amount: Number(repayAmount) }); };

  const columns: Column<EmployeeLoan>[] = [
    { header: 'Loan #', render: (l) => <code>{l.loanNumber}</code>, sortValue: (l) => l.loanNumber },
    { header: 'Employee', render: (l) => <strong>{l.employee.fullName}</strong>, sortValue: (l) => l.employee.fullName },
    { header: 'Branch', render: (l) => l.employee.branch?.name ?? '—', sortValue: (l) => l.employee.branch?.name ?? '' },
    { header: 'Principal', render: (l) => inr(l.principalAmount), sortValue: (l) => Number(l.principalAmount) },
    { header: 'Rate', render: (l) => `${Number(l.annualInterestRate)}%`, sortValue: (l) => Number(l.annualInterestRate) },
    { header: 'Tenure', render: (l) => `${l.tenureMonths} mo`, sortValue: (l) => l.tenureMonths },
    { header: 'Monthly', render: (l) => inr(l.monthlyDeduction), sortValue: (l) => Number(l.monthlyDeduction) },
    { header: 'Outstanding', render: (l) => inr(l.outstandingAmount), sortValue: (l) => Number(l.outstandingAmount) },
    { header: 'Status', render: (l) => <span className={`pill pill-${l.status.toLowerCase()}`}>{l.status}</span>, sortValue: (l) => l.status },
  ];

  if (canManage) {
    columns.push({
      header: 'Actions',
      render: (l) => {
        const busy = decide.isPending || disburse.isPending;
        if (l.status === 'PENDING') return (
          <div className="row-actions">
            <button type="button" className="sm ghost" disabled={busy} onClick={() => { setError(''); decide.mutate({ id: l.id, decision: 'APPROVED' }); }}>Approve</button>
            <button type="button" className="sm ghost danger" disabled={busy} onClick={() => { setError(''); decide.mutate({ id: l.id, decision: 'REJECTED' }); }}>Reject</button>
          </div>
        );
        if (l.status === 'APPROVED') return <button type="button" className="sm ghost" disabled={busy} onClick={() => { setError(''); disburse.mutate(l.id); }}>Disburse</button>;
        if (l.status === 'DISBURSED') return <button type="button" className="sm ghost" onClick={() => { setError(''); setRepayFor(l); setRepayAmount(''); }}>Record repayment</button>;
        return <span className="muted">—</span>;
      },
    });
  }

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Employee Loans</h1>
          <p className="muted">Staff loans repaid via monthly salary deduction</p>
        </div>
        {canManage && <button onClick={() => { setShowForm((v) => !v); setError(''); }}>{showForm ? 'Close' : 'New loan request'}</button>}
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
          <button key={sName} type="button" className={`sm ${status === sName ? '' : 'ghost'}`} onClick={() => setStatus(sName)}>
            {sName === 'ALL' ? 'All' : sName.charAt(0) + sName.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {error && !showForm && <div className="error-box">{error}</div>}

      <DataTable
        columns={columns}
        rows={listQuery.data ?? []}
        loading={listQuery.isLoading}
        empty="No employee loans found."
        searchPlaceholder="Search by employee, loan number or branch…"
      />

      {repayFor && (
        <div className="modal-overlay" onClick={() => setRepayFor(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submitRepay}>
            <h2>Record repayment</h2>
            <p className="muted">{repayFor.employee.fullName} · outstanding {inr(repayFor.outstandingAmount)}</p>
            <label style={{ width: '100%' }}>Amount
              <input type="number" min="1" max={Number(repayFor.outstandingAmount)} step="0.01" value={repayAmount} onChange={(e) => setRepayAmount(e.target.value)} required autoFocus />
            </label>
            {error && <div className="error-box">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setRepayFor(null)}>Cancel</button>
              <button type="submit" disabled={repay.isPending}>Save</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
