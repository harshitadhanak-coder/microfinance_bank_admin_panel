import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FilterBar } from '../../components/FilterBar';
import { Badge } from '../../components/Badge';
import { Tabs, TabDef } from '../../components/Tabs';
import { ActionMenu } from '../../components/ActionMenu';
import { Drawer } from '../../components/Drawer';
import { Modal, ConfirmDialog } from '../../components/Modal';
import { CalendarCheck, Check, ListChecks, Loader, Plus, Ban, Wallet, X } from '../../components/icons';
import { fmtDate, fmtDayMonth, apiMessage } from '../../lib/format';
import { useToast } from '../../components/Toast';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import LeavePolicies from './LeavePolicies';
import MyLeave, { ApplyLeaveModal } from './MyLeave';
import {
  leaveApi, leaveKeys, invalidateLeave, isOpen, isCancellable, requestTypeLabel, currentApprover,
  STATUS_FILTERS, type StatusFilter, type LeaveRequestRow, type LedgerEntry,
} from './leaveShared';

/** Minimal employee shape for the "Record leave" picker. */
interface EmployeeOption { id: string; fullName: string; employeeCode: string }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const now = new Date();
const CURRENT_MONTH = now.getMonth() + 1;
const CURRENT_YEAR = now.getFullYear();
const CALENDAR_YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

type Decision = 'APPROVED' | 'REJECTED';
/** A pending decision — one request (`single`) or many selected (`bulk`). */
type DecisionTarget =
  | { kind: 'single'; leave: LeaveRequestRow; decision: Decision }
  | { kind: 'bulk'; ids: string[]; decision: Decision };

