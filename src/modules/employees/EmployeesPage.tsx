import { FormEvent, useState } from 'react';
import { AxiosError } from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import EmployeeDetailModal from './EmployeeDetailModal';

interface EmployeeRow {
  id: string;
  employeeCode: string;
  fullName: string;
  phoneNumber: string;
  email?: string | null;
  designation: string;
  employmentStatus: string;
  joiningDate: string;
  branchId?: string | null;
  branch?: { name: string } | null;
}

interface BranchOption { id: string; name: string; code: string }

const emptyForm = {
  fullName: '', phoneNumber: '', email: '', designation: '', branchId: '', joiningDate: '',
  bankAccountNumber: '', bankIfscCode: '', panNumber: '',
  basicSalary: '', houseRentAllowance: '', dearnessAllowance: '', specialAllowance: '', effectiveFrom: '',
};
type Form = typeof emptyForm;

const apiMessage = (err: unknown, fallback: string): string =>
  (err instanceof AxiosError && err.response?.data?.message) || fallback;
const fmtDate = (value?: string | null): string =>
  value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const compact = <T extends Record<string, unknown>>(obj: T): Partial<T> =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v != null)) as Partial<T>;

export default function EmployeesPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const canCreate = can(user?.role, 'employee:create');
  const canManage = can(user?.role, 'employee:update');

  const listQuery = useQuery({
    queryKey: ['/employees'],
    queryFn: () => api.get('/employees?pageSize=100').then((r) => r.data.data as EmployeeRow[]),
  });

  const branchesQuery = useQuery({
    queryKey: ['/branches', 'options'],
    queryFn: () => api.get('/branches?pageSize=100').then((r) => r.data.data as BranchOption[]),
    enabled: showForm,
  });

  const closeForm = () => { setShowForm(false); setForm(emptyForm); setError(''); };

  const createEmployee = useMutation({
    mutationFn: (f: Form) =>
      api.post('/employees', {
        ...compact({
          fullName: f.fullName, phoneNumber: f.phoneNumber, email: f.email, designation: f.designation,
          branchId: f.branchId, joiningDate: f.joiningDate,
          bankAccountNumber: f.bankAccountNumber, bankIfscCode: f.bankIfscCode, panNumber: f.panNumber,
        }),
        salaryStructure: compact({
          basicSalary: f.basicSalary ? Number(f.basicSalary) : '',
          houseRentAllowance: f.houseRentAllowance ? Number(f.houseRentAllowance) : '',
          dearnessAllowance: f.dearnessAllowance ? Number(f.dearnessAllowance) : '',
          specialAllowance: f.specialAllowance ? Number(f.specialAllowance) : '',
          effectiveFrom: f.effectiveFrom || f.joiningDate,
        }),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/employees'] }); closeForm(); },
    onError: (err) => setError(apiMessage(err, 'Could not create the employee. Check all required fields are valid.')),
  });

  const startCreate = () => {
    if (showForm) { closeForm(); return; }
    setForm(emptyForm); setError(''); setShowForm(true);
  };

  const submit = (ev: FormEvent) => { ev.preventDefault(); setError(''); createEmployee.mutate(form); };

  const statusPill = (s: string) => <span className={`pill pill-${s.toLowerCase()}`}>{s.replaceAll('_', ' ')}</span>;

  const columns: Column<EmployeeRow>[] = [
    { header: 'Code', render: (e) => <code>{e.employeeCode}</code>, sortValue: (e) => e.employeeCode },
    { header: 'Name', render: (e) => <strong>{e.fullName}</strong>, sortValue: (e) => e.fullName },
    { header: 'Designation', render: (e) => e.designation, sortValue: (e) => e.designation },
    { header: 'Branch', render: (e) => e.branch?.name ?? '—', sortValue: (e) => e.branch?.name ?? '' },
    { header: 'Phone', render: (e) => e.phoneNumber, sortValue: (e) => e.phoneNumber },
    { header: 'Joined', render: (e) => fmtDate(e.joiningDate), sortValue: (e) => e.joiningDate },
    { header: 'Status', render: (e) => statusPill(e.employmentStatus), sortValue: (e) => e.employmentStatus },
    { header: 'Actions', render: (e) => <button type="button" className="sm ghost" onClick={() => setOpenId(e.id)}>Open</button> },
  ];

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Employee Management</h1>
          <p className="muted">Staff profiles — personal details, branch, KYC documents and salary</p>
        </div>
        {canCreate && <button onClick={startCreate}>{showForm ? 'Close' : 'Add employee'}</button>}
      </header>

      {showForm && (
        <form className="panel pad form-grid" onSubmit={submit}>
          <label>Full name<input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required /></label>
          <label>Phone<input value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} placeholder="+9198XXXXXXXX" required /></label>
          <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label>Designation<input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} required /></label>
          <label>Branch
            <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
              <option value="">— Unassigned —</option>
              {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
            </select>
          </label>
          <label>Joining date<input type="date" value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} required /></label>
          <label>Bank account no.<input value={form.bankAccountNumber} onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })} placeholder="optional" /></label>
          <label>IFSC<input value={form.bankIfscCode} onChange={(e) => setForm({ ...form, bankIfscCode: e.target.value.toUpperCase() })} placeholder="HDFC0000123" /></label>
          <label>PAN<input value={form.panNumber} onChange={(e) => setForm({ ...form, panNumber: e.target.value.toUpperCase() })} placeholder="ABCDE1234F" /></label>
          <div className="span-all"><h3 className="section-title">Salary structure</h3></div>
          <label>Basic salary<input type="number" min="0" value={form.basicSalary} onChange={(e) => setForm({ ...form, basicSalary: e.target.value })} required /></label>
          <label>House rent allowance<input type="number" min="0" value={form.houseRentAllowance} onChange={(e) => setForm({ ...form, houseRentAllowance: e.target.value })} /></label>
          <label>Dearness allowance<input type="number" min="0" value={form.dearnessAllowance} onChange={(e) => setForm({ ...form, dearnessAllowance: e.target.value })} /></label>
          <label>Special allowance<input type="number" min="0" value={form.specialAllowance} onChange={(e) => setForm({ ...form, specialAllowance: e.target.value })} /></label>
          <label>Salary effective from<input type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} /></label>
          {error && <div className="error-box span-all">{error}</div>}
          <div className="span-all row-actions">
            <button type="submit" disabled={createEmployee.isPending}>Save employee</button>
            <button type="button" className="ghost" onClick={closeForm}>Cancel</button>
          </div>
        </form>
      )}

      {error && !showForm && <div className="error-box">{error}</div>}

      <DataTable
        columns={columns}
        rows={listQuery.data ?? []}
        loading={listQuery.isLoading}
        empty="No employees yet. Add the first one."
        searchPlaceholder="Search by name, code, designation or branch…"
      />

      {openId && <EmployeeDetailModal employeeId={openId} canManage={canManage} onClose={() => setOpenId(null)} />}
    </>
  );
}
