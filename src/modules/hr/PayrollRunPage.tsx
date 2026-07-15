import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Form, FormGrid, Field, FormActions } from '../../components/Form';
import { ConfirmDialog } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { Loader, Wallet } from '../../components/icons';
import { apiMessage } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import { PayrollRun, periodLabel } from './payrollShared';

const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Payroll — Run (guided). Replaces the inline run-form on the list with a
 * dedicated, deliberate page: pick the period, review what the run will do, then
 * confirm. Payroll is computed from each employee's salary structure and the
 * month's attendance; a period can only be run once.
 */
export default function PayrollRunPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canRun = can(user?.role, 'payroll:run');

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState('');

  const runsQuery = useQuery({
    queryKey: ['/human-resources/payroll/runs'],
    queryFn: () => api.get('/human-resources/payroll/runs').then((r) => r.data.data as PayrollRun[]),
    enabled: canRun,
  });
  const existing = (runsQuery.data ?? []).find((r) => r.month === month && r.year === year) ?? null;

  const runPayroll = useMutation({
    mutationFn: () => api.post('/human-resources/payroll/run', { month, year, adjustments: [] }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['/human-resources/payroll/runs'] });
      setConfirmOpen(false);
      toast.success(`Payroll generated for ${periodLabel(month, year)}.`);
      const runId = res.data?.data?.id as string | undefined;
      navigate(runId ? `/payroll/${runId}` : '/payroll');
    },
    onError: (err) => { setConfirmOpen(false); setError(apiMessage(err, 'Could not run payroll. A run may already exist for that month.')); },
  });

  if (!canRun) return <p className="muted">You do not have permission to run payroll.</p>;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Payroll & Finance' }, { label: 'Payroll', to: '/payroll' }, { label: 'Run payroll' }]}
        title="Run payroll"
        subtitle="Generate payslips for a pay period"
      />

      <Form onSubmit={(e) => { e.preventDefault(); setError(''); if (!existing) setConfirmOpen(true); }}>
        <Card title="Pay period">
          <FormGrid cols={2}>
            <Field label="Month" required>
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {MONTHS_FULL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </Field>
            <Field label="Year" required>
              <input type="number" min={2000} max={2100} value={year} onChange={(e) => setYear(Number(e.target.value))} required />
            </Field>
          </FormGrid>

          {existing ? (
            <div className="info-box">
              Payroll for <strong>{periodLabel(month, year)}</strong> has already been run
              (<Badge status={existing.status} />, {existing._count?.payslips ?? 0} payslips).{' '}
              <a className="cell-link" onClick={() => navigate(`/payroll/${existing.id}`)}>View the run</a>.
            </div>
          ) : (
            <p className="muted sm-text" style={{ margin: 0 }}>
              This generates a payslip for every active employee with a salary structure, using {periodLabel(month, year)}
              attendance (present days, paid leave, loss-of-pay), then applies PF, ESI, professional tax and any loan or
              salary-advance deductions. A period can only be run once.
            </p>
          )}
        </Card>

        {error && <div className="error-box">{error}</div>}

        <FormActions>
          <button type="button" className="ghost" onClick={() => navigate('/payroll')}>Cancel</button>
          <button type="submit" disabled={!!existing || runPayroll.isPending}>
            {runPayroll.isPending ? <><Loader size={15} /> Running…</> : 'Run payroll'}
          </button>
        </FormActions>
      </Form>

      {confirmOpen && (
        <ConfirmDialog
          icon={<Wallet size={20} />}
          title={`Run payroll for ${periodLabel(month, year)}?`}
          message="This generates payslips for all eligible employees for the selected period. A period can only be run once — review the month and year before confirming."
          confirmLabel="Run payroll"
          loading={runPayroll.isPending}
          onConfirm={() => runPayroll.mutate()}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </>
  );
}
