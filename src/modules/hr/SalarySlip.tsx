import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { Skeleton } from '../../components/Skeleton';

import { Download, Printer, Wallet } from '../../components/icons';

/** Salary-slip detail returned by GET /human-resources/payslips/:id. */
export interface PayslipDetail {
  company: { name: string; tagline: string };
  payslipId: string;
  period: { month: number; year: number };
  generatedAt: string;
  paymentStatus: string;
  paidAt: string | null;
  employee: {
    fullName: string;
    employeeCode: string;
    designation: string;
    branch: string | null;
    location: string | null;
  };
  presentDays: number;
  earnings: {
    basicSalary: number;
    houseRentAllowance: number;
    dearnessAllowance: number;
    specialAllowance: number;
    allowancesTotal: number;
    grossEarnings: number;
  };
  deductions: {
    loanDeduction: number;
    providentFund: number;
    stateInsurance: number;
    professionalTax: number;
    otherDeductions: number;
    totalDeductions: number;
  };
  loan: { loanNumber: string; emiDeducted: number; outstandingAmount: number; monthlyDeduction: number } | null;
  netPay: number;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const money = (v: number): string =>
  `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const esc = (v: unknown): string =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/** Styling shared by the on-screen slip and the standalone print/PDF window. */
const SLIP_STYLES = `
  .slip { color: #1c1e26; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; }
  .slip * { box-sizing: border-box; }
  .slip .slip-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding-bottom: 16px; border-bottom: 2px solid #1c1e26; }
  .slip .slip-brand { display: flex; align-items: center; gap: 12px; }
  .slip .slip-mark { width: 46px; height: 46px; border-radius: 10px; background: #1c1e26; color: #d8b56a; font-weight: 700; font-size: 18px; letter-spacing: .5px; display: flex; align-items: center; justify-content: center; }
  .slip .slip-co { font-size: 19px; font-weight: 700; }
  .slip .slip-tag { font-size: 12px; color: #6b7080; margin-top: 2px; }
  .slip .slip-title { text-align: right; }
  .slip .slip-title h3 { margin: 0; font-size: 15px; letter-spacing: 1.5px; text-transform: uppercase; color: #6b7080; }
  .slip .slip-period { font-size: 18px; font-weight: 700; margin-top: 2px; }
  .slip .slip-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 28px; margin: 18px 0 6px; }
  .slip .slip-meta div { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; padding: 5px 0; border-bottom: 1px dashed #e4e6ee; }
  .slip .slip-meta span:first-child { color: #6b7080; }
  .slip .slip-meta span:last-child { font-weight: 600; text-align: right; }
  .slip .slip-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 18px; }
  .slip table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .slip table caption { text-align: left; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: .6px; padding: 8px 10px; background: #f4f5f8; border: 1px solid #e4e6ee; border-bottom: none; }
  .slip th, .slip td { padding: 7px 10px; border: 1px solid #e4e6ee; }
  .slip td.amt { text-align: right; font-variant-numeric: tabular-nums; }
  .slip tfoot td { font-weight: 700; background: #f9fafb; }
  .slip .slip-summary { margin-top: 18px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .slip .slip-stat { border: 1px solid #e4e6ee; border-radius: 10px; padding: 12px 14px; }
  .slip .slip-stat span { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: #6b7080; }
  .slip .slip-stat strong { font-size: 17px; }
  .slip .slip-stat.net { background: #1c1e26; border-color: #1c1e26; color: #fff; }
  .slip .slip-stat.net span { color: #d8b56a; }
  .slip .slip-foot { margin-top: 18px; font-size: 11px; color: #8a8f9e; text-align: center; border-top: 1px dashed #e4e6ee; padding-top: 10px; }
  @media print { @page { size: A4; margin: 14mm; } body { margin: 0; } }
`;

/** Builds the slip's inner HTML — shared verbatim by the modal and the print window. */
function buildSlipInner(d: PayslipDetail): string {
  const period = `${MONTHS[d.period.month - 1]} ${d.period.year}`;
  const status = d.paymentStatus === 'PAID' ? 'Paid' : d.paymentStatus === 'PROCESSED' ? 'Processed' : 'Draft';
  const meta: Array<[string, string]> = [
    ['Employee Name', esc(d.employee.fullName)],
    ['Employee ID', esc(d.employee.employeeCode)],
    ['Designation', esc(d.employee.designation)],
    ['Branch', esc(d.employee.branch ?? '—')],
    ['Location', esc(d.employee.location ?? '—')],
    ['Days Present', `${d.presentDays}`],
    ['Payment Status', status],
    ['Payment Date', fmtDate(d.paidAt) === '—' ? fmtDate(d.generatedAt) : fmtDate(d.paidAt)],
  ];

  const earningRows = ([
    ['Basic Salary', d.earnings.basicSalary],
    ['House Rent Allowance', d.earnings.houseRentAllowance],
    ['Dearness Allowance', d.earnings.dearnessAllowance],
    ['Special Allowance', d.earnings.specialAllowance],
  ] as Array<[string, number]>).filter(([, v], i) => i === 0 || v > 0);

  const deductionRows = ([
    ['Employee Loan EMI', d.deductions.loanDeduction],
    ['Provident Fund (PF)', d.deductions.providentFund],
    ['State Insurance (ESI)', d.deductions.stateInsurance],
    ['Professional Tax', d.deductions.professionalTax],
    ['Other Deductions', d.deductions.otherDeductions],
  ] as Array<[string, number]>).filter(([, v]) => v > 0);

  const row = ([label, value]: [string, number]) =>
    `<tr><td>${esc(label)}</td><td class="amt">${money(value)}</td></tr>`;

  const loanNote = d.loan
    ? `<div class="slip-meta" style="grid-template-columns:1fr;margin-top:14px"><div><span>Loan ${esc(d.loan.loanNumber)} — remaining balance after this EMI</span><span>${money(d.loan.outstandingAmount)}</span></div></div>`
    : '';

  return `
    <div class="slip-head">
      <div class="slip-brand">
        <div class="slip-mark">MF</div>
        <div><div class="slip-co">${esc(d.company.name)}</div><div class="slip-tag">${esc(d.company.tagline)}</div></div>
      </div>
      <div class="slip-title"><h3>Salary Slip</h3><div class="slip-period">${period}</div></div>
    </div>
    <div class="slip-meta">${meta.map(([k, v]) => `<div><span>${k}</span><span>${v}</span></div>`).join('')}</div>
    <div class="slip-cols">
      <table>
        <caption>Earnings</caption>
        <tbody>${earningRows.map(row).join('')}</tbody>
        <tfoot><tr><td>Gross Salary</td><td class="amt">${money(d.earnings.grossEarnings)}</td></tr></tfoot>
      </table>
      <table>
        <caption>Deductions</caption>
        <tbody>${deductionRows.length ? deductionRows.map(row).join('') : '<tr><td>No deductions</td><td class="amt">₹0.00</td></tr>'}</tbody>
        <tfoot><tr><td>Total Deductions</td><td class="amt">${money(d.deductions.totalDeductions)}</td></tr></tfoot>
      </table>
    </div>
    ${loanNote}
    <div class="slip-summary">
      <div class="slip-stat"><span>Gross Salary</span><strong>${money(d.earnings.grossEarnings)}</strong></div>
      <div class="slip-stat"><span>Total Deductions</span><strong>${money(d.deductions.totalDeductions)}</strong></div>
      <div class="slip-stat net"><span>Net Salary</span><strong>${money(d.netPay)}</strong></div>
    </div>
    <div class="slip-foot">This is a computer-generated salary slip and does not require a signature. Generated on ${fmtDate(d.generatedAt)}.</div>
  `;
}

/** Opens the slip in a standalone window and triggers the browser print dialog (Print / Save as PDF). */
function printSlip(detail: PayslipDetail): void {
  const title = `Salary Slip — ${detail.employee.fullName} — ${MONTHS[detail.period.month - 1]} ${detail.period.year}`;
  const win = window.open('', '_blank', 'width=880,height=1000');
  if (!win) return;
  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{margin:0;padding:24px;background:#fff}${SLIP_STYLES}</style></head><body><div class="slip">${buildSlipInner(detail)}</div></body></html>`,
  );
  win.document.close();
  win.focus();
  // Let styles/layout settle before invoking print so the first page renders fully.
  win.setTimeout(() => win.print(), 250);
}

// The standard PDF fonts don't carry the ₹ glyph, so the downloaded PDF uses the
// "Rs" prefix (on-screen and print keep ₹). Values stay identical.
const pdfMoney = (v: number): string =>
  `Rs ${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const INK: [number, number, number] = [28, 30, 38];
const GOLD: [number, number, number] = [216, 181, 106];
const MUTED: [number, number, number] = [107, 112, 128];
const LINE: [number, number, number] = [228, 230, 238];

/**
 * Renders the slip as a real, vector (selectable-text) PDF and downloads it.
 * jsPDF is imported dynamically so it is only fetched when a slip is actually
 * downloaded, keeping it out of the initial app bundle.
 */
async function downloadSlipPdf(d: PayslipDetail): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const M = 14;
  const RX = 196; // right content edge
  let y = 18;

  // ── Header ──
  doc.setFillColor(...INK);
  doc.roundedRect(M, y - 4, 12, 12, 2, 2, 'F');
  doc.setTextColor(...GOLD);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('MF', M + 6, y + 3.4, { align: 'center' });
  doc.setTextColor(...INK);
  doc.setFontSize(15);
  doc.text(d.company.name, M + 16, y + 1);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(d.company.tagline, M + 16, y + 6);
  doc.setFontSize(9);
  doc.text('SALARY SLIP', RX, y - 1, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text(`${MONTHS[d.period.month - 1]} ${d.period.year}`, RX, y + 5, { align: 'right' });

  y += 12;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.5);
  doc.line(M, y, RX, y);
  y += 8;

  // ── Identity grid (two columns, four rows) ──
  const status = d.paymentStatus === 'PAID' ? 'Paid' : d.paymentStatus === 'PROCESSED' ? 'Processed' : 'Draft';
  const paymentDate = d.paidAt ? fmtDate(d.paidAt) : fmtDate(d.generatedAt);
  const pairs: Array<[string, string]> = [
    ['Employee Name', d.employee.fullName],
    ['Employee ID', d.employee.employeeCode],
    ['Designation', d.employee.designation],
    ['Branch', d.employee.branch ?? '—'],
    ['Location', d.employee.location ?? '—'],
    ['Days Present', String(d.presentDays)],
    ['Payment Status', status],
    ['Payment Date', paymentDate],
  ];
  const colGap = 8;
  const colW = (RX - M - colGap) / 2;
  const cell = (x: number, label: string, value: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(label, x, y + 3.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...INK);
    doc.text(value, x + colW, y + 3.5, { align: 'right' });
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([0.6, 0.6], 0);
    doc.line(x, y + 5.5, x + colW, y + 5.5);
    doc.setLineDashPattern([], 0);
  };
  for (let r = 0; r < 4; r += 1) {
    cell(M, pairs[r * 2][0], pairs[r * 2][1]);
    cell(M + colW + colGap, pairs[r * 2 + 1][0], pairs[r * 2 + 1][1]);
    y += 7.5;
  }
  y += 3;

  // ── Earnings / Deductions tables ──
  const earnings = ([
    ['Basic Salary', d.earnings.basicSalary],
    ['House Rent Allowance', d.earnings.houseRentAllowance],
    ['Dearness Allowance', d.earnings.dearnessAllowance],
    ['Special Allowance', d.earnings.specialAllowance],
  ] as Array<[string, number]>).filter(([, v], i) => i === 0 || v > 0);
  const deductions = ([
    ['Employee Loan EMI', d.deductions.loanDeduction],
    ['Provident Fund (PF)', d.deductions.providentFund],
    ['State Insurance (ESI)', d.deductions.stateInsurance],
    ['Professional Tax', d.deductions.professionalTax],
    ['Other Deductions', d.deductions.otherDeductions],
  ] as Array<[string, number]>).filter(([, v]) => v > 0);
  const deductionRows = deductions.length ? deductions : ([['No deductions', 0]] as Array<[string, number]>);
  const ROW_H = 8;

  const table = (x: number, title: string, rows: Array<[string, number]>, footLabel: string, footVal: number): number => {
    let ty = y;
    // header
    doc.setFillColor(244, 245, 248);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.rect(x, ty, colW, ROW_H, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text(title.toUpperCase(), x + 3, ty + 5.4);
    ty += ROW_H;
    // body
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...INK);
    for (const [label, value] of rows) {
      doc.rect(x, ty, colW, ROW_H, 'S');
      doc.text(label, x + 3, ty + 5.4);
      doc.text(pdfMoney(value), x + colW - 3, ty + 5.4, { align: 'right' });
      ty += ROW_H;
    }
    // footer
    doc.setFillColor(249, 250, 251);
    doc.rect(x, ty, colW, ROW_H, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.text(footLabel, x + 3, ty + 5.4);
    doc.text(pdfMoney(footVal), x + colW - 3, ty + 5.4, { align: 'right' });
    ty += ROW_H;
    return ty;
  };

  const leftBottom = table(M, 'Earnings', earnings, 'Gross Salary', d.earnings.grossEarnings);
  const rightBottom = table(M + colW + colGap, 'Deductions', deductionRows, 'Total Deductions', d.deductions.totalDeductions);
  y = Math.max(leftBottom, rightBottom) + 8;

  if (d.loan) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(
      `Loan ${d.loan.loanNumber} — remaining balance after this EMI: ${pdfMoney(d.loan.outstandingAmount)}`,
      M,
      y,
    );
    y += 6;
  }

  // ── Summary cards ──
  const cardGap = 6;
  const cardW = (RX - M - 2 * cardGap) / 3;
  const cardH = 18;
  const card = (x: number, label: string, value: number, filled: boolean) => {
    if (filled) {
      doc.setFillColor(...INK);
      doc.roundedRect(x, y, cardW, cardH, 2, 2, 'F');
      doc.setTextColor(...GOLD);
    } else {
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, y, cardW, cardH, 2, 2, 'S');
      doc.setTextColor(...MUTED);
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(label.toUpperCase(), x + 4, y + 6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...(filled ? ([255, 255, 255] as [number, number, number]) : INK));
    doc.text(pdfMoney(value), x + 4, y + 13);
  };
  card(M, 'Gross Salary', d.earnings.grossEarnings, false);
  card(M + cardW + cardGap, 'Total Deductions', d.deductions.totalDeductions, false);
  card(M + 2 * (cardW + cardGap), 'Net Salary', d.netPay, true);
  y += cardH + 8;

  // ── Footer note ──
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(
    `This is a computer-generated salary slip and does not require a signature. Generated on ${fmtDate(d.generatedAt)}.`,
    (M + RX) / 2,
    y,
    { align: 'center' },
  );

  const safeName = d.employee.fullName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  doc.save(`Salary-Slip-${safeName}-${MONTHS[d.period.month - 1]}-${d.period.year}.pdf`);
}

export function SalarySlip({ payslipId, onClose }: { payslipId: string; onClose: () => void }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['/human-resources/payslips', payslipId],
    queryFn: () => api.get(`/human-resources/payslips/${payslipId}`).then((r) => r.data.data as PayslipDetail),
  });

  return (
    <Modal
      size="lg"
      onClose={onClose}
      icon={<Wallet size={20} />}
      title="Salary Slip"
      subtitle={data ? `${data.employee.fullName} · ${data.employee.employeeCode}` : 'Loading…'}
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>Close</button>
          <button type="button" className="ghost" disabled={!data} onClick={() => data && printSlip(data)}>
            <Printer size={15} /> Print
          </button>
          <button type="button" disabled={!data} onClick={() => { if (data) void downloadSlipPdf(data); }}>
            <Download size={15} /> Download PDF
          </button>
        </>
      }
    >
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
    </Modal>
  );
}
