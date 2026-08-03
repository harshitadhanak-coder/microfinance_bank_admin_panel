import { FormEvent, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { Badge } from '../../components/Badge';
import { ActionMenu } from '../../components/ActionMenu';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { EmptyState } from '../../components/EmptyState';
import { MultiSelect } from '../../components/MultiSelect';
import { CalendarCheck, Pencil, Plus, Trash2, Users } from '../../components/icons';
import { apiMessage } from '../../lib/format';
import { useToast } from '../../components/Toast';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Shift {
  id: string;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  graceMinutes: number;
  fullDayMinutes: number;
  halfDayMinutes: number;
  lateAfterMinutes: number | null;
  halfDayAfterMinutes: number | null;
  weeklyOffDays: number[];
  effectiveFrom: string | null;
  description: string | null;
  isActive: boolean;
  /** Employees on this shift right now — what blocks a delete. */
  employeeCount: number;
  /** Assignment-log rows pointing at it, including closed ones. */
  assignmentCount: number;
}

/** Assign-picker row: every assignable employee with the shift they are on now. */
interface EmployeeOption {
  id: string;
  fullName: string;
  employeeCode: string;
  shift: { id: string; name: string } | null;
}
interface BranchOption { id: string; name: string }

/** One employee currently on a shift, as listed by the "Assigned employees" view. */
interface AssignedEmployee {
  id: string;
  employeeCode: string;
  fullName: string;
  designation: string | null;
  employmentStatus: string;
  branch: { id: string; name: string } | null;
}

export default function ShiftsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const toast = useToast();
  const canManage = can(user?.role, 'shift:manage');

  const [editing, setEditing] = useState<Shift | 'new' | null>(null);
  const [assignFor, setAssignFor] = useState<Shift | null>(null);
  const [employeesFor, setEmployeesFor] = useState<Shift | null>(null);
  const [deleteFor, setDeleteFor] = useState<Shift | null>(null);

  const query = useQuery({
    queryKey: ['/human-resources/shifts'],
    queryFn: () => api.get('/human-resources/shifts').then((r) => r.data.data as Shift[]),
    placeholderData: keepPreviousData,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['/human-resources/shifts'] });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/human-resources/shifts/${id}`),
    onSuccess: () => { refresh(); setDeleteFor(null); toast.success('Shift removed.'); },
    onError: (err) => { setDeleteFor(null); toast.error(apiMessage(err, 'Could not remove the shift.')); },
  });

  const columns: Column<Shift>[] = [
    { header: 'Shift', render: (s) => <><strong>{s.name}</strong><div className="muted sm-text">{s.code}</div></>, sortValue: (s) => s.name },
    { header: 'Timing', render: (s) => <span className="num">{s.startTime}–{s.endTime}</span>, sortValue: (s) => s.startTime },
    { header: 'Grace', render: (s) => <span className="num">{s.lateAfterMinutes ?? s.graceMinutes} min</span> },
    { header: 'Full / Half day', render: (s) => <span className="num">{s.fullDayMinutes} / {s.halfDayAfterMinutes ?? s.halfDayMinutes} min</span> },
    { header: 'Weekly off', render: (s) => s.weeklyOffDays.length ? s.weeklyOffDays.map((d) => WEEKDAYS[d]).join(', ') : '—' },
    {
      header: 'Employees',
      // Clickable, because "who is on this shift?" is the question every
      // assign / delete decision starts from.
      render: (s) => (
        s.employeeCount
          ? <button type="button" className="link-btn num" onClick={() => setEmployeesFor(s)}>{s.employeeCount}</button>
          : <span className="muted">None</span>
      ),
      sortValue: (s) => s.employeeCount,
    },
    { header: 'Status', render: (s) => <Badge status={s.isActive ? 'ACTIVE' : 'INACTIVE'}>{s.isActive ? 'Active' : 'Inactive'}</Badge>, sortValue: (s) => String(s.isActive) },
  ];

  if (canManage) {
    columns.push({
      header: '',
      render: (s) => (
        <div className="actions-cell">
          <ActionMenu items={[
            { key: 'assigned', label: `Assigned employees (${s.employeeCount})`, icon: <Users size={15} />, onSelect: () => setEmployeesFor(s) },
            { key: 'assign', label: 'Assign employees', icon: <Plus size={15} />, onSelect: () => setAssignFor(s) },
            { key: 'edit', label: 'Edit', icon: <Pencil size={15} />, onSelect: () => setEditing(s) },
            { key: 'delete', label: 'Delete', icon: <Trash2 size={15} />, tone: 'danger', separatorBefore: true, onSelect: () => setDeleteFor(s) },
          ]} />
        </div>
      ),
    });
  }

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Human Resources' }, { label: 'Shifts' }]}
        title="Shifts"
        subtitle="Shift timings drive attendance. Assign shifts to employees; unassigned staff use the global policy."
        actions={canManage && <button className="btn-lg" onClick={() => setEditing('new')}><Plus size={16} /> New shift</button>}
      />

      <DataTable
        columns={columns}
        rows={query.data ?? []}
        loading={query.isLoading}
        empty="No shifts defined yet."
        searchPlaceholder="Search shifts…"
      />

      {editing && (
        <ShiftFormModal
          shift={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDone={(msg) => { setEditing(null); refresh(); toast.success(msg); }}
        />
      )}

      {assignFor && (
        <AssignShiftModal shift={assignFor} onClose={() => setAssignFor(null)} onDone={(msg) => { setAssignFor(null); refresh(); toast.success(msg); }} />
      )}

      {employeesFor && (
        <ShiftEmployeesModal
          shift={employeesFor}
          onClose={() => setEmployeesFor(null)}
          onChanged={(msg) => { refresh(); toast.success(msg); }}
        />
      )}

      {deleteFor && (
        // Two different situations, so two different dialogs: staff still on the
        // shift is a dead end until they are moved, and the page says so rather
        // than letting the delete fail with a server error.
        deleteFor.employeeCount > 0 ? (
          <ConfirmDialog
            tone="warn"
            icon={<Users size={20} />}
            title="Shift is still in use"
            message={<>
              <strong>{deleteFor.employeeCount}</strong> employee{deleteFor.employeeCount === 1 ? ' is' : 's are'} still on <strong>{deleteFor.name}</strong>. Unassign them or move them to another shift first — then the shift can be deleted.
              <br /><span className="muted sm-text">Marking the shift inactive keeps its history and stops new assignments.</span>
            </>}
            confirmLabel="View employees"
            onConfirm={() => { setEmployeesFor(deleteFor); setDeleteFor(null); }}
            onCancel={() => setDeleteFor(null)}
          />
        ) : (
          <ConfirmDialog
            tone="danger"
            icon={<Trash2 size={20} />}
            title="Delete shift"
            message={<>
              No employee is on this shift, so it can be removed.
              {deleteFor.assignmentCount > 0 && <> Its {deleteFor.assignmentCount} past assignment record{deleteFor.assignmentCount === 1 ? '' : 's'} will be deleted with it.</>}
              <br /><span className="muted sm-text">{deleteFor.name} · {deleteFor.code}</span>
            </>}
            confirmLabel="Delete"
            loading={remove.isPending}
            onConfirm={() => remove.mutate(deleteFor.id)}
            onCancel={() => setDeleteFor(null)}
          />
        )
      )}
    </>
  );
}

// ── Create / edit ────────────────────────────────────────────────────────────
const emptyForm = {
  code: '', name: '', startTime: '09:00', endTime: '18:00',
  graceMinutes: '15', lateAfterMinutes: '', fullDayMinutes: '480', halfDayMinutes: '240', halfDayAfterMinutes: '',
  effectiveFrom: '', description: '', isActive: true,
};
type Form = typeof emptyForm;

function ShiftFormModal({ shift, onClose, onDone }: { shift: Shift | null; onClose: () => void; onDone: (msg: string) => void }) {
  const isEdit = shift != null;
  const [form, setForm] = useState<Form>(
    shift
      ? {
          code: shift.code, name: shift.name, startTime: shift.startTime, endTime: shift.endTime,
          graceMinutes: String(shift.graceMinutes), lateAfterMinutes: shift.lateAfterMinutes == null ? '' : String(shift.lateAfterMinutes),
          fullDayMinutes: String(shift.fullDayMinutes), halfDayMinutes: String(shift.halfDayMinutes),
          halfDayAfterMinutes: shift.halfDayAfterMinutes == null ? '' : String(shift.halfDayAfterMinutes),
          effectiveFrom: shift.effectiveFrom ? shift.effectiveFrom.slice(0, 10) : '', description: shift.description ?? '', isActive: shift.isActive,
        }
      : emptyForm,
  );
  const [weeklyOff, setWeeklyOff] = useState<number[]>(shift?.weeklyOffDays ?? [0]);
  const [error, setError] = useState('');

  const toggleDay = (d: number) => setWeeklyOff((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

  const save = useMutation({
    mutationFn: () => {
      const body = {
        code: form.code.trim(), name: form.name.trim(), startTime: form.startTime, endTime: form.endTime,
        graceMinutes: Number(form.graceMinutes), fullDayMinutes: Number(form.fullDayMinutes), halfDayMinutes: Number(form.halfDayMinutes),
        lateAfterMinutes: form.lateAfterMinutes === '' ? null : Number(form.lateAfterMinutes),
        halfDayAfterMinutes: form.halfDayAfterMinutes === '' ? null : Number(form.halfDayAfterMinutes),
        weeklyOffDays: weeklyOff,
        ...(form.effectiveFrom ? { effectiveFrom: form.effectiveFrom } : {}),
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
        isActive: form.isActive,
      };
      return isEdit ? api.patch(`/human-resources/shifts/${shift!.id}`, body) : api.post('/human-resources/shifts', body);
    },
    onSuccess: () => onDone(isEdit ? 'Shift updated.' : 'Shift created.'),
    onError: (err) => setError(apiMessage(err, 'Could not save the shift.')),
  });

  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); save.mutate(); };
  const disabled = !form.code.trim() || !form.name.trim() || save.isPending;

  return (
    <Modal
      size="lg"
      onClose={onClose}
      icon={<CalendarCheck size={20} />}
      title={isEdit ? 'Edit shift' : 'New shift'}
      subtitle="Grace, half-day and weekly-off apply to every employee assigned this shift"
      footer={<>
        <button type="button" className="ghost" onClick={onClose}>Cancel</button>
        <button type="submit" form="shift-form" disabled={disabled}>{save.isPending ? 'Saving…' : 'Save shift'}</button>
      </>}
    >
      <form id="shift-form" className="form-grid" onSubmit={submit}>
        <label>Code<input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="GEN" required /></label>
        <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="General Shift" required /></label>
        <label>Start time<input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required /></label>
        <label>End time<input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} required /></label>
        <label>Grace (min)<input type="number" min="0" value={form.graceMinutes} onChange={(e) => setForm({ ...form, graceMinutes: e.target.value })} /></label>
        <label>Late-after override (min)<input type="number" min="0" value={form.lateAfterMinutes} onChange={(e) => setForm({ ...form, lateAfterMinutes: e.target.value })} placeholder="optional" /></label>
        <label>Full day (min)<input type="number" min="1" value={form.fullDayMinutes} onChange={(e) => setForm({ ...form, fullDayMinutes: e.target.value })} /></label>
        <label>Half day floor (min)<input type="number" min="0" value={form.halfDayMinutes} onChange={(e) => setForm({ ...form, halfDayMinutes: e.target.value })} /></label>
        <label>Half-day-after override (min)<input type="number" min="0" value={form.halfDayAfterMinutes} onChange={(e) => setForm({ ...form, halfDayAfterMinutes: e.target.value })} placeholder="optional" /></label>
        <label>Effective from<input type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} /></label>
        <div className="span-all">
          <span className="field-label">Weekly off</span>
          <div className="chip-row">
            {WEEKDAYS.map((d, i) => (
              <label key={d} className={`day-chip ${weeklyOff.includes(i) ? 'on' : ''}`}>
                <input type="checkbox" checked={weeklyOff.includes(i)} onChange={() => toggleDay(i)} /> {d}
              </label>
            ))}
          </div>
        </div>
        <label className="span-all">Description<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="optional" /></label>
        <label className="checkbox span-all"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active</label>
        {error && <div className="error-box span-all">{error}</div>}
      </form>
    </Modal>
  );
}

// ── Assigned employees ─────────────────────────────────────────────────────
/**
 * Who is on a shift, and the way off it. This is the missing half of shift
 * management: a shift could be assigned from three places but never unassigned,
 * so "cannot be deleted, employees are still on it" was a dead end with no
 * screen that even said who those employees were.
 *
 * Unassigning clears the employee's shift — attendance then follows the global
 * policy — so the alternative (move them to another shift) is offered too.
 */
function ShiftEmployeesModal({ shift, onClose, onChanged }: { shift: Shift; onClose: () => void; onChanged: (msg: string) => void }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  const query = useQuery({
    queryKey: ['/human-resources/shifts', shift.id, 'employees'],
    queryFn: () => api.get(`/human-resources/shifts/${shift.id}/employees`)
      .then((r) => r.data.data as { employees: AssignedEmployee[]; employeeCount: number; assignmentCount: number }),
  });
  const employees = query.data?.employees ?? [];
  const allSelected = employees.length > 0 && selected.length === employees.length;

  const unassign = useMutation({
    mutationFn: () => api.post(`/human-resources/shifts/${shift.id}/unassign`, selected.length ? { employeeIds: selected } : {}),
    onSuccess: (res) => {
      const { unassigned } = res.data.data as { unassigned: number };
      setSelected([]); setConfirming(false);
      qc.invalidateQueries({ queryKey: ['/human-resources/shifts', shift.id, 'employees'] });
      qc.invalidateQueries({ queryKey: ['/human-resources/shifts/assign-options'] });
      onChanged(`Removed ${unassigned} employee${unassigned === 1 ? '' : 's'} from ${shift.name}.`);
    },
    onError: (err) => { setConfirming(false); setError(apiMessage(err, 'Could not unassign the employees.')); },
  });

  const toggle = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const targetCount = selected.length || employees.length;

  return (
    <>
      <Modal
        size="lg"
        onClose={onClose}
        icon={<Users size={20} />}
        title={`Employees on "${shift.name}"`}
        subtitle="Unassign to free the shift for deletion, or assign them to a different shift instead"
        footer={<>
          <button type="button" className="ghost" onClick={onClose}>Close</button>
          <button
            type="button"
            className="danger"
            disabled={employees.length === 0 || unassign.isPending}
            onClick={() => { setError(''); setConfirming(true); }}
          >
            {selected.length ? `Remove ${selected.length} from shift` : 'Remove all from shift'}
          </button>
        </>}
      >
        {query.isLoading ? (
          <p className="muted">Loading…</p>
        ) : employees.length === 0 ? (
          <EmptyState
            variant="no-data"
            title="No employees on this shift"
            message={query.data?.assignmentCount
              ? `Nobody is on it now. ${query.data.assignmentCount} past assignment record${query.data.assignmentCount === 1 ? '' : 's'} remain, and are removed with the shift.`
              : 'This shift can be deleted.'}
          />
        ) : (
          <>
            <p className="muted sm-text">
              {employees.length} employee{employees.length === 1 ? '' : 's'} currently follow this shift's timings.
              Unassigned staff fall back to the global attendance policy.
            </p>
            <div className="table-scroll">
              <table className="perm-table">
                <thead>
                  <tr>
                    <th style={{ width: '2.2rem' }}>
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={allSelected}
                        onChange={() => setSelected(allSelected ? [] : employees.map((e) => e.id))}
                      />
                    </th>
                    <th>Employee</th>
                    <th>Designation</th>
                    <th>Branch</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => (
                    <tr key={emp.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${emp.fullName}`}
                          checked={selected.includes(emp.id)}
                          onChange={() => toggle(emp.id)}
                        />
                      </td>
                      <td><strong>{emp.fullName}</strong><div className="muted sm-text">{emp.employeeCode}</div></td>
                      <td className="sm-text">{emp.designation ?? '—'}</td>
                      <td className="sm-text">{emp.branch?.name ?? '—'}</td>
                      <td><Badge status={emp.employmentStatus}>{emp.employmentStatus.replace(/_/g, ' ')}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {error && <div className="error-box">{error}</div>}
      </Modal>

      {confirming && (
        <ConfirmDialog
          tone="danger"
          icon={<Users size={20} />}
          title={`Remove ${targetCount} employee${targetCount === 1 ? '' : 's'} from this shift?`}
          message={<>Their current assignment is closed and attendance falls back to the global policy until another shift is assigned.</>}
          confirmLabel="Remove from shift"
          loading={unassign.isPending}
          onConfirm={() => unassign.mutate()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}

// ── Assign ─────────────────────────────────────────────────────────────────
function AssignShiftModal({ shift, onClose, onDone }: { shift: Shift; onClose: () => void; onDone: (msg: string) => void }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'employees' | 'branch'>('employees');
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [branchId, setBranchId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  // Whether to leave out staff who already sit on another shift. Off by default:
  // moving someone from one shift to another is the common case, so hiding them
  // would be the very thing that makes an employee "missing" from the picker.
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);

  const employeesQuery = useQuery({
    queryKey: ['/human-resources/shifts/assign-options'],
    queryFn: () => api.get('/human-resources/shifts/assign-options').then((r) => r.data.data as EmployeeOption[]),
  });
  const branchesQuery = useQuery({
    queryKey: ['/branches', 'shift-assign-options'],
    queryFn: () => api.get('/branches').then((r) => r.data.data as BranchOption[]),
    enabled: mode === 'branch',
  });

  const assign = useMutation({
    mutationFn: () => {
      if (mode === 'branch') {
        return api.post('/human-resources/shifts/bulk-assign', { shiftId: shift.id, branchId, ...(effectiveFrom ? { effectiveFrom } : {}), ...(note.trim() ? { note: note.trim() } : {}) });
      }
      return api.post(`/human-resources/shifts/${shift.id}/assign`, { employeeIds, ...(effectiveFrom ? { effectiveFrom } : {}), ...(note.trim() ? { note: note.trim() } : {}) });
    },
    onSuccess: (res) => {
      const data = res.data.data as { assigned: number; unchanged: number };
      // The picker labels each employee with their current shift, so it is stale
      // the moment an assignment lands.
      qc.invalidateQueries({ queryKey: ['/human-resources/shifts/assign-options'] });
      onDone(`Assigned ${data.assigned} employee${data.assigned === 1 ? '' : 's'}${data.unchanged ? `, ${data.unchanged} already on this shift` : ''}.`);
    },
    onError: (err) => setError(apiMessage(err, 'Could not assign the shift.')),
  });

  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); assign.mutate(); };
  const disabled = assign.isPending || (mode === 'employees' ? employeeIds.length === 0 : !branchId);

  const roster = employeesQuery.data ?? [];
  const visible = onlyUnassigned ? roster.filter((emp) => !emp.shift) : roster;
  // The current shift is part of the option label, so the search box finds
  // "everyone on HO Team" as readily as it finds one person by name or code.
  const options = visible.map((emp) => ({
    id: emp.id,
    name: `${emp.fullName} (${emp.employeeCode}) · ${emp.shift ? (emp.shift.id === shift.id ? 'already on this shift' : emp.shift.name) : 'No shift'}`,
  }));
  const alreadyHere = roster.filter((emp) => emp.shift?.id === shift.id).length;

  return (
    <Modal
      size="md"
      onClose={onClose}
      icon={<Users size={20} />}
      title={`Assign "${shift.name}"`}
      subtitle="A new assignment supersedes the employee's current shift"
      footer={<>
        <button type="button" className="ghost" onClick={onClose}>Cancel</button>
        <button type="submit" form="assign-form" disabled={disabled}>{assign.isPending ? 'Assigning…' : 'Assign'}</button>
      </>}
    >
      <form id="assign-form" className="form-grid" onSubmit={submit}>
        <div className="segmented span-all" role="tablist">
          <button type="button" className={mode === 'employees' ? 'on' : ''} onClick={() => setMode('employees')}>Selected employees</button>
          <button type="button" className={mode === 'branch' ? 'on' : ''} onClick={() => setMode('branch')}>Entire branch</button>
        </div>
        {mode === 'employees' ? (
          <div className="span-all">
            <span className="field-label">Employees</span>
            <MultiSelect options={options} selected={employeeIds} onChange={setEmployeeIds} allLabel="Select employees…" noun="employee" />
            <p className="muted sm-text">
              {employeesQuery.isLoading
                ? 'Loading employees…'
                : <>
                    {options.length} of {roster.length} employee{roster.length === 1 ? '' : 's'} listed, A–Z, each showing the shift they are on now.
                    {alreadyHere > 0 && ` ${alreadyHere} already on this shift.`}
                    {' '}Someone on another shift is still selectable — assigning moves them here.
                  </>}
            </p>
            <label className="checkbox">
              <input type="checkbox" checked={onlyUnassigned} onChange={(e) => { setOnlyUnassigned(e.target.checked); setEmployeeIds([]); }} />
              Only show employees without a shift
            </label>
          </div>
        ) : (
          <label className="span-all">Branch
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} required>
              <option value="">— Select branch —</option>
              {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
        <label>Effective from<input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} /></label>
        <label>Note<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" /></label>
        {error && <div className="error-box span-all">{error}</div>}
      </form>
    </Modal>
  );
}
