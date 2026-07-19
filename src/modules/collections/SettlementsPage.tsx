import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FilterBar } from '../../components/FilterBar';
import { Badge } from '../../components/Badge';
import { ActionMenu, ActionItem } from '../../components/ActionMenu';
import { Drawer } from '../../components/Drawer';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { AlertCircle, Check, Eye, HandCoins, X } from '../../components/icons';
import { inr, fmtDate, apiMessage } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import { DayCloseStatus, DayEndSettlement, SETTLEMENT_ATTACHMENT_LABEL, SETTLEMENT_STATUSES, settlementStatusLabel } from './shared';

const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

/** Streams a settlement attachment through the authenticated API and saves it. */
const downloadSettlementAttachment = async (settlementId: string, documentId: string, fileName: string) => {
  const res = await api.get(`/collections/settlements/${settlementId}/attachments/${documentId}/download`, { responseType: 'blob' });
  const objectUrl = window.URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
};

/** Ordered lifecycle for the timeline; REJECTED is rendered as a branch. */
const LIFECYCLE: { key: DayCloseStatus; label: string }[] = [
  { key: 'SUBMITTED', label: 'Submitted by officer' },
  { key: 'VERIFIED', label: 'Cash verified' },
  { key: 'APPROVED', label: 'Approved & locked' },
];
const rank: Record<DayCloseStatus, number> = { DRAFT: 0, SUBMITTED: 1, VERIFIED: 2, APPROVED: 3, REJECTED: 1 };

/**
 * Day-End Settlements — the branch's review of each field officer's day-end cash.
 * Its own route (was a tab in the Collections mega-page). Lifecycle: the officer
 * SUBMITS → branch VERIFIES the counted cash → APPROVES (locks) it, or REJECTS
 * with a note so the officer corrects and resubmits.
 */
