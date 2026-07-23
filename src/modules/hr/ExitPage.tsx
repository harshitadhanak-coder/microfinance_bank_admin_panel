import { FormEvent, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FilterBar } from '../../components/FilterBar';
import { Badge } from '../../components/Badge';
import { Modal } from '../../components/Modal';
import { LogOut, Check } from '../../components/icons';
import { apiMessage, fmtDate, inr, titleCase } from '../../lib/format';
import { useToast } from '../../components/Toast';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';

const STATUSES = ['ALL', 'SUBMITTED', 'UNDER_REVIEW', 'NOTICE_PERIOD', 'CLEARANCE', 'SETTLEMENT', 'COMPLETED', 'WITHDRAWN', 'REJECTED'] as const;
type StatusFilter = (typeof STATUSES)[number];

interface ClearanceItem { id: string; department: string; label: string; status: string; remarks: string | null }
interface FinalSettlement { unpaidSalary: string; leaveEncashment: string; gratuity: string; deductions: string; loanRecovery: string; advanceRecovery: string; netPayable: string }
interface Resignation {
  id: string;
  reason: string | null;
  resignationDate: string;
  requestedLastWorkingDate: string;
  approvedLastWorkingDate: string | null;
  noticePeriodDays: number;
  status: string;
  employee: { id: string; fullName: string; employeeCode: string; designation: string; branch: { name: string } | null };
  clearanceItems?: ClearanceItem[];
  finalSettlement?: FinalSettlement | null;
}

const label = (s: string) => titleCase(s.replace(/_/g, ' '));

export default function ExitPage() {
  const { user } = useAuth();
  const canManage = can(user?.role, 'exit:manage');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [openId, setOpenId] = useState<string | null>(null);

  const listUrl = `/human-resources/exit/resignations${status === 'ALL' ? '' : `?status=${status}`}`;
  const query = useQuery({
    queryKey: [listUrl],
    queryFn: () => api.get(listUrl).then((r) => r.data.data as Resignation[]),
    placeholderData: keepPreviousData,
  });

  const columns: Column<Resignation>[] = [
    { header: 'Employee', render: (r) => <><strong>{r.employee.fullName}</strong><div className="muted sm-text">{r.employee.employeeCode} · {r.employee.designation}</div></>, sortValue: (r) => r.employee.fullName },
    { header: 'Branch', render: (r) => r.employee.branch?.name ?? '—' },
    { header: 'Resigned', render: (r) => fmtDate(r.resignationDate), sortValue: (r) => r.resignationDate },
    { header: 'Last working day', render: (r) => fmtDate(r.approvedLastWorkingDate ?? r.requestedLastWorkingDate) },
    { header: 'Notice', render: (r) => <span className="num">{r.noticePeriodDays}d</span> },
    { header: 'Status', render: (r) => <Badge status={r.status}>{label(r.status)}</Badge>, sortValue: (r) => r.status },
    { header: '', render: (r) => <button className="ghost sm" onClick={() => setOpenId(r.id)}>Open</button> },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Human Resources' }, { label: 'Exit Management' }]}
        title="Exit Management"
        subtitle={canManage ? 'Review resignations through notice, clearance, full-&-final settlement and exit.' : 'Team resignations (read-only).'}
      />
      <FilterBar chips={status !== 'ALL' ? [{ key: 'status', label: `Status: ${label(status)}`, onRemove: () => setStatus('ALL') }] : []} onReset={status !== 'ALL' ? () => setStatus('ALL') : undefined}>
        <label>Status
          <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s === 'ALL' ? 'All' : label(s)}</option>)}
          </select>
        </label>
      </FilterBar>

      <DataTable columns={columns} rows={query.data ?? []} loading={query.isLoading} empty="No resignations." searchPlaceholder="Search by employee…" />

      {openId && <ExitDetailModal id={openId} canManage={canManage} onClose={() => setOpenId(null)} />}
    </>
  );
}

