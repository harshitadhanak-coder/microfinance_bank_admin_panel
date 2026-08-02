import { amountInWords } from '../../lib/format';

/**
 * Salary-slip rendering library: the shared HTML/CSS builder plus print and
 * vector-PDF exporters. Consumed by the printable Salary Slip page
 * (SalarySlipPage) — no React component lives here.
 *
 * The layout reproduces the client's reference workbook ("Salary Slip" sheet of
 * Staff Master Data-2026.xlsx): a single bordered grid of five columns — company
 * banner, pay-period line, a two-up employee block, an Earnings
 * (Particulars / TFP PM / Total) vs Deductions (Particulars / Amount) split, the
 * totals row, the net-payable-in-words line, and the payment-details block.
 *
 * "TFP PM" is the contracted monthly figure and "Total" what was actually earned
 * in the month; they diverge whenever the month was prorated for loss of pay.
 */

/** Salary-slip detail returned by GET /human-resources/payslips/:id. */
export interface PayslipDetail {
  company: { name: string; tagline: string; addressLine: string };
  payslipId: string;
  period: { month: number; year: number };
  generatedAt: string;
  paymentStatus: string;
  paidAt: string | null;
  employee: {
    fullName: string;
    employeeCode: string;
    designation: string;
    department: string | null;
    branch: string | null;
    location: string | null;
    dateOfBirth: string | null;
    joiningDate: string;
    grade: string | null;
    uanNumber: string | null;
    providentFundNumber: string | null;
    stateInsuranceNumber: string | null;
    bankName: string | null;
    bankIfscCode: string | null;
    bankAccountMasked: string | null;
    panMasked: string | null;
  };
  attendance: {
    standardDays: number;
    presentDays: number;
    paidLeaveDays: number;
    lwpDays: number;
    lossOfPayDays: number;
    holidayDays: number;
    weeklyOffDays: number;
    lateCount: number;
    overtimeHours: number;
  };
  earnings: {
    basicEarned: number;
    houseRentAllowance: number;
    dearnessAllowance: number;
    conveyanceAllowance: number;
    medicalAllowance: number;
    travelAllowance: number;
    specialAllowance: number;
    foodAllowance: number;
    mobileAllowance: number;
    otherAllowance: number;
    overtimePay: number;
    incentive: number;
    bonus: number;
    grossEarnings: number;
  };
  /** Contracted monthly ("TFP PM") counterpart of each earnings component. */
  monthly: Omit<PayslipDetail['earnings'], 'grossEarnings'>;
  /** Statutory rates, so PF/ESIC labels can quote the basis they were charged on. */
  rates: { pfRate: number; esiRate: number };
  deductions: {
    providentFund: number;
    stateInsurance: number;
    professionalTax: number;
    taxDeductedAtSource: number;
    loanDeduction: number;
    salaryAdvanceRecovery: number;
    lateDeduction: number;
    otherDeductions: number;
    totalDeductions: number;
  };
  lossOfPayAmount: number;
  loan: { loanNumber: string; emiDeducted: number; outstandingAmount: number; monthlyDeduction: number } | null;
  salaryAdvance: { recovered: number; outstandingAmount: number; monthlyRecovery: number } | null;
  netPay: number;
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Amounts print unprefixed, exactly as the reference sheet does — the slip
 * states its currency once, in the net-payable line. Keeping the symbol out of
 * the grid also means the HTML and the PDF render identical figures (the PDF's
 * standard fonts carry no ₹ glyph).
 */
const money = (v: number): string =>
  Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Day counts print as whole numbers unless the payslip carries a half day. */
const days = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1));

const esc = (v: unknown): string =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

/** Paid days is the standard month less any loss of pay — the reference's "Paid Dayes". */
const paidDays = (d: PayslipDetail): number =>
  Math.max(0, d.attendance.standardDays - d.attendance.lossOfPayDays);

/**
 * The two-up identity block, in the reference sheet's order: left column reads
 * down the employee's identity, right column their dates and day counts.
 */