export default function LeavePage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const [view, setView] = useState<'list' | 'calendar' | 'myLeave' | 'policies'>('list');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [decisionTarget, setDecisionTarget] = useState<DecisionTarget | null>(null);
  const [balancesFor, setBalancesFor] = useState<LeaveRequestRow | null>(null);
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [pendingCancel, setPendingCancel] = useState<LeaveRequestRow | null>(null);

  const canDecide = can(user?.role, 'leave:decide');
  const canAccrue = can(user?.role, 'leave:accrue');
  const canManagePolicy = can(user?.role, 'leave:managePolicy');
  const canManageLeave = can(user?.role, 'leave:manage');

  const query = useQuery({
    queryKey: leaveKeys.requests(status),
    queryFn: () => leaveApi.listRequests({ status, limit: 100 }),
  });
  const typesQuery = useQuery({ queryKey: leaveKeys.types, queryFn: leaveApi.listTypes });

  const rows = useMemo(
    () => (query.data?.items ?? []).filter(
      (l) => typeFilter === 'ALL' || l.lines.some((line) => line.leaveType.code === typeFilter),
    ),
    [query.data, typeFilter],
  );
  const refreshLeaves = () => invalidateLeave(qc);

  // Only open requests are decidable — the bulk bar targets those.
  const openSelected = rows.filter((l) => selectedIds.has(l.id) && isOpen(l.status));

  const decide = useMutation({
    mutationFn: ({ id, decision, comments }: { id: string; decision: Decision; comments?: string }) =>
      leaveApi.decide(id, decision, comments),
    onSuccess: (_res, variables) => {
      refreshLeaves();
      toast.success(variables.decision === 'APPROVED' ? 'Leave approved.' : 'Leave rejected.');
      setDecisionTarget(null);
    },
    onError: (err) => toast.error(apiMessage(err, 'Could not record the decision.')),
  });

  // Bulk = one request per leave (there is no bulk endpoint); reports a summary.
  const bulkDecide = useMutation({
    mutationFn: async ({ ids, decision, comments }: { ids: string[]; decision: Decision; comments?: string }) => {
      const results = await Promise.allSettled(ids.map((id) => leaveApi.decide(id, decision, comments)));
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

  const employeesQuery = useQuery({
    queryKey: ['/employees', 'leave-book'],
    queryFn: () => api.get('/employees?pageSize=100').then((r) => r.data.data as EmployeeOption[]),
    enabled: canManageLeave,
  });

  /**
   * HR cancels a request. There is deliberately no delete: an approved leave is
   * reversed with a contra entry so the history survives, which is exactly what
   * the legacy hard-delete destroyed.
   */
  const cancelRequest = useMutation({
    mutationFn: (id: string) => leaveApi.hrCancel(id),
    onSuccess: () => { toast.success('Leave request cancelled.'); setPendingCancel(null); refreshLeaves(); },
    onError: (err) => { toast.error(apiMessage(err, 'Could not cancel the request.')); setPendingCancel(null); },
  });

  const accrual = useMutation({
    mutationFn: () => leaveApi.runAccrual(CURRENT_MONTH, CURRENT_YEAR),
    onSuccess: (result) => {
      toast.success(
        `Accrual ${result.runNo}: ${result.totalCredited} day(s) credited to ${result.successCount} employee(s)`
        + (result.skippedCount ? `, ${result.skippedCount} skipped.` : '.'),
      );
      refreshLeaves();
    },
    onError: (err) => toast.error(apiMessage(err, 'Could not run leave accrual.')),
  });

  const backfill = useMutation({
    mutationFn: () => leaveApi.backfillAccrual(12),
    onSuccess: () => {
      setBackfillOpen(false);
      toast.success('Leave balances brought up to date.');
      refreshLeaves();
    },
    onError: (err) => { setBackfillOpen(false); toast.error(apiMessage(err, 'Could not back-fill leave accrual.')); },
  });

  const columns: Column<LeaveRequestRow>[] = [
    { header: 'Employee', render: (l) => <><strong>{l.employee?.fullName}</strong><div className="muted sm-text">{l.employee?.employeeCode}</div></>, sortValue: (l) => l.employee?.fullName ?? '' },
    { header: 'Request', render: (l) => <span className="mono sm-text">{l.requestNo}</span>, sortValue: (l) => l.requestNo },
    { header: 'Type', render: (l) => requestTypeLabel(l.lines), sortValue: (l) => requestTypeLabel(l.lines) },
    { header: 'From', render: (l) => fmtDate(l.fromDate), sortValue: (l) => l.fromDate },
    { header: 'To', render: (l) => fmtDate(l.toDate), sortValue: (l) => l.toDate },
    { header: 'Days', render: (l) => <span className="num">{Number(l.totalDays)}</span>, sortValue: (l) => Number(l.totalDays) },
    { header: 'With', render: (l) => currentApprover(l) },
    { header: 'Status', render: (l) => <Badge status={l.status} />, sortValue: (l) => l.status },
    {
      header: '',
      render: (l) => (
        <div className="actions-cell">
          <ActionMenu
            items={[
              { key: 'balances', label: 'Balances & ledger', icon: <Wallet size={15} />, onSelect: () => setBalancesFor(l) },
              ...(canDecide && isOpen(l.status) ? [
                { key: 'approve', label: 'Approve', icon: <Check size={15} />, separatorBefore: true, onSelect: () => setDecisionTarget({ kind: 'single', leave: l, decision: 'APPROVED' }) },
                { key: 'reject', label: 'Reject', icon: <X size={15} />, tone: 'danger' as const, onSelect: () => setDecisionTarget({ kind: 'single', leave: l, decision: 'REJECTED' }) },
              ] : []),
              ...(canManageLeave && isCancellable(l) ? [
                { key: 'cancel', label: 'Cancel request', icon: <Ban size={15} />, tone: 'danger' as const, separatorBefore: true, onSelect: () => setPendingCancel(l) },
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
    { key: 'myLeave', label: 'My leave' },
    ...(canManagePolicy ? [{ key: 'policies', label: 'Policies' }] : []),
  ];

  const typeName = (code: string) => typesQuery.data?.find((t) => t.code === code)?.name ?? code;
  const typeChips = typeFilter !== 'ALL'
    ? [{ key: 'type', label: `Type: ${typeName(typeFilter)}`, onRemove: () => setTypeFilter('ALL') }]
    : [];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Human Resources' }, { label: 'Leave' }]}
        title="Leave"
        subtitle="Record, review and decide staff leave"
        actions={view !== 'myLeave' && (
          <>
            {canAccrue && (
              <>
                <button type="button" className="ghost" disabled={backfill.isPending || accrual.isPending} onClick={() => setBackfillOpen(true)}>
                  {backfill.isPending ? <><Loader size={15} /> Backfilling…</> : <><ListChecks size={15} /> Back-fill accrual</>}
                </button>
                <button type="button" className="ghost" disabled={accrual.isPending || backfill.isPending} onClick={() => accrual.mutate()}>
                  {accrual.isPending ? <><Loader size={15} /> Running…</> : <><CalendarCheck size={15} /> Run leave accrual</>}
                </button>
              </>
            )}
            {canManageLeave && (
              <button type="button" onClick={() => setBookOpen(true)}><Plus size={15} /> Record leave</button>
            )}
          </>
        )}
        tabs={<Tabs tabs={viewTabs} active={view} onChange={(t) => setView(t as 'list' | 'calendar' | 'myLeave' | 'policies')} />}
      />

      {view === 'list' ? (
        <>
          <FilterBar chips={typeChips} onReset={typeChips.length ? () => setTypeFilter('ALL') : undefined}>
            <label>Status
              <select value={status} onChange={(e) => { setStatus(e.target.value as StatusFilter); setSelectedIds(new Set()); }} aria-label="Filter by status">
                {STATUS_FILTERS.map((s) => (
                  <option key={s} value={s}>{s === 'ALL' ? 'All statuses' : s.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())}</option>
                ))}
              </select>
            </label>
            <label>Type
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Filter by leave type">
                <option value="ALL">All types</option>
                {(typesQuery.data ?? []).map((t) => <option key={t.id} value={t.code}>{t.name}</option>)}
              </select>
            </label>
          </FilterBar>

          {canDecide && openSelected.length > 0 && (
            <div className="bulk-bar">
              <span className="bulk-count">{openSelected.length} awaiting decision</span>
              <span className="bulk-spacer" />
              <button type="button" onClick={() => setDecisionTarget({ kind: 'bulk', ids: openSelected.map((l) => l.id), decision: 'APPROVED' })}><Check size={14} /> Approve all</button>
              <button type="button" className="ghost" onClick={() => setDecisionTarget({ kind: 'bulk', ids: openSelected.map((l) => l.id), decision: 'REJECTED' })}><X size={14} /> Reject all</button>
              <button type="button" className="ghost" onClick={() => setSelectedIds(new Set())}>Clear</button>
            </div>
          )}

          <DataTable
            columns={columns}
            rows={rows}
            loading={query.isLoading}
            empty="No leave requests found."
            searchPlaceholder="Search by employee or request no…"
            selection={canDecide ? { selectedIds, onChange: setSelectedIds } : undefined}
          />
        </>
      ) : view === 'calendar' ? (
        <LeaveCalendarView />
      ) : view === 'myLeave' ? (
        <MyLeave />
      ) : (
        <LeavePolicies />
      )}

      {decisionTarget && (
        <DecisionModal
          target={decisionTarget}
          pending={decide.isPending || bulkDecide.isPending}
          onClose={() => setDecisionTarget(null)}
          onConfirm={(note) => {
            if (decisionTarget.kind === 'single') decide.mutate({ id: decisionTarget.leave.id, decision: decisionTarget.decision, comments: note || undefined });
            else bulkDecide.mutate({ ids: decisionTarget.ids, decision: decisionTarget.decision, comments: note || undefined });
          }}
        />
      )}

      {balancesFor && <BalancesDrawer leave={balancesFor} onClose={() => setBalancesFor(null)} />}

      {bookOpen && (
        <RecordLeaveModal
          employees={employeesQuery.data ?? []}
          onClose={() => setBookOpen(false)}
          onDone={() => { setBookOpen(false); refreshLeaves(); }}
        />
      )}

      {pendingCancel && (
        <ConfirmDialog
          icon={<Ban size={20} />}
          tone="danger"
          title="Cancel leave request?"
          message={<>
            {requestTypeLabel(pendingCancel.lines)} leave for <strong>{pendingCancel.employee?.fullName}</strong> ({fmtDate(pendingCancel.fromDate)} – {fmtDate(pendingCancel.toDate)}) will be cancelled.
            {pendingCancel.status === 'APPROVED'
              ? <><br /><span className="muted sm-text">Days not yet taken are credited back with a reversing entry. Days already in the past stay consumed, and a locked payroll period is refused rather than silently rewritten.</span></>
              : <><br /><span className="muted sm-text">The days held against their balance are released.</span></>}
          </>}
          confirmLabel="Cancel request"
          loading={cancelRequest.isPending}
          onConfirm={() => cancelRequest.mutate(pendingCancel.id)}
          onCancel={() => setPendingCancel(null)}
        />
      )}

      {backfillOpen && (
        <ConfirmDialog
          icon={<ListChecks size={20} />}
          title="Back-fill leave accrual"
          message={<>
            Runs the monthly accrual for every month in the past year that hasn’t been run yet, bringing balances up to date for all active employees.
            <br /><span className="muted sm-text">Safe to run — accrual is idempotent per employee, so a month already credited is skipped rather than counted twice.</span>
          </>}
          confirmLabel="Back-fill now"
          loading={backfill.isPending}
          onConfirm={() => backfill.mutate()}
          onCancel={() => setBackfillOpen(false)}
        />
      )}
    </>
  );
}

// ── Record leave for an employee (HR / Super Admin) ──────────────────────
/**
 * Picks the employee, then hands off to the same preview-first form employees
 * use for themselves. HR sees the identical per-day breakdown and rule check
 * the employee would, which is what stops "HR booked it so it must be fine"
 * from quietly bypassing the policy.
 */
function RecordLeaveModal({
  employees, onClose, onDone,
}: {
  employees: EmployeeOption[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [employeeId, setEmployeeId] = useState('');
  const typesQuery = useQuery({ queryKey: leaveKeys.types, queryFn: leaveApi.listTypes });
  const balancesQuery = useQuery({
    queryKey: leaveKeys.employeeBalances(employeeId),
    queryFn: () => leaveApi.employeeBalances(employeeId),
    enabled: Boolean(employeeId),
  });

  if (employeeId) {
    return (
      <ApplyLeaveModal
        types={typesQuery.data ?? []}
        balances={balancesQuery.data?.balances ?? []}
        employeeId={employeeId}
        onBehalf
        onClose={onClose}
        onDone={onDone}
      />
    );
  }

  return (
    <Modal
      size="sm" onClose={onClose} icon={<CalendarCheck size={20} />}
      title="Record leave"
      subtitle="Choose whose leave you are recording."
      footer={<button type="button" className="ghost" onClick={onClose}>Cancel</button>}
    >
      <label>Employee
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} data-autofocus>
          <option value="">— Select employee —</option>
          {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.fullName} ({emp.employeeCode})</option>)}
        </select>
      </label>
    </Modal>
  );
}

// ── Approve/Reject decision (single or bulk) ─────────────────────────────
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
    ? `${target.leave.employee?.fullName} · ${requestTypeLabel(target.leave.lines)} · ${fmtDayMonth(target.leave.fromDate)}–${fmtDayMonth(target.leave.toDate)}`
    : `${count} leave request${count === 1 ? '' : 's'} awaiting decision`;
  // The backend rejects a rejection with no reason, so the form does too rather
  // than letting the user discover it from a 400.
  const noteRequired = !approve;
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
          <button type="submit" form="decision-form" className={approve ? '' : 'danger'} disabled={pending || (noteRequired && !note.trim())}>
            {pending ? 'Working…' : approve ? 'Approve' : 'Reject'}
          </button>
        </>
      }
    >
      <form id="decision-form" onSubmit={submit}>
        <label>{noteRequired ? 'Reason for rejection' : 'Decision note'}
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={noteRequired ? 'Required — the applicant sees this' : 'Optional note for the applicant(s)'}
            required={noteRequired}
            data-autofocus
          />
        </label>
      </form>
    </Modal>
  );
}

// ── Balances + ledger statement ──────────────────────────────────────────
/**
 * The statement is the answer to "why is my balance 7.5?" — every credit and
 * debit that produced it, in order. Under the legacy counters this drawer could
 * only ever show the number itself.
 */
function BalancesDrawer({ leave, onClose }: { leave: LeaveRequestRow; onClose: () => void }) {
  const balancesQuery = useQuery({
    queryKey: leaveKeys.employeeBalances(leave.employeeId),
    queryFn: () => leaveApi.employeeBalances(leave.employeeId),
  });
  const ledgerQuery = useQuery({
    queryKey: leaveKeys.employeeLedger(leave.employeeId),
    queryFn: () => leaveApi.employeeLedger(leave.employeeId, 50),
  });
  const tracked = (balancesQuery.data?.balances ?? []).filter((b) => b.isPaid);
  const entries = ledgerQuery.data?.entries ?? [];

  return (
    <Drawer
      onClose={onClose}
      title="Leave balances"
      subtitle={`${leave.employee?.fullName}${tracked[0] ? ` · ${tracked[0].periodLabel}` : ''}`}
      footer={<button onClick={onClose}>Close</button>}
    >
      {balancesQuery.isLoading ? (
        <p className="muted">Loading balances…</p>
      ) : tracked.length === 0 ? (
        <p className="muted">No tracked leave balances found for this employee.</p>
      ) : (
        <div className="bal-chips">
          {tracked.map((b) => (
            <div key={b.leaveTypeId} className={`bal-chip${b.available <= 1 ? ' bal-low' : ''}`}>
              <div className="bal-type">{b.name}</div>
              <div className="bal-avail">{b.available}</div>
              <div className="bal-sub">used {b.used} / {b.opening + b.accrued}{b.pending > 0 ? ` · ${b.pending} held` : ''}</div>
            </div>
          ))}
        </div>
      )}

      <h3 style={{ marginTop: '1.25rem', marginBottom: '0.5rem' }}>Statement</h3>
      {ledgerQuery.isLoading ? (
        <p className="muted">Loading statement…</p>
      ) : entries.length === 0 ? (
        <p className="muted">No ledger entries yet.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead><tr><th>Date</th><th>Type</th><th>Entry</th><th className="num">Cr</th><th className="num">Dr</th><th className="num">Balance</th></tr></thead>
            <tbody>
              {entries.map((e: LedgerEntry) => (
                <tr key={e.id}>
                  <td className="sm-text">{fmtDate(e.effectiveDate)}</td>
                  <td className="sm-text">{e.leaveType?.code ?? '—'}</td>
                  <td className="sm-text" title={e.reason ?? undefined}>{e.entryType.replace(/_/g, ' ').toLowerCase()}</td>
                  <td className="num">{Number(e.credit) || ''}</td>
                  <td className="num">{Number(e.debit) || ''}</td>
                  <td className="num">{Number(e.balanceAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Drawer>
  );
}

// ── Team leave calendar ──────────────────────────────────────────────────
/**
 * Who is off this month. The legacy module had a dedicated /calendar endpoint;
 * the ledger module answers it from the request list filtered by date range,
 * so there is one query path for "approved leave in a window" rather than two
 * that can disagree.
 */
function LeaveCalendarView() {
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [year, setYear] = useState(CURRENT_YEAR);
  const from = new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

  const query = useQuery({
    queryKey: [...leaveKeys.requests('calendar'), month, year],
    queryFn: () => leaveApi.listRequests({ status: 'APPROVED', from, to, limit: 200 }),
  });
  const entries = query.data?.items ?? [];

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
              <thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th className="num">Days</th></tr></thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td><strong>{e.employee?.fullName}</strong> <span className="muted sm-text">{e.employee?.employeeCode}</span></td>
                    <td>{requestTypeLabel(e.lines)}</td>
                    <td>{fmtDayMonth(e.fromDate)}–{fmtDayMonth(e.toDate)}</td>
                    <td className="num">{Number(e.totalDays)}</td>
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
