import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { api } from '../../api/client';
import { inr } from '../../components/StatCard';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';

interface Installment {
  id: string; sequenceNumber: number; dueDate: string;
  principalDue: string; interestDue: string; totalDue: string;
  amountPaid: string; penaltyAmount: string; status: string; paidAt?: string | null;
}
interface LoanPayment {
  id: string; receiptNumber: string; amount: string; paymentMode: string; collectedAt: string; remarks?: string | null;
}
interface LoanDetail {
  id: string; loanNumber: string; status: string; assetClassification: string;
  principalAmount: string; annualInterestRate: string; tenureMonths: number;
  installmentAmount: string; outstandingPrincipal: string; totalAmountPaid: string;
  accruedPenalty: string; disbursedAt?: string | null; closedAt?: string | null;
  client: { fullName: string; phoneNumber: string; clientCode: string };
  loanProduct: { name: string; interestMethod: string };
  branch: { name: string };
  loanApplication?: { applicationNumber: string; status: string; leadId?: string | null } | null;
  assignedOfficerId?: string | null;
  installments: Installment[];
  payments: LoanPayment[];
}
interface OfficerOption { id: string; fullName: string; designation: string | null }

const fmtDate = (v?: string | null): string =>
  v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const label = (s: string) => s.replaceAll('_', ' ');
const pill = (s: string) => <span className={`pill pill-${s.toLowerCase()}`}>{label(s)}</span>;

type Tab = 'summary' | 'schedule' | 'collections';

/**
 * Read-only loan workspace: summary and approval trail, the full repayment
 * schedule, and the collections recorded against the loan. Loans have no edit
 * actions by design — progress moves only through payments and settlements.
 */
