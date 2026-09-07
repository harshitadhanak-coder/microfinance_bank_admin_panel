import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Badge } from '../../components/Badge';
import { Modal, ConfirmDialog } from '../../components/Modal';
import { EmptyState } from '../../components/EmptyState';
import { LogOut, Ban } from '../../components/icons';
import { apiMessage, fmtDate, inr } from '../../lib/format';
import { useToast } from '../../components/Toast';
import { exitLabel, invalidateResignations, myResignationsKey, type Resignation } from './exitShared';

/** Statuses after which the exit is closed — a new resignation may be filed. */
const TERMINAL = ['WITHDRAWN', 'REJECTED', 'COMPLETED'];
/** While HR has not decided, the employee may still take it back. */
const WITHDRAWABLE = ['SUBMITTED', 'UNDER_REVIEW'];

/**
 * My Resignation — the self-service tab on the Exit Management page.
 *
 * Exit Management itself is HR's review queue (and the Branch Manager's
 * read-only window onto their branch). This tab is the half the Admin Panel
 * never had: an admin-portal employee — a Branch Manager above all — submitting
 * their OWN resignation, following it through notice, clearance and final
 * settlement, and withdrawing it while HR has yet to decide.
 *
 * It uses the same ungated self-service endpoints as the Field Officer app
 * (`POST /exit/resignations`, `GET …/me`, `POST …/:id/withdraw`); ownership is
 * enforced in the service layer, and every workflow action stays with HR.
 */
