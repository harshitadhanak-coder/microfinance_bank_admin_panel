import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/Card';
import { Form, FormGrid, Field, FormActions } from '../../components/Form';
import { CardsSkeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { Loader } from '../../components/icons';
import { apiMessage } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import { compact, useEmployeeMasters } from './shared';

interface MasterRef { id: string }
interface EmployeeDetail {
  id: string; employeeCode: string; fullName: string; phoneNumber: string; email?: string | null;
  designation: string; employmentStatus: string; joiningDate: string; branchId?: string | null;
  bankIfscCode?: string | null;
  departmentRef?: MasterRef | null; designationRef?: MasterRef | null; grade?: MasterRef | null;
  employmentTypeRef?: MasterRef | null; shift?: MasterRef | null;
  departmentId?: string | null; designationId?: string | null; gradeId?: string | null;
  employmentTypeId?: string | null; shiftId?: string | null;
}

const emptyEdit = {
  fullName: '', phoneNumber: '', email: '', designation: '', branchId: '',
  joiningDate: '', employmentStatus: 'ACTIVE', bankAccountNumber: '', bankIfscCode: '', panNumber: '',
  departmentId: '', designationId: '', gradeId: '', employmentTypeId: '', shiftId: '',
};
type EditForm = typeof emptyEdit;

/** Employee — Edit. Profile fields; salary is revised from the Details → Salary tab. */
export default function EmployeeEditPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = can(user?.role, 'employee:update');

  const [form, setForm] = useState<EditForm>(emptyEdit);
  const [error, setError] = useState('');
  const set = (patch: Partial<EditForm>) => setForm((f) => ({ ...f, ...patch }));

  const detailQuery = useQuery({
    queryKey: ['/employees', id],
    queryFn: () => api.get(`/employees/${id}`).then((r) => r.data.data as EmployeeDetail),
  });
  const detail = detailQuery.data;

  const masters = useEmployeeMasters(canManage);
  const designationOptions = masters.designations.filter(
    (d) => !form.departmentId || d.department?.id === form.departmentId || !d.department,
  );

  useEffect(() => {
    if (!detail) return;
    setForm({
      ...emptyEdit,
      fullName: detail.fullName, phoneNumber: detail.phoneNumber, email: detail.email ?? '',
      designation: detail.designation, branchId: detail.branchId ?? '',
      joiningDate: detail.joiningDate ? detail.joiningDate.slice(0, 10) : '',
      employmentStatus: detail.employmentStatus, bankIfscCode: detail.bankIfscCode ?? '',
      departmentId: detail.departmentRef?.id ?? detail.departmentId ?? '',
      designationId: detail.designationRef?.id ?? detail.designationId ?? '',
      gradeId: detail.grade?.id ?? detail.gradeId ?? '',
      employmentTypeId: detail.employmentTypeRef?.id ?? detail.employmentTypeId ?? '',
      shiftId: detail.shift?.id ?? detail.shiftId ?? '',
    });
  }, [detail]);

  const updateEmployee = useMutation({
    mutationFn: () => api.patch(`/employees/${id}`, compact({
      fullName: form.fullName, phoneNumber: form.phoneNumber, email: form.email,
      designation: form.designation, branchId: form.branchId, joiningDate: form.joiningDate,
      employmentStatus: form.employmentStatus, bankAccountNumber: form.bankAccountNumber,
      bankIfscCode: form.bankIfscCode, panNumber: form.panNumber,
      departmentId: form.departmentId, designationId: form.designationId, gradeId: form.gradeId,
      employmentTypeId: form.employmentTypeId, shiftId: form.shiftId,
    })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/employees'] });
      qc.invalidateQueries({ queryKey: ['/employees', id] });
      toast.success('Employee updated.');
      navigate(`/employees/${id}`);
    },
    onError: (err) => setError(apiMessage(err, 'Could not save changes.')),
  });

  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); updateEmployee.mutate(); };

  if (!canManage) return <p className="muted">You do not have permission to edit employees.</p>;

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: 'Human Resources' }, { label: 'Employees', to: '/employees' },
          { label: detail?.fullName ?? 'Employee', to: `/employees/${id}` }, { label: 'Edit' },
        ]}
        title={detail ? `Edit ${detail.fullName}` : 'Edit employee'}
        subtitle={detail ? <>{detail.designation} · <code>{detail.employeeCode}</code></> : undefined}
      />

      {!detail ? <CardsSkeleton count={1} /> : (
        <Form onSubmit={submit}>
          <Card title="Profile">
            <FormGrid cols={3}>
              <Field label="Full name" required><input value={form.fullName} onChange={(e) => set({ fullName: e.target.value })} required /></Field>
              <Field label="Phone" required><input value={form.phoneNumber} onChange={(e) => set({ phoneNumber: e.target.value })} required /></Field>
              <Field label="Email"><input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} /></Field>
              <Field label="Designation (label)" required={!form.designationId}><input value={form.designation} onChange={(e) => set({ designation: e.target.value })} required={!form.designationId} /></Field>
              <Field label="Branch">
                <select value={form.branchId} onChange={(e) => set({ branchId: e.target.value })}>
                  <option value="">— Unassigned —</option>
                  {masters.branches.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
                </select>
              </Field>
              <Field label="Employment status">
                <select value={form.employmentStatus} onChange={(e) => set({ employmentStatus: e.target.value })}>
                  <option value="ONBOARDING">Onboarding</option><option value="ACTIVE">Active</option>
                  <option value="ON_NOTICE">On notice</option><option value="SEPARATED">Separated</option>
                </select>
              </Field>
              <Field label="Department">
                <select value={form.departmentId} onChange={(e) => set({ departmentId: e.target.value, designationId: '' })}>
                  <option value="">— Select —</option>
                  {masters.departments.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
                </select>
              </Field>
              <Field label="Designation">
                <select value={form.designationId} onChange={(e) => set({ designationId: e.target.value })}>
                  <option value="">— Select —</option>
                  {designationOptions.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
                </select>
              </Field>
              <Field label="Grade">
                <select value={form.gradeId} onChange={(e) => set({ gradeId: e.target.value })}>
                  <option value="">— Select —</option>
                  {masters.grades.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.code})</option>)}
                </select>
              </Field>
              <Field label="Employment type">
                <select value={form.employmentTypeId} onChange={(e) => set({ employmentTypeId: e.target.value })}>
                  <option value="">— Select —</option>
                  {masters.employmentTypes.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
                </select>
              </Field>
              <Field label="Shift">
                <select value={form.shiftId} onChange={(e) => set({ shiftId: e.target.value })}>
                  <option value="">— Select —</option>
                  {masters.shifts.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                </select>
              </Field>
              <Field label="Joining date"><input type="date" value={form.joiningDate} onChange={(e) => set({ joiningDate: e.target.value })} /></Field>
              <Field label="Bank account no." help="Leave blank to keep"><input value={form.bankAccountNumber} onChange={(e) => set({ bankAccountNumber: e.target.value })} placeholder="leave blank to keep" /></Field>
              <Field label="IFSC"><input value={form.bankIfscCode} onChange={(e) => set({ bankIfscCode: e.target.value.toUpperCase() })} /></Field>
              <Field label="PAN" help="Leave blank to keep"><input value={form.panNumber} onChange={(e) => set({ panNumber: e.target.value.toUpperCase() })} placeholder="leave blank to keep" /></Field>
            </FormGrid>
          </Card>

          {error && <div className="error-box">{error}</div>}

          <FormActions>
            <button type="button" className="ghost" onClick={() => navigate(`/employees/${id}`)}>Cancel</button>
            <button type="submit" disabled={updateEmployee.isPending}>
              {updateEmployee.isPending ? <><Loader size={15} /> Saving…</> : 'Save changes'}
            </button>
          </FormActions>
        </Form>
      )}
    </>
  );
}
