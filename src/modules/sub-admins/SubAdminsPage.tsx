import { FormEvent, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FilterBar } from '../../components/FilterBar';
import { Badge } from '../../components/Badge';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { ActionMenu, type ActionItem } from '../../components/ActionMenu';
import { useServerTable } from '../../components/useServerTable';
import { useToast } from '../../components/Toast';
import { Ban, CheckCircle, Pencil, Plus, RotateCcw, Trash2, UserCheck } from '../../components/icons';
import { apiMessage } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';

/** Date + time, as the lead and report screens format timestamps. */
const fmtSignIn = (value: string) =>
  new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * Sub Admin — every administrator account in one place.
 *
 * These are standalone login accounts, not employees: they carry no attendance,
 * leave or salary and never appear in the Employees directory.
 *
 * The list shows Super Admin and HR Admin alongside the three Operations-only
 * sub-admin roles, so this is the whole administrator picture. Listing is not
 * managing, though: the two privileged roles are PROTECTED — they can have their
 * contact details corrected and can be deactivated, but they cannot be created,
 * re-roled or deleted here. A screen for delegating Operations access must not
 * be able to hand out Super Admin.
 *
 * The whole screen is Super Admin only. The route guard enforces that in the
 * browser and `/sub-admins` enforces it again on the server, which is the copy
 * that counts.
 */

interface SubAdminRole {
  id: string;
  key: string | null;
  name: string;
  displayName: string | null;
  scopeType?: string;
}

interface SubAdminRow {
  id: string;
  fullName: string;
  email: string;
  username: string | null;
  phoneNumber: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  lastLoginAt: string | null;
  forcePasswordChange: boolean;
  createdAt: string;
  role: SubAdminRole;
}

const roleLabel = (role: SubAdminRole) => role.displayName ?? role.name;

/** What each role actually reaches — the reason the roles differ. */
const ACCESS_NOTE: Record<string, string> = {
  'operations-team': 'Operations · all branches',
  'gujarat-head': 'Operations · Gujarat branches only',
  'mumbai-head': 'Operations · Maharashtra branches only',
  'super-admin': 'Full system access',
  'human-resources-admin': 'HR module · all branches',
};

/**
 * Roles listed for visibility but not managed here. Mirrors
 * PROTECTED_ADMIN_ROLES on the backend, which is what actually enforces it.
 */
const PROTECTED_ROLE_KEYS = ['super-admin', 'human-resources-admin'];
const isProtected = (row: SubAdminRow) => PROTECTED_ROLE_KEYS.includes(row.role.key ?? '');

