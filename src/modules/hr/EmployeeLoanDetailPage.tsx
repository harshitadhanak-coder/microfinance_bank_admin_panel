import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Skeleton } from '../../components/Skeleton';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { Ban, Banknote, Check, CheckCircle, HandCoins, Lock, Pencil } from '../../components/icons';
import { inr, fmtDate, apiMessage } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import { EmployeeLoanRow, empLoanStatusLabel } from './employeeLoanShared';

type StageAction = 'APPROVE' | 'REJECT' | 'DISBURSE' | 'CLOSE';
const STAGE_META: Record<StageAction, { title: string; message: string; confirmLabel: string; tone: 'success' | 'danger' | 'warn' | 'info' }> = {
  APPROVE: { title: 'Approve loan request', message: 'The loan will move to Approved and can then be disbursed.', confirmLabel: 'Approve', tone: 'success' },
  REJECT: { title: 'Reject loan request', message: 'The request will be rejected and can no longer be processed.', confirmLabel: 'Reject', tone: 'danger' },
  DISBURSE: { title: 'Disburse loan', message: 'This opens the outstanding balance and begins monthly salary deduction.', confirmLabel: 'Disburse', tone: 'info' },
  CLOSE: { title: 'Close loan', message: 'This settles the loan, zeroes the outstanding balance and stops further deductions.', confirmLabel: 'Close loan', tone: 'warn' },
};

interface TimelineStep { label: string; done: boolean; at?: string | null; tone?: 'danger'; note?: string | null }

/**
 * Employee Loan — Details. The canonical workspace for one staff loan: full
 * terms, a status timeline (requested → approved → disbursed → closed), and every
 * stage action valid for its status. Employee loans use a flat monthly deduction
 * (no installment schedule), so the timeline replaces a repayment table.
 */
