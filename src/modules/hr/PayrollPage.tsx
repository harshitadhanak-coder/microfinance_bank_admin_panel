import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import { Modal } from '../../components/Modal';
import { Eye, Wallet } from '../../components/icons';
import { inr, apiMessage } from '../../lib/format';
import { useToast } from '../../components/Toast';
import { SalarySlip } from './SalarySlip';

interface PayrollRun {
  id: string;
  month: number;
  year: number;
  status: string;
  createdAt: string;
  totalNetPay?: number;
  totalGrossEarnings?: number;
  _count?: { payslips: number };
}

interface Payslip {
  id: string;
  standardDays?: number | string;
  presentDays: string;
  paidLeaveDays?: number | string;
  lwpDays?: number | string;
  lossOfPayDays?: number | string;
  grossEarnings: string;
  totalDeductions?: string;
  providentFund: string;
  stateInsurance: string;
  professionalTax: string;
  loanDeduction: string;
  netPay: string;
  lateCount?: number;
  overtimeHours?: number | string;
  incentive?: string;
  bonus?: string;
  employee: { fullName: string; employeeCode: string; branch?: { name: string } | null };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function PayrollPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const now = new Date();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ month: String(now.getMonth() + 1), year: String(now.getFullYear()) });
  const [openRun, setOpenRun] = useState<PayrollRun | null>(null);
  const [slipId, setSlipId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const canRun = can(user?.role, 'payroll:run');
  const canMarkPaid = can(user?.role, 'payroll:markPaid');

  const runsQuery = useQuery({
    queryKey: ['/human-resources/payroll/runs'],
    queryFn: () => api.get('/human-resources/payroll/runs').then((r) => r.data.data as PayrollRun[]),
  });

  const payslipsQuery = useQuery({
    queryKey: ['/human-resources/payroll/runs', openRun?.id, 'payslips'],
    queryFn: () => api.get(`/human-resources/payroll/runs/${openRun!.id}/payslips`).then((r) => r.data.data as Payslip[]),
    enabled: !!openRun,
  });

  const runPayroll = useMutation({
    mutationFn: (body: { month: number; year: number; adjustments: [] }) =>
      api.post('/human-resources/payroll/run', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/human-resources/payroll/runs'] });
      setShowForm(false);
      setError('');
    },
    onError: (err) => setError(apiMessage(err, 'Could not run payroll. A run may already exist for that month.')),
  });

  const markPaid = useMutation({
    mutationFn: (runId: string) => api.post(`/human-resources/payroll/runs/${runId}/mark-paid`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/human-resources/payroll/runs'] });
      toast.success('Payroll run marked as paid.');
    },
    onError: (err) => toast.error(apiMessage(err, 'Could not mark the run as paid.')),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    runPayroll.mutate({ month: Number(form.month), year: Number(form.year), adjustments: [] });
  };

  const runColumns: Column<PayrollRun>[] = [
    { header: 'Period', render: (r) => <strong>{MONTHS[r.month - 1]} {r.year}</strong>, sortValue: (r) => r.year * 100 + r.month },
    { header: 'Status', render: (r) => <span className={`pill pill-${r.status.toLowerCase()}`}>{r.status}</span>, sortValue: (r) => r.status },
    { header: 'Payslips', render: (r) => r._count?.payslips ?? 0, sortValue: (r) => r._count?.payslips ?? 0 },
    {
      header: 'Total payroll',
      render: (r) => (
        <div>
          <strong>{inr(r.totalNetPay)}</strong>
          {r.totalGrossEarnings != null && <div className="muted sm">Gross {inr(r.totalGrossEarnings)}</div>}
        </div>
      ),
      sortValue: (r) => r.totalNetPay ?? 0,
    },
    { header: 'Run on', render: (r) => new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }), sortValue: (r) => r.createdAt },
    {
      header: 'Actions',
      render: (r) => (
        <div className="row-actions">
          <button type="button" className="sm ghost" onClick={() => setOpenRun(r)}>View payslips</button>
          {r.status === 'PROCESSED' && canMarkPaid && (
            <button
              type="button"
              className="sm"
              disabled={markPaid.isPending && markPaid.variables === r.id}
              onClick={() => markPaid.mutate(r.id)}
            >
              {markPaid.isPending && markPaid.variables === r.id ? 'Marking…' : 'Mark paid'}
            </button>
          )}
          {r.status === 'PAID' && <span className="pill pill-paid">Paid</span>}
        </div>
      ),
    },
  ];

  const slipColumns: Column<Payslip>[] = [
    { header: 'Employee', render: (p) => <strong>{p.employee.fullName}</strong>, sortValue: (p) => p.employee.fullName },
    { header: 'Branch', render: (p) => p.employee.branch?.name ?? '—', sortValue: (p) => p.employee.branch?.name ?? '' },
    { header: 'Present', render: (p) => p.presentDays, sortValue: (p) => Number(p.presentDays) },
    { header: 'LOP days', render: (p) => (Number(p.lossOfPayDays) > 0 ? p.lossOfPayDays : '—'), sortValue: (p) => Number(p.lossOfPayDays) },
    { header: 'Gross', render: (p) => inr(p.grossEarnings), sortValue: (p) => Number(p.grossEarnings) },
    { header: 'Deductions', render: (p) => inr(p.totalDeductions), sortValue: (p) => Number(p.totalDeductions) },
    { header: 'PF', render: (p) => inr(p.providentFund), sortValue: (p) => Number(p.providentFund) },
    { header: 'ESI', render: (p) => inr(p.stateInsurance), sortValue: (p) => Number(p.stateInsurance) },
    { header: 'Prof. tax', render: (p) => inr(p.professionalTax), sortValue: (p) => Number(p.professionalTax) },
    { header: 'Loan EMI', render: (p) => (Number(p.loanDeduction) > 0 ? inr(p.loanDeduction) : '—'), sortValue: (p) => Number(p.loanDeduction) },
    { header: 'Net pay', render: (p) => <strong>{inr(p.netPay)}</strong>, sortValue: (p) => Number(p.netPay) },
    { header: 'Slip', render: (p) => <button type="button" className="sm ghost" onClick={() => setSlipId(p.id)}><Eye size={14} /> View slip</button> },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Payroll & Finance' }, { label: 'Payroll' }]}
        title="Payroll"
        subtitle="Run monthly payroll and review generated payslips"
        actions={canRun && <button onClick={() => { setShowForm((v) => !v); setError(''); }}>{showForm ? 'Close' : 'Run payroll'}</button>}
      />

      {showForm && (
        <form className="panel pad form-grid" onSubmit={submit}>
          <label>Month
            <select value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </label>
          <label>Year<input type="number" min="2000" max="2100" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} required /></label>
          {error && <div className="error-box span-all">{error}</div>}
          <div className="span-all row-actions">
            <button type="submit" disabled={runPayroll.isPending}>{runPayroll.isPending ? 'Running…' : 'Run payroll'}</button>
            <button type="button" className="ghost" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      {error && !showForm && <div className="error-box">{error}</div>}

      <DataTable
        columns={runColumns}
        rows={runsQuery.data ?? []}
        loading={runsQuery.isLoading}
        empty="No payroll has been run yet."
        searchable={false}
      />

      {openRun && (
        <Modal
          size="lg"
          onClose={() => setOpenRun(null)}
          icon={<Wallet size={20} />}
          title={`Payslips — ${MONTHS[openRun.month - 1]} ${openRun.year}`}
          subtitle={`${openRun._count?.payslips ?? 0} employees`}
          footer={<button onClick={() => setOpenRun(null)}>Close</button>}
        >
          <DataTable
            columns={slipColumns}
            rows={payslipsQuery.data ?? []}
            loading={payslipsQuery.isLoading}
            empty="No payslips in this run."
            searchPlaceholder="Search by employee or branch…"
          />
        </Modal>
      )}

      {slipId && <SalarySlip payslipId={slipId} onClose={() => setSlipId(null)} />}
    </>
  );
}
