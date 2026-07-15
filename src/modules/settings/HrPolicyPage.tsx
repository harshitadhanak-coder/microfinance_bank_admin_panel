import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/Card';
import { Form, FormGrid, Field, FormActions } from '../../components/Form';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { Loader } from '../../components/icons';
import { apiMessage } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';

interface AttendancePolicy {
  officeStart: string; officeEnd: string; graceMinutes: number;
  fullDayMinutes: number; halfDayMinutes: number; weeklyOffDays: number[];
  standardWorkingDays: number; freeLatesPerMonth: number;
  lateDeductionType: 'HALF_DAY' | 'FIXED'; lateDeductionAmount: number;
  overtimeEnabled: boolean; overtimeRatePerHour: number;
}
interface PayrollPolicy {
  pfRate: number; pfCeiling: number; esiRate: number; esiGrossCeiling: number; professionalTaxFlat: number;
}
interface Policies { attendance: AttendancePolicy; payroll: PayrollPolicy }

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Settings — HR Policy. Attendance + payroll rules, read/write for HR & HQ. */
export default function HrPolicyPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const canManage = can(user?.role, 'master:manage');

  const { data, isLoading } = useQuery({
    queryKey: ['/human-resources/policies'],
    queryFn: () => api.get('/human-resources/policies').then((r) => r.data.data as Policies),
  });

  const [att, setAtt] = useState<AttendancePolicy | null>(null);
  const [pay, setPay] = useState<PayrollPolicy | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { if (data) { setAtt(data.attendance); setPay(data.payroll); } }, [data]);

  const save = useMutation({
    mutationFn: () => api.patch('/human-resources/policies', { attendancePolicy: att, payrollPolicy: pay }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/human-resources/policies'] }); toast.success('HR policy updated.'); setError(''); },
    onError: (err) => setError(apiMessage(err, 'Could not update the HR policy.')),
  });

  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); save.mutate(); };
  const setA = (patch: Partial<AttendancePolicy>) => setAtt((p) => (p ? { ...p, ...patch } : p));
  const setP = (patch: Partial<PayrollPolicy>) => setPay((p) => (p ? { ...p, ...patch } : p));
  const toggleDay = (d: number) => setAtt((p) => p ? { ...p, weeklyOffDays: p.weeklyOffDays.includes(d) ? p.weeklyOffDays.filter((x) => x !== d) : [...p.weeklyOffDays, d].sort() } : p);

  const num = (v: string) => (v === '' ? 0 : Number(v));

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Administration' }, { label: 'Settings', to: '/settings' }, { label: 'HR Policy' }]}
        title="HR Policy"
        subtitle={canManage ? 'Attendance and payroll rules applied across the organization' : 'Read-only — attendance and payroll rules'}
      />

      {isLoading || !att || !pay ? (
        <Card><Skeleton height={18} /><Skeleton height={14} style={{ marginTop: 10 }} /><Skeleton height={14} style={{ marginTop: 8 }} /></Card>
      ) : (
        <Form onSubmit={submit}>
          <Card title="Attendance policy">
            <FormGrid cols={3}>
              <Field label="Office start"><input type="time" value={att.officeStart} onChange={(e) => setA({ officeStart: e.target.value })} disabled={!canManage} /></Field>
              <Field label="Office end"><input type="time" value={att.officeEnd} onChange={(e) => setA({ officeEnd: e.target.value })} disabled={!canManage} /></Field>
              <Field label="Grace (min)"><input type="number" min="0" value={att.graceMinutes} onChange={(e) => setA({ graceMinutes: num(e.target.value) })} disabled={!canManage} /></Field>
              <Field label="Full day (min)"><input type="number" min="60" value={att.fullDayMinutes} onChange={(e) => setA({ fullDayMinutes: num(e.target.value) })} disabled={!canManage} /></Field>
              <Field label="Half day (min)"><input type="number" min="30" value={att.halfDayMinutes} onChange={(e) => setA({ halfDayMinutes: num(e.target.value) })} disabled={!canManage} /></Field>
              <Field label="Standard working days"><input type="number" min="1" max="31" value={att.standardWorkingDays} onChange={(e) => setA({ standardWorkingDays: num(e.target.value) })} disabled={!canManage} /></Field>
              <Field label="Free lates / month"><input type="number" min="0" value={att.freeLatesPerMonth} onChange={(e) => setA({ freeLatesPerMonth: num(e.target.value) })} disabled={!canManage} /></Field>
              <Field label="Late deduction"><select value={att.lateDeductionType} onChange={(e) => setA({ lateDeductionType: e.target.value as AttendancePolicy['lateDeductionType'] })} disabled={!canManage}><option value="HALF_DAY">Half day</option><option value="FIXED">Fixed amount</option></select></Field>
              <Field label="Late deduction amount"><input type="number" min="0" value={att.lateDeductionAmount} onChange={(e) => setA({ lateDeductionAmount: num(e.target.value) })} disabled={!canManage || att.lateDeductionType !== 'FIXED'} /></Field>
              <Field label="Overtime rate / hr"><input type="number" min="0" value={att.overtimeRatePerHour} onChange={(e) => setA({ overtimeRatePerHour: num(e.target.value) })} disabled={!canManage || !att.overtimeEnabled} /></Field>
            </FormGrid>
            <div className="check-row">
              <label className="check"><input type="checkbox" checked={att.overtimeEnabled} onChange={(e) => setA({ overtimeEnabled: e.target.checked })} disabled={!canManage} /> Overtime enabled</label>
            </div>
            <Field label="Weekly off days">
              <div className="check-row">
                {DOW.map((d, i) => (
                  <label key={d} className="check"><input type="checkbox" checked={att.weeklyOffDays.includes(i)} onChange={() => toggleDay(i)} disabled={!canManage} /> {d}</label>
                ))}
              </div>
            </Field>
          </Card>

          <Card title="Payroll policy">
            <FormGrid cols={3}>
              <Field label="PF rate" help="Fraction, e.g. 0.12"><input type="number" step="0.01" min="0" max="1" value={pay.pfRate} onChange={(e) => setP({ pfRate: num(e.target.value) })} disabled={!canManage} /></Field>
              <Field label="PF ceiling (₹)"><input type="number" min="0" value={pay.pfCeiling} onChange={(e) => setP({ pfCeiling: num(e.target.value) })} disabled={!canManage} /></Field>
              <Field label="ESI rate" help="Fraction, e.g. 0.0075"><input type="number" step="0.0001" min="0" max="1" value={pay.esiRate} onChange={(e) => setP({ esiRate: num(e.target.value) })} disabled={!canManage} /></Field>
              <Field label="ESI gross ceiling (₹)"><input type="number" min="0" value={pay.esiGrossCeiling} onChange={(e) => setP({ esiGrossCeiling: num(e.target.value) })} disabled={!canManage} /></Field>
              <Field label="Professional tax (₹)"><input type="number" min="0" value={pay.professionalTaxFlat} onChange={(e) => setP({ professionalTaxFlat: num(e.target.value) })} disabled={!canManage} /></Field>
            </FormGrid>
          </Card>

          {error && <div className="error-box">{error}</div>}

          {canManage && (
            <FormActions>
              <button type="submit" disabled={save.isPending}>{save.isPending ? <><Loader size={15} /> Saving…</> : 'Save policy'}</button>
            </FormActions>
          )}
        </Form>
      )}
    </>
  );
}