export default function LoanDetailModal({ loanId, onClose }: { loanId: string; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('summary');

  const { data: loan } = useQuery({
    queryKey: ['/loans', loanId],
    queryFn: () => api.get(`/loans/${loanId}`).then((r) => r.data.data as LoanDetail),
  });

  const installments = loan?.installments ?? [];
  const payments = loan?.payments ?? [];
  const paidCount = installments.filter((i) => i.status === 'PAID').length;
  const firstDueDate = installments[0]?.dueDate ?? null;
  const nextDueDate = installments.find((i) => i.status !== 'PAID')?.dueDate ?? null;

  // ── Assign to a field officer (for collection) ──
  const canLink = can(user?.role, 'loan:link');
  const [officerId, setOfficerId] = useState('');
  const [assignMsg, setAssignMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { data: officers } = useQuery({
    queryKey: ['/employees', 'options'],
    queryFn: () => api.get('/employees?pageSize=100').then((r) => r.data.data as OfficerOption[]),
    enabled: canLink,
  });
  const currentOfficer = officers?.find((o) => o.id === loan?.assignedOfficerId) ?? null;
  const selectedOfficer = officerId || loan?.assignedOfficerId || '';

  const assign = useMutation({
    mutationFn: (id: string) => api.patch(`/loans/${loanId}/assign-officer`, { assignedOfficerId: id }),
    onSuccess: () => {
      setAssignMsg({ ok: true, text: 'Field officer assigned for collection.' });
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/loans') });
    },
    onError: (err) =>
      setAssignMsg({ ok: false, text: axios.isAxiosError(err) ? err.response?.data?.message ?? 'Could not assign the loan.' : 'Could not assign the loan.' }),
  });

  const tabs: { key: Tab; label: string }[] = [
    { key: 'summary', label: 'Summary' },
    { key: 'schedule', label: `Schedule (${paidCount}/${installments.length})` },
    { key: 'collections', label: `Collections${payments.length ? ` (${payments.length})` : ''}` },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {!loan ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <header className="row">
              <div>
                <h2><code>{loan.loanNumber}</code></h2>
                <p className="muted">{loan.client.fullName} · {loan.client.phoneNumber} · {loan.branch.name}</p>
              </div>
              <div className="row-actions">
                {pill(loan.status)}
                {pill(loan.assetClassification)}
              </div>
            </header>

            <div className="tabs">
              {tabs.map((t) => (
                <button key={t.key} type="button" className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'summary' && (
              <dl className="detail-list">
                <div><dt>Product</dt><dd>{loan.loanProduct.name} ({label(loan.loanProduct.interestMethod).toLowerCase()})</dd></div>
                <div><dt>Principal</dt><dd>{inr(loan.principalAmount)}</dd></div>
                <div><dt>Interest rate</dt><dd>{Number(loan.annualInterestRate)}% p.a.</dd></div>
                <div><dt>Tenure</dt><dd>{loan.tenureMonths} months</dd></div>
                <div><dt>EMI</dt><dd>{inr(loan.installmentAmount)}</dd></div>
                <div><dt>Outstanding principal</dt><dd><strong>{inr(loan.outstandingPrincipal)}</strong></dd></div>
                <div><dt>Total collected</dt><dd>{inr(loan.totalAmountPaid)}</dd></div>
                <div><dt>Accrued penalty</dt><dd>{inr(loan.accruedPenalty)}</dd></div>
                <div><dt>Disbursed on</dt><dd>{fmtDate(loan.disbursedAt)}</dd></div>
                <div><dt>First EMI due</dt><dd>{fmtDate(firstDueDate)}</dd></div>
                {loan.status === 'ACTIVE' && <div><dt>Next EMI due</dt><dd>{fmtDate(nextDueDate)}</dd></div>}
                {loan.closedAt && <div><dt>Closed on</dt><dd>{fmtDate(loan.closedAt)}</dd></div>}
                {loan.loanApplication && (
                  <div><dt>Application</dt><dd><code>{loan.loanApplication.applicationNumber}</code> {pill(loan.loanApplication.status)}</dd></div>
                )}
                <div><dt>Field officer</dt><dd>
                  {loan.assignedOfficerId
                    ? (currentOfficer?.fullName ?? <span className="pill pill-approved">Assigned</span>)
                    : <span className="pill pill-new">Unassigned</span>}
                </dd></div>
                <div><dt>Client code</dt><dd><code>{loan.client.clientCode}</code></dd></div>
              </dl>
            )}

            {tab === 'summary' && canLink && loan.status === 'ACTIVE' && (
              <>
                <h3 className="section-title">Assign for collection</h3>
                {assignMsg && <div className={assignMsg.ok ? 'success-box' : 'error-box'}>{assignMsg.text}</div>}
                <div className="row-actions">
                  <select value={selectedOfficer} onChange={(e) => setOfficerId(e.target.value)} aria-label="Field officer">
                    <option value="">— Select field officer —</option>
                    {(officers ?? []).map((o) => (
                      <option key={o.id} value={o.id}>{o.fullName}{o.designation ? ` · ${o.designation}` : ''}</option>
                    ))}
                  </select>
                  <button type="button" className="sm" disabled={!selectedOfficer || assign.isPending}
                    onClick={() => { setAssignMsg(null); assign.mutate(selectedOfficer); }}>
                    {loan.assignedOfficerId ? 'Reassign' : 'Assign'}
                  </button>
                </div>
              </>
            )}

            {tab === 'schedule' && (
              <div className="panel" style={{ maxHeight: '46vh', overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr><th>#</th><th>Due date</th><th>Principal</th><th>Interest</th><th>Total due</th><th>Paid</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {installments.map((i) => (
                      <tr key={i.id}>
                        <td>{i.sequenceNumber}</td>
                        <td>{fmtDate(i.dueDate)}</td>
                        <td className="num">{inr(i.principalDue)}</td>
                        <td className="num">{inr(i.interestDue)}</td>
                        <td className="num">{inr(i.totalDue)}</td>
                        <td className="num">{inr(i.amountPaid)}</td>
                        <td>{pill(i.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'collections' && (
              <div className="doc-list">
                {payments.length === 0 && <p className="muted">No payments recorded against this loan yet.</p>}
                {payments.map((p) => (
                  <div key={p.id} className="doc-row">
                    <span className="doc-meta">
                      <strong>{inr(p.amount)} · {label(p.paymentMode)}</strong>
                      <span className="muted sm-text">Receipt <code>{p.receiptNumber}</code>{p.remarks ? ` · ${p.remarks}` : ''}</span>
                    </span>
                    <span className="muted sm-text">{fmtDate(p.collectedAt)}</span>
                  </div>
                ))}
                {payments.length >= 20 && <p className="muted sm-text">Showing the 20 most recent payments.</p>}
              </div>
            )}

            <div className="modal-actions">
              <button onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
