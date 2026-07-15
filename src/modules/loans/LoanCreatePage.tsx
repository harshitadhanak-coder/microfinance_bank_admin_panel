import { FormEvent, useMemo, useState } from 'react';
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
import { ClientOption, EmployeeOption, ProductOption } from './shared';

/**
 * Loan — Create. Back-office quick-create: creates the application, approves and
 * disburses it in one step. Only KYC-verified, non-blacklisted clients qualify
 * (the backend enforces this too). Was a modal on the list; now a dedicated page.
 */
export default function LoanCreatePage() {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canCreate = can(user?.role, 'loan:create');

  const [clientId, setClientId] = useState('');
  const [loanProductId, setLoanProductId] = useState('');
  const [requestedAmount, setRequestedAmount] = useState('');
  const [tenureMonths, setTenureMonths] = useState('12');
  const [purpose, setPurpose] = useState('');
  const [assignedOfficerId, setAssignedOfficerId] = useState('');
  const [firstDueDate, setFirstDueDate] = useState('');
  const [error, setError] = useState('');

  const { data: clients } = useQuery({
    queryKey: ['/clients', 'loan-options'],
    queryFn: () => api.get('/clients?pageSize=100').then((r) => r.data.data as ClientOption[]),
    enabled: canCreate,
  });
  const { data: products } = useQuery({
    queryKey: ['/loans/products'],
    queryFn: () => api.get('/loans/products').then((r) => r.data.data as ProductOption[]),
    enabled: canCreate,
  });
  const { data: employees } = useQuery({
    queryKey: ['/employees', 'loan-options'],
    queryFn: () => api.get('/employees?pageSize=100').then((r) => r.data.data as EmployeeOption[]),
    enabled: canCreate,
  });

  const eligibleClients = useMemo(
    () => (clients ?? []).filter((c) => c.kycStatus === 'VERIFIED' && !c.isBlacklisted),
    [clients],
  );
  const selectedClient = eligibleClients.find((c) => c.id === clientId);
  const selectedProduct = (products ?? []).find((p) => p.id === loanProductId);
  const officerOptions = useMemo(
    () => (employees ?? []).filter((e) => !selectedClient || !e.branchId || e.branchId === selectedClient.branchId),
    [employees, selectedClient],
  );

  const create = useMutation({
    mutationFn: () =>
      api.post('/loans', {
        clientId, loanProductId,
        requestedAmount: Number(requestedAmount),
        tenureMonths: Number(tenureMonths),
        purpose: purpose.trim() || undefined,
        assignedOfficerId: assignedOfficerId || undefined,
        firstDueDate: firstDueDate || undefined,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/loans') });
      toast.success('Loan created and disbursed.');
      const newId = res.data?.data?.id as string | undefined;
      navigate(newId ? `/loans/${newId}` : '/loans');
    },
    onError: (err) => setError(apiMessage(err, 'Could not create the loan.')),
  });

  const disabled = !clientId || !loanProductId || !requestedAmount || !tenureMonths || create.isPending;
  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); if (!disabled) create.mutate(); };

  if (!canCreate) return <p className="muted">You do not have permission to create loans.</p>;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Operations' }, { label: 'Loans', to: '/loans' }, { label: 'New loan' }]}
        title="New loan"
        subtitle="Creates the application, approves and disburses it in one step. Only KYC-verified clients are eligible."
      />

      <Form onSubmit={submit}>
        <Card title="Loan details">
          <FormGrid cols={2}>
            <Field label="Client" required full>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
                <option value="">Select a client</option>
                {eligibleClients.map((c) => <option key={c.id} value={c.id}>{c.fullName} · {c.clientCode}</option>)}
              </select>
            </Field>
            <Field label="Product" required>
              <select value={loanProductId} onChange={(e) => setLoanProductId(e.target.value)} required>
                <option value="">Select a product</option>
                {(products ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Amount (₹)" required help={selectedProduct ? `₹${Number(selectedProduct.minimumAmount).toLocaleString('en-IN')}–₹${Number(selectedProduct.maximumAmount).toLocaleString('en-IN')}` : undefined}>
              <input inputMode="numeric" value={requestedAmount} onChange={(e) => setRequestedAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="50000" required />
            </Field>
            <Field label="Tenure (months)" required help={selectedProduct ? `${selectedProduct.minimumTenureMonths}–${selectedProduct.maximumTenureMonths} months` : undefined}>
              <input inputMode="numeric" value={tenureMonths} onChange={(e) => setTenureMonths(e.target.value.replace(/[^0-9]/g, ''))} required />
            </Field>
            <Field label="Field officer" help="Optional — assign later from the loan">
              <select value={assignedOfficerId} onChange={(e) => setAssignedOfficerId(e.target.value)}>
                <option value="">Assign later</option>
                {officerOptions.map((e) => <option key={e.id} value={e.id}>{e.fullName}{e.designation ? ` · ${e.designation}` : ''}</option>)}
              </select>
            </Field>
            <Field label="First EMI due" help="Optional — defaults to one month after disbursal">
              <input type="date" value={firstDueDate} onChange={(e) => setFirstDueDate(e.target.value)} />
            </Field>
            <Field label="Purpose" full>
              <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Working capital" />
            </Field>
          </FormGrid>
        </Card>

        {error && <div className="error-box">{error}</div>}

        <FormActions>
          <button type="button" className="ghost" onClick={() => navigate('/loans')}>Cancel</button>
          <button type="submit" disabled={disabled}>
            {create.isPending ? <><Loader size={15} /> Creating…</> : 'Create loan'}
          </button>
        </FormActions>
      </Form>
    </>
  );
}
