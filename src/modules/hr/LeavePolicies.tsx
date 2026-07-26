import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Drawer } from '../../components/Drawer';
import { Form, FormGrid, Field } from '../../components/Form';
import { Skeleton } from '../../components/Skeleton';
import { Pencil, Loader } from '../../components/icons';
import { titleCase, apiMessage } from '../../lib/format';
import { useToast } from '../../components/Toast';

/**
 * Leave Policy config — the org-wide entitlement / accrual rules per leave type.
 * One row per LeaveType (the backend returns all six, dormant ones as defaults),
 * each editable in a drawer. Changing a policy affects future accrual only, so a
 * note points HR at "Run leave accrual" to actually grow balances.
 */
interface LeavePolicy {
  leaveType: string;
  annualEntitlement: number;
  monthlyAccrual: number;
  isPaid: boolean;
  carryForward: boolean;
  maxCarryForward: number;
  maxBalance: number | null;
  isEncashable: boolean;
  appliesToGender: string | null;
  resetMonth: number;
  autoConvertToUnpaid: boolean;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function LeavePolicies() {
  const [editing, setEditing] = useState<LeavePolicy | null>(null);
  const query = useQuery({
    queryKey: ['/human-resources/leaves/policies'],
    queryFn: () => api.get('/human-resources/leaves/policies').then((r) => r.data.data as LeavePolicy[]),
  });

  return (
    <Card
      title="Leave policies"
      action={<span className="muted sm-text">Org-wide rules per leave type</span>}
    >
      <div className="info-box" style={{ marginBottom: '1rem' }}>
        Policies define entitlement and accrual. Editing here affects <strong>future</strong> accrual only — run
        <strong> Run leave accrual</strong> (or Payroll) each month for balances to grow.
      </div>

      {query.isLoading ? (
        <div className="doc-list"><Skeleton height={48} /><Skeleton height={48} /><Skeleton height={48} /></div>
      ) : (
        <div className="table-scroll">
          <table className="perm-table">
            <thead>
              <tr>
                <th>Type</th><th>Paid</th><th>Days / yr</th><th>Accrual / mo</th>
                <th>Reset</th><th>Cap</th><th>Carry-fwd</th><th>Auto → unpaid</th><th></th>
              </tr>
            </thead>
            <tbody>
              {(query.data ?? []).map((p) => (
                <tr key={p.leaveType}>
                  <td>
                    <strong>{titleCase(p.leaveType)}</strong>
                    {p.appliesToGender && <div className="muted sm-text">{titleCase(p.appliesToGender)} only</div>}
                  </td>
                  <td>{p.isPaid ? <Badge tone="success">Paid</Badge> : <Badge tone="neutral">Unpaid</Badge>}</td>
                  <td className="num">{p.annualEntitlement}</td>
                  <td className="num">{p.monthlyAccrual > 0 ? p.monthlyAccrual : <span className="muted">up-front</span>}</td>
                  <td className="sm-text">{MONTHS[p.resetMonth - 1]}</td>
                  <td className="num">{p.maxBalance ?? '—'}</td>
                  <td className="sm-text">{p.carryForward ? `Yes · max ${p.maxCarryForward}` : 'No'}</td>
                  <td className="sm-text">{p.autoConvertToUnpaid ? 'Yes' : 'No'}</td>
                  <td className="actions-cell">
                    <button type="button" className="sm ghost" onClick={() => setEditing(p)}><Pencil size={14} /> Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <LeavePolicyDrawer policy={editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function LeavePolicyDrawer({ policy, onClose }: { policy: LeavePolicy; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({
    annualEntitlement: String(policy.annualEntitlement),
    monthlyAccrual: String(policy.monthlyAccrual),
    resetMonth: String(policy.resetMonth),
    maxBalance: policy.maxBalance == null ? '' : String(policy.maxBalance),
    maxCarryForward: String(policy.maxCarryForward),
    appliesToGender: policy.appliesToGender ?? '',
    isPaid: policy.isPaid,
    carryForward: policy.carryForward,
    isEncashable: policy.isEncashable,
    autoConvertToUnpaid: policy.autoConvertToUnpaid,
  });
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: () => api.patch(`/human-resources/leaves/policies/${policy.leaveType}`, {
      annualEntitlement: Number(form.annualEntitlement || 0),
      monthlyAccrual: Number(form.monthlyAccrual || 0),
      resetMonth: Number(form.resetMonth || 1),
      maxBalance: form.maxBalance === '' ? null : Number(form.maxBalance),
      maxCarryForward: Number(form.maxCarryForward || 0),
      appliesToGender: form.appliesToGender === '' ? null : form.appliesToGender,
      isPaid: form.isPaid,
      carryForward: form.carryForward,
      isEncashable: form.isEncashable,
      autoConvertToUnpaid: form.autoConvertToUnpaid,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/human-resources/leaves/policies'] });
      toast.success('Leave policy saved.');
      onClose();
    },
    onError: (err) => setError(apiMessage(err, 'Could not save the leave policy.')),
  });

  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); save.mutate(); };

  return (
    <Drawer
      onClose={onClose}
      title={`${titleCase(policy.leaveType)} leave policy`}
      subtitle="Org-wide — applies to every employee"
      footer={<>
        <button type="button" className="ghost" onClick={onClose}>Cancel</button>
        <button type="submit" form="leave-policy-form" disabled={save.isPending}>
          {save.isPending ? <><Loader size={15} /> Saving…</> : 'Save policy'}
        </button>
      </>}
    >
      <Form id="leave-policy-form" onSubmit={submit}>
        <FormGrid cols={2}>
          <Field label="Annual entitlement (days)">
            <input type="number" min="0" step="0.5" value={form.annualEntitlement} onChange={(e) => setForm({ ...form, annualEntitlement: e.target.value })} />
          </Field>
          <Field label="Monthly accrual (days)" help="0 = grant the full entitlement up-front at the reset month.">
            <input type="number" min="0" step="0.5" value={form.monthlyAccrual} onChange={(e) => setForm({ ...form, monthlyAccrual: e.target.value })} />
          </Field>
          <Field label="Fiscal reset month">
            <select value={form.resetMonth} onChange={(e) => setForm({ ...form, resetMonth: e.target.value })}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </Field>
          <Field label="Balance cap" help="Blank = no cap.">
            <input type="number" min="0" step="0.5" value={form.maxBalance} onChange={(e) => setForm({ ...form, maxBalance: e.target.value })} placeholder="No cap" />
          </Field>
          <Field label="Max carry-forward" help="Days rolled into the next year (if carry-forward is on).">
            <input type="number" min="0" step="0.5" value={form.maxCarryForward} onChange={(e) => setForm({ ...form, maxCarryForward: e.target.value })} />
          </Field>
          <Field label="Applies to" help="For statutory, gender-scoped types.">
            <select value={form.appliesToGender} onChange={(e) => setForm({ ...form, appliesToGender: e.target.value })}>
              <option value="">Everyone</option>
              <option value="FEMALE">Female only</option>
              <option value="MALE">Male only</option>
            </select>
          </Field>
        </FormGrid>
        <div className="check-row">
          <label className="check"><input type="checkbox" checked={form.isPaid} onChange={(e) => setForm({ ...form, isPaid: e.target.checked })} /> Paid leave</label>
          <label className="check"><input type="checkbox" checked={form.carryForward} onChange={(e) => setForm({ ...form, carryForward: e.target.checked })} /> Carry forward unused</label>
          <label className="check"><input type="checkbox" checked={form.isEncashable} onChange={(e) => setForm({ ...form, isEncashable: e.target.checked })} /> Encashable</label>
          <label className="check"><input type="checkbox" checked={form.autoConvertToUnpaid} onChange={(e) => setForm({ ...form, autoConvertToUnpaid: e.target.checked })} /> Auto-convert excess to unpaid</label>
        </div>
        {error && <div className="error-box">{error}</div>}
      </Form>
    </Drawer>
  );
}