export default function SubAdminsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const toast = useToast();
  const table = useServerTable();
  const [status, setStatus] = useState('');
  const [roleId, setRoleId] = useState('');
  const [editing, setEditing] = useState<SubAdminRow | 'new' | null>(null);
  const [deleteFor, setDeleteFor] = useState<SubAdminRow | null>(null);
  const [resetFor, setResetFor] = useState<SubAdminRow | null>(null);

  const listUrl = `/sub-admins?${table.params}${status ? `&status=${status}` : ''}${roleId ? `&roleId=${roleId}` : ''}`;
  const listQuery = useQuery({
    queryKey: [listUrl],
    queryFn: () => api.get(listUrl).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const rows = (listQuery.data?.data ?? []) as SubAdminRow[];
  const totalItems = (listQuery.data?.pagination?.totalItems ?? 0) as number;

  // Two lists, deliberately: the filter offers every role the table can show
  // (including the protected ones), the create/edit form offers only the roles
  // this module may actually assign.
  const filterRolesQuery = useQuery({
    queryKey: ['/sub-admins/roles/all'],
    queryFn: () => api.get('/sub-admins/roles/all').then((r) => r.data.data as SubAdminRole[]),
  });
  const assignableRolesQuery = useQuery({
    queryKey: ['/sub-admins/roles'],
    queryFn: () => api.get('/sub-admins/roles').then((r) => r.data.data as SubAdminRole[]),
  });

  const refresh = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/sub-admins') });

  const toggle = useMutation({
    mutationFn: (row: SubAdminRow) =>
      api.patch(`/sub-admins/${row.id}/status`, { status: row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }),
    onSuccess: (_d, row) => {
      refresh();
      toast.success(`${row.fullName} ${row.status === 'ACTIVE' ? 'deactivated' : 'activated'}.`);
    },
    onError: (err) => toast.error(apiMessage(err, 'Could not update the account status.')),
  });

  const resetPassword = useMutation({
    mutationFn: (id: string) => api.post(`/sub-admins/${id}/reset-password`).then((r) => r.data),
    onSuccess: (data) => {
      setResetFor(null);
      refresh();
      toast.success(`Password reset to ${data?.data?.temporaryPassword ?? 'the default'}. They must change it at next sign-in.`);
    },
    onError: (err) => { setResetFor(null); toast.error(apiMessage(err, 'Could not reset the password.')); },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/sub-admins/${id}`),
    onSuccess: () => { refresh(); setDeleteFor(null); toast.success('Sub-admin deleted.'); },
    onError: (err) => { setDeleteFor(null); toast.error(apiMessage(err, 'This sub-admin could not be deleted.')); },
  });

  /**
   * Protected rows (Super Admin / HR Admin) get edit, password reset and
   * activate/deactivate but never Delete, and you never get to deactivate the
   * account you are signed in with. The backend refuses all of this too — this
   * only keeps the menu from offering something that would come back a 4xx.
   */
  const rowActions = (row: SubAdminRow): ActionItem[] => {
    const protectedRow = isProtected(row);
    const isSelf = row.id === user?.id;
    return [
      { key: 'edit', label: 'Edit', icon: <Pencil size={15} />, onSelect: () => setEditing(row) },
      { key: 'reset', label: 'Reset password', icon: <RotateCcw size={15} />, onSelect: () => setResetFor(row) },
      ...(row.status === 'ACTIVE'
        ? isSelf
          ? []
          : [{ key: 'deactivate', label: 'Deactivate', icon: <Ban size={15} />, onSelect: () => toggle.mutate(row) } as ActionItem]
        : [{ key: 'activate', label: 'Activate', icon: <CheckCircle size={15} />, onSelect: () => toggle.mutate(row) } as ActionItem]),
      ...(protectedRow
        ? []
        : [{ key: 'delete', label: 'Delete', icon: <Trash2 size={15} />, tone: 'danger' as const, separatorBefore: true, onSelect: () => setDeleteFor(row) } as ActionItem]),
    ];
  };

  const columns: Column<SubAdminRow>[] = [
    { header: 'Name', render: (r) => <strong>{r.fullName}</strong>, sortKey: 'fullName' },
    { header: 'Email', render: (r) => r.email, sortKey: 'email' },
    { header: 'Username', render: (r) => (r.username ? <code>{r.username}</code> : <span className="muted">—</span>) },
    { header: 'Phone', render: (r) => r.phoneNumber },
    {
      header: 'Role',
      render: (r) => (
        <>
          {roleLabel(r.role)}
          {isProtected(r) && <span className="muted sm-text"> · protected</span>}
        </>
      ),
    },
    {
      header: 'Data access',
      render: (r) => <span className="muted">{ACCESS_NOTE[r.role.key ?? ''] ?? 'Operations module'}</span>,
    },
    {
      header: 'Last sign-in',
      render: (r) => (r.lastLoginAt ? fmtSignIn(r.lastLoginAt) : <span className="muted">Never</span>),
      sortKey: 'lastLoginAt',
    },
    { header: 'Status', render: (r) => <Badge status={r.status} />, sortKey: 'status' },
    { header: '', render: (r) => <div className="actions-cell"><ActionMenu items={rowActions(r)} /></div> },
  ];

  const chips = [
    ...(status ? [{ key: 'status', label: `Status: ${status}`, onRemove: () => { setStatus(''); table.setPage(1); } }] : []),
    ...(roleId
      ? [{
          key: 'role',
          label: `Role: ${roleLabel(filterRolesQuery.data?.find((r) => r.id === roleId) ?? { id: '', key: '', name: roleId, displayName: null })}`,
          onRemove: () => { setRoleId(''); table.setPage(1); },
        }]
      : []),
  ];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Administration' }, { label: 'Sub Admin' }]}
        title="Sub Admin"
        subtitle="Administrator logins — Super Admin, HR Admin and the Operations-only sub-admins"
        actions={<button className="btn-lg" onClick={() => setEditing('new')}><Plus size={16} /> Add sub-admin</button>}
      />

      <div className="info-box" style={{ marginBottom: '1rem' }}>
        These are login accounts, not employees. Sub-admins (Operations Team, Gujarat Head, Mumbai Head) hold the
        Operations module only and cannot open Human Resources; new ones start on the shared default password and must
        change it at first sign-in. Super Admin and HR Admin are listed for visibility — they can be edited and
        deactivated here, but not created, re-roled or deleted.
      </div>

      <FilterBar chips={chips} onReset={chips.length ? () => { setStatus(''); setRoleId(''); table.setPage(1); } : undefined}>
        <label>Role
          <select value={roleId} onChange={(e) => { setRoleId(e.target.value); table.setPage(1); }} aria-label="Filter by role">
            <option value="">All roles</option>
            {filterRolesQuery.data?.map((r) => <option key={r.id} value={r.id}>{roleLabel(r)}</option>)}
          </select>
        </label>
        <label>Status
          <select value={status} onChange={(e) => { setStatus(e.target.value); table.setPage(1); }} aria-label="Filter by account status">
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </label>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        loading={listQuery.isLoading}
        empty="No administrator accounts match this filter."
        searchPlaceholder="Search by name, email, username or phone…"
        server={{
          page: table.page, pageSize: table.pageSize, totalItems,
          onPageChange: table.setPage, sort: table.sort, onSortChange: table.onSortChange,
          search: table.search, onSearchChange: table.onSearchChange,
        }}
      />

      {editing && (
        <SubAdminFormModal
          row={editing === 'new' ? null : editing}
          roles={assignableRolesQuery.data ?? []}
          onClose={() => setEditing(null)}
          onDone={(message) => { setEditing(null); refresh(); toast.success(message); }}
        />
      )}

      {resetFor && (
        <ConfirmDialog
          icon={<RotateCcw size={20} />}
          title={`Reset password for ${resetFor.fullName}?`}
          message="The account goes back to the shared default password and must be changed at the next sign-in. Any open session is ended."
          confirmLabel="Reset password"
          loading={resetPassword.isPending}
          onConfirm={() => resetPassword.mutate(resetFor.id)}
          onCancel={() => setResetFor(null)}
        />
      )}

      {deleteFor && (
        <ConfirmDialog
          tone="danger"
          icon={<Trash2 size={20} />}
          title={`Delete ${deleteFor.fullName}?`}
          message={<>An account that has already signed in or acted is kept for audit — deactivate it instead.<br /><span className="muted sm-text">{deleteFor.email}</span></>}
          confirmLabel="Delete sub-admin"
          loading={remove.isPending}
          onConfirm={() => remove.mutate(deleteFor.id)}
          onCancel={() => setDeleteFor(null)}
        />
      )}
    </>
  );
}

// ── Create / edit ───────────────────────────────────────────────────────────

function SubAdminFormModal({ row, roles, onClose, onDone }: {
  row: SubAdminRow | null;
  roles: SubAdminRole[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const isEdit = row != null;
  const [fullName, setFullName] = useState(row?.fullName ?? '');
  const [email, setEmail] = useState(row?.email ?? '');
  const [phoneNumber, setPhoneNumber] = useState(row?.phoneNumber ?? '');
  const [roleId, setRoleId] = useState(row?.role.id ?? '');
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: () => {
      const body = { fullName: fullName.trim(), email: email.trim(), phoneNumber: phoneNumber.trim(), roleId };
      return isEdit ? api.patch(`/sub-admins/${row!.id}`, body) : api.post('/sub-admins', body);
    },
    onSuccess: (response) => {
      const temporaryPassword = response?.data?.data?.temporaryPassword as string | undefined;
      onDone(
        isEdit
          ? 'Sub-admin updated.'
          : `Sub-admin created${temporaryPassword ? ` — password ${temporaryPassword} (must be changed at first sign-in)` : ''}.`,
      );
    },
    onError: (err) => setError(apiMessage(err, 'Could not save the sub-admin.')),
  });

  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); save.mutate(); };
  const disabled = !fullName.trim() || !email.trim() || !phoneNumber.trim() || !roleId || save.isPending;
  const selected = roles.find((r) => r.id === roleId);

  return (
    <Modal
      size="md"
      onClose={onClose}
      icon={<UserCheck size={20} />}
      title={isEdit ? 'Edit sub-admin' : 'Add sub-admin'}
      subtitle="Operations-only delegate login"
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="sub-admin-form" disabled={disabled}>{save.isPending ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <form id="sub-admin-form" className="form-grid" onSubmit={submit}>
        <label className="span-all">Full name
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Ramesh Patel" required />
        </label>
        <label>Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" required />
        </label>
        <label>Phone
          <input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="9876543210" required />
        </label>
        <label className="span-all">Role
          <select value={roleId} onChange={(e) => setRoleId(e.target.value)} required>
            <option value="">— Select a sub-admin role —</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{roleLabel(r)}</option>)}
          </select>
        </label>
        {selected && (
          <p className="muted sm-text span-all">
            {ACCESS_NOTE[selected.key ?? ''] ?? 'Operations module'} · Operations module only — no access to Human Resources.
          </p>
        )}
        {!isEdit && (
          <p className="muted sm-text span-all">
            The account is created active on the shared default password and must be changed at first sign-in.
          </p>
        )}
        {error && <div className="error-box span-all">{error}</div>}
      </form>
    </Modal>
  );
}
