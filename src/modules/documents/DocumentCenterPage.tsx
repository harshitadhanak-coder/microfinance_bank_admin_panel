import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FilterBar } from '../../components/FilterBar';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { useToast } from '../../components/Toast';
import { Loader, CalendarOff } from '../../components/icons';
import { fmtDate, titleCase, apiMessage } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';

interface ExpiringDocument {
  id: string;
  documentType: string;
  category: string;
  fileName: string;
  expiryDate: string;
  isVerified: boolean;
  employee: { id: string; fullName: string; employeeCode: string; branch?: { name: string } | null };
}

const WINDOWS = [30, 60, 90, 180];

const daysUntil = (iso: string): number => Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);

/**
 * Document Center — org-wide employee-document oversight, focused on expiry
 * tracking (the org-wide view the API exposes). Per-employee documents remain on
 * each employee's Documents tab; here HR/HQ see what is lapsing and can nudge.
 */
export default function DocumentCenterPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [within, setWithin] = useState(30);

  const canManage = can(user?.role, 'document:manage');

  const url = `/documents/expiring?withinDays=${within}`;
  const { data, isLoading } = useQuery({
    queryKey: [url],
    queryFn: () => api.get(url).then((r) => r.data.data as ExpiringDocument[]),
  });
  const rows = data ?? [];

  const remind = useMutation({
    mutationFn: () => api.post('/documents/expiring/remind', { withinDays: within }),
    onSuccess: (res) => {
      const count = res.data?.data?.remindersSent ?? res.data?.data?.count;
      toast.success(typeof count === 'number' ? `Expiry reminders queued for ${count} document${count === 1 ? '' : 's'}.` : 'Expiry reminders queued.');
    },
    onError: (err) => toast.error(apiMessage(err, 'Could not queue expiry reminders.')),
  });

  const dueBadge = (iso: string) => {
    const d = daysUntil(iso);
    if (d < 0) return <Badge tone="danger">Expired</Badge>;
    if (d <= 7) return <Badge tone="warning">{d}d left</Badge>;
    return <Badge tone="info">{d}d left</Badge>;
  };

  const columns: Column<ExpiringDocument>[] = [
    { header: 'Employee', render: (d) => <a className="cell-link" onClick={() => navigate(`/employees/${d.employee.id}?tab=documents`)}><strong>{d.employee.fullName}</strong><div className="muted sm-text">{d.employee.employeeCode}</div></a>, sortValue: (d) => d.employee.fullName },
    { header: 'Branch', render: (d) => d.employee.branch?.name ?? '—', sortValue: (d) => d.employee.branch?.name ?? '' },
    { header: 'Document', render: (d) => <><strong>{d.documentType}</strong><div className="muted sm-text">{d.fileName}</div></>, sortValue: (d) => d.documentType },
    { header: 'Category', render: (d) => titleCase(d.category), sortValue: (d) => d.category },
    { header: 'Expiry', render: (d) => fmtDate(d.expiryDate), sortValue: (d) => d.expiryDate },
    { header: 'Due', render: (d) => dueBadge(d.expiryDate), sortValue: (d) => daysUntil(d.expiryDate) },
    { header: 'Verified', render: (d) => <Badge status={d.isVerified ? 'VERIFIED' : 'PENDING'}>{d.isVerified ? 'Verified' : 'Unverified'}</Badge>, sortValue: (d) => (d.isVerified ? 1 : 0) },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Administration' }, { label: 'Document Center' }]}
        title="Document Center"
        subtitle="Employee documents lapsing across the organization"
        actions={canManage && rows.length > 0 && (
          <button className="btn-lg" disabled={remind.isPending} onClick={() => remind.mutate()}>
            {remind.isPending ? <><Loader size={15} /> Sending…</> : <><CalendarOff size={15} /> Send reminders</>}
          </button>
        )}
      />

      <FilterBar
        chips={[{ key: 'within', label: `Expiring within ${within} days`, onRemove: () => setWithin(30) }]}
        onReset={within !== 30 ? () => setWithin(30) : undefined}
      >
        <label>Expiring within
          <select value={within} onChange={(e) => setWithin(Number(e.target.value))} aria-label="Expiry window">
            {WINDOWS.map((w) => <option key={w} value={w}>{w} days</option>)}
          </select>
        </label>
      </FilterBar>

      {!isLoading && rows.length === 0 ? (
        <EmptyState variant="no-data" title="Nothing expiring soon" message={`No employee documents are due to expire within ${within} days.`} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          loading={isLoading}
          empty="No expiring documents."
          searchPlaceholder="Search by employee, document or category…"
          pageSize={25}
        />
      )}
    </>
  );
}
