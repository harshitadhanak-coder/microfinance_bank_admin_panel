import { FormEvent, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { Badge } from '../../components/Badge';
import { ActionMenu } from '../../components/ActionMenu';
import { ConfirmDialog, Modal } from '../../components/Modal';
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
}

interface EmployeeOption { id: string; fullName: string; employeeCode: string }
interface BranchOption { id: string; name: string }

export default function ShiftsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const toast = useToast();
  const canManage = can(user?.role, 'shift:manage');

  const [editing, setEditing] = useState<Shift | 'new' | null>(null);
  const [assignFor, setAssignFor] = useState<Shift | null>(null);
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
    { header: 'Status', render: (s) => <Badge status={s.isActive ? 'ACTIVE' : 'INACTIVE'}>{s.isActive ? 'Active' : 'Inactive'}</Badge>, sortValue: (s) => String(s.isActive) },
  ];

  if (canManage) {
    columns.push({
      header: '',
      render: (s) => (
        <div className="actions-cell">
          <ActionMenu items={[
            { key: 'assign', label: 'Assign employees', icon: <Users size={15} />, onSelect: () => setAssignFor(s) },
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
        <AssignShiftModal shift={assignFor} onClose={() => setAssignFor(null)} onDone={(msg) => { setAssignFor(null); toast.success(msg); }} />
      )}

      {deleteFor && (
        <ConfirmDialog
          tone="danger"
          icon={<Trash2 size={20} />}
          title="Delete shift"
          message={<>This removes the shift. A shift assigned to employees (current or past) cannot be deleted — mark it inactive instead.<br /><span className="muted sm-text">{deleteFor.name} · {deleteFor.code}</span></>}
          confirmLabel="Delete"
          loading={remove.isPending}
          onConfirm={() => remove.mutate(deleteFor.id)}
          onCancel={() => setDeleteFor(null)}
        />
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

// ── Assign ─────────────────────────────────────────────────────────────────
function AssignShiftModal({ shift, onClose, onDone }: { shift: Shift; onClose: () => void; onDone: (msg: string) => void }) {
  const [mode, setMode] = useState<'employees' | 'branch'>('employees');
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [branchId, setBranchId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const employeesQuery = useQuery({
    queryKey: ['/employees', 'shift-assign-options'],
    queryFn: () => api.get('/employees?pageSize=300').then((r) => r.data.data as EmployeeOption[]),
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
      onDone(`Assigned ${data.assigned} employee${data.assigned === 1 ? '' : 's'}${data.unchanged ? `, ${data.unchanged} already on this shift` : ''}.`);
    },
    onError: (err) => setError(apiMessage(err, 'Could not assign the shift.')),
  });

  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); assign.mutate(); };
  const disabled = assign.isPending || (mode === 'employees' ? employeeIds.length === 0 : !branchId);
  const options = (employeesQuery.data ?? []).map((emp) => ({ id: emp.id, name: `${emp.fullName} (${emp.employeeCode})` }));

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
          <label className="span-all">Employees
            <MultiSelect options={options} selected={employeeIds} onChange={setEmployeeIds} allLabel="Select employees…" noun="employee" />
          </label>
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