export const identityPairs = (d: PayslipDetail): Array<[string, string]> => [
  [`Employee Name: ${d.employee.fullName}`, `Date of Joining: ${fmtDate(d.employee.joiningDate)}`],
  [`EMP. ID: ${d.employee.employeeCode}`, `Date of Birth: ${fmtDate(d.employee.dateOfBirth)}`],
  [`Designation: ${d.employee.designation}`, `Total Days: ${days(d.attendance.standardDays)}`],
  [`Grade: ${d.employee.grade ?? '—'}`, `Paid Days: ${days(paidDays(d))}`],
  [`PAN Number: ${d.employee.panMasked ?? '—'}`, `LOP Days: ${days(d.attendance.lossOfPayDays)}`],
];

/** An earnings line: label, contracted monthly ("TFP PM"), earned this month. */
export interface EarningRow { label: string; monthly: number; total: number }

/**
 * Earnings in the reference sheet's order, then the remaining components. Basic
 * always prints; every other line appears only when it carries a value in either
 * column, so a contracted allowance fully wiped out by LOP still shows (at 0)
 * rather than vanishing without explanation.
 */
export const earningRows = (d: PayslipDetail): EarningRow[] => {
  const keys: Array<[string, keyof PayslipDetail['monthly']]> = [
    ['Basic', 'basicEarned'],
    ['HRA', 'houseRentAllowance'],
    ['Monthly Bonus', 'bonus'],
    ['Traveling Allowance', 'travelAllowance'],
    ['Special Allowance', 'specialAllowance'],
    ['Dearness Allowance', 'dearnessAllowance'],
    ['Conveyance Allowance', 'conveyanceAllowance'],
    ['Medical Allowance', 'medicalAllowance'],
    ['Food Allowance', 'foodAllowance'],
    ['Mobile Allowance', 'mobileAllowance'],
    ['Other Allowance', 'otherAllowance'],
    ['Overtime Pay', 'overtimePay'],
    ['Incentive', 'incentive'],
  ];
  return keys
    .map(([label, key]) => ({ label, monthly: d.monthly[key], total: d.earnings[key] }))
    .filter((r, i) => i === 0 || r.monthly > 0 || r.total > 0);
};

const pct = (rate: number): string => `${(rate * 100).toFixed(2)} %`;

/**
 * Deduction lines, only those actually charged. Loss of pay is deliberately not
 * a line here: payroll prorates the earnings columns instead of deducting from a
 * full month, so an LOP row would double-count and stop the column summing to
 * Total Deductions. It is reported as "LOP Days" in the identity block and,
 * when it bit, as an amount in the note beneath the totals.
 */
export const deductionRows = (d: PayslipDetail): Array<[string, number]> =>
  ([
    [`PF (Basic @ ${pct(d.rates.pfRate)})`, d.deductions.providentFund],
    [`ESIC (Gross @ ${pct(d.rates.esiRate)})`, d.deductions.stateInsurance],
    ['PT (on Gross)', d.deductions.professionalTax],
    ['TDS', d.deductions.taxDeductedAtSource],
    ['Loan EMI', d.deductions.loanDeduction],
    ['Advance', d.deductions.salaryAdvanceRecovery],
    ['Late Deduction', d.deductions.lateDeduction],
    ['Other Deductions', d.deductions.otherDeductions],
  ] as Array<[string, number]>).filter(([, v]) => v > 0);

/** The net-payable sentence, in the reference sheet's wording. */
export const netPayableLine = (d: PayslipDetail): string =>
  `Net Payable Amount - ${money(d.netPay)}  (INR ${amountInWords(d.netPay)})`;

/** Payment-details rows: [left, right] pairs under the "Payment Details" banner. */
export const paymentPairs = (d: PayslipDetail): Array<[string, string]> => [
  ['Payment Mode: Bank', `Account Number: ${d.employee.bankAccountMasked ?? '—'}`],
  [`Bank Name: ${d.employee.bankName ?? '—'}`, `IFSC Code: ${d.employee.bankIfscCode ?? '—'}`],
];

