import { FormEvent, useState } from 'react';
import { AxiosError } from 'axios';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { useServerTable } from '../../components/useServerTable';
import { useAuth } from '../auth/AuthContext';
import { can, canListAllBranches } from '../auth/permissions';

interface Branch {
  id: string; code: string; name: string; addressLine: string; city: string; state: string; status: string;
  manager?: { fullName: string } | null;
  _count?: { clients: number; loans: number; employees: number };
}

const emptyForm = { code: '', name: '', addressLine: '', city: '', state: '' };

/** Reads the API error envelope's message, falling back to a default. */
const apiMessage = (err: unknown, fallback: string): string =>
  (err instanceof AxiosError && err.response?.data?.message) || fallback;

export default function BranchesPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  const listAll = canListAllBranches(user?.role);
  const canCreate = can(user?.role, 'branch:create');
  const canUpdate = can(user?.role, 'branch:update');
  const canDelete = can(user?.role, 'branch:delete');

  const table = useServerTable();

  // Cross-branch roles list every branch (server-paginated); a branch-scoped
  // user (e.g. a manager) can only read their own branch, so fetch that single
  // record instead — no paging needed for one row.
  const listUrl = `/branches?${table.params}`;
  const listQuery = useQuery({
    queryKey: [listUrl],
    enabled: listAll,
    queryFn: () => api.get(listUrl).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const singleQuery = useQuery({
    queryKey: ['branch', user?.branchId],
    enabled: !listAll && !!user?.branchId,
    queryFn: () => api.get(`/branches/${user!.branchId}`).then((r) => [r.data.data as Branch]),
  });

  const rows = (listAll ? listQuery.data?.data : singleQuery.data) as Branch[] | undefined;
  const totalItems = (listQuery.data?.pagination?.totalItems ?? 0) as number;
  const isLoading = listAll ? listQuery.isLoading : singleQuery.isLoading;

  const invalidate = () =>
    qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/branches') || q.queryKey[0] === 'branch' });

  const closeForm = () => { setShowForm(false); setEditing(null); setForm(emptyForm); setError(''); };

  const createBranch = useMutation({
    mutationFn: (body: typeof form) => api.post('/branches', body),
    onSuccess: () => { invalidate(); closeForm(); },
    onError: () => setError('Could not create the branch. Check the code is unique and all fields are filled.'),
  });

  const updateBranch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: typeof form }) => api.patch(`/branches/${id}`, body),
    onSuccess: () => { invalidate(); closeForm(); },
    onError: (err) => setError(apiMessage(err, 'Could not update the branch. Check the code is unique and all fields are filled.')),
  });

  const deleteBranch = useMutation({
    mutationFn: (id: string) => api.delete(`/branches/${id}`),
    onSuccess: invalidate,
    onError: (err) => setError(apiMessage(err, 'Could not delete the branch.')),
  });

  const startCreate = () => {
    if (showForm && !editing) { closeForm(); return; }
    setEditing(null); setForm(emptyForm); setError(''); setShowForm(true);
  };

  const startEdit = (b: Branch) => {
    setEditing(b);
    setForm({ code: b.code, name: b.name, addressLine: b.addressLine ?? '', city: b.city, state: b.state });
    setError('');
    setShowForm(true);
  };

  const remove = (b: Branch) => {
    setError('');
    if (window.confirm(`Delete ${b.name} (${b.code})? This cannot be undone.`)) deleteBranch.mutate(b.id);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (editing) updateBranch.mutate({ id: editing.id, body: form });
    else createBranch.mutate(form);
  };

  const columns: Column<Branch>[] = [
    { header: 'Code', render: (b) => <code>{b.code}</code>, sortKey: 'code' },
    { header: 'Branch', render: (b) => <strong>{b.name}</strong>, sortKey: 'name' },
    { header: 'Location', render: (b) => `${b.city}, ${b.state}`, sortKey: 'city' },
    { header: 'Manager', render: (b) => b.manager?.fullName ?? '—', sortKey: 'manager' },
    { header: 'Clients', render: (b) => b._count?.clients ?? 0, sortKey: 'clients' },
    { header: 'Loans', render: (b) => b._count?.loans ?? 0, sortKey: 'loans' },
    { header: 'Status', render: (b) => <span className={`pill pill-${b.status.toLowerCase()}`}>{b.status}</span>, sortKey: 'status' },
  ];

  if (canUpdate || canDelete) {
    columns.push({
      header: 'Actions',
      render: (b) => (
        <div className="row-actions">
          {canUpdate && <button type="button" className="sm ghost" onClick={() => startEdit(b)}>Edit</button>}
          {canDelete && <button type="button" className="sm ghost danger" onClick={() => remove(b)} disabled={deleteBranch.isPending}>Delete</button>}
        </div>
      ),
    });
  }

  const saving = createBranch.isPending || updateBranch.isPending;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Operations' }, { label: 'Branches' }]}
        title="Branches"
        subtitle="All operating branches in the network"
        actions={canCreate && <button onClick={startCreate}>{showForm && !editing ? 'Close' : 'Add branch'}</button>}
      />

      {showForm && (
        <form className="panel pad form-grid" onSubmit={submit}>
          <label>Code<input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="BR-SRT-001" required /></label>
          <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label>Address<input value={form.addressLine} onChange={(e) => setForm({ ...form, addressLine: e.target.value })} required /></label>
          <label>City<input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} required /></label>
          <label>State<input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} required /></label>
          {error && <div className="error-box span-all">{error}</div>}
          <div className="span-all row-actions">
            <button type="submit" disabled={saving}>{editing ? 'Save changes' : 'Save branch'}</button>
            <button type="button" className="ghost" onClick={closeForm}>Cancel</button>
          </div>
        </form>
      )}

      {error && !showForm && <div className="error-box">{error}</div>}

      <DataTable
        columns={columns}
        rows={rows ?? []}
        loading={isLoading}
        empty="No branches yet. Add the first one."
        searchPlaceholder="Search by code, name, city or manager…"
        server={listAll ? {
          page: table.page,
          pageSize: table.pageSize,
          totalItems,
          onPageChange: table.setPage,
          sort: table.sort,
          onSortChange: table.onSortChange,
          search: table.search,
          onSearchChange: table.onSearchChange,
        } : undefined}
      />
    </>
  );
}
