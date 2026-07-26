import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Drawer } from '../../components/Drawer';
import { Form, FormGrid, Field } from '../../components/Form';
import { EmptyState } from '../../components/EmptyState';
import { useToast } from '../../components/Toast';
import { CalendarCheck, Loader, Pencil, Plus } from '../../components/icons';
import { apiMessage, fmtDate } from '../../lib/format';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Shift {
  id: string; code: string; name: string;
  startTime: string; endTime: string;
  graceMinutes: number; fullDayMinutes: number; halfDayMinutes: number;
  lateAfterMinutes: number | null; halfDayAfterMinutes: number | null;
  weeklyOffDays: number[]; effectiveFrom: string | null;
  description: string | null; isActive: boolean;
}

/** One row of the employee's shift history (the open row, effectiveTo=null, is current). */
interface AssignmentRow {
  id: string;
  shift: { id: string; code: string; name: string };
  previousShift: { id: string; name: string | null } | null;
  effectiveFrom: string; effectiveTo: string | null;
  isCurrent: boolean; changedAt: string; note: string | null;
}

/**
 * Employee → Shift tab. Assign / change this employee's shift and read its
 * history, all in one place instead of the branch-wide Shifts screen.
 *
 * Writes go through the shift-assignment flow (`POST /shifts/:id/assign`), not a
 * bare `PATCH /employees/:id`, because that flow is what keeps the model honest:
 * it closes the previous open assignment, opens a new one (the history below),
 * and notifies the employee that their shift changed.
 */
