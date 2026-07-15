import { FormEvent, useState } from 'react';
import { AxiosError } from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FilterBar } from '../../components/FilterBar';
import { Badge } from '../../components/Badge';
import { Tabs, TabDef } from '../../components/Tabs';
import { ActionMenu } from '../../components/ActionMenu';
import { Drawer } from '../../components/Drawer';
import { Modal } from '../../components/Modal';
import { CalendarCheck, Check, Loader, Wallet, X } from '../../components/icons';
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
const LEAVE_TYPES = ['CASUAL', 'SICK', 'EARNED', 'UNPAID', 'MATERNITY', 'PATERNITY'] as const;
type TypeFilter = 'ALL' | (typeof LEAVE_TYPES)[number];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const now = new Date();
const CURRENT_MONTH = now.getMonth() + 1;
const CURRENT_YEAR = now.getFullYear();
const CALENDAR_YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

type Decision = 'APPROVED' | 'REJECTED';
/** A pending decision — one leave (`single`) or many selected leaves (`bulk`). */
type DecisionTarget =
  | { kind: 'single'; leave: LeaveRow; decision: Decision }
  | { kind: 'bulk'; ids: string[]; decision: Decision };

export default function LeavePage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [decisionTarget, setDecisionTarget] = useState<DecisionTarget | null>(null);
  const [balancesFor, setBalancesFor] = useState<LeaveRow | null>(null);

  const canDecide = can(user?.role, 'leave:decide');
  const canAccrue = can(user?.role, 'leave:accrue');

  const listUrl = `/human-resources/leaves?pageSize=100${status === 'ALL' ? '' : `&status=${status}`}`;
  const query = useQuery({
    queryKey: [listUrl],
    queryFn: () => api.get(listUrl).then((r) => r.data.data as LeaveRow[]),
  });

  const rows = (query.data ?? []).filter((l) => typeFilter === 'ALL' || l.leaveType === typeFilter);
  const refreshLeaves = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/human-resources/leaves') });

  // Selected leaves that are actually decidable (PENDING) — the bulk bar targets these.
  const pendingSelected = rows.filter((l) => selectedIds.has(l.id) && l.status === 'PENDING');

  const decide = useMutation({
    mutationFn: ({ id, decision, decisionNote }: { id: string; decision: Decision; decisionNote?: string }) =>
      api.post(`/human-resources/leaves/${id}/decision`, { decision, ...(decisionNote ? { decisionNote } : {}) }),
    onSuccess: (_res, variables) => {
      refreshLeaves();
      toast.success(variables.decision === 'APPROVED' ? 'Leave approved.' : 'Leave rejected.');
      setDecisionTarget(null);
    },
    onError: (err) => toast.error(apiMessage(err, 'Could not record the decision.')),
  });

  // Bulk = one single-decision request per leave (no bulk endpoint); reports a summary.
  const bulkDecide = useMutation({
    mutationFn: async ({ ids, decision, decisionNote }: { ids: string[]; decision: Decision; decisionNote?: string }) => {
      const results = await Promise.allSettled(
        ids.map((id) => api.post(`/human-resources/leaves/${id}/decision`, { decision, ...(decisionNote ? { decisionNote } : {}) })),
      );
      return { ok: results.filter((r) => r.status === 'fulfilled').length, failed: results.filter((r) => r.status === 'rejected').length, decision };
    },
    onSuccess: ({ ok, failed, decision }) => {
      refreshLeaves();
      setSelectedIds(new Set());
      setDecisionTarget(null);
      const verb = decision === 'APPROVED' ? 'approved' : 'rejected';
      if (failed === 0) toast.success(`${ok} leave request${ok === 1 ? '' : 's'} ${verb}.`);
      else toast.info(`${ok} ${verb}, ${failed} could not be processed.`);
    },
    onError: (err) => { setDecisionTarget(null); toast.error(apiMessage(err, 'Could not process the bulk decision.')); },
  });

  const accrual = useMutation({
    mutationFn: () => api.post('/human-resources/leaves/accrual/run', { month: CURRENT_MONTH, year: CURRENT_YEAR }),
    onSuccess: (res) => {
      const count = res.data?.data?.employeeCount as number | undefined;
      const base = (res.data?.message as string | undefined) || 'Leave accrual completed.';
      toast.success(typeof count === 'number' ? `${base} (${count} employees)` : base);
      refreshLeaves();
    },
    onError: (err) => {
      const msg = apiMessage(err, 'Could not run leave accrual.');
      if (err instanceof AxiosError && err.response?.status === 409) toast.info(msg);
      else toast.error(msg);
    },
  });

  const columns: Column<LeaveRow>[] = [
    { header: 'Employee', render: (l) => <><strong>{l.employee.fullName}</strong><div className="muted sm-text">{l.employee.employeeCode}</div></>, sortValue: (l) => l.employee.fullName },
    { header: 'Branch', render: (l) => l.employee.branch?.name ?? '—', sortValue: (l) => l.employee.branch?.name ?? '' },
    { header: 'Type', render: (l) => titleCase(l.leaveType), sortValue: (l) => l.leaveType },
    { header: 'From', render: (l) => fmtDate(l.fromDate), sortValue: (l) => l.fromDate },
    { header: 'To', render: (l) => fmtDate(l.toDate), sortValue: (l) => l.toDate },
    { header: 'Days', render: (l) => <span className="num">{l.numberOfDays}</span>, sortValue: (l) => Number(l.numberOfDays) },
    { header: 'Reason', render: (l) => l.reason ?? '—' },
    { header: 'Status', render: (l) => <Badge status={l.status} />, sortValue: (l) => l.status },
    {
      header: '',
      render: (l) => (
        <div className="actions-cell">
          <ActionMenu
            items={[
              { key: 'balances', label: 'View balances', icon: <Wallet size={15} />, onSelect: () => setBalancesFor(l) },
              ...(canDecide && l.status === 'PENDING' ? [
                { key: 'approve', label: 'Approve', icon: <Check size={15} />, separatorBefore: true, onSelect: () => setDecisionTarget({ kind: 'single', leave: l, decision: 'APPROVED' }) },
                { key: 'reject', label: 'Reject', icon: <X size={15} />, tone: 'danger' as const, onSelect: () => setDecisionTarget({ kind: 'single', leave: l, decision: 'REJECTED' }) },
              ] : []),
            ]}
          />
        </div>
      ),
    },
  ];

  const viewTabs: TabDef[] = [
    { key: 'list', label: 'List' },
    { key: 'calendar', label: 'Calendar' },
  ];

  const typeChips = typeFilter !== 'ALL'
    ? [{ key: 'type', label: `Type: ${titleCase(typeFilter)}`, onRemove: () => setTypeFilter('ALL') }]
    : [];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Human Resources' }, { label: 'Leave' }]}
        title="Leave requests"
        subtitle="Review and decide staff leave applications"
        actions={canAccrue && (
          <button type="button" className="ghost" disabled={accrual.isPending} onClick={() => accrual.mutate()}>
            {accrual.isPending ? <><Loader size={15} /> Running…</> : <><CalendarCheck size={15} /> Run leave accrual</>}
          </button>
        )}
        tabs={<Tabs tabs={viewTabs} active={view} onChange={(t) => setView(t as 'list' | 'calendar')} />}
      />

      {view === 'list' ? (
        <>
          <FilterBar chips={typeChips} onReset={typeChips.length ? () => setTypeFilter('ALL') : undefined}>
            <label>Status
              <select value={status} onChange={(e) => { setStatus(e.target.value as StatusFilter); setSelectedIds(new Set()); }} aria-label="Filter by status">
                {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s === 'ALL' ? 'All statuses' : titleCase(s)}</option>)}
              </select>
            </label>
            <label>Type
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TypeFilter)} aria-label="Filter by leave type">
                <option value="ALL">All types</option>
                {LEAVE_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
              </select>
            </label>
          </FilterBar>

          {canDecide && pendingSelected.length > 0 && (
            <div className="bulk-bar">
              <span className="bulk-count">{pendingSelected.length} pending selected</span>
              <span className="bulk-spacer" />
              <button type="button" onClick={() => setDecisionTarget({ kind: 'bulk', ids: pendingSelected.map((l) => l.id), decision: 'APPROVED' })}><Check size={14} /> Approve all</button>
              <button type="button" className="ghost" onClick={() => setDecisionTarget({ kind: 'bulk', ids: pendingSelected.map((l) => l.id), decision: 'REJECTED' })}><X size={14} /> Reject all</button>
              <button type="button" className="ghost" onClick={() => setSelectedIds(new Set())}>Clear</button>
            </div>
          )}

          <DataTable
            columns={columns}
            rows={rows}
            loading={query.isLoading}
            empty="No leave requests found."
            searchPlaceholder="Search by employee or branch…"
            selection={canDecide ? { selectedIds, onChange: setSelectedIds } : undefined}
          />
        </>
      ) : (
        <LeaveCalendarView />
      )}

      {decisionTarget && (
        <DecisionModal
          target={decisionTarget}
          pending={decide.isPending || bulkDecide.isPending}
          onClose={() => setDecisionTarget(null)}
          onConfirm={(note) => {
            if (decisionTarget.kind === 'single') decide.mutate({ id: decisionTarget.leave.id, decision: decisionTarget.decision, decisionNote: note || undefined });
            else bulkDecide.mutate({ ids: decisionTarget.ids, decision: decisionTarget.decision, decisionNote: note || undefined });
          }}
        />
      )}

      {balancesFor && <BalancesDrawer leave={balancesFor} onClose={() => setBalancesFor(null)} />}
    </>
  );
}

