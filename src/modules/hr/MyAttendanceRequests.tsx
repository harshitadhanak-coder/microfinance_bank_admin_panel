import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { Badge } from '../../components/Badge';
import { Modal, ConfirmDialog } from '../../components/Modal';
import { EmptyState } from '../../components/EmptyState';
import { ListChecks, Ban } from '../../components/icons';
import { apiMessage, fmtDate, titleCase } from '../../lib/format';
import { useToast } from '../../components/Toast';
import {
  REQUEST_TYPES, isPunchRequest, isRangeRequest, requestTypeLabel, fmtRequestTime,
  invalidateAttendanceRequests, myAttendanceRequestsKey,
  type AttendanceRequestType, type MyAttendanceRequest,
} from './attendanceRequestShared';

/**
 * My Attendance Requests — the self-service tab on the Attendance Requests page.
 *
 * The page itself is the HR review queue (and the Branch Manager's read-only
 * window onto their team). This tab is the other half that was missing from the
 * Admin Panel: an admin-portal employee — a Branch Manager above all — raising
 * their OWN missing-punch / regularization / WFH / outdoor-duty / permission
 * request, tracking it, and cancelling it while it is still pending.
 *
 * It talks to the same ungated `/attendance/requests` self-service endpoints the
 * Field Officer app uses (`POST`, `GET /me`, `DELETE /:id`); ownership is
 * enforced in the service layer, so nothing here can touch another person's
 * record. Deciding a request stays with HR.
 */
export default function MyAttendanceRequests() {
  const [raising, setRaising] = useState(false);
  const [cancelFor, setCancelFor] = useState<MyAttendanceRequest | null>(null);
  const qc = useQueryClient();
  const toast = useToast();

  const query = useQuery({
    queryKey: myAttendanceRequestsKey,
    queryFn: () => api.get('/human-resources/attendance/requests/me').then((r) => r.data.data as MyAttendanceRequest[]),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api.delete(`/human-resources/attendance/requests/${id}`),
    onSuccess: () => { toast.success('Request cancelled.'); setCancelFor(null); invalidateAttendanceRequests(qc); },
    onError: (err) => { toast.error(apiMessage(err, 'Could not cancel the request.')); setCancelFor(null); },
  });

  const columns: Column<MyAttendanceRequest>[] = [
    { header: 'Type', render: (r) => requestTypeLabel(r.type), sortValue: (r) => r.type },
    { header: 'Date(s)', render: (r) => (r.fromDate === r.toDate ? fmtDate(r.fromDate) : `${fmtDate(r.fromDate)} – ${fmtDate(r.toDate)}`), sortValue: (r) => r.fromDate },
    { header: 'Requested time', render: (r) => (r.requestedCheckIn || r.requestedCheckOut) ? <span className="num">{fmtRequestTime(r.requestedCheckIn)} – {fmtRequestTime(r.requestedCheckOut)}</span> : '—' },
    { header: 'Reason', render: (r) => r.reason ?? '—' },
    { header: 'Status', render: (r) => <Badge status={r.status}>{titleCase(r.status)}</Badge>, sortValue: (r) => r.status },
    {
      header: '',
      render: (r) => r.status === 'PENDING'
        ? <button type="button" className="ghost sm danger" onClick={() => setCancelFor(r)}><Ban size={14} /> Cancel</button>
        : <span className="muted">—</span>,
    },
  ];

  // Self-service reads the caller's OWN employee record, so an admin login with
  // no employee linked to it (a standalone Super Admin / HR account) gets a 404
  // rather than an empty list. Say so, instead of offering a "Raise request"
  // the API would reject.
  if (query.isError) {
    return (
      <div className="panel pad">
        <EmptyState
          variant="error"
          title="Self-service is unavailable for this account"
          message={apiMessage(query.error, 'Could not load your attendance requests.')}
        />
      </div>
    );
  }

  return (
    <>
      <div className="bulk-bar">
        <span className="bulk-count">Your attendance corrections</span>
        <span className="bulk-spacer" />
        <button type="button" onClick={() => setRaising(true)}><ListChecks size={14} /> Raise request</button>
      </div>

      <DataTable
        columns={columns}
        rows={query.data ?? []}
        loading={query.isLoading}
        empty="You have not raised any attendance request."
        searchPlaceholder="Search your requests…"
      />

      {raising && <RaiseRequestModal onClose={() => setRaising(false)} />}

      {cancelFor && (
        <ConfirmDialog
          tone="danger"
          icon={<Ban size={20} />}
          title="Cancel this request?"
          message={`Your ${requestTypeLabel(cancelFor.type)} request will be cancelled.`}
          confirmLabel="Cancel request"
          cancelLabel="Keep it"
          loading={cancel.isPending}
          onConfirm={() => cancel.mutate(cancelFor.id)}
          onCancel={() => setCancelFor(null)}
        />
      )}
    </>
  );
}

const emptyForm = { type: 'MISSING_PUNCH' as AttendanceRequestType, fromDate: '', toDate: '', checkIn: '', checkOut: '', reason: '' };

/** Raise an attendance correction for oneself. Mirrors the Field Officer form. */
function RaiseRequestModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  const isRange = isRangeRequest(form.type);
  const isPunch = isPunchRequest(form.type);

  const raise = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { type: form.type, fromDate: form.fromDate, reason: form.reason.trim() || undefined };
      if (isRange && form.toDate) body.toDate = form.toDate;
      if (form.checkIn) body.requestedCheckIn = `${form.fromDate}T${form.checkIn}:00`;
      if (form.checkOut) body.requestedCheckOut = `${form.fromDate}T${form.checkOut}:00`;
      return api.post('/human-resources/attendance/requests', body);
    },
    onSuccess: () => { toast.success('Request submitted. HR will review it.'); invalidateAttendanceRequests(qc); onClose(); },
    onError: (err) => setError(apiMessage(err, 'Could not submit the request.')),
  });

  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); raise.mutate(); };
  const disabled = raise.isPending || !form.fromDate || (isPunch && !form.checkIn);

  return (
    <Modal
      onClose={onClose}
      icon={<ListChecks size={20} />}
      title="Raise attendance request"
      subtitle="Missing punch, regularization, outdoor duty, work from home or permission."
      footer={<>
        <button type="button" className="ghost" onClick={onClose}>Cancel</button>
        <button type="submit" form="raise-attendance-request" disabled={disabled}>{raise.isPending ? 'Submitting…' : 'Submit request'}</button>
      </>}
    >
      <form id="raise-attendance-request" className="form-grid" onSubmit={submit}>
        <label className="span-all">Type
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AttendanceRequestType })}>
            {REQUEST_TYPES.map((t) => <option key={t} value={t}>{requestTypeLabel(t)}</option>)}
          </select>
        </label>
        <label>{isRange ? 'From' : 'Date'}
          <input type="date" value={form.fromDate} onChange={(e) => setForm({ ...form, fromDate: e.target.value })} required />
        </label>
        {isRange && (
          <label>To
            <input type="date" value={form.toDate} min={form.fromDate || undefined} onChange={(e) => setForm({ ...form, toDate: e.target.value })} />
          </label>
        )}
        {isPunch && (
          <label>Check in
            <input type="time" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} required />
          </label>
        )}
        {isPunch && (
          <label>Check out
            <input type="time" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} />
          </label>
        )}
        <label className="span-all">Reason
          <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} maxLength={500} placeholder="Explain the correction" />
        </label>
        {error && <div className="error-box span-all">{error}</div>}
      </form>
    </Modal>
  );
}