export default function MyResignation() {
  const [submitting, setSubmitting] = useState(false);
  const [withdrawFor, setWithdrawFor] = useState<Resignation | null>(null);
  const qc = useQueryClient();
  const toast = useToast();

  const query = useQuery({
    queryKey: myResignationsKey,
    queryFn: () => api.get('/human-resources/exit/resignations/me').then((r) => r.data.data as Resignation[]),
  });

  const rows = query.data ?? [];
  const active = rows.find((r) => !TERMINAL.includes(r.status)) ?? null;
  const history = rows.filter((r) => r !== active);

  const withdraw = useMutation({
    mutationFn: (id: string) => api.post(`/human-resources/exit/resignations/${id}/withdraw`),
    onSuccess: () => { toast.success('Resignation withdrawn.'); setWithdrawFor(null); invalidateResignations(qc); },
    onError: (err) => { toast.error(apiMessage(err, 'Could not withdraw the resignation.')); setWithdrawFor(null); },
  });

  if (query.isLoading) return <div className="panel pad muted">Loading…</div>;
  // Self-service reads the caller's OWN employee record, so an admin login with
  // no employee linked to it (a standalone Super Admin / HR account) gets a 404
  // rather than an empty list. Say so, instead of showing a "nothing here" that
  // invites them to file a resignation the API would reject.
  if (query.isError) {
    return (
      <div className="panel pad">
        <EmptyState
          variant="error"
          title="Self-service is unavailable for this account"
          message={apiMessage(query.error, 'Could not load your resignation.')}
        />
      </div>
    );
  }

  return (
    <>
      {active ? (
        <div className="panel pad">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>Resignation in progress</h2>
            <Badge status={active.status}>{exitLabel(active.status)}</Badge>
          </div>
          <dl className="profile-fields" style={{ marginTop: '1rem' }}>
            <Field label="Submitted">{fmtDate(active.resignationDate)}</Field>
            <Field label="Notice period">{active.noticePeriodDays} days</Field>
            <Field label="Requested last working day">{fmtDate(active.requestedLastWorkingDate)}</Field>
            <Field label="Approved last working day">{active.approvedLastWorkingDate ? fmtDate(active.approvedLastWorkingDate) : 'Pending HR'}</Field>
            <Field label="Reason">{active.reason || '—'}</Field>
            {active.finalSettlement && <Field label="Final settlement (net payable)">{inr(active.finalSettlement.netPayable)}</Field>}
          </dl>

          {!!active.clearanceItems?.length && (
            <div style={{ marginTop: '1rem' }}>
              <h3 style={{ margin: '0 0 0.4rem' }}>Clearance</h3>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {active.clearanceItems.map((item) => (
                  <li key={item.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.2rem 0' }}>
                    <Badge status={item.status === 'CLEARED' ? 'APPROVED' : 'PENDING'}>{exitLabel(item.status)}</Badge>
                    <span>{item.department} — {item.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {WITHDRAWABLE.includes(active.status) && (
            <div style={{ marginTop: '1rem' }}>
              <button type="button" className="ghost danger" onClick={() => setWithdrawFor(active)}><Ban size={15} /> Withdraw resignation</button>
            </div>
          )}
        </div>
      ) : (
        <div className="panel pad">
          <h2 style={{ marginTop: 0 }}>No resignation on record</h2>
          <p className="muted">Submitting a resignation begins your formal exit process. HR reviews it and confirms your last working day.</p>
          <button type="button" className="danger" onClick={() => setSubmitting(true)}><LogOut size={15} /> Submit resignation</button>
        </div>
      )}

      {history.length > 0 && (
        <div className="panel pad" style={{ marginTop: '0.8rem' }}>
          <h3 style={{ marginTop: 0 }}>History</h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {history.map((r) => (
              <li key={r.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.25rem 0' }}>
                <Badge status={r.status}>{exitLabel(r.status)}</Badge>
                <span className="muted">Submitted {fmtDate(r.resignationDate)} · last day {fmtDate(r.approvedLastWorkingDate ?? r.requestedLastWorkingDate)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {submitting && <SubmitResignationModal onClose={() => setSubmitting(false)} />}

      {withdrawFor && (
        <ConfirmDialog
          tone="danger"
          icon={<Ban size={20} />}
          title="Withdraw resignation?"
          message="Your resignation will be withdrawn and the exit process stopped."
          confirmLabel="Withdraw"
          cancelLabel="Keep it"
          loading={withdraw.isPending}
          onConfirm={() => withdraw.mutate(withdrawFor.id)}
          onCancel={() => setWithdrawFor(null)}
        />
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="profile-field"><dt>{label}</dt><dd>{children ?? '—'}</dd></div>;
}

/** Submit one's own resignation. Mirrors the Field Officer form. */
function SubmitResignationModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [lwd, setLwd] = useState('');
  const [notice, setNotice] = useState('30');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const submit = useMutation({
    mutationFn: () => api.post('/human-resources/exit/resignations', {
      requestedLastWorkingDate: lwd,
      noticePeriodDays: Number(notice),
      reason: reason.trim() || undefined,
    }),
    onSuccess: () => { toast.success('Resignation submitted.'); invalidateResignations(qc); onClose(); },
    onError: (err) => setError(apiMessage(err, 'Could not submit the resignation.')),
  });

  const onSubmit = (e: FormEvent) => { e.preventDefault(); setError(''); submit.mutate(); };

  return (
    <Modal
      onClose={onClose}
      icon={<LogOut size={20} />}
      title="Submit resignation"
      subtitle="HR will review it and confirm your last working day."
      footer={<>
        <button type="button" className="ghost" onClick={onClose}>Cancel</button>
        <button type="submit" form="submit-resignation" className="danger" disabled={submit.isPending || !lwd}>{submit.isPending ? 'Submitting…' : 'Submit resignation'}</button>
      </>}
    >
      <form id="submit-resignation" className="form-grid" onSubmit={onSubmit}>
        <label>Requested last working day
          <input type="date" value={lwd} onChange={(e) => setLwd(e.target.value)} required />
        </label>
        <label>Notice period (days)
          <input type="number" min="0" value={notice} onChange={(e) => setNotice(e.target.value)} />
        </label>
        <label className="span-all">Reason (optional)
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} placeholder="Optional" />
        </label>
        <p className="span-all muted">Submitting a resignation begins your formal exit process.</p>
        {error && <div className="error-box span-all">{error}</div>}
      </form>
    </Modal>
  );
}
