import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/Card';
import { Form, FormGrid, Field, FormActions } from '../../components/Form';
import { useToast } from '../../components/Toast';
import { Loader } from '../../components/icons';
import { apiMessage } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import { EmployeeOption } from './employeeLoanShared';

const empty = { employeeId: '', principalAmount: '', annualInterestRate: '12', tenureMonths: '12', purpose: '' };
type Form = typeof empty;

/** Employee Loan — Create. The former inline apply form, now a dedicated page. */
export default function EmployeeLoanCreatePage() {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = can(user?.role, 'employeeLoan:manage');

  const [form, setForm] = useState<Form>(empty);
  const [error, setError] = useState('');
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  const employeesQuery = useQuery({
    queryKey: ['/employees', 'loan-options'],
    queryFn: () => api.get('/employees?pageSize=100').then((r) => r.data.data as EmployeeOption[]),
    enabled: canManage,
  });

  const apply = useMutation({
    mutationFn: () => api.post('/employee-loans', {
      employeeId: form.employeeId,
      principalAmount: Number(form.principalAmount),
      annualInterestRate: Number(form.annualInterestRate),
      tenureMonths: Number(form.tenureMonths),
      ...(form.purpose ? { purpose: form.purpose } : {}),
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/employee-loans') });
      toast.success('Loan request submitted.');
      const id = res.data?.data?.id as string | undefined;
      navigate(id ? `/employee-loans/${id}` : '/employee-loans');
    },
    onError: (err) => setError(apiMessage(err, 'Could not submit the loan request.')),
  });

  const disabled = !form.employeeId || !form.principalAmount || !form.annualInterestRate || !form.tenureMonths || apply.isPending;
  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); if (!disabled) apply.mutate(); };

  if (!canManage) return <p className="muted">You do not have permission to raise employee loan requests.</p>;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Payroll & Finance' }, { label: 'Employee Loans', to: '/employee-loans' }, { label: 'New request' }]}
        title="New loan request"
        subtitle="Staff loan repaid via monthly salary deduction"
      />

      <Form onSubmit={submit}>
        <Card title="Loan request">
          <FormGrid cols={2}>
            <Field label="Employee" required full>
              <select value={form.employeeId} onChange={(e) => set({ employeeId: e.target.value })} required>
                <option value="">— Select employee —</option>
                {employeesQuery.data?.map((e) => <option key={e.id} value={e.id}>{e.fullName} ({e.employeeCode})</option>)}
              </select>
            </Field>
            <Field label="Principal amount (₹)" required><input type="number" min="1" value={form.principalAmount} onChange={(e) => set({ principalAmount: e.target.value })} required /></Field>
            <Field label="Interest rate (% p.a.)" required><input type="number" min="0" max="100" step="0.01" value={form.annualInterestRate} onChange={(e) => set({ annualInterestRate: e.target.value })} required /></Field>
            <Field label="Tenure (months)" required><input type="number" min="1" max="120" value={form.tenureMonths} onChange={(e) => set({ tenureMonths: e.target.value })} required /></Field>
            <Field label="Purpose" full><input value={form.purpose} onChange={(e) => set({ purpose: e.target.value })} placeholder="optional" /></Field>
          </FormGrid>
        </Card>

        {error && <div className="error-box">{error}</div>}

        <FormActions>
          <button type="button" className="ghost" onClick={() => navigate('/employee-loans')}>Cancel</button>
          <button type="submit" disabled={disabled}>{apply.isPending ? <><Loader size={15} /> Submitting…</> : 'Submit request'}</button>
        </FormActions>
      </Form>
    </>
  );
}
