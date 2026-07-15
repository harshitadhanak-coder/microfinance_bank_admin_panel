import { FormEvent, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FilterBar } from '../../components/FilterBar';
import { Badge, BadgeTone } from '../../components/Badge';
import { Tabs, TabDef } from '../../components/Tabs';
import { Card } from '../../components/Card';
import { Calendar, CalendarDayCell } from '../../components/Calendar';
import { ActionMenu } from '../../components/ActionMenu';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { CalendarOff, Pencil, Plus, Trash2 } from '../../components/icons';
import { fmtDate, titleCase, apiMessage } from '../../lib/format';
import { useToast } from '../../components/Toast';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';

type HolidayType = 'NATIONAL' | 'STATE' | 'COMPANY';

interface Holiday {
  id: string;
  date: string;
  name: string;
  type: HolidayType;
  state: string | null;
  branchId: string | null;
  isOptional: boolean;
}

const TYPES: HolidayType[] = ['NATIONAL', 'STATE', 'COMPANY'];
const TYPE_TONE: Record<HolidayType, BadgeTone> = { NATIONAL: 'brass', STATE: 'info', COMPANY: 'neutral' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const emptyForm = { date: '', name: '', type: 'NATIONAL' as HolidayType, state: '', isOptional: false };
type Form = typeof emptyForm;

// A handful of years around the current one for the picker.
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - 3 + i);

export default function HolidaysPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const toast = useToast();
  const [year, setYear] = useState<number>(CURRENT_YEAR);
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [editing, setEditing] = useState<Holiday | 'new' | null>(null);
  const [deleteFor, setDeleteFor] = useState<Holiday | null>(null);

  const canManage = can(user?.role, 'holiday:manage');

  const listUrl = `/human-resources/holidays?year=${year}`;
  const query = useQuery({
    queryKey: [listUrl],
    queryFn: () => api.get(listUrl).then((r) => r.data.data as Holiday[]),
    placeholderData: keepPreviousData,
  });
  const holidays = query.data ?? [];

  const refresh = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/human-resources/holidays') });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/human-resources/holidays/${id}`),
    onSuccess: () => { refresh(); setDeleteFor(null); toast.success('Holiday deleted.'); },
    onError: (err) => { setDeleteFor(null); toast.error(apiMessage(err, 'Could not delete the holiday.')); },
  });

  const columns: Column<Holiday>[] = [
    { header: 'Date', render: (h) => fmtDate(h.date), sortValue: (h) => h.date },
    { header: 'Name', render: (h) => <strong>{h.name}</strong>, sortValue: (h) => h.name },
    { header: 'Type', render: (h) => <Badge tone={TYPE_TONE[h.type]}>{titleCase(h.type)}</Badge>, sortValue: (h) => h.type },
    { header: 'State', render: (h) => h.state ?? '—', sortValue: (h) => h.state ?? '' },
    { header: 'Optional', render: (h) => (h.isOptional ? 'Yes' : 'No'), sortValue: (h) => (h.isOptional ? 1 : 0) },
  ];

  if (canManage) {
    columns.push({
      header: '',
      render: (h) => (
        <div className="actions-cell">
          <ActionMenu items={[
            { key: 'edit', label: 'Edit', icon: <Pencil size={15} />, onSelect: () => setEditing(h) },
            { key: 'delete', label: 'Delete', icon: <Trash2 size={15} />, tone: 'danger', separatorBefore: true, onSelect: () => setDeleteFor(h) },
          ]} />
        </div>
      ),
    });
  }

  const viewTabs: TabDef[] = [
    { key: 'list', label: 'List' },
    { key: 'calendar', label: 'Calendar' },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Human Resources' }, { label: 'Holidays' }]}
        title="Holidays"
        subtitle="National, state and company holiday calendar"
        actions={canManage && <button className="btn-lg" onClick={() => setEditing('new')}><Plus size={16} /> Add holiday</button>}
        tabs={<Tabs tabs={viewTabs} active={view} onChange={(t) => setView(t as 'list' | 'calendar')} />}
      />

      <FilterBar>
        <label>Year
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Filter by year">
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </FilterBar>

      {view === 'list' ? (
        <DataTable
          columns={columns}
          rows={holidays}
          loading={query.isLoading}
          empty={`No holidays configured for ${year}.`}
          searchPlaceholder="Search by name, type or state…"
        />
      ) : (
        <HolidayCalendarView year={year} holidays={holidays} loading={query.isLoading} />
      )}

      {editing && (
        <HolidayFormModal
          holiday={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDone={(message) => { setEditing(null); refresh(); toast.success(message); }}
        />
      )}

      {deleteFor && (
        <ConfirmDialog
          tone="danger"
          icon={<Trash2 size={20} />}
          title="Delete holiday"
          message={<>This removes the holiday from the calendar.<br /><span className="muted sm-text">{deleteFor.name} · {fmtDate(deleteFor.date)}</span></>}
          confirmLabel="Delete"
          loading={remove.isPending}
          onConfirm={() => remove.mutate(deleteFor.id)}
          onCancel={() => setDeleteFor(null)}
        />
      )}
    </>
  );
}