/** Loan / advance / LOP notes printed under the totals. */
export const slipNotes = (d: PayslipDetail): string[] => {
  const notes: string[] = [];
  if (d.lossOfPayAmount > 0) {
    notes.push(`Loss of pay: ${money(d.lossOfPayAmount)} for ${days(d.attendance.lossOfPayDays)} day(s) — earnings above are already prorated.`);
  }
  if (d.loan) notes.push(`Loan ${d.loan.loanNumber} — EMI ${money(d.loan.emiDeducted)} deducted; balance ${money(d.loan.outstandingAmount)}.`);
  if (d.salaryAdvance) notes.push(`Salary advance — ${money(d.salaryAdvance.recovered)} recovered; balance ${money(d.salaryAdvance.outstandingAmount)}.`);
  return notes;
};

// Column proportions carried over from the reference sheet's widths
// (B 22.71, C 20.43, D 24.14, E 30.14, F 17.29 characters).
const COL_WEIGHTS = [22.71, 20.43, 24.14, 30.14, 17.29];
const COL_TOTAL = COL_WEIGHTS.reduce((a, b) => a + b, 0);
const COL_PCT = COL_WEIGHTS.map((w) => (w / COL_TOTAL) * 100);

/** Styling shared by the on-screen slip and the standalone print/PDF window. */
export const SLIP_STYLES = `
  /* Fills whatever it is placed in rather than sitting at a fixed width — on the
     slip page that is the full content card, so the grid reaches both edges
     instead of floating in the middle of it. Column proportions are percentages,
     so widening the container widens the columns and leaves the layout intact. */
  .slip { color: #000; font-family: Arial, Helvetica, sans-serif; width: 100%; }
  .slip * { box-sizing: border-box; }
  .slip table.slip-grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .slip table.slip-grid td { border: 1px solid #000; padding: 5px 8px; font-size: 12.5px; vertical-align: middle; }
  .slip .co-name { font-family: 'Arial Black', Arial, sans-serif; font-size: 20px; text-align: center; letter-spacing: .5px; padding: 10px 8px; }
  .slip .co-addr { font-family: Verdana, Arial, sans-serif; font-size: 12px; font-weight: 700; text-align: center; }
  .slip .period { font-family: 'Arial Black', Arial, sans-serif; font-size: 15px; padding: 8px; }
  .slip .band { font-family: 'Arial Black', Arial, sans-serif; font-size: 15px; padding: 8px; }
  .slip .sub-band { font-family: 'Arial Black', Arial, sans-serif; font-size: 13px; background: #ddebf7; }
  .slip .col-head { font-family: 'Arial Black', Arial, sans-serif; font-size: 12px; background: #eeece1; }
  .slip .amt { text-align: right; font-variant-numeric: tabular-nums; }
  .slip .tot { font-weight: 700; background: #f2f2f2; }
  .slip .net { font-weight: 700; font-size: 13.5px; padding: 8px; }
  .slip .spacer td { border: none; height: 8px; padding: 0; }
  .slip .note { font-size: 11.5px; color: #333; }
  .slip .foot { font-size: 11px; text-align: center; font-style: italic; }
  @media print { @page { size: A4 portrait; margin: 12mm; } body { margin: 0; } }
`;

