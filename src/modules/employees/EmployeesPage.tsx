import { FormEvent, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { useServerTable } from '../../components/useServerTable';
import { ConfirmDialog } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { Pencil, Trash2 } from '../../components/icons';
import { fmtDate, apiMessage, inr } from '../../lib/format';
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

// ── Organization-master option shapes (from /masters/*/options) ──
interface DepartmentOption { id: string; name: string; code: string }
interface DesignationOption { id: string; name: string; code: string; department: { id: string; name: string } | null }
interface GradeOption { id: string; name: string; code: string; level?: number }
interface EmploymentTypeOption { id: string; name: string; code: string }
interface ShiftOption { id: string; name: string; code: string; startTime?: string; endTime?: string }

const STATUS_FILTERS = ['', 'ONBOARDING', 'ACTIVE', 'ON_NOTICE', 'SEPARATED'] as const;
const statusLabel = (s: string): string => (s ? s.charAt(0) + s.slice(1).toLowerCase().replaceAll('_', ' ') : 'All statuses');

/** Login roles offered when creating an employee's sign-in account. */
// Staff login roles. Only Branch Manager signs into the admin panel; Field
// Officer and Accountant sign into the Field Officer app. System-admin roles
// (HR / HQ / Super) are provisioned outside the employee flow.
const LOGIN_ROLES: { value: string; label: string; portal: string }[] = [
  { value: 'FIELD_OFFICER', label: 'Field Officer', portal: 'Field Officer app' },
  { value: 'ACCOUNTANT', label: 'Accountant', portal: 'Field Officer app' },
  { value: 'BRANCH_MANAGER', label: 'Branch Manager', portal: 'Admin panel' },
];

/** Numeric salary components that add up to the gross / CTC. */
const SALARY_COMPONENT_KEYS = [
  'basicSalary', 'houseRentAllowance', 'dearnessAllowance', 'specialAllowance',
  'conveyanceAllowance', 'medicalAllowance', 'travelAllowance', 'foodAllowance',
  'mobileAllowance', 'otherAllowance',
] as const;

const emptyForm = {
  fullName: '', phoneNumber: '', email: '', designation: '', branchId: '', joiningDate: '',
  bankAccountNumber: '', bankIfscCode: '', panNumber: '',
  // personal / HR profile — organization-master FK ids replace the old free-text department/employeeType
  departmentId: '', designationId: '', gradeId: '', employmentTypeId: '', shiftId: '',
  reportsToId: '', dateOfBirth: '', gender: '', maritalStatus: '',
  addressLine: '', emergencyContactName: '', emergencyContactPhone: '', emergencyContactRelation: '',
  confirmationDate: '', uanNumber: '', providentFundNumber: '', stateInsuranceNumber: '',
  // salary structure
  basicSalary: '', houseRentAllowance: '', dearnessAllowance: '', specialAllowance: '',
  conveyanceAllowance: '', medicalAllowance: '', travelAllowance: '', foodAllowance: '',
  mobileAllowance: '', otherAllowance: '', effectiveFrom: '',
  isProvidentFundApplicable: true, isStateInsuranceApplicable: false, isProfessionalTaxApplicable: true,
  // login account — a sign-in is created + emailed with the employee by default
  createLoginAccount: true, accountRoleName: 'FIELD_OFFICER',
};
type Form = typeof emptyForm;

const compact = <T extends Record<string, unknown>>(obj: T): Partial<T> =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v != null)) as Partial<T>;

const num = (v: string): number | '' => (v ? Number(v) : '');

