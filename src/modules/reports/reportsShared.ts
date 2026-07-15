import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { inr, fmtDate } from '../../lib/format';

/**
 * Shared report model, formatters and exporters — extracted from the old
 * single-page Reports screen so the catalog (`/reports`) and the per-report
 * runner (`/reports/:reportKey`) share one implementation.
 */

export type FilterKey = 'dateRange' | 'branch' | 'department' | 'employee' | 'month' | 'year';
export type ColumnType = 'text' | 'number' | 'currency' | 'date' | 'datetime' | 'percent';
export type Category = 'EMPLOYEE' | 'ATTENDANCE' | 'LEAVE' | 'PAYROLL' | 'DASHBOARD';

export interface CatalogItem { key: string; title: string; category: Category; description: string; filters: FilterKey[] }
export interface ReportColumn { key: string; label: string; type?: ColumnType }
export interface SummaryItem { label: string; value: unknown; type?: ColumnType }
export interface ReportData { key: string; title: string; columns: ReportColumn[]; rows: Record<string, unknown>[]; summary?: SummaryItem[] }

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const CATEGORY_ORDER: Category[] = ['EMPLOYEE', 'ATTENDANCE', 'LEAVE', 'PAYROLL', 'DASHBOARD'];
export const CATEGORY_LABEL: Record<Category, string> = {
  EMPLOYEE: 'Employee', ATTENDANCE: 'Attendance', LEAVE: 'Leave', PAYROLL: 'Payroll', DASHBOARD: 'Dashboard',
};

/** Rows above this size trigger a confirm before a client-side (in-memory) export. */
export const LARGE_EXPORT_THRESHOLD = 5000;

const asNumber = (value: unknown): number => {
  const n = typeof value === 'string' ? Number(value) : (value as number);
  return Number.isFinite(n) ? n : 0;
};

const fmtDateTime = (value: unknown): string => {
  if (!value) return '—';
  const d = new Date(value as string);
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const displayCell = (value: unknown, type?: ColumnType): string => {
  if (value === null || value === undefined || value === '') return '—';
  switch (type) {
    case 'currency': return inr(value as number | string);
    case 'date': return fmtDate(value as string);
    case 'datetime': return fmtDateTime(value);
    default: return String(value);
  }
};

export const sortCell = (value: unknown, type?: ColumnType): string | number => {
  switch (type) {
    case 'currency': case 'number': case 'percent': return asNumber(value);
    case 'date': case 'datetime': return value ? new Date(value as string).getTime() : 0;
    default: return value == null ? '' : String(value);
  }
};

const exportValue = (value: unknown, type?: ColumnType): string | number => {
  if (value === null || value === undefined || value === '') return '';
  switch (type) {
    case 'currency': case 'number': case 'percent': return asNumber(value);
    case 'date': return fmtDate(value as string);
    case 'datetime': return fmtDateTime(value);
    default: return String(value);
  }
};

export const summaryValue = (item: SummaryItem): string =>
  item.type === 'currency' ? inr(item.value as number | string) : String(item.value ?? '—');

const stamp = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const triggerDownload = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
};

const csvField = (value: string | number): string => {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportCsv(report: ReportData): void {
  const header = report.columns.map((c) => csvField(c.label)).join(',');
  const body = report.rows.map((row) => report.columns.map((c) => csvField(exportValue(row[c.key], c.type))).join(',')).join('\r\n');
  triggerDownload(new Blob([`${header}\r\n${body}`], { type: 'text/csv;charset=utf-8;' }), `${report.key}-${stamp()}.csv`);
}

export function exportExcel(report: ReportData): void {
  const data = report.rows.map((row) => {
    const out: Record<string, string | number> = {};
    for (const c of report.columns) out[c.label] = exportValue(row[c.key], c.type);
    return out;
  });
  const ws = XLSX.utils.json_to_sheet(data, { header: report.columns.map((c) => c.label) });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${report.key}.xlsx`);
}

const pdfCell = (value: unknown, type?: ColumnType): string => {
  if (value === null || value === undefined || value === '') return '';
  if (type === 'currency') return `Rs ${asNumber(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  if (type === 'date') return fmtDate(value as string);
  if (type === 'datetime') return fmtDateTime(value);
  return String(value);
};

export function exportPdf(report: ReportData, periodLine: string): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const M = 12;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const RX = pageW - M;
  const usableW = RX - M;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(28, 30, 38);
  doc.text(report.title, M, 16);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(107, 112, 128);
  if (periodLine) doc.text(periodLine, M, 22);

  const cols = report.columns;
  const colW = usableW / Math.max(cols.length, 1);
  const ROW_H = 7;
  let y = periodLine ? 28 : 24;

  const drawHeader = () => {
    doc.setFillColor(244, 245, 248); doc.setDrawColor(228, 230, 238); doc.setLineWidth(0.2);
    doc.rect(M, y, usableW, ROW_H, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(28, 30, 38);
    cols.forEach((c, i) => { const text = doc.splitTextToSize(c.label, colW - 2)[0] as string; doc.text(text, M + i * colW + 1.5, y + 4.7); });
    y += ROW_H;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(28, 30, 38);
  };

  drawHeader();
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);

  for (const row of report.rows) {
    if (y + ROW_H > pageH - M) { doc.addPage(); y = M + 4; drawHeader(); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); }
    doc.setDrawColor(228, 230, 238); doc.setLineWidth(0.15);
    doc.rect(M, y, usableW, ROW_H, 'S');
    cols.forEach((c, i) => { const raw = pdfCell(row[c.key], c.type); const text = doc.splitTextToSize(raw, colW - 2)[0] as string; doc.text(text ?? '', M + i * colW + 1.5, y + 4.7); });
    y += ROW_H;
  }

  if (report.rows.length === 0) { doc.setTextColor(107, 112, 128); doc.text('No data for the selected filters.', M, y + 5); }
  doc.save(`${report.key}.pdf`);
}
