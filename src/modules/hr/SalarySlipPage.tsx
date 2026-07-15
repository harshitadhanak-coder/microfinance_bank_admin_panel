import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/Card';
import { Skeleton } from '../../components/Skeleton';
import { Download, Printer } from '../../components/icons';
import {
  PayslipDetail, MONTHS, SLIP_STYLES, buildSlipInner, printSlip, downloadSlipPdf,
} from './SalarySlip';

/**
 * Salary Slip — printable page (route `/payroll/slip/:id`), replacing the old
 * slip modal. The slip renders full-width with Print (browser dialog) and
 * Download PDF (vector jsPDF) actions in the page header.
 */
export default function SalarySlipPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['/human-resources/payslips', id],
    queryFn: () => api.get(`/human-resources/payslips/${id}`).then((r) => r.data.data as PayslipDetail),
  });

  const period = data ? `${MONTHS[data.period.month - 1]} ${data.period.year}` : '';

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Payroll & Finance' }, { label: 'Payroll', to: '/payroll' }, { label: 'Salary slip' }]}
        title="Salary slip"
        subtitle={data ? `${data.employee.fullName} · ${data.employee.employeeCode} · ${period}` : 'Loading…'}
        actions={(
          <>
            <button type="button" className="ghost" onClick={() => navigate(-1)}>Back</button>
            <button type="button" className="ghost" disabled={!data} onClick={() => data && printSlip(data)}>
              <Printer size={15} /> Print
            </button>
            <button type="button" className="btn-lg" disabled={!data} onClick={() => { if (data) void downloadSlipPdf(data); }}>
              <Download size={15} /> Download PDF
            </button>
          </>
        )}
      />

      <Card>
        {isLoading && (
          <div style={{ display: 'grid', gap: 12 }}>
            <Skeleton height={48} />
            <Skeleton height={120} />
            <Skeleton height={140} />
          </div>
        )}
        {isError && <div className="error-box">Could not load this salary slip.</div>}
        {data && (
          <div
            className="salary-slip-doc"
            // Content is built from our own API response and every value is escaped in buildSlipInner.
            dangerouslySetInnerHTML={{ __html: `<style>${SLIP_STYLES}</style><div class="slip">${buildSlipInner(data)}</div>` }}
          />
        )}
      </Card>
    </>
  );
}
