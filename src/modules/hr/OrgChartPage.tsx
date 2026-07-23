import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { StatCard } from '../../components/StatCard';
import { Modal } from '../../components/Modal';
import { EmptyState } from '../../components/EmptyState';
import { Skeleton } from '../../components/Skeleton';
import { ChevronDown, ChevronRight, Users, UserCheck } from '../../components/icons';
import { apiMessage } from '../../lib/format';
import { useToast } from '../../components/Toast';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';

interface Node {
  id: string;
  employeeCode: string;
  fullName: string;
  designation: string;
  department: string | null;
  branchName: string | null;
  isBranchManager: boolean;
  reportsToSuperAdmin: boolean;
  reports: Node[];
}
interface Tree { roots: Node[]; totalEmployees: number }
interface EmployeeOption { id: string; fullName: string; employeeCode: string }

export default function OrgChartPage() {
  const { user } = useAuth();
  const canManage = can(user?.role, 'hierarchy:manage');
  const [reassign, setReassign] = useState<Node | null>(null);

  const query = useQuery({
    queryKey: ['/human-resources/hierarchy/tree'],
    queryFn: () => api.get('/human-resources/hierarchy/tree').then((r) => r.data.data as Tree),
  });

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Human Resources' }, { label: 'Org Chart' }]}
        title="Reporting Hierarchy"
        subtitle="Employees roll up to their reporting manager, then the branch manager, then Super Admin (head-office branches report directly)."
      />

      <div className="stat-row">
        <StatCard label="Employees on chart" value={query.data?.totalEmployees ?? '—'} />
        <StatCard label="Top-level (roots)" value={query.data?.roots.length ?? '—'} hint="Branch managers + head-office staff" />
      </div>

      {query.isLoading ? (
        <Skeleton height={240} />
      ) : !query.data?.roots.length ? (
        <EmptyState title="No employees on the chart" message="Once employees have branches and managers, the tree appears here." />
      ) : (
        <div className="org-tree card">
          {query.data.roots.map((n) => (
            <TreeNode key={n.id} node={n} depth={0} canManage={canManage} onReassign={setReassign} />
          ))}
        </div>
      )}

      {reassign && (
        <ReassignManagerModal node={reassign} onClose={() => setReassign(null)} />
      )}
    </>
  );
}

function TreeNode({ node, depth, canManage, onReassign }: { node: Node; depth: number; canManage: boolean; onReassign: (n: Node) => void }) {
  const [open, setOpen] = useState(depth < 2);
  const hasReports = node.reports.length > 0;
  return (
    <div className="org-node" style={{ marginLeft: depth * 20 }}>
      <div className="org-row">
        <button className="tree-toggle" onClick={() => setOpen((o) => !o)} disabled={!hasReports} aria-label={open ? 'Collapse' : 'Expand'}>
          {hasReports ? (open ? <ChevronDown size={16} /> : <ChevronRight size={16} />) : <span style={{ width: 16, display: 'inline-block' }} />}
        </button>
        <span className="org-avatar">{node.isBranchManager ? <UserCheck size={16} /> : <Users size={16} />}</span>
        <div className="org-info">
          <strong>{node.fullName}</strong>
          <span className="muted sm-text"> · {node.designation}{node.branchName ? ` · ${node.branchName}` : ''}</span>
          {node.isBranchManager && <span className="pill pill-info">Branch Manager</span>}
          {node.reportsToSuperAdmin && <span className="pill">Head office</span>}
          {hasReports && <span className="muted sm-text"> · {node.reports.length} report{node.reports.length === 1 ? '' : 's'}</span>}
        </div>
        {canManage && (
          <button className="ghost sm" onClick={() => onReassign(node)}>Change manager</button>
        )}
      </div>
      {open && hasReports && node.reports.map((child) => (
        <TreeNode key={child.id} node={child} depth={depth + 1} canManage={canManage} onReassign={onReassign} />
      ))}
    </div>
  );
}

function ReassignManagerModal({ node, onClose }: { node: Node; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [managerId, setManagerId] = useState('');
  const [error, setError] = useState('');

  const employeesQuery = useQuery({
    queryKey: ['/employees', 'org-reassign-options'],
    queryFn: () => api.get('/employees?pageSize=300').then((r) => r.data.data as EmployeeOption[]),
  });

  const save = useMutation({
    mutationFn: () => api.patch(`/employees/${node.id}/reporting-manager`, { managerId: managerId || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/human-resources/hierarchy/tree'] });
      toast.success('Reporting manager updated.');
      onClose();
    },
    onError: (err) => setError(apiMessage(err, 'Could not update the manager.')),
  });

  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); save.mutate(); };

  return (
    <Modal
      size="md"
      onClose={onClose}
      icon={<UserCheck size={20} />}
      title="Change reporting manager"
      subtitle={`${node.fullName} · ${node.employeeCode}`}
      footer={<>
        <button type="button" className="ghost" onClick={onClose}>Cancel</button>
        <button type="submit" form="reassign-form" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</button>
      </>}
    >
      <form id="reassign-form" className="form-grid" onSubmit={submit}>
        <label className="span-all">Reporting manager
          <select value={managerId} onChange={(e) => setManagerId(e.target.value)}>
            <option value="">— None (reports to branch manager / Super Admin) —</option>
            {employeesQuery.data?.filter((e) => e.id !== node.id).map((e) => <option key={e.id} value={e.id}>{e.fullName} ({e.employeeCode})</option>)}
          </select>
        </label>
        <p className="muted sm-text span-all">Cycles are rejected — you cannot pick someone who already reports to this employee.</p>
        {error && <div className="error-box span-all">{error}</div>}
      </form>
    </Modal>
  );
}
