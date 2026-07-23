import { FormEvent, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FilterBar } from '../../components/FilterBar';
import { Badge } from '../../components/Badge';
import { Modal } from '../../components/Modal';
import { Check, Ban, ListChecks } from '../../components/icons';
import { apiMessage, fmtDate, titleCase } from '../../lib/format';
import { useToast } from '../../components/Toast';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';

const TYPES = ['MISSING_PUNCH', 'REGULARIZATION', 'WRONG_TIMING', 'OUTDOOR_DUTY', 'WORK_FROM_HOME', 'PERMISSION'] as const;
const STATUSES = ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
type StatusFilter = (typeof STATUSES)[number];

interface AttendanceRequest {
  id: string;
  type: string;
  fromDate: string;
  toDate: string;
  requestedCheckIn: string | null;
  requestedCheckOut: string | null;
  reason: string | null;
  status: string;
  createdAt: string;
  employee: { fullName: string; employeeCode: string; branch: { name: string } | null };
}

const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—');
const label = (t: string) => titleCase(t.replace(/_/g, ' '));

export default function AttendanceRequestsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const toast = useToast();
  const canApprove = can(user?.role, 'attendance:approve');

  const [status, setStatus] = useState<StatusFilter>('PENDING');
  const [type, setType] = useState('ALL');
  const [decideFor, setDecideFor] = useState<{ req: AttendanceRequest; decision: 'APPROVED' | 'REJECTED' } | null>(null);

  const params = new URLSearchParams();
  if (status !== 'ALL') params.set('status', status);
  if (type !== 'ALL') params.set('type', type);
  const listUrl = `/human-resources/attendance/requests${params.toString() ? `?${params}` : ''}`;

  const query = useQuery({
    queryKey: [listUrl],
    queryFn: () => api.get(listUrl).then((r) => r.data.data as AttendanceRequest[]),
    placeholderData: keepPreviousData,
  });

  const columns: Column<AttendanceRequest>[] = [
    { header: 'Employee', render: (r) => <><strong>{r.employee.fullName}</strong><div className="muted sm-text">{r.employee.employeeCode}{r.employee.branch ? ` · ${r.employee.branch.name}` : ''}</div></>, sortValue: (r) => r.employee.fullName },
    { header: 'Type', render: (r) => label(r.type), sortValue: (r) => r.type },
    { header: 'Date(s)', render: (r) => r.fromDate === r.toDate ? fmtDate(r.fromDate) : `${fmtDate(r.fromDate)} – ${fmtDate(r.toDate)}`, sortValue: (r) => r.fromDate },
    { header: 'Requested time', render: (r) => (r.requestedCheckIn || r.requestedCheckOut) ? <span className="num">{fmtTime(r.requestedCheckIn)} – {fmtTime(r.requestedCheckOut)}</span> : '—' },
    { header: 'Reason', render: (r) => r.reason ?? '—' },
    { header: 'Status', render: (r) => <Badge status={r.status}>{titleCase(r.status)}</Badge>, sortValue: (r) => r.status },
  ];

  if (canApprove) {
    columns.push({
      header: '',
      render: (r) => r.status === 'PENDING' ? (
        <div className="actions-cell" style={{ gap: 6 }}>
          <button className="ghost sm ok" onClick={() => setDecideFor({ req: r, decision: 'APPROVED' })}><Check size={14} /> Approve</button>
          <button className="ghost sm danger" onClick={() => setDecideFor({ req: r, decision: 'REJECTED' })}><Ban size={14} /> Reject</button>
        </div>
      ) : <span className="muted">—</span>,
    });
  }

  const chips = [
    ...(status !== 'PENDING' ? [{ key: 'status', label: `Status: ${titleCase(status)}`, onRemove: () => setStatus('PENDING') }] : []),
    ...(type !== 'ALL' ? [{ key: 'type', label: `Type: ${label(type)}`, onRemove: () => setType('ALL') }] : []),
  ];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Human Resources' }, { label: 'Attendance Requests' }]}
        title="Attendance Requests"
        subtitle={canApprove ? 'Approve or reject employee corrections — approval applies the change to attendance.' : 'Team attendance requests (read-only).'}
      />

      <FilterBar chips={chips} onReset={chips.length ? () => { setStatus('PENDING'); setType('ALL'); } : undefined}>
        <label>Status
          <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s === 'ALL' ? 'All' : titleCase(s)}</option>)}
          </select>
        </label>
        <label>Type
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="ALL">All types</option>
            {TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </select>
        </label>
      </FilterBar>

      <DataTable columns={columns} rows={query.data ?? []} loading={query.isLoading} empty="No attendance requests." searchPlaceholder="Search by employee…" />

      {decideFor && (
        <DecideModal
          request={decideFor.req}
          decision={decideFor.decision}
          onClose={() => setDecideFor(null)}
          onDone={(msg) => { setDecideFor(null); qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/human-resources/attendance/requests') }); toast.success(msg); }}
        />
      )}
    </>
  );
}

function DecideModal({ request, decision, onClose, onDone }: { request: AttendanceRequest; decision: 'APPROVED' | 'REJECTED'; onClose: () => void; onDone: (msg: string) => void }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const save = useMutation({
    mutationFn: () => api.post(`/human-resources/attendance/requests/${request.id}/decision`, { decision, ...(note.trim() ? { decisionNote: note.trim() } : {}) }),
    onSuccess: () => onDone(`Request ${decision.toLowerCase()}.`),
    onError: (err) => setError(apiMessage(err, 'Could not record the decision.')),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); save.mutate(); };
  const approving = decision === 'APPROVED';

  return (
    <Modal
      size="sm"
      onClose={onClose}
      icon={<ListChecks size={20} />}
      title={approving ? 'Approve request' : 'Reject request'}
      subtitle={`${request.employee.fullName} · ${label(request.type)}`}
      footer={<>
        <button type="button" className="ghost" onClick={onClose}>Cancel</button>
        <button type="submit" form="decide-form" className={approving ? '' : 'danger'} disabled={save.isPending}>{save.isPending ? 'Saving…' : approving ? 'Approve' : 'Reject'}</button>
      </>}
    >
      <form id="decide-form" className="form-grid" onSubmit={submit}>
        <p className="span-all muted">{approving ? 'Approving applies the correction to the employee\'s attendance and notifies them.' : 'The employee is notified of the rejection.'}</p>
        <label className="span-all">Note<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" /></label>
        {error && <div className="error-box span-all">{error}</div>}
      </form>
    </Modal>
  );
}