/** Builds the slip's inner HTML — shared verbatim by the on-screen slip and the print window. */
export function buildSlipInner(d: PayslipDetail): string {
  const period = `${MONTHS[d.period.month - 1]} - ${d.period.year}`.toUpperCase();

  const earnings = earningRows(d);
  const deductions = deductionRows(d);
  // The two columns are one grid, so the shorter side is padded with blank
  // cells rather than left ragged — matching the reference sheet.
  const bodyRows = Math.max(earnings.length, deductions.length);

  const colgroup = `<colgroup>${COL_PCT.map((p) => `<col style="width:${p.toFixed(2)}%">`).join('')}</colgroup>`;
  const full = (cls: string, html: string) => `<tr><td class="${cls}" colspan="5">${html}</td></tr>`;
  const twoUp = (cls: string, left: string, right: string) =>
    `<tr><td class="${cls}" colspan="3">${left}</td><td class="${cls}" colspan="2">${right}</td></tr>`;
  const spacer = '<tr class="spacer"><td colspan="5"></td></tr>';

  const grid = (): string => {
    const rows: string[] = [];
    for (let i = 0; i < bodyRows; i += 1) {
      const e = earnings[i];
      const x = deductions[i];
      rows.push(
        '<tr>' +
        (e ? `<td>${esc(e.label)}</td><td class="amt">${money(e.monthly)}</td><td class="amt">${money(e.total)}</td>`
           : '<td></td><td></td><td></td>') +
        (x ? `<td>${esc(x[0])}</td><td class="amt">${money(x[1])}</td>`
           : '<td></td><td></td>') +
        '</tr>',
      );
    }
    return rows.join('');
  };

  const notes = slipNotes(d).map((n) => full('note', esc(n))).join('');

  return `
    <table class="slip-grid">
      ${colgroup}
      ${full('co-name', esc(d.company.name))}
      ${d.company.addressLine ? full('co-addr', esc(d.company.addressLine)) : ''}
      ${full('period', `Pay Slip for the month of ${esc(period)}`)}
      ${spacer}
      ${identityPairs(d).map(([l, r]) => twoUp('', esc(l), esc(r))).join('')}
      ${spacer}
      ${full('band', 'Salary Details')}
      <tr>
        <td class="sub-band" colspan="3">Earnings</td>
        <td class="sub-band" colspan="2">Deductions</td>
      </tr>
      <tr>
        <td class="col-head">Particulars</td>
        <td class="col-head amt">TFP PM</td>
        <td class="col-head amt">Total</td>
        <td class="col-head">Particulars</td>
        <td class="col-head amt">Amount</td>
      </tr>
      ${grid()}
      <tr>
        <td class="tot" colspan="2">Total Earning</td>
        <td class="tot amt">${money(d.earnings.grossEarnings)}</td>
        <td class="tot">Total Deductions</td>
        <td class="tot amt">${money(d.deductions.totalDeductions)}</td>
      </tr>
      ${notes}
      ${spacer}
      ${full('net', esc(netPayableLine(d)))}
      ${full('band', 'Payment Details')}
      ${paymentPairs(d).map(([l, r]) => twoUp('', esc(l), esc(r))).join('')}
      ${full('foot', `For any queries and clarification on this pay slip please contact your respective HR. Generated on ${esc(fmtDate(d.generatedAt))}.`)}
    </table>
  `;
}

