import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { useAuth } from '../auth/AuthContext';
import { can, canListAllBranches } from '../auth/permissions';

interface Branch {
  id: string; code: string; name: string; city: string; state: string; status: string;
  manager?: { fullName: string } | null;
  _count?: { clients: number; loans: number; employees: number };
}

export default function BranchesPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', addressLine: '', city: '', state: '' });
  const [error, setError] = useState('');

  const listAll = canListAllBranches(user?.role);
  const canCreate = can(user?.role, 'branch:create');

  // Cross-branch roles list every branch; a branch-scoped user (e.g. a manager)
  // can only read their own branch, so fetch that single record instead.
  const { data, isLoading } = useQuery({
    queryKey: listAll ? ['branches'] : ['branch', user?.branchId],
    enabled: listAll || !!user?.branchId,
    queryFn: () =>
      listAll
        ? api.get('/branches?pageSize=100').then((r) => r.data.data as Branch[])
        : api.get(`/branches/${user!.branchId}`).then((r) => [r.data.data as Branch]),
  });

  const createBranch = useMutation({
    mutationFn: (body: typeof form) => api.post('/branches', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branches'] });
      setShowForm(false);
      setForm({ code: '', name: '', addressLine: '', city: '', state: '' });
    },
    onError: () => setError('Could not create the branch. Check the code is unique and all fields are filled.'),
  });

  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); createBranch.mutate(form); };

  const columns: Column<Branch>[] = [
    { header: 'Code', render: (b) => <code>{b.code}</code>, sortValue: (b) => b.code },
    { header: 'Branch', render: (b) => <strong>{b.name}</strong>, sortValue: (b) => b.name },
    { header: 'Location', render: (b) => `${b.city}, ${b.state}`, sortValue: (b) => `${b.city}, ${b.state}` },
    { header: 'Manager', render: (b) => b.manager?.fullName ?? '—', sortValue: (b) => b.manager?.fullName ?? '' },
    { header: 'Clients', render: (b) => b._count?.clients ?? 0, sortValue: (b) => b._count?.clients ?? 0 },
    { header: 'Loans', render: (b) => b._count?.loans ?? 0, sortValue: (b) => b._count?.loans ?? 0 },
    { header: 'Status', render: (b) => <span className={`pill pill-${b.status.toLowerCase()}`}>{b.status}</span>, sortValue: (b) => b.status },
  ];

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Branches</h1>
          <p className="muted">All operating branches in the network</p>
        </div>
        {canCreate && (
          <button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Close' : 'Add branch'}</button>
        )}
      </header>

      {canCreate && showForm && (
        <form className="panel pad form-grid" onSubmit={submit}>
          <label>Code<input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="BR-SRT-001" required /></label>
          <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label>Address<input value={form.addressLine} onChange={(e) => setForm({ ...form, addressLine: e.target.value })} required /></label>
          <label>City<input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} required /></label>
          <label>State<input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} required /></label>
          {error && <div className="error-box span-all">{error}</div>}
          <div className="span-all"><button type="submit" disabled={createBranch.isPending}>Save branch</button></div>
        </form>
      )}

      <DataTable columns={columns} rows={data ?? []} loading={isLoading} empty="No branches yet. Add the first one." />
    </>
  );
}