export default function EmployeeShiftTab({ employeeId, canManage }: { employeeId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();

  // Full shift definitions — for the assign dropdown and to enrich the current
  // shift with timing / weekly-off, which the history row does not carry.
  const shiftsQuery = useQuery({
    queryKey: ['/human-resources/shifts'],
    queryFn: () => api.get('/human-resources/shifts').then((r) => r.data.data as Shift[]),
  });
  const historyQuery = useQuery({
    queryKey: ['/human-resources/shifts/assignments', employeeId],
    queryFn: () => api.get(`/human-resources/shifts/assignments/${employeeId}`).then((r) => r.data.data as AssignmentRow[]),
  });

  const shifts = shiftsQuery.data ?? [];
  const history = historyQuery.data ?? [];
  const current = history.find((h) => h.isCurrent) ?? null;
  const currentShift = current ? shifts.find((s) => s.id === current.shift.id) ?? null : null;

  const [shiftId, setShiftId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  // Assigning happens in a slide-over so the tab stays a clean current-shift +
  // history read-out instead of a permanently-open form.
  const [assignOpen, setAssignOpen] = useState(false);

  const assign = useMutation({
    mutationFn: () => api.post(`/human-resources/shifts/${shiftId}/assign`, {
      employeeIds: [employeeId],
      ...(effectiveFrom ? { effectiveFrom } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    }),
    onSuccess: (res) => {
      const data = res.data.data as { assigned: number; unchanged: number };
      qc.invalidateQueries({ queryKey: ['/human-resources/shifts/assignments', employeeId] });
      // Overview's "Shift" row reads the denormalised pointer on the employee.
      qc.invalidateQueries({ queryKey: ['/employees', employeeId] });
      setShiftId(''); setEffectiveFrom(''); setNote(''); setError('');
      setAssignOpen(false);
      toast.success(data.assigned ? 'Shift assigned.' : 'Employee is already on that shift.');
    },
    onError: (err) => setError(apiMessage(err, 'Could not assign the shift.')),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault(); setError('');
    if (!shiftId) { setError('Select a shift to assign.'); return; }
    assign.mutate();
  };
  const openAssign = () => { setError(''); setAssignOpen(true); };

  const loading = shiftsQuery.isLoading || historyQuery.isLoading;
  const activeShifts = shifts.filter((s) => s.isActive || s.id === current?.shift.id);

  return (
    <div className="tab-stack">
      <Card
        title="Current shift"
        action={canManage && (
          <button className="sm" onClick={openAssign}>
            {current ? <><Pencil size={14} /> Change shift</> : <><Plus size={14} /> Assign shift</>}
          </button>
        )}
      >
        {loading ? (
          <p className="muted">Loading…</p>
        ) : !current ? (
          <EmptyState
            variant="no-data"
            title="No shift assigned"
            message="Attendance falls back to the global policy until a shift is assigned."
            action={canManage && <button onClick={openAssign}><Plus size={15} /> Assign shift</button>}
          />
        ) : (
          <dl className="detail-list">
            <div><dt>Shift</dt><dd><strong>{current.shift.name}</strong> <span className="muted">({current.shift.code})</span></dd></div>
            {currentShift && (
              <>
                <div><dt>Timing</dt><dd className="num">{currentShift.startTime}–{currentShift.endTime}</dd></div>
                <div><dt>Grace</dt><dd className="num">{currentShift.lateAfterMinutes ?? currentShift.graceMinutes} min</dd></div>
                <div><dt>Full / half day</dt><dd className="num">{currentShift.fullDayMinutes} / {currentShift.halfDayAfterMinutes ?? currentShift.halfDayMinutes} min</dd></div>
                <div><dt>Weekly off</dt><dd>{currentShift.weeklyOffDays.length ? currentShift.weeklyOffDays.map((d) => WEEKDAYS[d]).join(', ') : '—'}</dd></div>
              </>
            )}
            <div><dt>Effective from</dt><dd>{fmtDate(current.effectiveFrom)}</dd></div>
            {current.note && <div><dt>Note</dt><dd>{current.note}</dd></div>}
          </dl>
        )}
      </Card>

      <Card title="Assignment history">
        {historyQuery.isLoading ? (
          <p className="muted">Loading…</p>
        ) : history.length === 0 ? (
          <EmptyState variant="no-data" title="No shift history" message="This employee has not been assigned a shift yet." />
        ) : (
          <div className="table-scroll">
            <table className="perm-table">
              <thead>
                <tr><th>Shift</th><th>Effective</th><th>Status</th><th>Changed</th><th>Note</th></tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td>
                      <strong>{h.shift.name}</strong> <span className="muted sm-text">{h.shift.code}</span>
                      {h.previousShift?.name && <div className="muted sm-text">from {h.previousShift.name}</div>}
                    </td>
                    <td className="sm-text">{fmtDate(h.effectiveFrom)} → {h.effectiveTo ? fmtDate(h.effectiveTo) : 'current'}</td>
                    <td>{h.isCurrent ? <Badge tone="success" dot>Current</Badge> : <span className="muted">Superseded</span>}</td>
                    <td className="sm-text muted">{fmtDate(h.changedAt)}</td>
                    <td className="sm-text">{h.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {!canManage && (
        <p className="muted sm-text"><CalendarCheck size={13} /> Shifts are assigned by HR.</p>
      )}

      {/* Assign / change shift — slide-over editor. Writes through the assignment
          flow so history and the employee notification stay correct. */}
      {assignOpen && canManage && (
        <Drawer
          size="sm"
          onClose={() => setAssignOpen(false)}
          title={current ? 'Change shift' : 'Assign shift'}
          subtitle="Attendance rules follow the assigned shift."
          footer={<>
            <button type="button" className="ghost" onClick={() => setAssignOpen(false)}>Cancel</button>
            <button type="submit" form="shift-assign-form" disabled={assign.isPending || !shiftId}>
              {assign.isPending ? <><Loader size={15} /> Saving…</> : (current ? 'Change shift' : 'Assign shift')}
            </button>
          </>}>
          <Form id="shift-assign-form" onSubmit={submit}>
            <FormGrid cols={1}>
              <Field label="Shift" required>
                <select value={shiftId} onChange={(e) => setShiftId(e.target.value)} required>
                  <option value="">— Select a shift —</option>
                  {activeShifts.map((s) => (
                    <option key={s.id} value={s.id} disabled={s.id === current?.shift.id}>
                      {s.name} ({s.code}) · {s.startTime}–{s.endTime}{s.id === current?.shift.id ? ' — current' : ''}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Effective from" help="Defaults to today.">
                <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
              </Field>
              <Field label="Note" help="Optional — recorded on the change.">
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for the change" />
              </Field>
            </FormGrid>
            {error && <div className="error-box">{error}</div>}
          </Form>
        </Drawer>
      )}
    </div>
  );
}