export default function SettlementsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [status, setStatus] = useState('PENDING');
  const [peek, setPeek] = useState<DayEndSettlement | null>(null);
  const [confirm, setConfirm] = useState<{ s: DayEndSettlement; action: 'accept' } | null>(null);
  const [verifying, setVerifying] = useState<DayEndSettlement | null>(null);
  const [rejecting, setRejecting] = useState<DayEndSettlement | null>(null);

  const branchScoped = !!user?.branchId;
  const canVerify = can(user?.role, 'settlement:verify');
  const showOffers = can(user?.role, 'settlement:decide') || can(user?.role, 'settlement:complete') || can(user?.role, 'collection:classify');

  const url = `/collections/settlements${status ? `?status=${status}` : ''}`;
  const { data, isLoading } = useQuery({
    queryKey: [url],
    queryFn: () => api.get(url).then((r) => r.data.data as DayEndSettlement[]),
  });
  const rows = data ?? [];
  const refresh = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/collections/settlements') });

  const act = useMutation({
    mutationFn: ({ id, action, note, countedCash }: { id: string; action: 'verify' | 'accept' | 'reject'; note?: string; countedCash?: number }) =>
      api.post(
        `/collections/settlements/${id}/${action}`,
        action === 'verify' ? { countedCash } : action === 'reject' ? { note, countedCash } : undefined,
      ),
    onSuccess: (res) => { toast.success(res.data?.message ?? 'Settlement updated.'); setConfirm(null); setVerifying(null); setRejecting(null); void refresh(); },
    onError: (err) => { setConfirm(null); toast.error(apiMessage(err, 'Could not update the settlement.')); },
  });

  const columns: Column<DayEndSettlement>[] = [
    { header: 'Field officer', render: (s) => <a className="cell-link" onClick={() => setPeek(s)}><strong>{s.employee.fullName}</strong><div className="muted sm-text">{s.employee.employeeCode}</div></a>, sortValue: (s) => s.employee.fullName },
    ...(branchScoped ? [] : [{ header: 'Branch', render: (s) => s.employee.branch?.name ?? '—', sortValue: (s) => s.employee.branch?.name ?? '' } satisfies Column<DayEndSettlement>]),
    { header: 'Date', render: (s) => fmtDate(s.businessDate), sortValue: (s) => new Date(s.businessDate) },
    { header: 'Opening', render: (s) => <span className="num">{inr(s.openingBalance)}</span>, sortValue: (s) => Number(s.openingBalance) },
    { header: 'Collection', render: (s) => <span className="num">{inr(s.totalCashCollected)}</span>, sortValue: (s) => Number(s.totalCashCollected) },
    { header: 'Total deposit', render: (s) => <span className="num">{inr(s.totalCashDeposited)}</span>, sortValue: (s) => Number(s.totalCashDeposited) },
    { header: 'Closing', render: (s) => <span className="num"><strong>{inr(s.closingBalance)}</strong></span>, sortValue: (s) => Number(s.closingBalance) },
    { header: 'Submitted', render: (s) => s.submittedAt ? fmtDateTime(s.submittedAt) : '—', sortValue: (s) => s.submittedAt ?? '' },
    { header: 'Status', render: (s) => <Badge status={s.status} />, sortValue: (s) => s.status },
    {
      header: '',
      render: (s) => {
        const items: ActionItem[] = [{ key: 'view', label: 'View lifecycle', icon: <Eye size={15} />, onSelect: () => setPeek(s) }];
        if (canVerify && s.status === 'SUBMITTED') items.push({ key: 'verify', label: 'Verify cash', icon: <Check size={15} />, onSelect: () => setVerifying(s) });
        if (canVerify && s.status === 'VERIFIED') items.push({ key: 'approve', label: 'Approve & lock', icon: <Check size={15} />, onSelect: () => setConfirm({ s, action: 'accept' }) });
        if (canVerify && (s.status === 'SUBMITTED' || s.status === 'VERIFIED')) items.push({ key: 'reject', label: 'Reject', icon: <X size={15} />, tone: 'danger', separatorBefore: true, onSelect: () => setRejecting(s) });
        return <div className="actions-cell"><ActionMenu items={items} /></div>;
      },
    },
  ];

  const statusChips = status !== 'PENDING'
    ? [{ key: 'status', label: `Status: ${settlementStatusLabel[status] ?? status}`, onRemove: () => setStatus('PENDING') }]
    : [];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Operations' }, { label: 'Day-End Settlements' }]}
        title="Day-End Settlements"
        subtitle={<>Verify each field officer's day-end cash{user?.branch ? ` — ${user.branch.name}` : ''}</>}
        actions={showOffers && <button className="ghost" onClick={() => navigate('/settlements/offers')}><HandCoins size={15} /> Settlement offers</button>}
      />

      <FilterBar chips={statusChips} onReset={statusChips.length ? () => setStatus('PENDING') : undefined}>
        <label>Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by settlement status">
            {SETTLEMENT_STATUSES.map((s) => <option key={s} value={s}>{settlementStatusLabel[s] ?? s}</option>)}
          </select>
        </label>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        empty={status === 'PENDING' ? 'No settlements waiting for review.' : 'No settlements found.'}
        searchPlaceholder="Search by field officer…"
      />

      {peek && (
        <Drawer
          onClose={() => setPeek(null)}
          title={peek.employee.fullName}
          subtitle={`${fmtDate(peek.businessDate)}${peek.employee.branch ? ` · ${peek.employee.branch.name}` : ''}`}
          headerAside={<Badge status={peek.status} />}
          footer={<button onClick={() => setPeek(null)}>Close</button>}
        >
          <dl className="detail-list two-col">
            <div><dt>Opening balance</dt><dd className="num">{inr(peek.openingBalance)}</dd></div>
            <div><dt>Today's collection</dt><dd className="num">{inr(peek.totalCashCollected)}</dd></div>
            <div><dt>Hospicash</dt><dd className="num">{inr(peek.hospicash)}</dd></div>
            <div><dt>AXIS Bank</dt><dd className="num">{inr(peek.axisDeposit)}</dd></div>
            <div><dt>SBI Bank</dt><dd className="num">{inr(peek.sbiDeposit)}</dd></div>
            <div><dt>HDFC Bank</dt><dd className="num">{inr(peek.hdfcDeposit)}</dd></div>
            <div><dt>Total deposit</dt><dd className="num">{inr(peek.totalCashDeposited)}</dd></div>
            <div><dt>Closing balance</dt><dd className="num"><strong>{inr(peek.closingBalance)}</strong></dd></div>
            {Number(peek.varianceAmount) !== 0 && (
              <>
                <div><dt>Branch counted</dt><dd className="num">{inr(Number(peek.closingBalance) + Number(peek.varianceAmount))}</dd></div>
                <div><dt>Difference</dt><dd className="num" style={{ color: 'var(--status-danger-fg)' }}>{Number(peek.varianceAmount) < 0 ? 'Short' : 'Excess'} {inr(Math.abs(Number(peek.varianceAmount)))}</dd></div>
              </>
            )}
            <div><dt>Deposit reference</dt><dd>{peek.depositReference || '—'}</dd></div>
            {peek.reviewNote && <div><dt>Review note</dt><dd>{peek.reviewNote}</dd></div>}
          </dl>

          {peek.deposits && peek.deposits.length > 0 && (
            <>
              <h4 className="section-title">Deposit entries</h4>
              <ul className="attachment-list">
                {peek.deposits.map((d) => (
                  <li key={d.id}>
                    <Badge tone="neutral">{d.bank}</Badge>
                    <span className="attachment-name num">{inr(d.amount)}</span>
                    {(d.slipNumber || d.reference) && <span className="muted sm-text">{d.slipNumber || d.reference}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}

          {peek.attachments && peek.attachments.length > 0 && (
            <>
              <h4 className="section-title">Attachments</h4>
              <ul className="attachment-list">
                {peek.attachments.map((a) => (
                  <li key={a.id}>
                    <Badge tone="neutral">{SETTLEMENT_ATTACHMENT_LABEL[a.documentType] ?? a.documentType}</Badge>
                    <span className="attachment-name">{a.fileName}</span>
                    <button
                      type="button"
                      className="sm ghost"
                      onClick={() => downloadSettlementAttachment(peek.id, a.id, a.fileName)}
                    >
                      Download
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h4 className="section-title">Lifecycle</h4>
          <ul className="timeline">
            {LIFECYCLE.map((step) => {
              const done = rank[peek.status] >= rank[step.key] && peek.status !== 'REJECTED';
              return (
                <li key={step.key} style={{ opacity: done ? 1 : 0.5 }}>
                  <span className="timeline-icon">{done ? <Check size={14} /> : <span className="sm-text">{rank[step.key]}</span>}</span>
                  <div className="timeline-body">
                    <strong>{step.label}</strong>
                    {step.key === 'SUBMITTED' && peek.submittedAt && <span className="muted sm-text">{fmtDateTime(peek.submittedAt)}</span>}
                  </div>
                </li>
              );
            })}
            {peek.status === 'REJECTED' && (
              <li>
                <span className="timeline-icon" style={{ background: 'var(--status-danger-bg)', color: 'var(--status-danger-fg)' }}><X size={14} /></span>
                <div className="timeline-body"><strong>Rejected — awaiting resubmission</strong>{peek.reviewNote && <span className="muted sm-text">{peek.reviewNote}</span>}</div>
              </li>
            )}
          </ul>

          {canVerify && (peek.status === 'SUBMITTED' || peek.status === 'VERIFIED') && (
            <div className="row-actions" style={{ marginTop: '0.75rem', flexWrap: 'wrap' }}>
              {peek.status === 'SUBMITTED' && <button className="sm" onClick={() => { setVerifying(peek); setPeek(null); }}>Verify cash</button>}
              {peek.status === 'VERIFIED' && <button className="sm" onClick={() => { setConfirm({ s: peek, action: 'accept' }); setPeek(null); }}>Approve & lock</button>}
              <button className="sm ghost danger" onClick={() => { setRejecting(peek); setPeek(null); }}>Reject</button>
            </div>
          )}
        </Drawer>
      )}

      {confirm && (
        <ConfirmDialog
          icon={<Check size={20} />}
          title="Approve & lock settlement?"
          message={`This approves and locks ${confirm.s.employee.fullName}'s settlement for ${fmtDate(confirm.s.businessDate)}. It cannot be changed afterwards.`}
          confirmLabel="Approve & lock"
          loading={act.isPending}
          onConfirm={() => act.mutate({ id: confirm.s.id, action: confirm.action })}
          onCancel={() => setConfirm(null)}
        />
      )}

      {verifying && (
        <VerifySettlementModal
          settlement={verifying}
          pending={act.isPending}
          onClose={() => setVerifying(null)}
          onVerify={(countedCash) => act.mutate({ id: verifying.id, action: 'verify', countedCash })}
          onReject={() => { const s = verifying; setVerifying(null); setRejecting(s); }}
        />
      )}

      {rejecting && (
        <RejectSettlementModal
          settlement={rejecting}
          pending={act.isPending}
          onClose={() => setRejecting(null)}
          onReject={(note, countedCash) => act.mutate({ id: rejecting.id, action: 'reject', note, countedCash })}
        />
      )}
    </>
  );
}

/**
 * Branch verifies the counted cash. The amount must equal the officer's declared
 * closing to verify; a short/excess can't be verified and is steered to a reject
 * so the officer recounts and resubmits.
 */
function VerifySettlementModal({
  settlement, pending, onClose, onVerify, onReject,
}: {
  settlement: DayEndSettlement; pending: boolean; onClose: () => void; onVerify: (countedCash: number) => void; onReject: () => void;
}) {
  const declared = Number(settlement.closingBalance);
  const [counted, setCounted] = useState(declared ? String(declared) : '');
  const countedNum = Number(counted);
  const valid = counted.trim() !== '' && Number.isFinite(countedNum) && countedNum >= 0;
  const diff = valid ? Math.round((countedNum - declared) * 100) / 100 : 0;
  const matches = valid && Math.abs(diff) < 0.005;
  return (
    <Modal
      size="md"
      onClose={onClose}
      icon={<Check size={20} />}
      title="Verify counted cash"
      subtitle={`${settlement.employee.fullName} · ${fmtDate(settlement.businessDate)}. Count the cash handed over and enter it — it must match the declared closing of ${inr(settlement.closingBalance)} to verify.`}
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          {valid && !matches && <button type="button" className="danger" onClick={onReject}>Reject instead</button>}
          <button type="button" disabled={pending || !matches} onClick={() => onVerify(countedNum)}>
            {pending ? 'Verifying…' : 'Verify cash'}
          </button>
        </>
      }
    >
      <label>Cash counted
        <input value={counted} onChange={(e) => setCounted(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" data-autofocus />
      </label>
      {valid && !matches && (
        <p className="sm-text" style={{ marginTop: '0.4rem', color: 'var(--status-danger-fg)' }}>
          {diff < 0 ? 'Short' : 'Excess'} {inr(Math.abs(diff))} vs the declared {inr(settlement.closingBalance)}. You can’t verify a mismatch — reject it so the officer recounts and resubmits.
        </p>
      )}
      {matches && <p className="muted sm-text" style={{ marginTop: '0.4rem' }}>Matches the declared closing — ready to verify.</p>}
    </Modal>
  );
}

function RejectSettlementModal({
  settlement, pending, onClose, onReject,
}: {
  settlement: DayEndSettlement; pending: boolean; onClose: () => void; onReject: (note: string, countedCash?: number) => void;
}) {
  const [note, setNote] = useState('');
  const [counted, setCounted] = useState('');
  const declared = Number(settlement.closingBalance);
  const countedNum = Number(counted);
  const hasCounted = counted.trim() !== '' && Number.isFinite(countedNum) && countedNum >= 0;
  const diff = hasCounted ? Math.round((countedNum - declared) * 100) / 100 : 0;
  return (
    <Modal
      size="md"
      onClose={onClose}
      icon={<AlertCircle size={20} />}
      title="Reject settlement"
      subtitle={`${settlement.employee.fullName} · ${fmtDate(settlement.businessDate)} · declared closing ${inr(settlement.closingBalance)}. The officer will see the counted amount and note, and must resubmit.`}
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="danger" disabled={pending || note.trim().length < 3} onClick={() => onReject(note.trim(), hasCounted ? countedNum : undefined)}>
            {pending ? 'Rejecting…' : 'Reject settlement'}
          </button>
        </>
      }
    >
      <label>Cash counted (optional)
        <input value={counted} onChange={(e) => setCounted(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder={`Declared ${inr(settlement.closingBalance)}`} />
      </label>
      {hasCounted && diff !== 0 && (
        <p className="sm-text" style={{ marginTop: '0.35rem', color: 'var(--status-danger-fg)' }}>
          {diff < 0 ? 'Short' : 'Excess'} {inr(Math.abs(diff))} vs the declared closing — the officer will see this.
        </p>
      )}
      <label style={{ marginTop: '0.6rem' }}>Reason
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} placeholder="e.g. Cash short by ₹500 — recount and resubmit" data-autofocus />
      </label>
    </Modal>
  );
}