/** Opens the slip in a standalone window and triggers the browser print dialog (Print / Save as PDF). */
export function printSlip(detail: PayslipDetail): void {
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

// ── Vector PDF ──────────────────────────────────────────────────────────────

const INK: [number, number, number] = [0, 0, 0];
const BAND: [number, number, number] = [221, 235, 247]; // sub-band blue, as in the sheet
const HEAD: [number, number, number] = [238, 236, 225]; // column-header beige
const TOTAL_FILL: [number, number, number] = [242, 242, 242];

/**
 * Renders the slip as a real, vector (selectable-text) PDF and downloads it,
 * drawing the same five-column grid as the HTML so print and download match.
 * jsPDF is imported dynamically so it is only fetched when a slip is actually
 * downloaded, keeping it out of the initial app bundle.
 */
export async function downloadSlipPdf(d: PayslipDetail): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  const M = 12; // left margin
  const W = 186; // grid width (A4 210 − 2×12)
  const widths = COL_PCT.map((p) => (p / 100) * W);
  // x offset of each column, plus the right edge as the final entry.
  const x: number[] = widths.reduce<number[]>((acc, w) => [...acc, acc[acc.length - 1]! + w], [M]);
  let y = 14;

  doc.setLineWidth(0.2);
  doc.setDrawColor(...INK);
  doc.setTextColor(...INK);

  /** One grid row: cells are [text, colspan, align]. Returns the new y. */
  type Cell = { text: string; span: number; align?: 'left' | 'right'; bold?: boolean; size?: number; fill?: [number, number, number]; center?: boolean };
  const row = (cells: Cell[], height = 6.5) => {
    let col = 0;
    for (const c of cells) {
      const left = x[col]!;
      const width = x[col + c.span]! - left;
      if (c.fill) {
        doc.setFillColor(...c.fill);
        doc.rect(left, y, width, height, 'FD');
      } else {
        doc.rect(left, y, width, height, 'S');
      }
      doc.setFont('helvetica', c.bold ? 'bold' : 'normal');
      doc.setFontSize(c.size ?? 8.5);
      const baseline = y + height / 2 + (c.size ?? 8.5) * 0.12;
      if (c.center) doc.text(c.text, left + width / 2, baseline, { align: 'center' });
      else if (c.align === 'right') doc.text(c.text, left + width - 2, baseline, { align: 'right' });
      else doc.text(c.text, left + 2, baseline);
      col += c.span;
    }
    y += height;
  };
  const gap = (h = 2.5) => { y += h; };

  // ── Banner ──
  row([{ text: d.company.name, span: 5, bold: true, size: 14, center: true }], 10);
  if (d.company.addressLine) row([{ text: d.company.addressLine, span: 5, bold: true, size: 8.5, center: true }]);
  row([{ text: `Pay Slip for the month of ${`${MONTHS[d.period.month - 1]} - ${d.period.year}`.toUpperCase()}`, span: 5, bold: true, size: 11 }], 8);
  gap();

  // ── Identity ──
  for (const [left, right] of identityPairs(d)) {
    row([{ text: left, span: 3 }, { text: right, span: 2 }]);
  }
  gap();

  // ── Salary details ──
  row([{ text: 'Salary Details', span: 5, bold: true, size: 11 }], 8);
  row([
    { text: 'Earnings', span: 3, bold: true, size: 9.5, fill: BAND },
    { text: 'Deductions', span: 2, bold: true, size: 9.5, fill: BAND },
  ]);
  row([
    { text: 'Particulars', span: 1, bold: true, size: 8, fill: HEAD },
    { text: 'TFP PM', span: 1, bold: true, size: 8, align: 'right', fill: HEAD },
    { text: 'Total', span: 1, bold: true, size: 8, align: 'right', fill: HEAD },
    { text: 'Particulars', span: 1, bold: true, size: 8, fill: HEAD },
    { text: 'Amount', span: 1, bold: true, size: 8, align: 'right', fill: HEAD },
  ]);

  const earnings = earningRows(d);
  const deductions = deductionRows(d);
  for (let i = 0; i < Math.max(earnings.length, deductions.length); i += 1) {
    const e = earnings[i];
    const x2 = deductions[i];
    row([
      { text: e?.label ?? '', span: 1 },
      { text: e ? money(e.monthly) : '', span: 1, align: 'right' },
      { text: e ? money(e.total) : '', span: 1, align: 'right' },
      { text: x2?.[0] ?? '', span: 1 },
      { text: x2 ? money(x2[1]) : '', span: 1, align: 'right' },
    ]);
  }
  row([
    { text: 'Total Earning', span: 2, bold: true, fill: TOTAL_FILL },
    { text: money(d.earnings.grossEarnings), span: 1, bold: true, align: 'right', fill: TOTAL_FILL },
    { text: 'Total Deductions', span: 1, bold: true, fill: TOTAL_FILL },
    { text: money(d.deductions.totalDeductions), span: 1, bold: true, align: 'right', fill: TOTAL_FILL },
  ]);

  for (const note of slipNotes(d)) row([{ text: note, span: 5, size: 7.5 }], 5.5);
  gap();

  // ── Net payable + payment details ──
  row([{ text: netPayableLine(d), span: 5, bold: true, size: 10 }], 8);
  row([{ text: 'Payment Details', span: 5, bold: true, size: 11 }], 8);
  for (const [left, right] of paymentPairs(d)) {
    row([{ text: left, span: 3 }, { text: right, span: 2 }]);
  }
  row([{ text: `For any queries and clarification on this pay slip please contact your respective HR. Generated on ${fmtDate(d.generatedAt)}.`, span: 5, size: 7.5, center: true }]);

  const safeName = d.employee.fullName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  doc.save(`Salary-Slip-${safeName}-${MONTHS[d.period.month - 1]}-${d.period.year}.pdf`);
}
