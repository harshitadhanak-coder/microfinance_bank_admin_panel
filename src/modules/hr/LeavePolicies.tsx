import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Drawer } from '../../components/Drawer';
import { Modal, ConfirmDialog } from '../../components/Modal';
import { Skeleton } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { Plus, Check, ListChecks, Trash2 } from '../../components/icons';
import { fmtDate, apiMessage, apiFieldErrors } from '../../lib/format';
import { useToast } from '../../components/Toast';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import { leaveApi, leaveKeys, type LeaveTypeDef } from './leaveShared';

/**
 * Leave policies — the versioned policy engine.
 *
 * This screen looks nothing like its predecessor because the model underneath
 * changed shape. The legacy screen edited ONE global row per leave type in
 * place, which silently rewrote history: change entitlement from 12 to 15 and
 * last month's accrual then appeared to have been calculated at 15, so prior
 * payslips stopped reproducing.
 *
 * Here a plan is a stable identity and all rules live in effective-dated
 * VERSIONS. Changing a rule never edits a row — it drafts a new version with
 * its own `effectiveFrom`. The prior version keeps its window, so past accruals
 * and past payslips stay exactly as they were.
 *
 * Two controls exist because entitlement is a real balance-sheet liability:
 *   • HR drafts and simulates; Super Admin activates. A draft does nothing at
 *     all until someone else signs it off.
 *   • Simulate answers "who does this hit, and by how much" BEFORE activation,
 *     rather than discovering it in next month's accrual run.
 */

interface PlanVersion {
  id: string;
  versionNo: number;
  status: 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'SUPERSEDED';
  effectiveFrom: string;
  effectiveTo?: string | null;
  annualEntitlement: string | number;
  accrualFrequency: string;
  accrualAmount?: string | number | null;
  carryForwardEnabled: boolean;
  maxCarryForward?: string | number | null;
  maxBalance?: string | number | null;
  sandwichRule: string;
  insufficientBalanceAction: string;
  minNoticeDays: number;
  allowHalfDay: boolean;
  encashmentEnabled: boolean;
  changeReason: string;
  periodSchemeId: string;
  lwpLeaveTypeId?: string | null;
  createdAt: string;
}

interface PlanAssignment {
  id: string;
  scopeType: string;
  priority: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  status: string;
  gender?: string | null;
  state?: string | null;
}

interface PlanRow {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  status: string;
  leaveType: { code: string; name: string; shortCode: string };
  versions: PlanVersion[];
  _count: { assignments: number; versions: number };
}

interface PlanDetail extends Omit<PlanRow, '_count' | 'leaveType'> {
  leaveType: LeaveTypeDef;
  versions: PlanVersion[];
  assignments: PlanAssignment[];
}

interface SimulationResult {
  planCode: string;
  leaveType: string;
  effectiveFrom: string;
  strategy: string;
  affectedEmployees: number;
  totalDeltaDays: number;
  averageDeltaDays: number;
  largestAdjustment: number;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The version actually governing people right now — NOT simply the newest.
 * A DRAFT sitting above an ACTIVE one changes nothing until it is activated,
 * so showing the draft's entitlement in the list would state a number nobody
 * is accruing.
 */
const inForceVersion = (versions: PlanVersion[]): PlanVersion | undefined =>
  versions.find((v) => v.status === 'ACTIVE')
  ?? versions.find((v) => v.status === 'SCHEDULED')
  ?? versions.find((v) => v.status === 'SUPERSEDED');

const versionTone = (status: string) =>
  status === 'ACTIVE' ? 'success' : status === 'SCHEDULED' ? 'info' : status === 'DRAFT' ? 'warning' : 'neutral';

const accrualLabel = (v: PlanVersion) =>
  v.accrualFrequency === 'NONE' ? 'No accrual'
  : v.accrualFrequency === 'ANNUAL_UPFRONT' ? 'Up-front'
  : `${v.accrualAmount ?? '—'} / ${v.accrualFrequency.toLowerCase().replace('_', '-')}`;

export default function LeavePolicies() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [openPlanId, setOpenPlanId] = useState<string | null>(null);
  const [addingPlan, setAddingPlan] = useState(false);

  const canManage = can(user?.role, 'leave:managePolicy');

