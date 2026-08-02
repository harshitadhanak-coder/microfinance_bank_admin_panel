import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { StatCard } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { ConfirmDialog } from '../../components/Modal';
import { ExportButton } from '../../components/ExportButton';
import { useToast } from '../../components/Toast';
import { Eye, Wallet } from '../../components/icons';
import { inr, apiMessage } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { can, canAccessModule } from '../auth/permissions';
import { PayrollRun, Payslip, periodLabel } from './payrollShared';

/**
 * Payroll — Run details. Per-employee breakdown for a single run: totals up top,
 * every payslip as a row, and a link to each printable slip page. Mark-paid is a
 * guarded confirm here too. Run meta comes from the runs list (no dedicated
 * single-run endpoint), payslips from the run's payslip endpoint.
 */
export default function PayrollRunDetailPage() {
  const { runId = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [markPaidOpen, setMarkPaidOpen] = useState(false);

  const canMarkPaid = can(user?.role, 'payroll:markPaid');
  // The attendance route is module-guarded and would bounce a payroll-only role
  // straight back home, so the name is only a link when it can actually open.
  const canOpenAttendance = canAccessModule(user?.role, 'attendance');

  const runsQuery = useQuery({
    queryKey: ['/human-resources/payroll/runs'],
    queryFn: () => api.get('/human-resources/payroll/runs').then((r) => r.data.data as PayrollRun[]),
  });
  const run = (runsQuery.data ?? []).find((r) => r.id === runId) ?? null;

  const payslipsQuery = useQuery({
    queryKey: ['/human-resources/payroll/runs', runId, 'payslips'],
    queryFn: () => api.get(`/human-resources/payroll/runs/${runId}/payslips`).then((r) => r.data.data as Payslip[]),
    enabled: !!runId,
  });
  const payslips = payslipsQuery.data ?? [];

  /**
   * `chargeableLates` is computed inside the payroll run and never stored, so it
   * is re-derived here from the free-late allowance:
   *
   *   chargeable = lateCount − freeLatesPerMonth
   *
   * That reads the allowance in force NOW, not the one the run used. If the
   * policy has been edited since, the derived figure will not reconcile with the
   * stored Late deduction beside it — so the column is labelled as derived and
   * the two stored values (Lates, Late deduction) sit next to it as the record.
   */
  const policyQuery = useQuery({
    queryKey: ['/human-resources/policies'],
    queryFn: () => api.get('/human-resources/policies').then((r) => r.data.data as { attendance: { freeLatesPerMonth: number } }),
  });
  const freeLates = policyQuery.data?.attendance.freeLatesPerMonth;
  const chargeableLates = (p: Payslip): number | null =>
    freeLates === undefined ? null : Math.max(0, (p.lateCount ?? 0) - freeLates);

  const markPaid = useMutation({
    mutationFn: () => api.post(`/human-resources/payroll/runs/${runId}/mark-paid`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/human-resources/payroll/runs'] });
      setMarkPaidOpen(false);
      toast.success('Payroll run marked as paid.');
    },
    onError: (err) => { setMarkPaidOpen(false); toast.error(apiMessage(err, 'Could not mark the run as paid.')); },
  });

  const totalDeductions = payslips.reduce((s, p) => s + Number(p.totalDeductions ?? 0), 0);

  // The name opens that employee's attendance for the run's own month, not the
  // current one — the days the payslip was computed from are what you want to
  // check when a figure looks wrong.
  // (The run meta can still be in flight when the payslips have arrived; without
  // it the attendance page falls back to its own default month.)
  const openAttendance = (employeeId: string) =>
    navigate(run ? `/attendance/${employeeId}?month=${run.month}&year=${run.year}` : `/attendance/${employeeId}`);

  const slipColumns: Column<Payslip>[] = [
    {
      header: 'Employee',
      render: (p) => (
        <>
          {canOpenAttendance ? (
            <a
              className="cell-link"
              role="link"
              tabIndex={0}
              title={`View ${p.employee.fullName}'s attendance for this month`}
              onClick={() => openAttendance(p.employee.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAttendance(p.employee.id); } }}
            >
              <strong>{p.employee.fullName}</strong>
            </a>
          ) : (
            <strong>{p.employee.fullName}</strong>
          )}
          <div className="muted sm-text"><code>{p.employee.employeeCode}</code></div>
        </>
      ),
      sortValue: (p) => p.employee.fullName,
    },
    { header: 'Branch', render: (p) => p.employee.branch?.name ?? '—', sortValue: (p) => p.employee.branch?.name ?? '' },
    { header: 'Present', render: (p) => p.presentDays, sortValue: (p) => Number(p.presentDays) },
    { header: 'LOP', render: (p) => (Number(p.lossOfPayDays) > 0 ? p.lossOfPayDays : '—'), sortValue: (p) => Number(p.lossOfPayDays) },
    // ── Late breakdown: raw count → chargeable (derived) → the money it cost.
    // Table only, by request: the salary slip and its PDF are unchanged.
    {
      header: 'Lates',
      render: (p) => (p.lateCount ? <span className="num">{p.lateCount}</span> : '—'),
      sortValue: (p) => p.lateCount ?? 0,
    },
    {
      header: 'Chargeable',
      render: (p) => {
        const n = chargeableLates(p);
        if (n === null) return <span className="muted">…</span>;
        return n > 0
          ? <span className="num" title={`${p.lateCount ?? 0} lates − ${freeLates} free`}>{n}</span>
          : '—';
      },
      sortValue: (p) => chargeableLates(p) ?? 0,
    },
    {
      header: 'Late ded.',
      render: (p) => (Number(p.lateDeduction ?? 0) > 0 ? <span className="num">{inr(p.lateDeduction)}</span> : '—'),
      sortValue: (p) => Number(p.lateDeduction ?? 0),
    },
    { header: 'Gross', render: (p) => <span className="num">{inr(p.grossEarnings)}</span>, sortValue: (p) => Number(p.grossEarnings) },
    { header: 'Deductions', render: (p) => <span className="num">{inr(p.totalDeductions)}</span>, sortValue: (p) => Number(p.totalDeductions) },
    { header: 'PF', render: (p) => <span className="num">{inr(p.providentFund)}</span>, sortValue: (p) => Number(p.providentFund) },
    { header: 'ESI', render: (p) => <span className="num">{inr(p.stateInsurance)}</span>, sortValue: (p) => Number(p.stateInsurance) },
    { header: 'Prof. tax', render: (p) => <span className="num">{inr(p.professionalTax)}</span>, sortValue: (p) => Number(p.professionalTax) },
    { header: 'Loan EMI', render: (p) => (Number(p.loanDeduction) > 0 ? <span className="num">{inr(p.loanDeduction)}</span> : '—'), sortValue: (p) => Number(p.loanDeduction) },
    { header: 'Net pay', render: (p) => <strong className="num">{inr(p.netPay)}</strong>, sortValue: (p) => Number(p.netPay) },
    { header: '', render: (p) => <div className="actions-cell"><button type="button" className="sm ghost" onClick={() => navigate(`/payroll/slip/${p.id}`)}><Eye size={14} /> Slip</button></div> },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: 'Payroll & Finance' }, { label: 'Payroll', to: '/payroll' },
          { label: run ? periodLabel(run.month, run.year) : 'Run' },
        ]}
        title={run ? `Payroll — ${periodLabel(run.month, run.year)}` : 'Payroll run'}
        subtitle={`${run?._count?.payslips ?? payslips.length} employees`}
        meta={run && <Badge status={run.status} />}
        actions={(
          <>
            {/* The month's salary register — "Payroll — Jul 2026" and so on. */}
            <ExportButton
              url={`/human-resources/payroll/runs/${runId}/export`}
              fileBase={run ? `Payroll-${periodLabel(run.month, run.year).replace(' ', '-')}` : 'Payroll'}
              disabled={!payslips.length}
            />
            {run?.status === 'PROCESSED' && canMarkPaid && (
              <button className="btn-lg" onClick={() => setMarkPaidOpen(true)}><Wallet size={15} /> Mark as paid</button>
            )}
          </>
        )}
      />

      <div className="stat-grid" style={{ marginBottom: '1rem' }}>
        <StatCard label="Net payroll" value={inr(run?.totalNetPay)} icon={<Wallet size={18} />} tone="brass" />
        <StatCard label="Gross earnings" value={inr(run?.totalGrossEarnings)} tone="info" />
        <StatCard label="Total deductions" value={inr(totalDeductions)} tone="warning" />
        <StatCard label="Employees" value={String(run?._count?.payslips ?? payslips.length)} tone="success" />
      </div>

      <h2 className="section-title">Payslips</h2>
      <DataTable
        columns={slipColumns}
        rows={payslips}
        loading={payslipsQuery.isLoading}
        empty="No payslips in this run."
        searchPlaceholder="Search by employee or branch…"
        pageSize={25}
      />

      {markPaidOpen && run && (
        <ConfirmDialog
          icon={<Wallet size={20} />}
          title={`Mark ${periodLabel(run.month, run.year)} as paid?`}
          message={`This records the entire run (${run._count?.payslips ?? payslips.length} payslips, ${inr(run.totalNetPay)} net) as disbursed to employees. This cannot be undone.`}
          confirmLabel="Mark as paid"
          loading={markPaid.isPending}
          onConfirm={() => markPaid.mutate()}
          onCancel={() => setMarkPaidOpen(false)}
        />
      )}
    </>
  );
}