function ExitDetailModal({ id, canManage, onClose }: { id: string; canManage: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState('');
  const [approve, setApprove] = useState(false);
  const [lwd, setLwd] = useState('');
  const [notice, setNotice] = useState('30');

  const detailUrl = `/human-resources/exit/resignations/${id}`;
  const query = useQuery({ queryKey: [detailUrl], queryFn: () => api.get(detailUrl).then((r) => r.data.data as Resignation) });
  const r = query.data;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: [detailUrl] });
    qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/human-resources/exit/resignations') });
  };

  const act = useMutation({
    mutationFn: (input: { path: string; body?: unknown }) => api.post(`${detailUrl}${input.path}`, input.body ?? {}),
    onSuccess: (_res, input) => { refresh(); toast.success('Done.'); if (input.path === '/approve') setApprove(false); },
    onError: (err) => setError(apiMessage(err, 'Action failed.')),
  });

  const clearItem = useMutation({
    mutationFn: (item: ClearanceItem) => api.put(`${detailUrl}/clearance`, { items: [{ id: item.id, status: item.status === 'CLEARED' ? 'PENDING' : 'CLEARED' }] }),
    onSuccess: () => refresh(),
    onError: (err) => setError(apiMessage(err, 'Could not update clearance.')),
  });

  const canReview = r?.status === 'SUBMITTED';
  const canApprove = r?.status === 'SUBMITTED' || r?.status === 'UNDER_REVIEW';
  const canSettle = r && ['NOTICE_PERIOD', 'CLEARANCE', 'SETTLEMENT'].includes(r.status);
  const canComplete = r?.status === 'SETTLEMENT';

  const submitApprove = (e: FormEvent) => { e.preventDefault(); setError(''); act.mutate({ path: '/approve', body: { approvedLastWorkingDate: lwd || undefined, noticePeriodDays: Number(notice) } }); };

  return (
    <Modal
      size="lg"
      onClose={onClose}
      icon={<LogOut size={20} />}
      title={r ? `Exit · ${r.employee.fullName}` : 'Exit'}
      subtitle={r ? `${r.employee.employeeCode} · ${label(r.status)}` : ''}
      footer={<button type="button" className="ghost" onClick={onClose}>Close</button>}
    >
      {!r ? <p className="muted">Loading…</p> : (
        <div className="exit-detail">
          <div className="kv-grid">
            <div><span className="muted sm-text">Resigned on</span><div>{fmtDate(r.resignationDate)}</div></div>
            <div><span className="muted sm-text">Requested LWD</span><div>{fmtDate(r.requestedLastWorkingDate)}</div></div>
            <div><span className="muted sm-text">Approved LWD</span><div>{r.approvedLastWorkingDate ? fmtDate(r.approvedLastWorkingDate) : '—'}</div></div>
            <div><span className="muted sm-text">Notice</span><div>{r.noticePeriodDays} days</div></div>
          </div>
          {r.reason && <p className="muted"><strong>Reason:</strong> {r.reason}</p>}

          {canManage && (
            <div className="action-bar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
              {canReview && <button className="ghost sm" onClick={() => act.mutate({ path: '/review' })}>Move to review</button>}
              {canApprove && <button className="sm" onClick={() => setApprove(true)}>Approve</button>}
              {canApprove && <button className="ghost sm danger" onClick={() => act.mutate({ path: '/reject' })}>Reject</button>}
              {canSettle && <button className="ghost sm" onClick={() => act.mutate({ path: '/settlement' })}>Compute F&amp;F</button>}
              {canComplete && <button className="sm" onClick={() => act.mutate({ path: '/complete' })}>Complete exit</button>}
            </div>
          )}

          {approve && (
            <form className="form-grid card" onSubmit={submitApprove} style={{ padding: 12, marginBottom: 12 }}>
              <label>Approved last working day<input type="date" value={lwd} onChange={(e) => setLwd(e.target.value)} /></label>
              <label>Notice period (days)<input type="number" min="0" value={notice} onChange={(e) => setNotice(e.target.value)} /></label>
              <div className="span-all" style={{ display: 'flex', gap: 8 }}>
                <button type="submit" disabled={act.isPending}>Confirm approval</button>
                <button type="button" className="ghost" onClick={() => setApprove(false)}>Cancel</button>
              </div>
            </form>
          )}

          {!!r.clearanceItems?.length && (
            <section>
              <h4>Clearance checklist</h4>
              <ul className="clearance-list">
                {r.clearanceItems.map((it) => (
                  <li key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Badge status={it.status === 'CLEARED' ? 'APPROVED' : 'PENDING'}>{titleCase(it.status)}</Badge>
                    <span><strong>{it.department}</strong> — {it.label}</span>
                    {canManage && <button className="ghost sm" style={{ marginLeft: 'auto' }} disabled={clearItem.isPending} onClick={() => clearItem.mutate(it)}>{it.status === 'CLEARED' ? 'Undo' : <><Check size={13} /> Clear</>}</button>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {r.finalSettlement && (
            <section>
              <h4>Full &amp; final settlement</h4>
              <div className="kv-grid">
                <div><span className="muted sm-text">Unpaid salary</span><div className="num">{inr(r.finalSettlement.unpaidSalary)}</div></div>
                <div><span className="muted sm-text">Leave encashment</span><div className="num">{inr(r.finalSettlement.leaveEncashment)}</div></div>
                <div><span className="muted sm-text">Gratuity</span><div className="num">{inr(r.finalSettlement.gratuity)}</div></div>
                <div><span className="muted sm-text">Loan + advance recovery</span><div className="num">{inr(Number(r.finalSettlement.loanRecovery) + Number(r.finalSettlement.advanceRecovery))}</div></div>
                <div><span className="muted sm-text">Deductions</span><div className="num">{inr(r.finalSettlement.deductions)}</div></div>
                <div><span className="muted sm-text"><strong>Net payable</strong></span><div className="num"><strong>{inr(r.finalSettlement.netPayable)}</strong></div></div>
              </div>
            </section>
          )}

          {error && <div className="error-box">{error}</div>}
        </div>
      )}
    </Modal>
  );
}
