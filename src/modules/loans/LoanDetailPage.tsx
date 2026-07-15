import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/Card';
import { Tabs, TabDef } from '../../components/Tabs';
import { Badge } from '../../components/Badge';
import { Form, FormGrid, Field, FormActions } from '../../components/Form';
import { EmptyState } from '../../components/EmptyState';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { Loader } from '../../components/icons';
import { inr, fmtDate, titleCase, apiMessage } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import { EmployeeOption, LoanDetail, bucketLabel, loanStatusLabel } from './shared';

type TabKey = 'overview' | 'schedule' | 'collections' | 'officer';

/**
 * Loan — Details. Tabbed read-mostly workspace replacing the old detail modal:
 * Overview (terms + approval trail), Schedule (full repayment plan), Collections
 * (payment ledger) and Officer (field-officer assignment + purpose). Loans have
 * no financial edit — progress moves only through payments and settlements.
 */
export default function LoanDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const canEdit = can(user?.role, 'loan:edit');

  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as TabKey) || 'overview';
  const setTab = (t: TabKey) => setParams((p) => { p.set('tab', t); return p; }, { replace: true });

  const { data: loan } = useQuery({
    queryKey: ['/loans', id],
    queryFn: () => api.get(`/loans/${id}`).then((r) => r.data.data as LoanDetail),
  });

  const installments = loan?.installments ?? [];
  const payments = loan?.payments ?? [];
  const paidCount = installments.filter((i) => i.status === 'PAID').length;
  const firstDueDate = installments[0]?.dueDate ?? null;
  const nextDueDate = installments.find((i) => i.status !== 'PAID')?.dueDate ?? null;

  // Officer directory (to resolve the assigned officer's name and offer the picker).
  const { data: officers } = useQuery({
    queryKey: ['/employees', 'loan-options'],
    queryFn: () => api.get('/employees?pageSize=100').then((r) => r.data.data as EmployeeOption[]),
    enabled: canEdit || tab === 'officer' || tab === 'overview',
  });
  const currentOfficer = officers?.find((o) => o.id === loan?.assignedOfficerId) ?? null;

  // ── Officer + purpose edit (never the financials) ──
  const [officerId, setOfficerId] = useState('');
  const [purpose, setPurpose] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { setOfficerId(loan?.assignedOfficerId ?? ''); }, [loan?.assignedOfficerId]);

  const save = useMutation({
    mutationFn: () => api.patch(`/loans/${id}`, {
      assignedOfficerId: officerId || undefined,
      purpose: purpose.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/loans') });
      setError(''); setPurpose('');
      toast.success('Loan updated.');
    },
    onError: (err) => setError(apiMessage(err, 'Could not update the loan.')),
  });
  const submitEdit = (e: FormEvent) => { e.preventDefault(); setError(''); save.mutate(); };

  const tabs: TabDef[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'schedule', label: 'Schedule', count: installments.length },
    { key: 'collections', label: 'Collections', count: payments.length },
    ...(canEdit ? [{ key: 'officer', label: 'Officer' }] : []),
  ];

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: 'Operations' }, { label: 'Loans', to: '/loans' },
          { label: loan?.loanNumber ?? 'Loan' },
        ]}
        title={loan ? <code>{loan.loanNumber}</code> : 'Loan'}
        subtitle={loan ? <>{loan.client.fullName} · {loan.client.phoneNumber} · {loan.branch.name}</> : undefined}
        meta={loan && <>
          <Badge status={loan.status}>{loanStatusLabel(loan.status)}</Badge>{' '}
          <Badge status={loan.assetClassification}>{bucketLabel(loan.assetClassification)}</Badge>
        </>}
        tabs={<Tabs tabs={tabs} active={tab} onChange={(t) => setTab(t as TabKey)} />}
      />

      {!loan ? (
        <Card><Skeleton height={20} /><Skeleton height={14} style={{ marginTop: 12 }} /><Skeleton height={14} style={{ marginTop: 8 }} /></Card>
      ) : (
        <>
          {tab === 'overview' && (
            <div className="detail-cols">
              <Card title="Loan terms">
                <dl className="detail-list">
                  <div><dt>Product</dt><dd>{loan.loanProduct.name} ({titleCase(loan.loanProduct.interestMethod)})</dd></div>
                  <div><dt>Principal</dt><dd className="num">{inr(loan.principalAmount)}</dd></div>
                  <div><dt>Interest rate</dt><dd>{Number(loan.annualInterestRate)}% p.a.</dd></div>
                  <div><dt>Tenure</dt><dd>{loan.tenureMonths} months</dd></div>
                  <div><dt>EMI</dt><dd className="num">{inr(loan.installmentAmount)}</dd></div>
                  <div><dt>Outstanding principal</dt><dd><strong className="num">{inr(loan.outstandingPrincipal)}</strong></dd></div>
                  <div><dt>Total collected</dt><dd className="num">{inr(loan.totalAmountPaid)}</dd></div>
                  <div><dt>Accrued penalty</dt><dd className="num">{inr(loan.accruedPenalty)}</dd></div>
                  <div><dt>Purpose</dt><dd>{loan.purpose ?? '—'}</dd></div>
                </dl>
              </Card>
              <Card title="Status & parties">
                <dl className="detail-list one-col">
                  <div><dt>Disbursed on</dt><dd>{fmtDate(loan.disbursedAt)}</dd></div>
                  <div><dt>First EMI due</dt><dd>{fmtDate(firstDueDate)}</dd></div>
                  {loan.status === 'ACTIVE' && <div><dt>Next EMI due</dt><dd>{fmtDate(nextDueDate)}</dd></div>}
                  {loan.closedAt && <div><dt>Closed on</dt><dd>{fmtDate(loan.closedAt)}</dd></div>}
                  <div><dt>Repayment progress</dt><dd>{paidCount} / {installments.length} paid</dd></div>
                  {loan.loanApplication && (
                    <div><dt>Application</dt><dd><code>{loan.loanApplication.applicationNumber}</code> <Badge status={loan.loanApplication.status} /></dd></div>
                  )}
                  <div><dt>Field officer</dt><dd>
                    {loan.assignedOfficerId
                      ? (currentOfficer?.fullName ?? <Badge tone="success">Assigned</Badge>)
                      : <Badge tone="neutral">Unassigned</Badge>}
                  </dd></div>
                  <div><dt>Client</dt><dd>{loan.client.fullName} · <code>{loan.client.clientCode}</code></dd></div>
                </dl>
              </Card>
            </div>
          )}

          {tab === 'schedule' && (
            <Card title="Repayment schedule" className="card-flush">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr><th>#</th><th>Due date</th><th className="ta-right">Principal</th><th className="ta-right">Interest</th><th className="ta-right">Total due</th><th className="ta-right">Paid</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {installments.map((i) => (
                      <tr key={i.id}>
                        <td>{i.sequenceNumber}</td>
                        <td>{fmtDate(i.dueDate)}</td>
                        <td className="num ta-right">{inr(i.principalDue)}</td>
                        <td className="num ta-right">{inr(i.interestDue)}</td>
                        <td className="num ta-right">{inr(i.totalDue)}</td>
                        <td className="num ta-right">{inr(i.amountPaid)}</td>
                        <td><Badge status={i.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {tab === 'collections' && (
            <Card title="Collection ledger">
              {payments.length === 0 ? (
                <EmptyState variant="no-data" title="No payments yet" message="Payments recorded against this loan will appear here." />
              ) : (
                <>
                  <div className="doc-list">
                    {payments.map((p) => (
                      <div key={p.id} className="doc-row">
                        <div style={{ minWidth: 0 }}>
                          <div className="doc-name">{inr(p.amount)} · {titleCase(p.paymentMode)}</div>
                          <div className="doc-meta">Receipt <code>{p.receiptNumber}</code>{p.remarks ? ` · ${p.remarks}` : ''}</div>
                        </div>
                        <span className="muted sm-text">{fmtDate(p.collectedAt)}</span>
                      </div>
                    ))}
                  </div>
                  {payments.length >= 20 && <p className="muted sm-text" style={{ marginTop: '0.75rem' }}>Showing the 20 most recent payments.</p>}
                </>
              )}
            </Card>
          )}

          {tab === 'officer' && canEdit && (
            <div className="detail-cols">
              <Card title="Current assignment">
                <dl className="detail-list one-col">
                  <div><dt>Field officer</dt><dd>
                    {loan.assignedOfficerId
                      ? (currentOfficer?.fullName ?? <Badge tone="success">Assigned</Badge>)
                      : <Badge tone="neutral">Unassigned</Badge>}
                  </dd></div>
                  <div><dt>Purpose</dt><dd>{loan.purpose ?? '—'}</dd></div>
                </dl>
                <p className="muted sm-text" style={{ margin: 0 }}>
                  Assigning an officer places this loan in that officer's collection list. Financial terms can never be changed after disbursal.
                </p>
              </Card>
              <Card title="Assign / edit">
                <Form onSubmit={submitEdit}>
                  <FormGrid cols={1}>
                    <Field label="Field officer">
                      <select value={officerId} onChange={(e) => setOfficerId(e.target.value)}>
                        <option value="">— Unassigned —</option>
                        {(officers ?? []).map((o) => <option key={o.id} value={o.id}>{o.fullName}{o.designation ? ` · ${o.designation}` : ''}</option>)}
                      </select>
                    </Field>
                    <Field label="Purpose" help="Leave blank to keep the current purpose">
                      <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder={loan.purpose ?? 'Working capital'} />
                    </Field>
                  </FormGrid>
                  {error && <div className="error-box">{error}</div>}
                  <FormActions>
                    <button type="submit" disabled={save.isPending}>{save.isPending ? <><Loader size={15} /> Saving…</> : 'Save changes'}</button>
                  </FormActions>
                </Form>
              </Card>
            </div>
          )}
        </>
      )}
    </>
  );
}
