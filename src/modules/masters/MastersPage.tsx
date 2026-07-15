import { FormEvent, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { useServerTable } from '../../components/useServerTable';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { ActionMenu, type ActionItem } from '../../components/ActionMenu';
import { Ban, CheckCircle, Pencil, Plus, Settings2, Trash2 } from '../../components/icons';
import { titleCase, apiMessage } from '../../lib/format';
import { useToast } from '../../components/Toast';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';

// ── Domain model ────────────────────────────────────────────────────────────
// Every master shares the same envelope; resource-specific fields are optional
// on the shared row type so one component can render all six tabs.
interface MasterRow {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
  level?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  graceMinutes?: number | null;
  fullDayMinutes?: number | null;
  halfDayMinutes?: number | null;
  departmentId?: string | null;
  department?: { id: string; name: string; code: string } | null;
}

interface OptionRow { id: string; name: string; code: string }

type MasterKey =
  | 'departments'
  | 'designations'
  | 'grades'
  | 'employment-types'
  | 'shifts'
  | 'holiday-groups';

// A single form field description. `optionsKey` points a select at another
// master's /options endpoint (used by designation → department).
type FieldType = 'text' | 'textarea' | 'number' | 'time' | 'select';
interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  optionsKey?: MasterKey;
  placeholder?: string;
  span?: boolean; // full-width row in the form grid
}

interface MasterDef {
  label: string;
  singular: string;
  extraColumns: Column<MasterRow>[];
  formFields: FieldDef[];
}

// Fields shared by every master, reused across the configs to stay DRY.
const CODE: FieldDef = { name: 'code', label: 'Code', type: 'text', required: true };
const NAME: FieldDef = { name: 'name', label: 'Name', type: 'text', required: true };
const DESCRIPTION: FieldDef = { name: 'description', label: 'Description', type: 'textarea', placeholder: 'optional', span: true };

const timing = (r: MasterRow): string =>
  r.startTime && r.endTime ? `${r.startTime}–${r.endTime}` : '—';

// ── Per-resource configuration — drives columns and form for all six tabs ────
const MASTER_CONFIG: Record<MasterKey, MasterDef> = {
  departments: {
    label: 'Departments',
    singular: 'department',
    extraColumns: [],
    formFields: [CODE, NAME, DESCRIPTION],
  },
  designations: {
    label: 'Designations',
    singular: 'designation',
    extraColumns: [
      { header: 'Department', render: (r) => r.department?.name ?? '—', sortKey: 'department' },
    ],
    formFields: [
      CODE,
      NAME,
      { name: 'departmentId', label: 'Department', type: 'select', optionsKey: 'departments', required: true, span: true },
      DESCRIPTION,
    ],
  },
  grades: {
    label: 'Grades',
    singular: 'grade',
    extraColumns: [
      { header: 'Level', render: (r) => (r.level ?? '—'), sortKey: 'level' },
    ],
    formFields: [
      CODE,
      NAME,
      { name: 'level', label: 'Level', type: 'number', required: true },
      DESCRIPTION,
    ],
  },
  'employment-types': {
    label: 'Employment Types',
    singular: 'employment type',
    extraColumns: [],
    formFields: [CODE, NAME, DESCRIPTION],
  },
  shifts: {
    label: 'Shifts',
    singular: 'shift',
    extraColumns: [
      { header: 'Timing', render: (r) => timing(r), sortKey: 'startTime' },
    ],
    formFields: [
      CODE,
      NAME,
      { name: 'startTime', label: 'Start time', type: 'time', required: true },
      { name: 'endTime', label: 'End time', type: 'time', required: true },
      { name: 'graceMinutes', label: 'Grace (min)', type: 'number' },
      { name: 'fullDayMinutes', label: 'Full day (min)', type: 'number' },
      { name: 'halfDayMinutes', label: 'Half day (min)', type: 'number' },
      DESCRIPTION,
    ],
  },
  'holiday-groups': {
    label: 'Holiday Groups',
    singular: 'holiday group',
    extraColumns: [],
    formFields: [CODE, NAME, DESCRIPTION],
  },
};

const TAB_ORDER: MasterKey[] = ['departments', 'designations', 'grades', 'employment-types', 'shifts', 'holiday-groups'];

