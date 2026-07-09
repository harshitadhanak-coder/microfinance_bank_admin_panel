import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { useServerTable } from '../../components/useServerTable';
import { inr } from '../../components/StatCard';
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

export default function LoanLinkPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const table = useServerTable({ initialSort: { key: 'loanNumber', direction: 'asc' } });
  const [assignFor, setAssignFor] = useState<LinkableLoan | null>(null);

  // Only active loans can be worked in the field, so the link screen is scoped
  // to ACTIVE loans by default.
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
          ? <span className="pill pill-approved">{l.assignedOfficer.fullName}</span>
          : <span className="pill pill-new">Unassigned</span>,
    },
    { header: '', render: (l) => <button type="button" className="sm ghost" onClick={() => setAssignFor(l)}>{l.assignedOfficer ? 'Reassign' : 'Assign'}</button> },
  ];

  return (
    <>
      <header className="page-head">
        <h1>Loan Link with Field Officer</h1>
        <p className="muted">
          Assign each disbursed loan to a field officer. The loan then appears in that officer’s collection list.
          {user?.branch ? ` — ${user.branch.name}` : ''}
        </p>
      </header>

      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        empty="No active loans to link yet."
        searchPlaceholder="Search by loan no. or client…"
        server={{
          page: table.page,
          pageSize: table.pageSize,
          totalItems,
          onPageChange: table.setPage,
          sort: table.sort,
          onSortChange: table.onSortChange,
          search: table.search,
          onSearchChange: table.onSearchChange,
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
  const [officerId, setOfficerId] = useState(loan.assignedOfficer?.id ?? '');
  const [error, setError] = useState('');

  const assign = useMutation({
    mutationFn: () => api.patch(`/loans/${loan.id}/assign-officer`, { assignedOfficerId: officerId }),
    onSuccess: onDone,
    onError: (err) => setError(axios.isAxiosError(err) ? err.response?.data?.message ?? 'Could not link the loan.' : 'Could not link the loan.'),
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head" style={{ width: '100%' }}>
          <h2>Link loan {loan.loanNumber}</h2>
          <button type="button" className="ghost sm" onClick={onClose}>Close</button>
        </div>
        <p className="muted sm-text" style={{ margin: 0 }}>Customer: {loan.client.fullName}</p>

        <label style={{ marginTop: '0.6rem' }}>
          Field officer
          <select value={officerId} onChange={(e) => setOfficerId(e.target.value)}>
            <option value="">Select a field officer</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.fullName}{e.designation ? ` · ${e.designation}` : ''}</option>
            ))}
          </select>
        </label>

        {error && <div className="error-box" style={{ marginTop: '0.6rem' }}>{error}</div>}

        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button type="button" disabled={!officerId || assign.isPending} onClick={() => { setError(''); assign.mutate(); }}>
            {assign.isPending ? 'Linking…' : 'Link loan'}
          </button>
        </div>
      </div>
    </div>
  );
}
