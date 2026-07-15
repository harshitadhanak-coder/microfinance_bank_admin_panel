import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { Badge } from '../../components/Badge';
import { Modal } from '../../components/Modal';
import { useServerTable } from '../../components/useServerTable';
import { useToast } from '../../components/Toast';
import { UserCheck } from '../../components/icons';
import { inr, apiMessage } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';

interface LinkableLoan {
  id: string;
  loanNumber: string;
  outstandingPrincipal: string;
  installmentAmount: string;
  status: string;
  client: { fullName: string; phoneNumber: string };
  assignedOfficer: { id: string; fullName: string } | null;
}

interface Employee {
  id: string;
  fullName: string;
  employeeCode: string;
  designation: string | null;
}

/**
 * Loan Assignments — assign each disbursed (ACTIVE) loan to a field officer so it
 * appears in that officer's collection list. Now a nav-visible Operations page
 * (previously the hidden "Loan Link with FO" route).
 */
export default function LoanLinkPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const table = useServerTable({ initialSort: { key: 'loanNumber', direction: 'asc' } });
  const [assignFor, setAssignFor] = useState<LinkableLoan | null>(null);

  const url = `/loans?${table.params}&status=ACTIVE`;
  const { data, isLoading } = useQuery({
    queryKey: [url],
    queryFn: () => api.get(url).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const rows = (data?.data ?? []) as LinkableLoan[];
  const totalItems = (data?.pagination?.totalItems ?? 0) as number;

  const { data: employees } = useQuery({
    queryKey: ['employees-for-link'],
    queryFn: () => api.get('/employees?pageSize=100').then((r) => r.data.data as Employee[]),
  });

  const columns: Column<LinkableLoan>[] = [
    { header: 'Loan no.', render: (l) => <code>{l.loanNumber}</code>, sortKey: 'loanNumber' },
    { header: 'Client', render: (l) => <><strong>{l.client.fullName}</strong><div className="muted sm-text">{l.client.phoneNumber}</div></>, sortKey: 'client' },
    { header: 'Outstanding', render: (l) => <span className="num">{inr(l.outstandingPrincipal)}</span>, sortKey: 'outstandingPrincipal' },
    { header: 'EMI', render: (l) => <span className="num">{inr(l.installmentAmount)}</span>, sortKey: 'installmentAmount' },
    {
      header: 'Field officer',
      render: (l) =>
        l.assignedOfficer
          ? <Badge tone="success">{l.assignedOfficer.fullName}</Badge>
          : <Badge tone="neutral">Unassigned</Badge>,
    },
    { header: '', render: (l) => <div className="actions-cell"><button type="button" className="sm ghost" onClick={() => setAssignFor(l)}>{l.assignedOfficer ? 'Reassign' : 'Assign'}</button></div> },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Operations' }, { label: 'Loans', to: '/loans' }, { label: 'Assignments' }]}
        title="Loan assignments"
        subtitle={`Assign disbursed loans to field officers for collection${user?.branch ? ` — ${user.branch.name}` : ''}`}
      />

      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        empty="No active loans to assign yet."
        searchPlaceholder="Search by loan no. or client…"
        server={{
          page: table.page, pageSize: table.pageSize, totalItems,
          onPageChange: table.setPage, sort: table.sort, onSortChange: table.onSortChange,
          search: table.search, onSearchChange: table.onSearchChange,
        }}
      />

      {assignFor && (
        <AssignModal
          loan={assignFor}
          employees={employees ?? []}
          onClose={() => setAssignFor(null)}
          onDone={() => {
            setAssignFor(null);
            void queryClient.invalidateQueries({ queryKey: [url] });
          }}
        />
      )}
    </>
  );
}

function AssignModal({
  loan,
  employees,
  onClose,
  onDone,
}: {
  loan: LinkableLoan;
  employees: Employee[];
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [officerId, setOfficerId] = useState(loan.assignedOfficer?.id ?? '');
  const [error, setError] = useState('');

  const assign = useMutation({
    mutationFn: () => api.patch(`/loans/${loan.id}/assign-officer`, { assignedOfficerId: officerId }),
    onSuccess: () => { toast.success('Loan assigned to field officer.'); onDone(); },
    onError: (err) => setError(apiMessage(err, 'Could not assign the loan.')),
  });

  return (
    <Modal
      size="md"
      onClose={onClose}
      icon={<UserCheck size={20} />}
      title={`Assign loan ${loan.loanNumber}`}
      subtitle={`Customer: ${loan.client.fullName}`}
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button type="button" disabled={!officerId || assign.isPending} onClick={() => { setError(''); assign.mutate(); }}>
            {assign.isPending ? 'Assigning…' : 'Assign loan'}
          </button>
        </>
      }
    >
      <label>
        Field officer
        <select value={officerId} onChange={(e) => setOfficerId(e.target.value)}>
          <option value="">Select a field officer</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.fullName}{e.designation ? ` · ${e.designation}` : ''}</option>
          ))}
        </select>
      </label>

      {error && <div className="error-box" style={{ marginTop: '0.6rem' }}>{error}</div>}
    </Modal>
  );
}
