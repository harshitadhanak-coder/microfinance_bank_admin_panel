import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/Card';
import ImportModal from '../../components/ImportModal';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';

/**
 * Loans — Import. Dedicated page for bulk-importing loans from a spreadsheet.
 * Hosts the shared ImportModal flow (template → upload → per-row result) as the
 * page's primary content rather than a modal launched off the list.
 */
export default function LoanImportPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canCreate = can(user?.role, 'loan:create');

  const refresh = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/loans') });

  if (!canCreate) return <p className="muted">You do not have permission to import loans.</p>;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Operations' }, { label: 'Loans', to: '/loans' }, { label: 'Import' }]}
        title="Import loans"
        subtitle="Bulk-create disbursed loans from a .csv or .xlsx file"
      />
      <Card>
        <ImportModal
          inline
          title="Import loans"
          endpoint="/loans/import"
          templateName="loans-template.csv"
          columns={[
            { field: 'clientCode', header: 'clientCode', example: 'CL-ABC12-3456', required: true },
            { field: 'productName', header: 'productName', example: 'Micro Business Loan', required: true },
            { field: 'requestedAmount', header: 'requestedAmount', example: '50000', required: true, numeric: true },
            { field: 'tenureMonths', header: 'tenureMonths', example: '12', required: true, numeric: true },
            { field: 'purpose', header: 'purpose', example: 'Working capital' },
            { field: 'officerCode', header: 'officerCode', example: 'EMP-XXXX-0000' },
          ]}
          onClose={() => navigate('/loans')}
          onDone={refresh}
        />
      </Card>
    </>
  );
}
