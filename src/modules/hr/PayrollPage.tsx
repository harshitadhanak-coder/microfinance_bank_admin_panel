import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { Badge } from '../../components/Badge';
import { ActionMenu } from '../../components/ActionMenu';
import { ConfirmDialog } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { Eye, Wallet } from '../../components/icons';
import { inr, fmtDate, apiMessage } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import { PayrollRun, periodLabel } from './payrollShared';

/**
 * Payroll — Run history (List). The high-stakes monthly run now has an audit
 * trail: every run listed with status, headcount, totals and run date. Running a
 * new payroll is a guided page (/payroll/run); each run drills into a per-employee
 * breakdown (/payroll/:runId). Mark-paid is a guarded confirm.
 */
export default function PayrollPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [markPaidTarget, setMarkPaidTarget] = useState<PayrollRun | null>(null);

  const canRun = can(user?.role, 'payroll:run');
  const canMarkPaid = can(user?.role, 'payroll:markPaid');

  const runsQuery = useQuery({
    queryKey: ['/human-resources/payroll/runs'],
    queryFn: () => api.get('/human-resources/payroll/runs').then((r) => r.data.data as PayrollRun[]),
  });

  const markPaid = useMutation({
    mutationFn: (runId: string) => api.post(`/human-resources/payroll/runs/${runId}/mark-paid`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/human-resources/payroll/runs'] });
      setMarkPaidTarget(null);
      toast.success('Payroll run marked as paid.');
    },
    onError: (err) => { setMarkPaidTarget(null); toast.error(apiMessage(err, 'Could not mark the run as paid.')); },
  });

  const runColumns: Column<PayrollRun>[] = [
    { header: 'Period', render: (r) => <a className="cell-link" onClick={() => navigate(`/payroll/${r.id}`)}><strong>{periodLabel(r.month, r.year)}</strong></a>, sortValue: (r) => r.year * 100 + r.month },
    { header: 'Status', render: (r) => <Badge status={r.status} />, sortValue: (r) => r.status },
    { header: 'Payslips', render: (r) => r._count?.payslips ?? 0, sortValue: (r) => r._count?.payslips ?? 0 },
    {
      header: 'Total payroll',
      render: (r) => (
        <div>
          <strong className="num">{inr(r.totalNetPay)}</strong>
          {r.totalGrossEarnings != null && <div className="muted sm-text">Gross {inr(r.totalGrossEarnings)}</div>}
        </div>
      ),
      sortValue: (r) => r.totalNetPay ?? 0,
    },
    { header: 'Run on', render: (r) => fmtDate(r.createdAt), sortValue: (r) => r.createdAt },
    {
      header: '',
      render: (r) => (
        <div className="actions-cell">
          <ActionMenu
            items={[
              { key: 'view', label: 'View breakdown', icon: <Eye size={15} />, onSelect: () => navigate(`/payroll/${r.id}`) },
              ...(r.status === 'PROCESSED' && canMarkPaid
                ? [{ key: 'markpaid', label: 'Mark as paid', icon: <Wallet size={15} />, separatorBefore: true, onSelect: () => setMarkPaidTarget(r) }]
                : []),
            ]}
          />
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Payroll & Finance' }, { label: 'Payroll' }]}
        title="Payroll"
        subtitle="Monthly payroll runs and their generated payslips"
        actions={canRun && <button className="btn-lg" onClick={() => navigate('/payroll/run')}><Wallet size={15} /> Run payroll</button>}
      />

      <DataTable
        columns={runColumns}
        rows={runsQuery.data ?? []}
        loading={runsQuery.isLoading}
        empty="No payroll has been run yet."
        searchable={false}
      />

      {markPaidTarget && (
        <ConfirmDialog
          icon={<Wallet size={20} />}
          title={`Mark ${periodLabel(markPaidTarget.month, markPaidTarget.year)} as paid?`}
          message={`This records the entire run (${markPaidTarget._count?.payslips ?? 0} payslips, ${inr(markPaidTarget.totalNetPay)} net) as disbursed to employees. This cannot be undone.`}
          confirmLabel="Mark as paid"
          loading={markPaid.isPending}
          onConfirm={() => markPaid.mutate(markPaidTarget.id)}
          onCancel={() => setMarkPaidTarget(null)}
        />
      )}
    </>
  );
}