// ── Month calendar (navigable within the selected year) ─────────────────────
const pad = (n: number) => String(n).padStart(2, '0');

function HolidayCalendarView({ year, holidays, loading }: { year: number; holidays: Holiday[]; loading: boolean }) {
  const [month, setMonth] = useState<number>(new Date().getFullYear() === year ? new Date().getMonth() + 1 : 1);

  const byDate = useMemo(() => {
    const map = new Map<string, Holiday>();
    holidays.forEach((h) => map.set(h.date.slice(0, 10), h));
    return map;
  }, [holidays]);

  const days: CalendarDayCell[] = useMemo(() => {
    const count = new Date(year, month, 0).getDate();
    return Array.from({ length: count }, (_, i) => {
      const date = `${year}-${pad(month)}-${pad(i + 1)}`;
      const h = byDate.get(date);
      return {
        date,
        primary: h ? { label: h.name, tone: TYPE_TONE[h.type] } : undefined,
        title: h ? `${h.name}${h.isOptional ? ' (optional)' : ''}` : undefined,
      };
    });
  }, [year, month, byDate]);

  const monthHolidays = holidays.filter((h) => Number(h.date.slice(5, 7)) === month).length;

  return (
    <Card title={`${MONTHS[month - 1]} ${year}`} action={<span className="muted sm-text">{monthHolidays} holiday{monthHolidays === 1 ? '' : 's'} this month</span>}>
      {loading ? (
        <p className="muted">Loading calendar…</p>
      ) : (
        <Calendar
          month={month}
          year={year}
          days={days}
          onPrev={month > 1 ? () => setMonth((m) => m - 1) : undefined}
          onNext={month < 12 ? () => setMonth((m) => m + 1) : undefined}
          legend={(
            <div className="att-legend">
              <span className="att-legend-lead">Holiday types:</span>
              {TYPES.map((t) => (
                <span key={t} className="att-legend-item">
                  <span className={`legend-swatch tone-${TYPE_TONE[t]}`} aria-hidden="true" />{titleCase(t)}
                </span>
              ))}
            </div>
          )}
        />
      )}
    </Card>
  );
}

// ── Create / edit form ──────────────────────────────────────────────────────
function HolidayFormModal({ holiday, onClose, onDone }: { holiday: Holiday | null; onClose: () => void; onDone: (message: string) => void }) {
  const isEdit = holiday != null;
  const [form, setForm] = useState<Form>(
    holiday
      ? { date: holiday.date.slice(0, 10), name: holiday.name, type: holiday.type, state: holiday.state ?? '', isOptional: holiday.isOptional }
      : emptyForm,
  );
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: () => {
      const body = {
        date: form.date,
        name: form.name.trim(),
        type: form.type,
        ...(form.state.trim() ? { state: form.state.trim() } : { state: null }),
        isOptional: form.isOptional,
      };
      return isEdit
        ? api.patch(`/human-resources/holidays/${holiday!.id}`, body)
        : api.post('/human-resources/holidays', body);
    },
    onSuccess: () => onDone(isEdit ? 'Holiday updated.' : 'Holiday added.'),
    onError: (err) => setError(apiMessage(err, 'Could not save the holiday.')),
  });

  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); save.mutate(); };
  const disabled = !form.date || !form.name.trim() || save.isPending;

  return (
    <Modal
      size="md"
      onClose={onClose}
      icon={<CalendarOff size={20} />}
      title={isEdit ? 'Edit holiday' : 'Add holiday'}
      subtitle="National, state or company non-working day"
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="holiday-form" disabled={disabled}>{save.isPending ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <form id="holiday-form" className="form-grid" onSubmit={submit}>
        <label>Date<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></label>
        <label>Type
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as HolidayType })} required>
            {TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
          </select>
        </label>
        <label className="span-all">Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label className="span-all">State<input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="optional" /></label>
        <label className="span-all checkbox-field">
          <input type="checkbox" checked={form.isOptional} onChange={(e) => setForm({ ...form, isOptional: e.target.checked })} />
          Optional (restricted) holiday
        </label>
        {error && <div className="error-box span-all">{error}</div>}
      </form>
    </Modal>
  );
}