export default function EmployeeLoanDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = can(user?.role, 'employeeLoan:manage');

  const [params, setParams] = useSearchParams();
  const [editOpen, setEditOpen] = useState(false);
  const [repayOpen, setRepayOpen] = useState(false);
  const [stage, setStage] = useState<StageAction | null>(null);

  const { data: loan } = useQuery({
    queryKey: ['/employee-loans', id],
    queryFn: () => api.get(`/employee-loans/${id}`).then((r) => r.data.data as EmployeeLoanRow),
  });

  // Deep link `?edit=1` opens the edit modal (from the list's Edit action).
  useEffect(() => {
    if (params.get('edit') === '1' && loan?.status === 'PENDING') {
      setEditOpen(true);
      setParams((p) => { p.delete('edit'); return p; }, { replace: true });
    }
  }, [params, loan, setParams]);

  const refresh = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/employee-loans') });

  const stageMutation = useMutation({
    mutationFn: (action: StageAction) => {
      switch (action) {
        case 'APPROVE': return api.post(`/employee-loans/${id}/decision`, { decision: 'APPROVED' });
        case 'REJECT': return api.post(`/employee-loans/${id}/decision`, { decision: 'REJECTED' });
        case 'DISBURSE': return api.post(`/employee-loans/${id}/disburse`);
        case 'CLOSE': return api.post(`/employee-loans/${id}/close`);
      }
    },
    onSuccess: (_d, action) => { refresh(); setStage(null); toast.success(`Loan ${action === 'REJECT' ? 'rejected' : action === 'CLOSE' ? 'closed' : action === 'DISBURSE' ? 'disbursed' : 'approved'}.`); },
    onError: (err) => { setStage(null); toast.error(apiMessage(err, 'Could not complete the action.')); },
  });

  if (!loan) {
    return (
      <>
        <PageHeader breadcrumb={[{ label: 'Payroll & Finance' }, { label: 'Employee Loans', to: '/employee-loans' }, { label: 'Loan' }]} title="Loan" />
        <Card><Skeleton height={20} /><Skeleton height={14} style={{ marginTop: 12 }} /><Skeleton height={14} style={{ marginTop: 8 }} /></Card>
      </>
    );
  }

  const steps: TimelineStep[] = loan.status === 'REJECTED'
    ? [
        { label: 'Requested', done: true, at: loan.requestedAt },
        { label: 'Rejected', done: true, tone: 'danger', note: loan.decisionNote },
      ]
    : [
        { label: 'Requested', done: true, at: loan.requestedAt },
        { label: 'Approved', done: ['APPROVED', 'DISBURSED', 'CLOSED'].includes(loan.status), note: loan.decisionNote },
        { label: 'Disbursed', done: ['DISBURSED', 'CLOSED'].includes(loan.status), at: loan.disbursedAt },
        { label: 'Closed', done: loan.status === 'CLOSED', at: loan.closedAt },
      ];

  const actions = canManage && (
    <>
      {loan.status === 'PENDING' && <>
        <button className="ghost" onClick={() => setEditOpen(true)}><Pencil size={15} /> Edit</button>
        <button className="ghost danger" onClick={() => setStage('REJECT')}><Ban size={15} /> Reject</button>
        <button className="btn-lg" onClick={() => setStage('APPROVE')}><CheckCircle size={15} /> Approve</button>
      </>}
      {loan.status === 'APPROVED' && <button className="btn-lg" onClick={() => setStage('DISBURSE')}><Banknote size={15} /> Disburse</button>}
      {loan.status === 'DISBURSED' && <>
        <button className="ghost" onClick={() => setStage('CLOSE')}><Lock size={15} /> Close loan</button>
        <button className="btn-lg" onClick={() => setRepayOpen(true)}><HandCoins size={15} /> Record repayment</button>
      </>}
    </>
  );

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Payroll & Finance' }, { label: 'Employee Loans', to: '/employee-loans' }, { label: loan.loanNumber }]}
        title={<code>{loan.loanNumber}</code>}
        subtitle={<>{loan.employee.fullName} · <code>{loan.employee.employeeCode}</code>{loan.employee.branch ? ` · ${loan.employee.branch.name}` : ''}</>}
        meta={<Badge status={loan.status}>{empLoanStatusLabel(loan.status)}</Badge>}
        actions={actions}
      />

      <div className="detail-cols">
        <Card title="Loan terms">
          <dl className="detail-list">
            <div><dt>Employee</dt><dd>{loan.employee.fullName} · {loan.employee.designation}</dd></div>
            <div><dt>Branch</dt><dd>{loan.employee.branch?.name ?? '—'}</dd></div>
            <div><dt>Principal</dt><dd className="num">{inr(loan.principalAmount)}</dd></div>
            <div><dt>Interest rate</dt><dd>{Number(loan.annualInterestRate)}% p.a.</dd></div>
            <div><dt>Tenure</dt><dd>{loan.tenureMonths} months</dd></div>
            <div><dt>Monthly deduction</dt><dd className="num">{inr(loan.monthlyDeduction)}</dd></div>
            <div><dt>Outstanding</dt><dd><strong className="num">{inr(loan.outstandingAmount)}</strong></dd></div>
            <div><dt>Purpose</dt><dd>{loan.purpose ?? '—'}</dd></div>
            <div><dt>Remarks</dt><dd>{loan.decisionNote ?? '—'}</dd></div>
          </dl>
        </Card>

        <Card title="Status timeline">
          <ul className="timeline">
            {steps.map((s) => (
              <li key={s.label} style={{ opacity: s.done ? 1 : 0.5 }}>
                <span className="timeline-icon" style={s.tone === 'danger' ? { background: 'var(--status-danger-bg)', color: 'var(--status-danger-fg)' } : undefined}>
                  {s.tone === 'danger' ? <Ban size={14} /> : s.done ? <Check size={14} /> : <span className="sm-text">·</span>}
                </span>
                <div className="timeline-body">
                  <strong>{s.label}</strong>
                  {s.at && <span className="muted sm-text">{fmtDate(s.at)}</span>}
                  {s.note && <span className="muted sm-text">{s.note}</span>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {editOpen && <EditModal loan={loan} onClose={() => setEditOpen(false)} onDone={() => { setEditOpen(false); refresh(); toast.success('Loan request updated.'); }} />}

      {repayOpen && <RepayModal loan={loan} onClose={() => setRepayOpen(false)} onDone={() => { setRepayOpen(false); refresh(); toast.success('Repayment recorded.'); }} />}

      {stage && (
        <ConfirmDialog
          tone={STAGE_META[stage].tone}
          icon={stage === 'REJECT' ? <Ban size={20} /> : stage === 'DISBURSE' ? <Banknote size={20} /> : stage === 'CLOSE' ? <Lock size={20} /> : <CheckCircle size={20} />}
          title={STAGE_META[stage].title}
          message={<>{STAGE_META[stage].message}<br /><span className="muted sm-text">{loan.loanNumber} · {loan.employee.fullName}</span></>}
          confirmLabel={STAGE_META[stage].confirmLabel}
          loading={stageMutation.isPending}
          onConfirm={() => stageMutation.mutate(stage)}
          onCancel={() => setStage(null)}
        />
      )}
    </>
  );
}

// ── Edit (pending only) ──────────────────────────────────────────────────────
function EditModal({ loan, onClose, onDone }: { loan: EmployeeLoanRow; onClose: () => void; onDone: () => void }) {
  const [principalAmount, setPrincipalAmount] = useState(String(Number(loan.principalAmount)));
  const [annualInterestRate, setAnnualInterestRate] = useState(String(Number(loan.annualInterestRate)));
  const [tenureMonths, setTenureMonths] = useState(String(loan.tenureMonths));
  const [purpose, setPurpose] = useState(loan.purpose ?? '');
  const [remarks, setRemarks] = useState(loan.decisionNote ?? '');
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: () => api.patch(`/employee-loans/${loan.id}`, {
      principalAmount: Number(principalAmount), annualInterestRate: Number(annualInterestRate),
      tenureMonths: Number(tenureMonths), purpose: purpose.trim(), remarks: remarks.trim(),
    }),
    onSuccess: onDone,
    onError: (err) => setError(apiMessage(err, 'Could not update the loan.')),
  });
  const disabled = !principalAmount || !annualInterestRate || !tenureMonths || save.isPending;

  return (
    <Modal
      size="md" onClose={onClose} icon={<Pencil size={20} />}
      title={`Edit loan ${loan.loanNumber}`}
      subtitle="Only pending requests can be edited. Employee, loan number and branch are fixed."
      footer={<>
        <button type="button" className="ghost" onClick={onClose}>Cancel</button>
        <button type="button" disabled={disabled} onClick={() => { setError(''); save.mutate(); }}>{save.isPending ? 'Saving…' : 'Save changes'}</button>
      </>}
    >
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

// ── Record repayment (disbursed only) ────────────────────────────────────────
function RepayModal({ loan, onClose, onDone }: { loan: EmployeeLoanRow; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const repay = useMutation({
    mutationFn: () => api.post(`/employee-loans/${loan.id}/repayment`, { amount: Number(amount) }),
    onSuccess: onDone,
    onError: (err) => setError(apiMessage(err, 'Could not record the repayment.')),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); repay.mutate(); };

  return (
    <Modal
      size="md" onClose={onClose} icon={<HandCoins size={20} />}
      title="Record repayment"
      subtitle={`${loan.employee.fullName} · outstanding ${inr(loan.outstandingAmount)}`}
      footer={<>
        <button type="button" className="ghost" onClick={onClose}>Cancel</button>
        <button type="submit" form="emp-loan-repay" disabled={repay.isPending || !amount}>{repay.isPending ? 'Saving…' : 'Save'}</button>
      </>}
    >
      <form id="emp-loan-repay" onSubmit={submit}>
        <label>Amount
          <input type="number" min="1" max={Number(loan.outstandingAmount)} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required data-autofocus />
        </label>
        {error && <div className="error-box" style={{ marginTop: '0.75rem' }}>{error}</div>}
      </form>
    </Modal>
  );
}