export default function MastersPage() {
  const [active, setActive] = useState<MasterKey>('departments');

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Organization Masters</h1>
          <p className="muted">Departments, designations, grades, employment types, shifts and holiday groups</p>
        </div>
      </header>

      <div className="master-tabs" role="tablist">
        {TAB_ORDER.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active === key}
            className={`master-tab${active === key ? ' active' : ''}`}
            onClick={() => setActive(key)}
          >
            {MASTER_CONFIG[key].label}
          </button>
        ))}
      </div>

      {/* Keyed so switching tabs remounts the resource with fresh table state. */}
      <MasterResource key={active} resourceKey={active} />
    </>
  );
}

// ── One master resource: search + table + CRUD, driven by MASTER_CONFIG ──────
function MasterResource({ resourceKey }: { resourceKey: MasterKey }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const toast = useToast();
  const table = useServerTable();
  const [editing, setEditing] = useState<MasterRow | 'new' | null>(null);
  const [deleteFor, setDeleteFor] = useState<MasterRow | null>(null);

  const def = MASTER_CONFIG[resourceKey];
  const canManage = can(user?.role, 'master:manage');

  const listUrl = `/masters/${resourceKey}?${table.params}`;
  const listQuery = useQuery({
    queryKey: [listUrl],
    queryFn: () => api.get(listUrl).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const rows = (listQuery.data?.data ?? []) as MasterRow[];
  const totalItems = (listQuery.data?.pagination?.totalItems ?? 0) as number;

  const refresh = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith(`/masters/${resourceKey}`) });

  const toggle = useMutation({
    mutationFn: (row: MasterRow) => api.patch(`/masters/${resourceKey}/${row.id}/status`, { isActive: !row.isActive }),
    onSuccess: (_d, row) => { refresh(); toast.success(`${titleCase(def.singular)} ${row.isActive ? 'deactivated' : 'activated'}.`); },
    onError: (err) => toast.error(apiMessage(err, 'Could not update the status.')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/masters/${resourceKey}/${id}`),
    onSuccess: () => { refresh(); setDeleteFor(null); toast.success(`${titleCase(def.singular)} deleted.`); },
    onError: (err) => { setDeleteFor(null); toast.error(apiMessage(err, `Could not delete the ${def.singular}.`)); },
  });

  const columns: Column<MasterRow>[] = [
    { header: 'Code', render: (r) => <code>{r.code}</code>, sortKey: 'code' },
    { header: 'Name', render: (r) => <strong>{r.name}</strong>, sortKey: 'name' },
    ...def.extraColumns,
    { header: 'Status', render: (r) => <span className={`pill pill-${r.isActive ? 'active' : 'inactive'}`}>{r.isActive ? 'Active' : 'Inactive'}</span>, sortKey: 'isActive' },
  ];

  if (canManage) {
    columns.push({
      header: 'Actions',
      render: (r) => <div className="actions-cell"><ActionMenu items={rowActions(r)} /></div>,
    });
  }

  function rowActions(r: MasterRow): ActionItem[] {
    return [
      { key: 'edit', label: 'Edit', icon: <Pencil size={15} />, onSelect: () => setEditing(r) },
      r.isActive
        ? { key: 'deactivate', label: 'Deactivate', icon: <Ban size={15} />, onSelect: () => toggle.mutate(r) }
        : { key: 'activate', label: 'Activate', icon: <CheckCircle size={15} />, onSelect: () => toggle.mutate(r) },
      { key: 'delete', label: 'Delete', icon: <Trash2 size={15} />, tone: 'danger', separatorBefore: true, onSelect: () => setDeleteFor(r) },
    ];
  }

  return (
    <>
      {canManage && (
        <div className="page-head row" style={{ marginBottom: 12 }}>
          <span />
          <button onClick={() => setEditing('new')}><Plus size={16} /> Add {def.singular}</button>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        loading={listQuery.isLoading}
        empty={`No ${def.label.toLowerCase()} found.`}
        searchPlaceholder={`Search ${def.label.toLowerCase()} by code or name…`}
        server={{
          page: table.page, pageSize: table.pageSize, totalItems,
          onPageChange: table.setPage, sort: table.sort, onSortChange: table.onSortChange,
          search: table.search, onSearchChange: table.onSearchChange,
        }}
      />

      {editing && (
        <MasterFormModal
          resourceKey={resourceKey}
          def={def}
          row={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDone={(message) => { setEditing(null); refresh(); toast.success(message); }}
        />
      )}

      {deleteFor && (
        <ConfirmDialog
          tone="danger"
          icon={<Trash2 size={20} />}
          title={`Delete ${def.singular}`}
          message={<>This permanently removes the record if nothing depends on it.<br /><span className="muted sm-text">{deleteFor.name} · {deleteFor.code}</span></>}
          confirmLabel="Delete"
          loading={remove.isPending}
          onConfirm={() => remove.mutate(deleteFor.id)}
          onCancel={() => setDeleteFor(null)}
        />
      )}
    </>
  );
}

// ── Create / edit form, generated from the resource's field config ───────────
type FormState = Record<string, string>;

function initialForm(def: MasterDef, row: MasterRow | null): FormState {
  const state: FormState = {};
  for (const field of def.formFields) {
    if (field.name === 'departmentId') {
      state[field.name] = row?.department?.id ?? row?.departmentId ?? '';
    } else {
      const value = row ? (row as unknown as Record<string, unknown>)[field.name] : undefined;
      state[field.name] = value == null ? '' : String(value);
    }
  }
  return state;
}

function MasterFormModal({ resourceKey, def, row, onClose, onDone }: {
  resourceKey: MasterKey;
  def: MasterDef;
  row: MasterRow | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const isEdit = row != null;
  const [form, setForm] = useState<FormState>(() => initialForm(def, row));
  const [error, setError] = useState('');

  // Department options for the designation select (only fetched when needed).
  const selectField = def.formFields.find((f) => f.type === 'select');
  const optionsQuery = useQuery({
    queryKey: [`/masters/${selectField?.optionsKey}/options`],
    queryFn: () => api.get(`/masters/${selectField!.optionsKey}/options`).then((r) => r.data.data as OptionRow[]),
    enabled: !!selectField,
  });

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {};
      for (const field of def.formFields) {
        const raw = form[field.name] ?? '';
        if (field.type === 'number') {
          body[field.name] = raw === '' ? null : Number(raw);
        } else if (field.type === 'select') {
          body[field.name] = raw === '' ? null : raw;
        } else {
          body[field.name] = raw.trim();
        }
      }
      return isEdit
        ? api.patch(`/masters/${resourceKey}/${row!.id}`, body)
        : api.post(`/masters/${resourceKey}`, body);
    },
    onSuccess: () => onDone(isEdit ? `${titleCase(def.singular)} updated.` : `${titleCase(def.singular)} added.`),
    onError: (err) => setError(apiMessage(err, `Could not save the ${def.singular}.`)),
  });

  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); save.mutate(); };

  const missingRequired = def.formFields.some((f) => f.required && !String(form[f.name] ?? '').trim());
  const disabled = missingRequired || save.isPending;

  const set = (name: string, value: string) => setForm((prev) => ({ ...prev, [name]: value }));

  return (
    <Modal
      size="md"
      onClose={onClose}
      icon={<Settings2 size={20} />}
      title={isEdit ? `Edit ${def.singular}` : `Add ${def.singular}`}
      subtitle={`Organization ${def.singular} master`}
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="master-form" disabled={disabled}>{save.isPending ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <form id="master-form" className="form-grid" onSubmit={submit}>
        {def.formFields.map((field) => {
          const value = form[field.name] ?? '';
          const labelClass = field.span || field.type === 'textarea' ? 'span-all' : undefined;
          if (field.type === 'select') {
            return (
              <label key={field.name} className={labelClass}>{field.label}
                <select value={value} onChange={(e) => set(field.name, e.target.value)} required={field.required}>
                  <option value="">— Select {field.label.toLowerCase()} —</option>
                  {optionsQuery.data?.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.code})</option>)}
                </select>
              </label>
            );
          }
          if (field.type === 'textarea') {
            return (
              <label key={field.name} className={labelClass}>{field.label}
                <textarea value={value} onChange={(e) => set(field.name, e.target.value)} placeholder={field.placeholder} rows={3} />
              </label>
            );
          }
          return (
            <label key={field.name} className={labelClass}>{field.label}
              <input
                type={field.type === 'number' ? 'number' : field.type === 'time' ? 'time' : 'text'}
                value={value}
                onChange={(e) => set(field.name, e.target.value)}
                placeholder={field.placeholder}
                required={field.required}
              />
            </label>
          );
        })}
        {error && <div className="error-box span-all">{error}</div>}
      </form>
    </Modal>
  );
}