export default function EmployeesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const table = useServerTable();
  const [status, setStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm);
  const [detail, setDetail] = useState<{ id: string; tab?: 'personal' | 'edit' } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmployeeRow | null>(null);
  const [error, setError] = useState('');

  const canCreate = can(user?.role, 'employee:create');
  const canManage = can(user?.role, 'employee:update');

  const listUrl = `/employees?${table.params}${status ? `&status=${status}` : ''}`;
  const listQuery = useQuery({
    queryKey: [listUrl],
    queryFn: () => api.get(listUrl).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const rows = (listQuery.data?.data ?? []) as EmployeeRow[];
  const totalItems = (listQuery.data?.pagination?.totalItems ?? 0) as number;

  const refresh = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/employees') });

  const branchesQuery = useQuery({
    queryKey: ['/branches', 'options'],
    queryFn: () => api.get('/branches?pageSize=100').then((r) => r.data.data as BranchOption[]),
    enabled: showForm,
  });

  // Candidate reporting managers — other employees, scoped to the chosen branch.
  const managerOptionsQuery = useQuery({
    queryKey: ['/employees', 'manager-options'],
    queryFn: () => api.get('/employees?pageSize=200').then((r) => r.data.data as EmployeeRow[]),
    enabled: showForm,
  });
  const managerOptions = (managerOptionsQuery.data ?? []).filter((e) => !form.branchId || e.branchId === form.branchId);

  // Organization-master options for the HR selects — fetched only while the create form is open.
  const departmentsQuery = useQuery({
    queryKey: ['/masters/departments/options'],
    queryFn: () => api.get('/masters/departments/options').then((r) => r.data.data as DepartmentOption[]),
    enabled: showForm,
  });
  const designationsQuery = useQuery({
    queryKey: ['/masters/designations/options'],
    queryFn: () => api.get('/masters/designations/options').then((r) => r.data.data as DesignationOption[]),
    enabled: showForm,
  });
  const gradesQuery = useQuery({
    queryKey: ['/masters/grades/options'],
    queryFn: () => api.get('/masters/grades/options').then((r) => r.data.data as GradeOption[]),
    enabled: showForm,
  });
  const employmentTypesQuery = useQuery({
    queryKey: ['/masters/employment-types/options'],
    queryFn: () => api.get('/masters/employment-types/options').then((r) => r.data.data as EmploymentTypeOption[]),
    enabled: showForm,
  });
  const shiftsQuery = useQuery({
    queryKey: ['/masters/shifts/options'],
    queryFn: () => api.get('/masters/shifts/options').then((r) => r.data.data as ShiftOption[]),
    enabled: showForm,
  });
  // Designations belonging to the chosen department (plus any without one) come first / are the only options.
  const designationOptions = (designationsQuery.data ?? []).filter(
    (d) => !form.departmentId || d.department?.id === form.departmentId || !d.department,
  );

  const grossPreview = SALARY_COMPONENT_KEYS.reduce((sum, key) => sum + (Number(form[key]) || 0), 0);

  const closeForm = () => { setShowForm(false); setForm(emptyForm); setError(''); };

  const createEmployee = useMutation({
    mutationFn: (f: Form) =>
      api.post('/employees', {
        ...compact({
          fullName: f.fullName, phoneNumber: f.phoneNumber, email: f.email, designation: f.designation,
          branchId: f.branchId, joiningDate: f.joiningDate,
          bankAccountNumber: f.bankAccountNumber, bankIfscCode: f.bankIfscCode, panNumber: f.panNumber,
          departmentId: f.departmentId, designationId: f.designationId, gradeId: f.gradeId,
          employmentTypeId: f.employmentTypeId, shiftId: f.shiftId,
          reportsToId: f.reportsToId, dateOfBirth: f.dateOfBirth,
          gender: f.gender, maritalStatus: f.maritalStatus, addressLine: f.addressLine,
          emergencyContactName: f.emergencyContactName, emergencyContactPhone: f.emergencyContactPhone,
          emergencyContactRelation: f.emergencyContactRelation,
          confirmationDate: f.confirmationDate, uanNumber: f.uanNumber,
          providentFundNumber: f.providentFundNumber, stateInsuranceNumber: f.stateInsuranceNumber,
        }),
        salaryStructure: {
          ...compact({
            basicSalary: num(f.basicSalary),
            houseRentAllowance: num(f.houseRentAllowance),
            dearnessAllowance: num(f.dearnessAllowance),
            specialAllowance: num(f.specialAllowance),
            conveyanceAllowance: num(f.conveyanceAllowance),
            medicalAllowance: num(f.medicalAllowance),
            travelAllowance: num(f.travelAllowance),
            foodAllowance: num(f.foodAllowance),
            mobileAllowance: num(f.mobileAllowance),
            otherAllowance: num(f.otherAllowance),
            effectiveFrom: f.effectiveFrom || f.joiningDate,
          }),
          isProvidentFundApplicable: f.isProvidentFundApplicable,
          isStateInsuranceApplicable: f.isStateInsuranceApplicable,
          isProfessionalTaxApplicable: f.isProfessionalTaxApplicable,
        },
        createLoginAccount: f.createLoginAccount,
        ...(f.createLoginAccount ? { accountRoleName: f.accountRoleName } : {}),
      }),
    onSuccess: (res) => {
      refresh();
      closeForm();
      toast.success('Employee created successfully.');
      // The backend may create the employee yet fail to provision the login.
      const account = res.data?.data?.account as { created?: boolean; error?: string } | undefined;
      if (account?.error) toast.info(`Login account was not created: ${account.error}`);
    },
    onError: (err) => setError(apiMessage(err, 'Could not create the employee. Check all required fields are valid.')),
  });

  const deleteEmployee = useMutation({
    mutationFn: (id: string) => api.delete(`/employees/${id}`),
    onSuccess: () => { refresh(); setDeleteTarget(null); setError(''); toast.success('Employee deleted successfully.'); },
    onError: (err) => { setDeleteTarget(null); setError(apiMessage(err, 'This employee could not be deleted.')); },
  });

  const startCreate = () => {
    if (showForm) { closeForm(); return; }
    setForm(emptyForm); setError(''); setShowForm(true);
  };

  const submit = (ev: FormEvent) => { ev.preventDefault(); setError(''); createEmployee.mutate(form); };

  const statusPill = (s: string) => <span className={`pill pill-${s.toLowerCase()}`}>{s.replaceAll('_', ' ')}</span>;

  const columns: Column<EmployeeRow>[] = [
    { header: 'Code', render: (e) => <code>{e.employeeCode}</code>, sortKey: 'employeeCode' },
    { header: 'Name', render: (e) => <strong>{e.fullName}</strong>, sortKey: 'fullName' },
    { header: 'Designation', render: (e) => e.designation, sortKey: 'designation' },
    { header: 'Branch', render: (e) => e.branch?.name ?? '—', sortKey: 'branch' },
    { header: 'Phone', render: (e) => e.phoneNumber },
    { header: 'Joined', render: (e) => fmtDate(e.joiningDate), sortKey: 'joiningDate' },
    { header: 'Status', render: (e) => statusPill(e.employmentStatus), sortKey: 'employmentStatus' },
    {
      header: '',
      render: (e) => (
        <div className="row-actions">
          <button type="button" className="sm ghost" onClick={() => { setError(''); setDetail({ id: e.id, tab: 'personal' }); }}>Open</button>
          {canManage && (
            <button type="button" className="sm ghost" onClick={() => { setError(''); setDetail({ id: e.id, tab: 'edit' }); }}><Pencil size={14} /> Edit</button>
          )}
          {canManage && (
            <button type="button" className="sm ghost danger" onClick={() => { setError(''); setDeleteTarget(e); }}><Trash2 size={14} /> Delete</button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Employee Management</h1>
          <p className="muted">Staff profiles — personal details, branch, KYC documents and salary</p>
        </div>
        <div className="row-actions">
          <select value={status} onChange={(e) => { setStatus(e.target.value); table.setPage(1); }} aria-label="Filter by employment status">
            {STATUS_FILTERS.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
          {canCreate && <button onClick={startCreate}>{showForm ? 'Close' : 'Add employee'}</button>}
        </div>
      </header>

      {showForm && (
        <form className="panel pad form-grid" onSubmit={submit}>
          <label>Full name<input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required /></label>
          <label>Phone<input value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} placeholder="+9198XXXXXXXX" required /></label>
          <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label>Designation (label)<input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="Free-text title" required={!form.designationId} /></label>
          <label>Branch
            <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value, reportsToId: '' })}>
              <option value="">— Unassigned —</option>
              {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
            </select>
          </label>
          <label>Joining date<input type="date" value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} required /></label>
          <label>Bank account no.<input value={form.bankAccountNumber} onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })} placeholder="optional" /></label>
          <label>IFSC<input value={form.bankIfscCode} onChange={(e) => setForm({ ...form, bankIfscCode: e.target.value.toUpperCase() })} placeholder="HDFC0000123" /></label>
          <label>PAN<input value={form.panNumber} onChange={(e) => setForm({ ...form, panNumber: e.target.value.toUpperCase() })} placeholder="ABCDE1234F" /></label>

          <div className="span-all"><h3 className="section-title">Organization</h3></div>
          <label>Department
            <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value, designationId: '' })}>
              <option value="">— Select —</option>
              {departmentsQuery.data?.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
            </select>
          </label>
          <label>Designation
            <select value={form.designationId} onChange={(e) => setForm({ ...form, designationId: e.target.value })}>
              <option value="">— Select —</option>
              {designationOptions.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
            </select>
          </label>
          <label>Grade
            <select value={form.gradeId} onChange={(e) => setForm({ ...form, gradeId: e.target.value })}>
              <option value="">— Select —</option>
              {gradesQuery.data?.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.code})</option>)}
            </select>
          </label>
          <label>Employment type
            <select value={form.employmentTypeId} onChange={(e) => setForm({ ...form, employmentTypeId: e.target.value })}>
              <option value="">— Select —</option>
              {employmentTypesQuery.data?.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
            </select>
          </label>
          <label>Shift
            <select value={form.shiftId} onChange={(e) => setForm({ ...form, shiftId: e.target.value })}>
              <option value="">— Select —</option>
              {shiftsQuery.data?.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
            </select>
          </label>

          <div className="span-all"><h3 className="section-title">Personal</h3></div>
          <label>Reporting manager
            <select value={form.reportsToId} onChange={(e) => setForm({ ...form, reportsToId: e.target.value })}>
              <option value="">— None —</option>
              {managerOptions.map((m) => <option key={m.id} value={m.id}>{m.fullName} · {m.designation}</option>)}
            </select>
          </label>
          <label>Date of birth<input type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} /></label>
          <label>Gender
            <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option value="">— Select —</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label>Marital status
            <select value={form.maritalStatus} onChange={(e) => setForm({ ...form, maritalStatus: e.target.value })}>
              <option value="">— Select —</option>
              <option value="SINGLE">Single</option>
              <option value="MARRIED">Married</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label>Confirmation date<input type="date" value={form.confirmationDate} onChange={(e) => setForm({ ...form, confirmationDate: e.target.value })} /></label>
          <label className="span-all">Address<input value={form.addressLine} onChange={(e) => setForm({ ...form, addressLine: e.target.value })} placeholder="optional" /></label>
          <label>Emergency contact name<input value={form.emergencyContactName} onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })} /></label>
          <label>Emergency contact phone<input value={form.emergencyContactPhone} onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })} /></label>
          <label>Emergency contact relation<input value={form.emergencyContactRelation} onChange={(e) => setForm({ ...form, emergencyContactRelation: e.target.value })} placeholder="e.g. Spouse" /></label>
          <label>UAN number<input value={form.uanNumber} onChange={(e) => setForm({ ...form, uanNumber: e.target.value })} placeholder="optional" /></label>
          <label>Provident fund (PF) no.<input value={form.providentFundNumber} onChange={(e) => setForm({ ...form, providentFundNumber: e.target.value })} placeholder="optional" /></label>
          <label>State insurance (ESI) no.<input value={form.stateInsuranceNumber} onChange={(e) => setForm({ ...form, stateInsuranceNumber: e.target.value })} placeholder="optional" /></label>

          <div className="span-all"><h3 className="section-title">Salary</h3></div>
          <label>Basic salary<input type="number" min="0" value={form.basicSalary} onChange={(e) => setForm({ ...form, basicSalary: e.target.value })} required /></label>
          <label>House rent allowance<input type="number" min="0" value={form.houseRentAllowance} onChange={(e) => setForm({ ...form, houseRentAllowance: e.target.value })} /></label>
          <label>Dearness allowance<input type="number" min="0" value={form.dearnessAllowance} onChange={(e) => setForm({ ...form, dearnessAllowance: e.target.value })} /></label>
          <label>Special allowance<input type="number" min="0" value={form.specialAllowance} onChange={(e) => setForm({ ...form, specialAllowance: e.target.value })} /></label>
          <label>Conveyance allowance<input type="number" min="0" value={form.conveyanceAllowance} onChange={(e) => setForm({ ...form, conveyanceAllowance: e.target.value })} /></label>
          <label>Medical allowance<input type="number" min="0" value={form.medicalAllowance} onChange={(e) => setForm({ ...form, medicalAllowance: e.target.value })} /></label>
          <label>Travel allowance<input type="number" min="0" value={form.travelAllowance} onChange={(e) => setForm({ ...form, travelAllowance: e.target.value })} /></label>
          <label>Food allowance<input type="number" min="0" value={form.foodAllowance} onChange={(e) => setForm({ ...form, foodAllowance: e.target.value })} /></label>
          <label>Mobile allowance<input type="number" min="0" value={form.mobileAllowance} onChange={(e) => setForm({ ...form, mobileAllowance: e.target.value })} /></label>
          <label>Other allowance<input type="number" min="0" value={form.otherAllowance} onChange={(e) => setForm({ ...form, otherAllowance: e.target.value })} /></label>
          <label>Salary effective from<input type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} /></label>
          <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
            <input type="checkbox" checked={form.isProvidentFundApplicable} onChange={(e) => setForm({ ...form, isProvidentFundApplicable: e.target.checked })} style={{ width: 'auto' }} />
            PF applicable
          </label>
          <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
            <input type="checkbox" checked={form.isStateInsuranceApplicable} onChange={(e) => setForm({ ...form, isStateInsuranceApplicable: e.target.checked })} style={{ width: 'auto' }} />
            ESI applicable
          </label>
          <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
            <input type="checkbox" checked={form.isProfessionalTaxApplicable} onChange={(e) => setForm({ ...form, isProfessionalTaxApplicable: e.target.checked })} style={{ width: 'auto' }} />
            Professional tax applicable
          </label>
          <div className="span-all row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">Gross / CTC (monthly)</span>
            <strong>{inr(grossPreview)}</strong>
          </div>

          <div className="span-all"><h3 className="section-title">Login account</h3></div>
          <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
            <input type="checkbox" checked={form.createLoginAccount} onChange={(e) => setForm({ ...form, createLoginAccount: e.target.checked })} style={{ width: 'auto' }} />
            Create login account
          </label>
          <label>Login role
            <select value={form.accountRoleName} onChange={(e) => setForm({ ...form, accountRoleName: e.target.value })} disabled={!form.createLoginAccount}>
              {LOGIN_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label} — {r.portal}</option>)}
            </select>
          </label>
          <p className="muted span-all sm-text" style={{ margin: 0 }}>
            When enabled, a sign-in is created and the credentials are emailed to the employee (a temporary password is shown here in dev).
            Branch Managers sign into the admin panel; Field Officers and Accountants use the Field Officer app.
          </p>

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
        rows={rows}
        loading={listQuery.isLoading}
        empty="No employees match this filter."
        searchPlaceholder="Search by name, code, designation or branch…"
        server={{
          page: table.page, pageSize: table.pageSize, totalItems,
          onPageChange: table.setPage, sort: table.sort, onSortChange: table.onSortChange,
          search: table.search, onSearchChange: table.onSearchChange,
        }}
      />

      {detail && (
        <EmployeeDetailModal
          employeeId={detail.id}
          canManage={canManage}
          initialTab={detail.tab}
          onClose={() => setDetail(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          tone="danger"
          icon={<Trash2 size={20} />}
          title={`Delete ${deleteTarget.fullName}?`}
          message="This permanently removes the employee's profile, salary structure and KYC records. It is blocked if the employee has loans, attendance, payroll or an active branch posting."
          confirmLabel="Delete employee"
          loading={deleteEmployee.isPending}
          onConfirm={() => deleteEmployee.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}