// ── Approve/Reject decision (single or bulk), with an optional note ──────────
function DecisionModal({
  target, pending, onClose, onConfirm,
}: {
  target: DecisionTarget;
  pending: boolean;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  const approve = target.decision === 'APPROVED';
  const count = target.kind === 'bulk' ? target.ids.length : 1;
  const subtitle = target.kind === 'single'
    ? `${target.leave.employee.fullName} · ${titleCase(target.leave.leaveType)} · ${fmtDayMonth(target.leave.fromDate)}–${fmtDayMonth(target.leave.toDate)}`
    : `${count} pending leave request${count === 1 ? '' : 's'}`;
  const submit = (e: FormEvent) => { e.preventDefault(); onConfirm(note.trim()); };

  return (
    <Modal
      size="sm"
      onClose={() => { if (!pending) onClose(); }}
      title={approve ? (count > 1 ? `Approve ${count} leaves` : 'Approve leave') : (count > 1 ? `Reject ${count} leaves` : 'Reject leave')}
      subtitle={subtitle}
      footer={
        <>
          <button type="button" className="ghost" disabled={pending} onClick={onClose}>Cancel</button>
          <button type="submit" form="decision-form" className={approve ? '' : 'danger'} disabled={pending}>
            {pending ? 'Working…' : approve ? 'Approve' : 'Reject'}
          </button>
        </>
      }
    >
      <form id="decision-form" onSubmit={submit}>
        <label>Decision note
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for the applicant(s)" data-autofocus />
        </label>
      </form>
    </Modal>
  );
}

// ── Leave balances (peek) ────────────────────────────────────────────────────
interface LeaveBalance {
  leaveType: string; isPaid: boolean; annualEntitlement: number;
  opening: number; accrued: number; used: number; encashed: number; available: number;
}
interface BalancesResponse { year: number; balances: LeaveBalance[] }

function BalancesDrawer({ leave, onClose }: { leave: LeaveRow; onClose: () => void }) {
  const url = `/human-resources/leaves/balances?employeeId=${encodeURIComponent(leave.employeeId)}`;
  const query = useQuery({ queryKey: [url], queryFn: () => api.get(url).then((r) => r.data.data as BalancesResponse) });
  const paid = (query.data?.balances ?? []).filter((b) => b.isPaid);

  return (
    <Drawer
      onClose={onClose}
      title="Leave balances"
      subtitle={`${leave.employee.fullName}${query.data ? ` · ${query.data.year}` : ''}`}
      footer={<button onClick={onClose}>Close</button>}
    >
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
    </Drawer>
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
  const query = useQuery({ queryKey: [url], queryFn: () => api.get(url).then((r) => r.data.data as CalendarResponse) });
  const entries = query.data?.entries ?? [];

  return (
    <>
      <FilterBar>
        <label>Month
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </label>
        <label>Year
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {CALENDAR_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </FilterBar>

      {query.isLoading ? (
        <div className="panel pad muted">Loading calendar…</div>
      ) : entries.length === 0 ? (
        <div className="panel pad muted">No one is on approved leave in {MONTHS[month - 1]} {year}.</div>
      ) : (
        <div className="panel">
          <div className="table-scroll">
            <table>
              <thead><tr><th>Employee</th><th>Branch</th><th>Type</th><th>Dates</th></tr></thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.leaveId}>
                    <td><strong>{e.employee.fullName}</strong> <span className="muted sm-text">{e.employee.employeeCode}</span></td>
                    <td>{e.employee.branch?.name ?? '—'}</td>
                    <td>{titleCase(e.leaveType)}</td>
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
