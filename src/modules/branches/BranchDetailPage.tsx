import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { Card, StatCard } from '../../components/Card';
import { Tabs, TabDef } from '../../components/Tabs';
import { Badge } from '../../components/Badge';
import { Modal } from '../../components/Modal';
import { Skeleton } from '../../components/Skeleton';
import { AlertCircle, Banknote, HandCoins, ListChecks, Pencil, UserCheck, Users } from '../../components/icons';
import { apiMessage, inr, fmtDate } from '../../lib/format';
import { useToast } from '../../components/Toast';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import { BranchDashboard, BranchDetail } from './shared';

interface EmployeeOption { id: string; fullName: string; employeeCode: string }

interface StaffRow {
  id: string; employeeCode: string; fullName: string; designation: string; employmentStatus: string; joiningDate: string;
}

type TabKey = 'overview' | 'performance' | 'staff';

/** Branch — Details. Tabbed: Overview, Performance (live KPIs) and Staff roster. */
export default function BranchDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canUpdate = can(user?.role, 'branch:update');
  const [assignManager, setAssignManager] = useState(false);

  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as TabKey) || 'overview';
  const setTab = (t: TabKey) => setParams((p) => { p.set('tab', t); return p; }, { replace: true });

  const detailQuery = useQuery({
    queryKey: ['/branches', id],
    queryFn: () => api.get(`/branches/${id}`).then((r) => r.data.data as BranchDetail),
  });
  const branch = detailQuery.data;

  const dashboardQuery = useQuery({
    queryKey: ['/branches', id, 'dashboard'],
    queryFn: () => api.get(`/branches/${id}/dashboard`).then((r) => r.data.data as BranchDashboard),
    enabled: tab === 'performance',
  });
  const kpi = dashboardQuery.data;

  const staffQuery = useQuery({
    queryKey: ['/employees', 'branch', id],
    queryFn: () => api.get(`/employees?branchId=${id}&pageSize=100&sortBy=fullName&sortOrder=asc`).then((r) => r.data.data as StaffRow[]),
    enabled: tab === 'staff',
  });

  const staffColumns: Column<StaffRow>[] = [
    { header: 'Code', render: (e) => <code>{e.employeeCode}</code>, sortValue: (e) => e.employeeCode },
    { header: 'Name', render: (e) => <a className="cell-link" onClick={() => navigate(`/employees/${e.id}`)}>{e.fullName}</a>, sortValue: (e) => e.fullName },
    { header: 'Designation', render: (e) => e.designation, sortValue: (e) => e.designation },
    { header: 'Joined', render: (e) => fmtDate(e.joiningDate), sortValue: (e) => e.joiningDate },
    { header: 'Status', render: (e) => <Badge status={e.employmentStatus} />, sortValue: (e) => e.employmentStatus },
  ];

  const tabs: TabDef[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'performance', label: 'Performance' },
    { key: 'staff', label: 'Staff', count: branch?._count?.employees },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Operations' }, { label: 'Branches', to: '/branches' }, { label: branch?.name ?? 'Branch' }]}
        title={branch?.name ?? 'Branch'}
        subtitle={branch ? <><code>{branch.code}</code> · {branch.city}, {branch.state}</> : undefined}
        meta={branch && <Badge status={branch.status} />}
        actions={canUpdate && <button className="btn-lg" onClick={() => navigate(`/branches/${id}/edit`)}><Pencil size={15} /> Edit</button>}
        tabs={<Tabs tabs={tabs} active={tab} onChange={(t) => setTab(t as TabKey)} />}
      />

      {!branch ? (
        <Card><Skeleton height={20} /><Skeleton height={14} style={{ marginTop: 12 }} /><Skeleton height={14} style={{ marginTop: 8 }} /></Card>
      ) : (
        <>
          {tab === 'overview' && (
            <div className="detail-cols">
              <Card title="Branch details">
                <dl className="detail-list">
                  <div><dt>Code</dt><dd><code>{branch.code}</code></dd></div>
                  <div><dt>Name</dt><dd>{branch.name}</dd></div>
                  <div><dt>Address</dt><dd>{branch.addressLine ?? '—'}</dd></div>
                  <div><dt>City</dt><dd>{branch.city}</dd></div>
                  <div><dt>State</dt><dd>{branch.state}</dd></div>
                  <div>
                    <dt>Manager</dt>
                    <dd>
                      {branch.manager?.fullName ?? '—'}
                      {canUpdate && !branch.reportsToSuperAdmin && (
                        <button className="ghost sm" style={{ marginLeft: 8 }} onClick={() => setAssignManager(true)}><UserCheck size={13} /> Change</button>
                      )}
                      {branch.reportsToSuperAdmin && <span className="muted sm-text"> · reports to Super Admin</span>}
                    </dd>
                  </div>
                  <div><dt>Status</dt><dd><Badge status={branch.status} /></dd></div>
                </dl>
              </Card>
              <Card title="At a glance">
                <div className="stat-grid">
                  <StatCard label="Clients" value={String(branch._count?.clients ?? 0)} icon={<Users size={18} />} tone="brass" />
                  <StatCard label="Loans" value={String(branch._count?.loans ?? 0)} icon={<ListChecks size={18} />} tone="info" to={`/loans`} />
                  <StatCard label="Staff" value={String(branch._count?.employees ?? 0)} icon={<Users size={18} />} tone="success" />
                </div>
              </Card>
            </div>
          )}

          {tab === 'performance' && (
            dashboardQuery.isLoading ? (
              <Card><Skeleton height={16} /><Skeleton height={14} style={{ marginTop: 10 }} /></Card>
            ) : kpi ? (
              <div className="stat-grid">
                <StatCard label="Active loans" value={String(kpi.activeLoanCount)} icon={<ListChecks size={18} />} tone="brass" />
                <StatCard label="Outstanding principal" value={inr(kpi.outstandingPrincipal)} icon={<Banknote size={18} />} tone="info" />
                <StatCard label="Overdue installments" value={String(kpi.overdueInstallmentCount)} icon={<AlertCircle size={18} />} tone="danger" />
                <StatCard label="Pending collection" value={inr(kpi.pendingCollectionAmount)} icon={<HandCoins size={18} />} tone="warning" />
                <StatCard label="Collected today" value={inr(kpi.collectedToday)} icon={<HandCoins size={18} />} tone="success" />
              </div>
            ) : (
              <Card><p className="muted">Could not load branch performance.</p></Card>
            )
          )}

          {tab === 'staff' && (
            <DataTable
              columns={staffColumns}
              rows={staffQuery.data ?? []}
              loading={staffQuery.isLoading}
              empty="No staff posted to this branch yet."
              searchPlaceholder="Search staff by name, code or designation…"
              pageSize={25}
            />
          )}
        </>
      )}

      {assignManager && branch && (
        <AssignBranchManagerModal branchId={id} current={branch.manager?.fullName ?? null} onClose={() => setAssignManager(false)} />
      )}
    </>
  );
}

