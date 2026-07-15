import { useState } from 'react';
import { AxiosError } from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Modal';
import { CalendarCheck, ListChecks, Loader, Wallet } from '../../components/icons';
import { fmtDate, fmtDayMonth, titleCase, apiMessage } from '../../lib/format';
import { useToast } from '../../components/Toast';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';

interface LeaveRow {
  id: string;
  employeeId: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  numberOfDays: string;
  reason?: string | null;
  status: string;
  employee: { fullName: string; employeeCode: string; branch?: { name: string } | null };
}

const STATUS_FILTERS = ['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

// CASUAL/SICK/EARNED/UNPAID plus the statutory MATERNITY/PATERNITY categories.
const LEAVE_TYPES = ['CASUAL', 'SICK', 'EARNED', 'UNPAID', 'MATERNITY', 'PATERNITY'] as const;
type TypeFilter = 'ALL' | (typeof LEAVE_TYPES)[number];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const now = new Date();
const CURRENT_MONTH = now.getMonth() + 1;
const CURRENT_YEAR = now.getFullYear();
const CALENDAR_YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

type Decision = 'APPROVED' | 'REJECTED';

export default function LeavePage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [decisionFor, setDecisionFor] = useState<{ leave: LeaveRow; decision: Decision } | null>(null);
  const [note, setNote] = useState('');
  const [balancesFor, setBalancesFor] = useState<LeaveRow | null>(null);

  const canDecide = can(user?.role, 'leave:decide');
  const canAccrue = can(user?.role, 'leave:accrue');

  const listUrl = `/human-resources/leaves?pageSize=100${status === 'ALL' ? '' : `&status=${status}`}`;
  const query = useQuery({
    queryKey: [listUrl],
    queryFn: () => api.get(listUrl).then((r) => r.data.data as LeaveRow[]),
  });

  const rows = (query.data ?? []).filter((l) => typeFilter === 'ALL' || l.leaveType === typeFilter);

  const decide = useMutation({
    mutationFn: ({ id, decision, decisionNote }: { id: string; decision: Decision; decisionNote?: string }) =>
      api.post(`/human-resources/leaves/${id}/decision`, { decision, ...(decisionNote ? { decisionNote } : {}) }),
    onSuccess: (_res, variables) => {
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/human-resources/leaves') });
      toast.success(variables.decision === 'APPROVED' ? 'Leave approved.' : 'Leave rejected.');
      setDecisionFor(null);
      setNote('');
    },
    onError: (err) => toast.error(apiMessage(err, 'Could not record the decision.')),
  });

  const accrual = useMutation({
    mutationFn: () => api.post('/human-resources/leaves/accrual/run', { month: CURRENT_MONTH, year: CURRENT_YEAR }),
    onSuccess: (res) => {
      const count = res.data?.data?.employeeCount as number | undefined;
      const base = (res.data?.message as string | undefined) || 'Leave accrual completed.';
      toast.success(typeof count === 'number' ? `${base} (${count} employees)` : base);
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/human-resources/leaves') });
    },
    onError: (err) => {
      const msg = apiMessage(err, 'Could not run leave accrual.');
      // 409 = the period was already accrued (idempotent) — surface it as info, not an error.
      if (err instanceof AxiosError && err.response?.status === 409) toast.info(msg);
      else toast.error(msg);
    },
  });

  const columns: Column<LeaveRow>[] = [
    { header: 'Employee', render: (l) => <strong>{l.employee.fullName}</strong>, sortValue: (l) => l.employee.fullName },
    { header: 'Branch', render: (l) => l.employee.branch?.name ?? '—', sortValue: (l) => l.employee.branch?.name ?? '' },
    { header: 'Type', render: (l) => titleCase(l.leaveType), sortValue: (l) => l.leaveType },
    { header: 'From', render: (l) => fmtDate(l.fromDate), sortValue: (l) => l.fromDate },
    { header: 'To', render: (l) => fmtDate(l.toDate), sortValue: (l) => l.toDate },
    { header: 'Days', render: (l) => l.numberOfDays, sortValue: (l) => Number(l.numberOfDays) },
    { header: 'Reason', render: (l) => l.reason ?? '—' },
    { header: 'Status', render: (l) => <span className={`pill pill-${l.status.toLowerCase()}`}>{l.status}</span>, sortValue: (l) => l.status },
    {
      header: 'Actions',
      render: (l) => (
        <div className="row-actions">
          <button type="button" className="sm ghost" onClick={() => setBalancesFor(l)}>Balances</button>
          {canDecide && l.status === 'PENDING' && (
            <>
              <button type="button" className="sm ghost" disabled={decide.isPending} onClick={() => { setNote(''); setDecisionFor({ leave: l, decision: 'APPROVED' }); }}>Approve</button>
              <button type="button" className="sm ghost danger" disabled={decide.isPending} onClick={() => { setNote(''); setDecisionFor({ leave: l, decision: 'REJECTED' }); }}>Reject</button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Human Resources' }, { label: 'Leave' }]}
        title="Leave requests"
        subtitle="Review and decide staff leave applications"
        actions={(
          <>
            <button type="button" className={`sm ${view === 'list' ? '' : 'ghost'}`} onClick={() => setView('list')}><ListChecks size={15} /> List</button>
            <button type="button" className={`sm ${view === 'calendar' ? '' : 'ghost'}`} onClick={() => setView('calendar')}><CalendarCheck size={15} /> Calendar</button>
            {canAccrue && (
              <button type="button" className="ghost" disabled={accrual.isPending} onClick={() => accrual.mutate()}>
                {accrual.isPending ? <><Loader size={15} /> Running…</> : <><CalendarCheck size={15} /> Run leave accrual</>}
              </button>
            )}
          </>
        )}
      />

      {view === 'list' ? (
        <>
          <div className="filter-row">
            {STATUS_FILTERS.map((s) => (
              <button key={s} type="button" className={`sm ${status === s ? '' : 'ghost'}`} onClick={() => setStatus(s)}>
                {s === 'ALL' ? 'All' : titleCase(s)}
              </button>
            ))}
            <label className="inline-field">Type
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}>
                <option value="ALL">All types</option>
                {LEAVE_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
              </select>
            </label>
          </div>

          <DataTable
            columns={columns}
            rows={rows}
            loading={query.isLoading}
            empty="No leave requests found."
            searchPlaceholder="Search by employee or branch…"
          />
        </>
      ) : (
        <LeaveCalendarView />
      )}

      {decisionFor && (
        <Modal
          size="sm"
          onClose={() => { if (!decide.isPending) { setDecisionFor(null); setNote(''); } }}
          title={decisionFor.decision === 'APPROVED' ? 'Approve leave' : 'Reject leave'}
          subtitle={`${decisionFor.leave.employee.fullName} · ${titleCase(decisionFor.leave.leaveType)} · ${fmtDayMonth(decisionFor.leave.fromDate)}–${fmtDayMonth(decisionFor.leave.toDate)}`}
          footer={
            <>
              <button type="button" className="ghost" disabled={decide.isPending} onClick={() => { setDecisionFor(null); setNote(''); }}>Cancel</button>
              <button
                type="submit"
                form="decision-form"
                className={decisionFor.decision === 'REJECTED' ? 'danger' : ''}
                disabled={decide.isPending}
              >
                {decide.isPending ? 'Working…' : decisionFor.decision === 'APPROVED' ? 'Approve' : 'Reject'}
              </button>
            </>
          }
        >
          <form
            id="decision-form"
            className="form-grid"
            onSubmit={(e) => { e.preventDefault(); decide.mutate({ id: decisionFor.leave.id, decision: decisionFor.decision, decisionNote: note.trim() || undefined }); }}
          >
            <label className="span-all">Decision note
              <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for the applicant" />
            </label>
          </form>
        </Modal>
      )}

      {balancesFor && <BalancesModal leave={balancesFor} onClose={() => setBalancesFor(null)} />}
    </>
  );
}

// ── Leave balance chips ─────────────────────────────────────────────────────
interface LeaveBalance {
  leaveType: string;
  isPaid: boolean;
  annualEntitlement: number;
  opening: number;
  accrued: number;
  used: number;
  encashed: number;
  available: number;
}
interface BalancesResponse { year: number; balances: LeaveBalance[] }

function BalancesModal({ leave, onClose }: { leave: LeaveRow; onClose: () => void }) {
  const url = `/human-resources/leaves/balances?employeeId=${encodeURIComponent(leave.employeeId)}`;
  const query = useQuery({
    queryKey: [url],
    queryFn: () => api.get(url).then((r) => r.data.data as BalancesResponse),
  });

  const paid = (query.data?.balances ?? []).filter((b) => b.isPaid);

  return (
    <Modal
      size="md"
      onClose={onClose}
      icon={<Wallet size={20} />}
      title="Leave balances"
      subtitle={`${leave.employee.fullName}${query.data ? ` · ${query.data.year}` : ''}`}
      footer={<button type="button" className="ghost" onClick={onClose}>Close</button>}
    >
      <div className="modal-body">
        {query.isLoading ? (
          <p className="muted">Loading balances…</p>
        ) : paid.length === 0 ? (
          <p className="muted">No paid leave balances found for this employee.</p>
        ) : (
          <div className="bal-chips">
            {paid.map((b) => (
              <div key={b.leaveType} className={`bal-chip${b.available <= 1 ? ' bal-low' : ''}`}>
                <div className="bal-type">{titleCase(b.leaveType)}</div>
                <div className="bal-avail">{b.available}</div>
                <div className="bal-sub">used {b.used} / {b.opening + b.accrued}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Team leave calendar ─────────────────────────────────────────────────────
interface CalendarEntry {
  leaveId: string;
  employee: { fullName: string; employeeCode: string; branch?: { name: string } | null };
  leaveType: string;
  fromDate: string;
  toDate: string;
}
interface CalendarResponse { month: number; year: number; entries: CalendarEntry[] }

function LeaveCalendarView() {
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [year, setYear] = useState(CURRENT_YEAR);

  const url = `/human-resources/leaves/calendar?month=${month}&year=${year}`;
  const query = useQuery({
    queryKey: [url],
    queryFn: () => api.get(url).then((r) => r.data.data as CalendarResponse),
  });

  const entries = query.data?.entries ?? [];

  return (
    <>
      <div className="filter-row">
        <label className="inline-field">Month
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </label>
        <label className="inline-field">Year
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {CALENDAR_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </div>

      {query.isLoading ? (
        <div className="panel pad muted">Loading calendar…</div>
      ) : entries.length === 0 ? (
        <div className="panel pad muted">No one is on approved leave in {MONTHS[month - 1]} {year}.</div>
      ) : (
        <div className="panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Branch</th>
                  <th>Type</th>
                  <th>Dates</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.leaveId}>
                    <td><strong>{e.employee.fullName}</strong> <span className="muted sm-text">{e.employee.employeeCode}</span></td>
                    <td>{e.employee.branch?.name ?? '—'}</td>
                    <td><span className="pill">{titleCase(e.leaveType)}</span></td>
                    <td>{fmtDayMonth(e.fromDate)}–{fmtDayMonth(e.toDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