  const plansQuery = useQuery({
    queryKey: leaveKeys.policies,
    queryFn: () => api.get('/leave/policies').then((r) => r.data.data as PlanRow[]),
  });
  const typesQuery = useQuery({ queryKey: leaveKeys.types, queryFn: leaveApi.listTypes });

  const plans = plansQuery.data ?? [];
  const refresh = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/leave') });

  return (
    <Card
      title="Leave policies"
      action={canManage && (
        <button type="button" className="sm" onClick={() => setAddingPlan(true)}><Plus size={14} /> New policy</button>
      )}
    >
      <div className="info-box" style={{ marginBottom: '1rem' }}>
        Rules live in <strong>effective-dated versions</strong>. Changing entitlement drafts a new version rather than
        editing the current one, so past accrual and issued payslips still reproduce exactly.
        {' '}Drafts do nothing until a Super Admin activates them.
      </div>

      {plansQuery.isLoading ? (
        <div className="doc-list"><Skeleton height={48} /><Skeleton height={48} /><Skeleton height={48} /></div>
      ) : plans.length === 0 ? (
        <EmptyState
          title="No leave policies yet"
          message="A policy attaches entitlement and accrual rules to a leave type, then assigns them to a group of employees."
          action={canManage && <button type="button" onClick={() => setAddingPlan(true)}><Plus size={15} /> New policy</button>}
        />
      ) : (
        <div className="table-scroll">
          <table className="perm-table">
            <thead>
              <tr>
                <th>Policy</th><th>Type</th><th>Current version</th><th className="num">Days / yr</th>
                <th>Accrual</th><th>Carry-fwd</th><th>Assigned to</th><th></th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => {
                const current = inForceVersion(p.versions);
                const drafts = p.versions.filter((v) => v.status === 'DRAFT');
                return (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      <div className="muted sm-text mono">{p.code}</div>
                    </td>
                    <td>{p.leaveType.name}</td>
                    <td>
                      {current
                        ? <>v{current.versionNo} <Badge tone={versionTone(current.status)}>{current.status.toLowerCase()}</Badge>
                            <div className="muted sm-text">from {fmtDate(current.effectiveFrom)}</div></>
                        : <span className="muted">not in force</span>}
                      {/* A draft changes nothing yet — flagged separately so the
                          numbers in this row are never read as already applied. */}
                      {drafts.map((d) => (
                        <div key={d.id} className="muted sm-text">
                          v{d.versionNo} draft awaiting activation ({Number(d.annualEntitlement)} days from {fmtDate(d.effectiveFrom)})
                        </div>
                      ))}
                    </td>
                    <td className="num">{current ? Number(current.annualEntitlement) : '—'}</td>
                    <td className="sm-text">{current ? accrualLabel(current) : '—'}</td>
                    <td className="sm-text">
                      {current?.carryForwardEnabled ? `Yes · max ${current.maxCarryForward ?? '∞'}` : 'No'}
                    </td>
                    <td className="sm-text">
                      {p._count.assignments === 0
                        ? <span className="muted">nobody</span>
                        : `${p._count.assignments} rule${p._count.assignments === 1 ? '' : 's'}`}
                    </td>
                    <td className="actions-cell">
                      {p.status === 'INACTIVE' && <Badge tone="neutral">retired</Badge>}
                      <button type="button" className="sm ghost" onClick={() => setOpenPlanId(p.id)}>
                        <ListChecks size={14} /> Versions
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {openPlanId && <PlanDrawer planId={openPlanId} onClose={() => setOpenPlanId(null)} onChanged={refresh} />}
      {addingPlan && (
        <NewPlanModal
          types={typesQuery.data ?? []}
          onClose={() => setAddingPlan(false)}
          onDone={() => { setAddingPlan(false); refresh(); }}
        />
      )}
    </Card>
  );
}

// ── Plan detail: version history + assignments ───────────────────────────
function PlanDrawer({ planId, onClose, onChanged }: { planId: string; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const [drafting, setDrafting] = useState(false);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [activating, setActivating] = useState<PlanVersion | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removingAssignment, setRemovingAssignment] = useState<PlanAssignment | null>(null);

  const canManage = can(user?.role, 'leave:managePolicy');
  const canActivate = can(user?.role, 'leave:approvePolicy');

  const query = useQuery({
    queryKey: leaveKeys.policy(planId),
    queryFn: () => api.get(`/leave/policies/${planId}`).then((r) => r.data.data as PlanDetail),
  });
  const plan = query.data;

  // Decides which verb the remove button offers. A never-used policy can simply
  // go; one with history must be retired instead.
  const usageQuery = useQuery({ queryKey: [...leaveKeys.policy(planId), 'usage'], queryFn: () => leaveApi.planUsage(planId) });
  const usage = usageQuery.data;

  const removePlan = useMutation({
    mutationFn: () => (usage?.isUsed ? leaveApi.retirePlan(planId) : leaveApi.deletePlan(planId)),
    onSuccess: () => {
      toast.success(usage?.isUsed
        ? 'Policy retired. It no longer applies to anyone; its history is intact.'
        : 'Policy deleted.');
      setRemoving(false);
      onChanged();
      onClose();
    },
    onError: (err) => { setRemoving(false); toast.error(apiMessage(err, 'Could not remove the policy.')); },
  });

  const removeAssignment = useMutation({
    mutationFn: (assignmentId: string) => leaveApi.deleteAssignment(planId, assignmentId),
    onSuccess: () => {
      toast.success('Assignment removed. The policy no longer targets that group.');
      setRemovingAssignment(null);
      query.refetch();
      onChanged();
    },
    onError: (err) => { setRemovingAssignment(null); toast.error(apiMessage(err, 'Could not remove the assignment.')); },
  });

  const simulate = useMutation({
    mutationFn: (versionId: string) =>
      api.post(`/leave/policies/${planId}/versions/${versionId}/simulate`).then((r) => r.data.data as SimulationResult),
    onSuccess: setSimulation,
    onError: (err) => toast.error(apiMessage(err, 'Could not simulate this version.')),
  });

  const activate = useMutation({
    mutationFn: (versionId: string) => api.post(`/leave/policies/${planId}/versions/${versionId}/activate`),
    onSuccess: () => {
      toast.success('Version activated. The previous one has been closed off, not overwritten.');
      setActivating(null);
      query.refetch();
      onChanged();
    },
    onError: (err) => { setActivating(null); toast.error(apiMessage(err, 'Could not activate this version.')); },
  });

  return (
    <Drawer
      onClose={onClose}
      title={plan ? plan.name : 'Policy'}
      subtitle={plan ? `${plan.code} · ${plan.leaveType.name}` : undefined}
      footer={<>
        {canManage && <button type="button" onClick={() => setDrafting(true)}><Plus size={15} /> New version</button>}
        {/* Delete when it was never used; retire once it has history. Retiring
            takes entitlement away from people, so it is Super-Admin-only. */}
        {plan?.status !== 'INACTIVE' && usage && (usage.isUsed ? canActivate : canManage) && (
          <button type="button" className="ghost danger" onClick={() => setRemoving(true)}>
            <Trash2 size={15} /> {usage.isUsed ? 'Retire policy' : 'Delete policy'}
          </button>
        )}
        <button className="ghost" onClick={onClose}>Close</button>
      </>}
    >
      {query.isLoading || !plan ? (
        <div className="doc-list"><Skeleton height={40} /><Skeleton height={40} /></div>
      ) : (
        <>
          <h3 style={{ marginBottom: '0.5rem' }}>Version history</h3>
          {plan.versions.length === 0 ? (
            <p className="muted sm-text">
              No versions yet — this policy has no rules, so it grants nothing. Add one to set entitlement,
              accrual and the day-counting rules.
            </p>
          ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>v</th><th>Status</th><th>Effective</th><th className="num">Days</th><th>Reason</th><th></th></tr></thead>
              <tbody>
                {plan.versions.map((v) => (
                  <tr key={v.id}>
                    <td>{v.versionNo}</td>
                    <td><Badge tone={versionTone(v.status)}>{v.status.toLowerCase()}</Badge></td>
                    <td className="sm-text">
                      {fmtDate(v.effectiveFrom)}{v.effectiveTo ? ` – ${fmtDate(v.effectiveTo)}` : ''}
                    </td>
                    <td className="num">{Number(v.annualEntitlement)}</td>
                    <td className="sm-text" title={v.changeReason}>{v.changeReason}</td>
                    <td className="actions-cell">
                      <button type="button" className="sm ghost" onClick={() => simulate.mutate(v.id)} disabled={simulate.isPending}>
                        Simulate
                      </button>
                      {v.status === 'DRAFT' && canActivate && (
                        <button type="button" className="sm" onClick={() => setActivating(v)}><Check size={14} /> Activate</button>
                      )}
                      {v.status === 'DRAFT' && !canActivate && <span className="muted sm-text">awaiting Super Admin</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}

          {simulation && (
            <div className="panel pad" style={{ marginTop: '0.75rem' }}>
              <strong>Impact from {fmtDate(simulation.effectiveFrom)}</strong>
              <p className="sm-text" style={{ marginTop: '0.35rem' }}>
                {simulation.affectedEmployees} employee{simulation.affectedEmployees === 1 ? '' : 's'} affected ·
                {' '}{simulation.totalDeltaDays >= 0 ? '+' : ''}{simulation.totalDeltaDays} days total ·
                {' '}{simulation.averageDeltaDays >= 0 ? '+' : ''}{simulation.averageDeltaDays} average ·
                {' '}largest {simulation.largestAdjustment >= 0 ? '+' : ''}{simulation.largestAdjustment}
              </p>
              <p className="muted sm-text">
                Transition strategy: {simulation.strategy.toLowerCase()}.
                {simulation.strategy === 'PROSPECTIVE' && ' Past accrual is untouched; only future months use the new rate.'}
                {simulation.strategy === 'TRUE_UP' && ' A one-off adjustment brings elapsed months onto the new rate.'}
              </p>
            </div>
          )}

          <h3 style={{ marginTop: '1.25rem', marginBottom: '0.5rem' }}>Who it applies to</h3>
          {plan.assignments.length === 0 ? (
            <p className="muted sm-text">
              No assignment rules — this policy currently applies to nobody. Add one to target a branch,
              department, designation, grade or gender.
            </p>
          ) : (
            <ul className="doc-list">
              {plan.assignments.map((a) => (
                <li key={a.id} className="sm-text" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ flex: 1 }}>
                    <strong>{a.scopeType.toLowerCase().replace(/_/g, ' ')}</strong>
                    {a.gender ? ` · ${a.gender}` : ''}{a.state ? ` · ${a.state}` : ''}
                    {' '}<span className="muted">
                      priority {a.priority} · from {fmtDate(a.effectiveFrom)}
                      {a.effectiveTo ? ` to ${fmtDate(a.effectiveTo)}` : ''}
                      {a.status !== 'ACTIVE' ? ' · closed' : ''}
                    </span>
                  </span>
                  {canManage && a.status === 'ACTIVE' && (
                    <button type="button" className="sm ghost danger" onClick={() => setRemovingAssignment(a)}>
                      <Trash2 size={13} /> Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="muted sm-text">
            Removing every assignment is the lightest way to stop a policy applying — it keeps the rules on file
            in case the group comes back.
          </p>

          {drafting && (
            <NewVersionModal
              planId={planId}
              current={plan.versions.find((v) => v.status === 'ACTIVE') ?? plan.versions[0]}
              onClose={() => setDrafting(false)}
              onDone={() => { setDrafting(false); query.refetch(); onChanged(); }}
            />
          )}

          {activating && (
            <ConfirmDialog
              icon={<Check size={20} />}
              title={`Activate version ${activating.versionNo}?`}
              message={<>
                From {fmtDate(activating.effectiveFrom)}, entitlement becomes <strong>{Number(activating.annualEntitlement)} days</strong>.
                <br /><span className="muted sm-text">
                  The current version is closed off the day before, not deleted — accruals already posted under it
                  keep pointing at the rule that produced them.
                </span>
              </>}
              confirmLabel="Activate"
              loading={activate.isPending}
              onConfirm={() => activate.mutate(activating.id)}
              onCancel={() => setActivating(null)}
            />
          )}

          {removing && usage && (
            <ConfirmDialog
              icon={<Trash2 size={20} />}
              tone="danger"
              title={usage.isUsed ? `Retire ${plan.name}?` : `Delete ${plan.name}?`}
              message={usage.isUsed ? (
                <>
                  This policy has already governed people, so it cannot be deleted — balances and payslips still
                  point at the rules it applied. Retiring it instead:
                  <br /><br />
                  • it stops applying to anyone from today<br />
                  • its {plan.versions.length} version{plan.versions.length === 1 ? '' : 's'} and all history stay on file<br />
                  • any draft version is discarded
                  <br /><br />
                  <span className="muted sm-text">
                    Employees governed only by this policy will have no policy for {plan.leaveType.name} afterwards,
                    so they stop accruing it. Assign them another policy first if that is not what you want.
                  </span>
                </>
              ) : (
                <>
                  This policy has never been used — no balances, requests or accruals reference it — so it can be
                  removed cleanly along with its {plan.versions.length} draft version{plan.versions.length === 1 ? '' : 's'}.
                  <br /><span className="muted sm-text">This cannot be undone.</span>
                </>
              )}
              confirmLabel={usage.isUsed ? 'Retire policy' : 'Delete policy'}
              loading={removePlan.isPending}
              onConfirm={() => removePlan.mutate()}
              onCancel={() => setRemoving(false)}
            />
          )}

          {removingAssignment && (
            <ConfirmDialog
              icon={<Trash2 size={20} />}
              tone="danger"
              title="Remove this assignment?"
              message={<>
                <strong>{plan.name}</strong> will stop applying to the{' '}
                {removingAssignment.scopeType.toLowerCase().replace(/_/g, ' ')} it targets.
                <br /><span className="muted sm-text">
                  The policy and its rules stay on file. Employees who match no other assignment for{' '}
                  {plan.leaveType.name} will stop accruing it.
                </span>
              </>}
              confirmLabel="Remove assignment"
              loading={removeAssignment.isPending}
              onConfirm={() => removeAssignment.mutate(removingAssignment.id)}
              onCancel={() => setRemovingAssignment(null)}
            />
          )}
        </>
      )}
    </Drawer>
  );
}

// ── Draft a new version ──────────────────────────────────────────────────
function NewVersionModal({
  planId, current, onClose, onDone,
}: {
  planId: string;
  current?: PlanVersion;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // The reset cycle a version is anchored to. A policy's FIRST version has no
  // current version to copy it from, so it must be chosen here — omitting it
  // was why creating the first version of any new policy failed validation.
  const schemesQuery = useQuery({ queryKey: leaveKeys.periodSchemes, queryFn: leaveApi.listPeriodSchemes });
  const schemes = schemesQuery.data ?? [];
  const [periodSchemeId, setPeriodSchemeId] = useState(current?.periodSchemeId ?? '');
  useEffect(() => {
    if (!periodSchemeId && schemes.length) setPeriodSchemeId(current?.periodSchemeId ?? schemes[0].id);
  }, [schemes, current, periodSchemeId]);

  // Pre-filled from the current version so this reads as "change what differs"
  // rather than "re-enter the whole rule set".
  const [form, setForm] = useState({
    effectiveFrom: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
    annualEntitlement: current ? String(Number(current.annualEntitlement)) : '12',
    accrualFrequency: current?.accrualFrequency ?? 'MONTHLY',
    accrualAmount: current?.accrualAmount != null ? String(Number(current.accrualAmount)) : '',
    carryForwardEnabled: current?.carryForwardEnabled ?? false,
    maxCarryForward: current?.maxCarryForward != null ? String(Number(current.maxCarryForward)) : '',
    sandwichRule: current?.sandwichRule ?? 'NONE',
    insufficientBalanceAction: current?.insufficientBalanceAction ?? 'BLOCK',
    lwpLeaveTypeId: current?.lwpLeaveTypeId ?? '',
    minNoticeDays: String(current?.minNoticeDays ?? 0),
    changeReason: '',
    policyChangeStrategy: 'PROSPECTIVE',
  });

  // Only unpaid types can absorb an over-balance request.
  const typesQuery = useQuery({ queryKey: leaveKeys.types, queryFn: leaveApi.listTypes });
  const unpaidTypes = (typesQuery.data ?? []).filter((t) => !t.isPaid);

  const save = useMutation({
    mutationFn: () => api.post(`/leave/policies/${planId}/versions`, {
      effectiveFrom: form.effectiveFrom,
      periodSchemeId,
      changeReason: form.changeReason.trim(),
      annualEntitlement: Number(form.annualEntitlement),
      accrualFrequency: form.accrualFrequency,
      ...(form.accrualAmount ? { accrualAmount: Number(form.accrualAmount) } : {}),
      carryForwardEnabled: form.carryForwardEnabled,
      ...(form.maxCarryForward ? { maxCarryForward: Number(form.maxCarryForward) } : {}),
      sandwichRule: form.sandwichRule,
      insufficientBalanceAction: form.insufficientBalanceAction,
      ...(form.insufficientBalanceAction === 'CONVERT_TO_LWP' ? { lwpLeaveTypeId: form.lwpLeaveTypeId } : {}),
      minNoticeDays: Number(form.minNoticeDays),
      policyChangeStrategy: form.policyChangeStrategy,
    }),
    onSuccess: () => { toast.success('Draft version created. A Super Admin must activate it.'); onDone(); },
    onError: (err) => {
      // Both: the summary explains the problem, the per-field map marks the
      // input that caused it so the user is not left hunting.
      setError(apiMessage(err, 'Could not create the version.'));
      setFieldErrors(apiFieldErrors(err));
    },
  });

  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); setFieldErrors({}); save.mutate(); };
  // Mirror the API's own cross-field rule so the dependency is visible in the
  // form rather than discovered from a 422.
  const needsLwpType = form.insufficientBalanceAction === 'CONVERT_TO_LWP' && !form.lwpLeaveTypeId;
  const disabled =
    save.isPending
    || form.changeReason.trim().length < 3
    || !form.effectiveFrom
    || !periodSchemeId
    || needsLwpType;
  /** Inline note under the input the server rejected. */
  const fieldNote = (name: string) =>
    fieldErrors[name] ? <span className="error-text sm-text">{fieldErrors[name]}</span> : null;

  return (
    <Modal
      size="md" onClose={onClose} icon={<Plus size={20} />}
      title="New policy version"
      subtitle="Creates a draft. Nothing changes until it is activated."
      footer={<>
        <button type="button" className="ghost" onClick={onClose} disabled={save.isPending}>Cancel</button>
        <button type="submit" form="new-version-form" disabled={disabled}>{save.isPending ? 'Saving…' : 'Create draft'}</button>
      </>}
    >
      <form id="new-version-form" className="form-grid" onSubmit={submit}>
        {/* First version of a policy has nothing to inherit this from, so it is
            always shown rather than hidden behind "same as current". */}
        <label className="span-all">Reset cycle
          <select value={periodSchemeId} onChange={(e) => setPeriodSchemeId(e.target.value)} required disabled={!!current}>
            {schemes.length === 0 && <option value="">— no period schemes configured —</option>}
            {schemes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} (starts {MONTH_NAMES[s.startMonth - 1]})
              </option>
            ))}
          </select>
          {current
            ? <span className="muted sm-text">Fixed to the policy’s existing cycle — changing it would split the balance year.</span>
            : <span className="muted sm-text">When the balance resets each year.</span>}
          {fieldNote('periodSchemeId')}
        </label>
        <label>Effective from
          <input type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} required />
          {fieldNote('effectiveFrom')}
        </label>
        <label>Days per year
          <input type="number" min={0} step="0.5" value={form.annualEntitlement} onChange={(e) => setForm({ ...form, annualEntitlement: e.target.value })} required />
          {fieldNote('annualEntitlement')}
        </label>
        <label>Accrual
          <select value={form.accrualFrequency} onChange={(e) => setForm({ ...form, accrualFrequency: e.target.value })}>
            <option value="MONTHLY">Monthly</option>
            <option value="QUARTERLY">Quarterly</option>
            <option value="HALF_YEARLY">Half-yearly</option>
            <option value="ANNUAL_UPFRONT">All up-front</option>
            <option value="DAILY">Daily</option>
            <option value="NONE">None</option>
          </select>
        </label>
        <label>Amount per cycle
          <input type="number" min={0} step="0.25" value={form.accrualAmount} placeholder="auto" onChange={(e) => setForm({ ...form, accrualAmount: e.target.value })} />
        </label>
        <label>Minimum notice (days)
          <input type="number" min={0} value={form.minNoticeDays} onChange={(e) => setForm({ ...form, minNoticeDays: e.target.value })} />
        </label>
        <label>Sandwich rule
          <select value={form.sandwichRule} onChange={(e) => setForm({ ...form, sandwichRule: e.target.value })}>
            <option value="NONE">Off — holidays inside leave are free</option>
            <option value="BOTH_SIDES">Charge when leave falls both sides</option>
            <option value="EITHER_SIDE">Charge when leave falls either side</option>
            <option value="HOLIDAY_ONLY">Holidays only</option>
          </select>
        </label>
        <label className="span-all">If the balance runs out
          <select value={form.insufficientBalanceAction} onChange={(e) => setForm({ ...form, insufficientBalanceAction: e.target.value })}>
            <option value="BLOCK">Block the request</option>
            <option value="CONVERT_TO_LWP">Convert the excess to unpaid leave</option>
            <option value="ALLOW_NEGATIVE">Allow a negative balance</option>
          </select>
          {fieldNote('insufficientBalanceAction')}
        </label>
        {/* Required by the API whenever the action is CONVERT_TO_LWP — the
            overflow has to land on a specific type. Only unpaid types are
            offered, since converting into another paid type would give the
            employee free leave rather than deducting it. */}
        {form.insufficientBalanceAction === 'CONVERT_TO_LWP' && (
          <label className="span-all">Convert excess days to
            <select value={form.lwpLeaveTypeId} onChange={(e) => setForm({ ...form, lwpLeaveTypeId: e.target.value })} required>
              <option value="">— Select a leave type —</option>
              {unpaidTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {unpaidTypes.length === 0
              ? <span className="error-text sm-text">No unpaid leave type exists. Create one before using this option.</span>
              : <span className="muted sm-text">Days beyond the balance are booked against this type instead of being refused.</span>}
            {fieldNote('lwpLeaveTypeId')}
          </label>
        )}
        <label className="check span-all">
          <input type="checkbox" checked={form.carryForwardEnabled} onChange={(e) => setForm({ ...form, carryForwardEnabled: e.target.checked })} />
          Carry unused days into the next period
        </label>
        {form.carryForwardEnabled && (
          <label>Max carried
            <input type="number" min={0} step="0.5" value={form.maxCarryForward} onChange={(e) => setForm({ ...form, maxCarryForward: e.target.value })} />
          </label>
        )}
        <label className="span-all">Transition
          <select value={form.policyChangeStrategy} onChange={(e) => setForm({ ...form, policyChangeStrategy: e.target.value })}>
            <option value="PROSPECTIVE">Prospective — future months only</option>
            <option value="TRUE_UP">True up — adjust elapsed months to the new rate</option>
            <option value="NONE">No transition handling</option>
          </select>
        </label>
        <label className="span-all">Why this change
          <input
            value={form.changeReason}
            onChange={(e) => setForm({ ...form, changeReason: e.target.value })}
            maxLength={500} minLength={3} required
            placeholder="Required — this is what explains the number two years from now"
          />
          {fieldNote('changeReason')}
        </label>
        {error && <div className="error-box span-all">{error}</div>}
      </form>
    </Modal>
  );
}

// ── New plan ─────────────────────────────────────────────────────────────
function NewPlanModal({ types, onClose, onDone }: { types: LeaveTypeDef[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ code: '', name: '', leaveTypeId: types[0]?.id ?? '', description: '' });
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: () => api.post('/leave/policies', {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      leaveTypeId: form.leaveTypeId,
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
    }),
    onSuccess: () => { toast.success('Policy created. Add a version to give it rules.'); onDone(); },
    onError: (err) => setError(apiMessage(err, 'Could not create the policy.')),
  });

  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); save.mutate(); };
  const disabled = save.isPending || !form.code.trim() || !form.name.trim() || !form.leaveTypeId;

  return (
    <Modal
      size="sm" onClose={onClose} icon={<Plus size={20} />}
      title="New leave policy"
      subtitle="A container for versions. Rules come next."
      footer={<>
        <button type="button" className="ghost" onClick={onClose} disabled={save.isPending}>Cancel</button>
        <button type="submit" form="new-plan-form" disabled={disabled}>{save.isPending ? 'Saving…' : 'Create policy'}</button>
      </>}
    >
      <form id="new-plan-form" className="form-grid" onSubmit={submit}>
        <label className="span-all">Leave type
          <select value={form.leaveTypeId} onChange={(e) => setForm({ ...form, leaveTypeId: e.target.value })} required>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label>Code
          <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} maxLength={50} required placeholder="FO_CASUAL" />
        </label>
        <label>Name
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={150} required placeholder="Field Officer — Casual" />
        </label>
        <label className="span-all">Description
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={500} placeholder="optional" />
        </label>
        {error && <div className="error-box span-all">{error}</div>}
      </form>
    </Modal>
  );
}