// ── Assign / change branch manager (HRJee hierarchy) ────────────────────────
function AssignBranchManagerModal({ branchId, current, onClose }: { branchId: string; current: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [employeeId, setEmployeeId] = useState('');
  const [error, setError] = useState('');

  const employeesQuery = useQuery({
    queryKey: ['/employees', 'branch-manager', branchId],
    queryFn: () => api.get(`/employees?branchId=${branchId}&pageSize=200&sortBy=fullName&sortOrder=asc`).then((r) => r.data.data as EmployeeOption[]),
  });

  const save = useMutation({
    mutationFn: () => api.patch(`/branches/${branchId}/manager`, { employeeId: employeeId || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/branches', branchId] });
      qc.invalidateQueries({ queryKey: ['/human-resources/hierarchy/tree'] });
      toast.success('Branch manager updated.');
      onClose();
    },
    onError: (err) => setError(apiMessage(err, 'Could not update the manager.')),
  });

  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); save.mutate(); };

  return (
    <Modal
      size="md" onClose={onClose} icon={<UserCheck size={20} />}
      title="Branch manager"
      subtitle={current ? `Current: ${current}` : 'No manager assigned'}
      footer={<>
        <button type="button" className="ghost" onClick={onClose}>Cancel</button>
        <button type="submit" form="assign-bm-form" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</button>
      </>}
    >
      <form id="assign-bm-form" className="form-grid" onSubmit={submit}>
        <label className="span-all">Manager (must be posted to this branch)
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">— None (clear manager) —</option>
            {employeesQuery.data?.map((emp) => <option key={emp.id} value={emp.id}>{emp.fullName} ({emp.employeeCode})</option>)}
          </select>
        </label>
        {error && <div className="error-box span-all">{error}</div>}
      </form>
    </Modal>
  );
}
