import { FormEvent, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
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
  const [editing, setEditing] = useState<Holiday | 'new' | null>(null);
  const [deleteFor, setDeleteFor] = useState<Holiday | null>(null);

  const canManage = can(user?.role, 'holiday:manage');

  const listUrl = `/human-resources/holidays?year=${year}`;
  const query = useQuery({
    queryKey: [listUrl],
    queryFn: () => api.get(listUrl).then((r) => r.data.data as Holiday[]),
    placeholderData: keepPreviousData,
  });

  const refresh = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/human-resources/holidays') });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/human-resources/holidays/${id}`),
    onSuccess: () => { refresh(); setDeleteFor(null); toast.success('Holiday deleted.'); },
    onError: (err) => { setDeleteFor(null); toast.error(apiMessage(err, 'Could not delete the holiday.')); },
  });

  const columns: Column<Holiday>[] = [
    { header: 'Date', render: (h) => fmtDate(h.date), sortValue: (h) => h.date },
    { header: 'Name', render: (h) => <strong>{h.name}</strong>, sortValue: (h) => h.name },
    { header: 'Type', render: (h) => <span className={`pill pill-${h.type.toLowerCase()}`}>{titleCase(h.type)}</span>, sortValue: (h) => h.type },
    { header: 'State', render: (h) => h.state ?? '—', sortValue: (h) => h.state ?? '' },
    { header: 'Optional', render: (h) => (h.isOptional ? 'Yes' : 'No'), sortValue: (h) => (h.isOptional ? 1 : 0) },
  ];

  if (canManage) {
    columns.push({
      header: 'Actions',
      render: (h) => (
        <div className="row-actions">
          <button type="button" className="icon-btn" title="Edit" aria-label="Edit holiday" onClick={() => setEditing(h)}><Pencil size={15} /></button>
          <button type="button" className="icon-btn danger" title="Delete" aria-label="Delete holiday" onClick={() => setDeleteFor(h)}><Trash2 size={15} /></button>
        </div>
      ),
    });
  }

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Holidays</h1>
          <p className="muted">National, state and company holiday calendar</p>
        </div>
        {canManage && <button onClick={() => setEditing('new')}><Plus size={16} /> Add holiday</button>}
      </header>

      <div className="filter-row">
        <label className="inline-field">Year
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </div>

      <DataTable
        columns={columns}
        rows={query.data ?? []}
        loading={query.isLoading}
        empty={`No holidays configured for ${year}.`}
        searchPlaceholder="Search by name, type or state…"
      />

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
