import { FormEvent, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/Card';
import { Form, FormSection, FormGrid, Field, FormActions } from '../../components/Form';
import { useToast } from '../../components/Toast';
import { Loader } from '../../components/icons';
import { apiMessage, inr } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import {
  SALARY_COMPONENTS, compact, num, portalForRole, useEmployeeMasters,
} from './shared';
import { roleLabel } from '../roles/shared';

const emptyForm = {
  fullName: '', phoneNumber: '', email: '', branchId: '', joiningDate: '',
  bankAccountNumber: '', bankIfscCode: '', panNumber: '',
  // Designation = job title, roleId = permissions. Both start empty and are
  // mandatory: a role is never pre-selected, so nobody is granted access by
  // simply not touching a dropdown.
  departmentId: '', designationId: '', roleId: '',
  gradeId: '', employmentTypeId: '', shiftId: '',
  reportsToId: '', dateOfBirth: '', gender: '', maritalStatus: '',
  addressLine: '', emergencyContactName: '', emergencyContactPhone: '', emergencyContactRelation: '',
  confirmationDate: '', uanNumber: '', providentFundNumber: '', stateInsuranceNumber: '',
  basicSalary: '', houseRentAllowance: '', dearnessAllowance: '', specialAllowance: '',
  conveyanceAllowance: '', medicalAllowance: '', travelAllowance: '', foodAllowance: '',
  mobileAllowance: '', otherAllowance: '', monthlyBonus: '', mediclaimDeduction: '', effectiveFrom: '',
  isProvidentFundApplicable: true, isStateInsuranceApplicable: false, isProfessionalTaxApplicable: true,
  createLoginAccount: true,
};
type Form = typeof emptyForm;

/** Employee — Create. The former inline-above-the-list form, now a dedicated page. */
export default function EmployeeCreatePage() {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState<Form>(emptyForm);
  const [error, setError] = useState('');

  const canCreate = can(user?.role, 'employee:create');
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  const masters = useEmployeeMasters(canCreate);
  const managerOptions = masters.managers.filter((e) => !form.branchId || e.branchId === form.branchId);
  const designationOptions = masters.designations.filter(
    (d) => !form.departmentId || d.department?.id === form.departmentId || !d.department,
  );
  const grossPreview = SALARY_COMPONENTS.reduce((sum, c) => sum + (Number(form[c.key]) || 0), 0);

  const createEmployee = useMutation({
    mutationFn: (f: Form) =>
      api.post('/employees', {
        ...compact({
          fullName: f.fullName, phoneNumber: f.phoneNumber, email: f.email,
          branchId: f.branchId, joiningDate: f.joiningDate,
          bankAccountNumber: f.bankAccountNumber, bankIfscCode: f.bankIfscCode, panNumber: f.panNumber,
          departmentId: f.departmentId, designationId: f.designationId, roleId: f.roleId, gradeId: f.gradeId,
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
            basicSalary: num(f.basicSalary), houseRentAllowance: num(f.houseRentAllowance),
            dearnessAllowance: num(f.dearnessAllowance), specialAllowance: num(f.specialAllowance),
            conveyanceAllowance: num(f.conveyanceAllowance), medicalAllowance: num(f.medicalAllowance),
            travelAllowance: num(f.travelAllowance), foodAllowance: num(f.foodAllowance),
            mobileAllowance: num(f.mobileAllowance), otherAllowance: num(f.otherAllowance),
            monthlyBonus: num(f.monthlyBonus), mediclaimDeduction: num(f.mediclaimDeduction),
            effectiveFrom: f.effectiveFrom || f.joiningDate,
          }),
          isProvidentFundApplicable: f.isProvidentFundApplicable,
          isStateInsuranceApplicable: f.isStateInsuranceApplicable,
          isProfessionalTaxApplicable: f.isProfessionalTaxApplicable,
        },
        createLoginAccount: f.createLoginAccount,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/employees') });
      toast.success('Employee created successfully.');
      const account = res.data?.data?.account as { created?: boolean; error?: string } | undefined;
      if (account?.error) toast.info(`Login account was not created: ${account.error}`);
      const newId = res.data?.data?.id as string | undefined;
      navigate(newId ? `/employees/${newId}` : '/employees');
    },
    onError: (err) => setError(apiMessage(err, 'Could not create the employee. Check all required fields are valid.')),
  });

  const submit = (ev: FormEvent) => { ev.preventDefault(); setError(''); createEmployee.mutate(form); };

  if (!canCreate) return <p className="muted">You do not have permission to add employees.</p>;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Human Resources' }, { label: 'Employees', to: '/employees' }, { label: 'New employee' }]}
        title="Add employee"
        subtitle="Create a staff profile, salary structure and (optionally) a sign-in account"
      />

      <Form onSubmit={submit}>
        <Card title="Identity & contact">
          <FormGrid cols={3}>
            <Field label="Full name" required><input value={form.fullName} onChange={(e) => set({ fullName: e.target.value })} required /></Field>
            <Field label="Phone" required><input value={form.phoneNumber} onChange={(e) => set({ phoneNumber: e.target.value })} placeholder="+9198XXXXXXXX" required /></Field>
            <Field label="Email"><input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} /></Field>
            <Field label="Branch">
              <select value={form.branchId} onChange={(e) => set({ branchId: e.target.value, reportsToId: '' })}>
                <option value="">— Unassigned —</option>
                {masters.branches.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
              </select>
            </Field>
            <Field label="Joining date" required><input type="date" value={form.joiningDate} onChange={(e) => set({ joiningDate: e.target.value })} required /></Field>
            <Field label="Bank account no."><input value={form.bankAccountNumber} onChange={(e) => set({ bankAccountNumber: e.target.value })} placeholder="optional" /></Field>
            <Field label="IFSC"><input value={form.bankIfscCode} onChange={(e) => set({ bankIfscCode: e.target.value.toUpperCase() })} placeholder="HDFC0000123" /></Field>
            <Field label="PAN"><input value={form.panNumber} onChange={(e) => set({ panNumber: e.target.value.toUpperCase() })} placeholder="ABCDE1234F" /></Field>
          </FormGrid>
        </Card>

        <Card title="Organization">
          <FormGrid cols={3}>
            <Field label="Department">
              <select value={form.departmentId} onChange={(e) => set({ departmentId: e.target.value, designationId: '' })}>
                <option value="">— Select —</option>
                {masters.departments.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
              </select>
            </Field>
            <Field label="Designation" required help="The employee's job title. Does not grant any access.">
              <select value={form.designationId} onChange={(e) => set({ designationId: e.target.value })} required>
                <option value="">— Select —</option>
                {designationOptions.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
              </select>
            </Field>
            <Field
              label="Role"
              required
              help={form.roleId ? `Signs in to the ${portalForRole(masters.roles.find((r) => r.id === form.roleId)?.name)}` : 'Decides permissions and which portal they sign in to'}
            >
              <select value={form.roleId} onChange={(e) => set({ roleId: e.target.value })} required>
                <option value="">— Select a role —</option>
                {masters.roles.map((r) => (
                  <option key={r.id} value={r.id}>{roleLabel(r)} — {portalForRole(r.name)}</option>
                ))}
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
            <Field label="Reporting manager">
              <select value={form.reportsToId} onChange={(e) => set({ reportsToId: e.target.value })}>
                <option value="">— None —</option>
                {managerOptions.map((m) => <option key={m.id} value={m.id}>{m.fullName} · {m.designation}</option>)}
              </select>
            </Field>
          </FormGrid>
        </Card>

        <Card title="Personal">
          <FormGrid cols={3}>
            <Field label="Date of birth"><input type="date" value={form.dateOfBirth} onChange={(e) => set({ dateOfBirth: e.target.value })} /></Field>
            <Field label="Gender">
              <select value={form.gender} onChange={(e) => set({ gender: e.target.value })}>
                <option value="">— Select —</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option>
              </select>
            </Field>
            <Field label="Marital status">
              <select value={form.maritalStatus} onChange={(e) => set({ maritalStatus: e.target.value })}>
                <option value="">— Select —</option><option value="SINGLE">Single</option><option value="MARRIED">Married</option><option value="OTHER">Other</option>
              </select>
            </Field>
            <Field label="Confirmation date"><input type="date" value={form.confirmationDate} onChange={(e) => set({ confirmationDate: e.target.value })} /></Field>
            <Field label="Address" full><input value={form.addressLine} onChange={(e) => set({ addressLine: e.target.value })} placeholder="optional" /></Field>
            <Field label="Emergency contact name"><input value={form.emergencyContactName} onChange={(e) => set({ emergencyContactName: e.target.value })} /></Field>
            <Field label="Emergency contact phone"><input value={form.emergencyContactPhone} onChange={(e) => set({ emergencyContactPhone: e.target.value })} /></Field>
            <Field label="Emergency contact relation"><input value={form.emergencyContactRelation} onChange={(e) => set({ emergencyContactRelation: e.target.value })} placeholder="e.g. Spouse" /></Field>
            <Field label="UAN number"><input value={form.uanNumber} onChange={(e) => set({ uanNumber: e.target.value })} placeholder="optional" /></Field>
            <Field label="Provident fund (PF) no."><input value={form.providentFundNumber} onChange={(e) => set({ providentFundNumber: e.target.value })} placeholder="optional" /></Field>
            <Field label="State insurance (ESI) no."><input value={form.stateInsuranceNumber} onChange={(e) => set({ stateInsuranceNumber: e.target.value })} placeholder="optional" /></Field>
          </FormGrid>
        </Card>

        <Card title="Salary structure" action={<span className="muted sm-text">Gross / CTC (monthly): <strong className="num">{inr(grossPreview)}</strong></span>}>
          <FormGrid cols={3}>
            {SALARY_COMPONENTS.map((c) => (
              <Field key={c.key} label={c.label} required={c.key === 'basicSalary'}>
                <input type="number" min="0" value={form[c.key]} onChange={(e) => set({ [c.key]: e.target.value } as Partial<Form>)} required={c.key === 'basicSalary'} />
              </Field>
            ))}
            <Field label="Salary effective from" help="Defaults to joining date"><input type="date" value={form.effectiveFrom} onChange={(e) => set({ effectiveFrom: e.target.value })} /></Field>
          </FormGrid>
          <div className="check-row">
            <label className="check"><input type="checkbox" checked={form.isProvidentFundApplicable} onChange={(e) => set({ isProvidentFundApplicable: e.target.checked })} /> PF applicable</label>
            <label className="check"><input type="checkbox" checked={form.isStateInsuranceApplicable} onChange={(e) => set({ isStateInsuranceApplicable: e.target.checked })} /> ESI applicable</label>
            <label className="check"><input type="checkbox" checked={form.isProfessionalTaxApplicable} onChange={(e) => set({ isProfessionalTaxApplicable: e.target.checked })} /> Professional tax applicable</label>
          </div>
        </Card>

        <Card title="Login account">
          <div className="check-row">
            <label className="check"><input type="checkbox" checked={form.createLoginAccount} onChange={(e) => set({ createLoginAccount: e.target.checked })} /> Create login account</label>
          </div>
          <p className="muted sm-text" style={{ margin: 0 }}>
            When enabled, a sign-in is created and the credentials are emailed to the employee (a temporary password is shown on the profile in dev).
            {' '}The account uses the <strong>Role</strong> chosen under Organization above — {form.roleId
              ? <>this employee will sign in to the <strong>{portalForRole(masters.roles.find((r) => r.id === form.roleId)?.name)}</strong>.</>
              : <>pick a role to decide which portal they reach.</>}
          </p>
        </Card>

        {error && <div className="error-box">{error}</div>}

        <FormActions>
          <button type="button" className="ghost" onClick={() => navigate('/employees')}>Cancel</button>
          <button type="submit" disabled={createEmployee.isPending}>
            {createEmployee.isPending ? <><Loader size={15} /> Saving…</> : 'Save employee'}
          </button>
        </FormActions>
      </Form>
    </>
  );
}
