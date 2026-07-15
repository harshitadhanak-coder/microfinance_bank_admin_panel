import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { FileSpreadsheet, Download, Printer } from '../../components/icons';
import { inr, fmtDate, apiMessage } from '../../lib/format';
import { useToast } from '../../components/Toast';
import { useAuth } from '../auth/AuthContext';

type FilterKey = 'dateRange' | 'branch' | 'department' | 'employee' | 'month' | 'year';
type ColumnType = 'text' | 'number' | 'currency' | 'date' | 'datetime' | 'percent';
type Category = 'EMPLOYEE' | 'ATTENDANCE' | 'LEAVE' | 'PAYROLL' | 'DASHBOARD';

interface CatalogItem {
  key: string;
  title: string;
  category: Category;
  description: string;
  filters: FilterKey[];
}

interface ReportColumn {
  key: string;
  label: string;
  type?: ColumnType;
}

interface SummaryItem {
  label: string;
  value: unknown;
  type?: ColumnType;
}

interface ReportData {
  key: string;
  title: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  summary?: SummaryItem[];
}

interface BranchOption { id: string; name: string }
interface DepartmentOption { id: string; name: string }
interface EmployeeOption { id: string; fullName: string; employeeCode: string }

type TableRow = Record<string, unknown> & { id: string };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CATEGORY_ORDER: Category[] = ['EMPLOYEE', 'ATTENDANCE', 'LEAVE', 'PAYROLL', 'DASHBOARD'];
const CATEGORY_LABEL: Record<Category, string> = {
  EMPLOYEE: 'Employee',
  ATTENDANCE: 'Attendance',
  LEAVE: 'Leave',
  PAYROLL: 'Payroll',
  DASHBOARD: 'Dashboard',
};

/** Numeric coercion tolerant of strings/nullish, used for currency/number sort + export. */
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

/** Cell text for on-screen display, by column type. */
const displayCell = (value: unknown, type?: ColumnType): string => {
  if (value === null || value === undefined || value === '') return '—';
  switch (type) {
    case 'currency': return inr(value as number | string);
    case 'date': return fmtDate(value as string);
    case 'datetime': return fmtDateTime(value);
    default: return String(value);
  }
};

/** Comparable value for DataTable sort/search, by column type. */
const sortCell = (value: unknown, type?: ColumnType): string | number => {
  switch (type) {
    case 'currency':
    case 'number':
    case 'percent':
      return asNumber(value);
    case 'date':
    case 'datetime':
      return value ? new Date(value as string).getTime() : 0;
    default:
      return value == null ? '' : String(value);
  }
};

/** Export value: keep currency/number/percent numeric so Excel can sum; format dates. */
const exportValue = (value: unknown, type?: ColumnType): string | number => {
  if (value === null || value === undefined || value === '') return '';
  switch (type) {
    case 'currency':
    case 'number':
    case 'percent':
      return asNumber(value);
    case 'date': return fmtDate(value as string);
    case 'datetime': return fmtDateTime(value);
    default: return String(value);
  }
};

const summaryValue = (item: SummaryItem): string =>
  item.type === 'currency' ? inr(item.value as number | string) : String(item.value ?? '—');

const stamp = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const triggerDownload = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const csvField = (value: string | number): string => {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function exportCsv(report: ReportData): void {
  const header = report.columns.map((c) => csvField(c.label)).join(',');
  const body = report.rows
    .map((row) => report.columns.map((c) => csvField(exportValue(row[c.key], c.type))).join(','))
    .join('\r\n');
  const csv = `${header}\r\n${body}`;
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `${report.key}-${stamp()}.csv`);
}

function exportExcel(report: ReportData): void {
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

/** PDF currency uses "Rs " because jsPDF's default font can't render the ₹ glyph. */
const pdfCell = (value: unknown, type?: ColumnType): string => {
  if (value === null || value === undefined || value === '') return '';
  if (type === 'currency') return `Rs ${asNumber(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  if (type === 'date') return fmtDate(value as string);
  if (type === 'datetime') return fmtDateTime(value);
  return String(value);
};

function exportPdf(report: ReportData, periodLine: string): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const M = 12;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const RX = pageW - M;
  const usableW = RX - M;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(28, 30, 38);
  doc.text(report.title, M, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(107, 112, 128);
  if (periodLine) doc.text(periodLine, M, 22);

  const cols = report.columns;
  const colW = usableW / Math.max(cols.length, 1);
  const ROW_H = 7;
  let y = periodLine ? 28 : 24;

  const drawHeader = () => {
    doc.setFillColor(244, 245, 248);
    doc.setDrawColor(228, 230, 238);
    doc.setLineWidth(0.2);
    doc.rect(M, y, usableW, ROW_H, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(28, 30, 38);
    cols.forEach((c, i) => {
      const text = doc.splitTextToSize(c.label, colW - 2)[0] as string;
      doc.text(text, M + i * colW + 1.5, y + 4.7);
    });
    y += ROW_H;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(28, 30, 38);
  };

  drawHeader();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);

  for (const row of report.rows) {
    if (y + ROW_H > pageH - M) {
      doc.addPage();
      y = M + 4;
      drawHeader();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
    }
    doc.setDrawColor(228, 230, 238);
    doc.setLineWidth(0.15);
    doc.rect(M, y, usableW, ROW_H, 'S');
    cols.forEach((c, i) => {
      const raw = pdfCell(row[c.key], c.type);
      const text = doc.splitTextToSize(raw, colW - 2)[0] as string;
      doc.text(text ?? '', M + i * colW + 1.5, y + 4.7);
    });
    y += ROW_H;
  }

  if (report.rows.length === 0) {
    doc.setTextColor(107, 112, 128);
    doc.text('No data for the selected filters.', M, y + 5);
  }

  doc.save(`${report.key}.pdf`);
}

export default function ReportsPage() {
  const toast = useToast();
  const { user } = useAuth();
  const now = new Date();

  const [selectedKey, setSelectedKey] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [branchId, setBranchId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const catalogQuery = useQuery({
    queryKey: ['/human-resources/reports/catalog'],
    queryFn: () => api.get('/human-resources/reports/catalog').then((r) => r.data.data as CatalogItem[]),
  });

  const branchesQuery = useQuery({
    queryKey: ['/branches', 'reports-filter'],
    queryFn: () => api.get('/branches?pageSize=100').then((r) => r.data.data as BranchOption[]),
  });
  const departmentsQuery = useQuery({
    queryKey: ['/masters/departments/options', 'reports-filter'],
    queryFn: () => api.get('/masters/departments/options').then((r) => r.data.data as DepartmentOption[]),
  });
  const employeesQuery = useQuery({
    queryKey: ['/employees', 'reports-filter'],
    queryFn: () => api.get('/employees?pageSize=200').then((r) => r.data.data as EmployeeOption[]),
  });

  const catalog = catalogQuery.data ?? [];
  const selected = catalog.find((c) => c.key === selectedKey) ?? null;

  // Auto-select the first report once the catalog loads.
  useEffect(() => {
    if (!selectedKey && catalog.length) setSelectedKey(catalog[0]!.key);
  }, [catalog, selectedKey]);

  const has = (f: FilterKey): boolean => !!selected?.filters.includes(f);

  const reportParams = useMemo(() => {
    const p = new URLSearchParams();
    if (!selected) return p;
    if (has('dateRange')) { if (from) p.set('from', from); if (to) p.set('to', to); }
    if (has('branch') && branchId) p.set('branchId', branchId);
    if (has('department') && departmentId) p.set('departmentId', departmentId);
    if (has('employee') && employeeId) p.set('employeeId', employeeId);
    if (has('month')) p.set('month', String(month));
    if (has('year')) p.set('year', String(year));
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, from, to, branchId, departmentId, employeeId, month, year]);

  const reportUrl = selected
    ? `/human-resources/reports/${selected.key}${reportParams.toString() ? `?${reportParams.toString()}` : ''}`
    : '';

  const reportQuery = useQuery({
    queryKey: [reportUrl],
    queryFn: () => api.get(reportUrl).then((r) => r.data.data as ReportData),
    enabled: !!reportUrl,
    placeholderData: keepPreviousData,
  });

  const report = reportQuery.data ?? null;

  const columns: Column<TableRow>[] = useMemo(() => {
    if (!report) return [];
    return report.columns.map((c) => ({
      header: c.label,
      render: (row: TableRow) => displayCell(row[c.key], c.type),
      sortValue: (row: TableRow) => sortCell(row[c.key], c.type),
    }));
  }, [report]);

  const tableRows: TableRow[] = useMemo(() => {
    if (!report) return [];
    return report.rows.map((row, i) => ({ ...row, id: row.id != null ? String(row.id) : String(i) }));
  }, [report]);

  const periodLine = useMemo(() => {
    if (!selected) return '';
    const parts: string[] = [];
    if (has('month') || has('year')) parts.push(`${MONTHS[month - 1]} ${year}`);
    if (has('dateRange') && (from || to)) parts.push(`${from || '…'} to ${to || '…'}`);
    if (has('branch') && branchId) parts.push(`Branch: ${branchesQuery.data?.find((b) => b.id === branchId)?.name ?? branchId}`);
    if (has('department') && departmentId) parts.push(`Dept: ${departmentsQuery.data?.find((d) => d.id === departmentId)?.name ?? departmentId}`);
    if (has('employee') && employeeId) {
      const emp = employeesQuery.data?.find((e) => e.id === employeeId);
      parts.push(`Employee: ${emp ? `${emp.fullName} — ${emp.employeeCode}` : employeeId}`);
    }
    return parts.join('   |   ');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, month, year, from, to, branchId, departmentId, employeeId, branchesQuery.data, departmentsQuery.data, employeesQuery.data]);

  const runExport = (kind: 'csv' | 'excel' | 'pdf') => {
    if (!report) return;
    try {
      if (kind === 'csv') exportCsv(report);
      else if (kind === 'excel') exportExcel(report);
      else exportPdf(report, periodLine);
      toast.success(`${kind.toUpperCase()} export ready.`);
    } catch (err) {
      toast.error(apiMessage(err, 'Export failed.'));
    }
  };

  const yearOptions: number[] = [];
  for (let y = now.getFullYear() - 3; y <= now.getFullYear() + 1; y += 1) yearOptions.push(y);

  const grouped = CATEGORY_ORDER
    .map((cat) => ({ cat, items: catalog.filter((c) => c.category === cat) }))
    .filter((g) => g.items.length > 0);

  // Branch managers are branch-scoped by the backend regardless; the control is
  // still shown for them so they can see the (single) scope explicitly.
  void user;

  const hasExport = !!report && report.rows.length > 0;

  return (
    <>
      <header className="page-head">
        <h1>Reports</h1>
        <p className="muted">Generate, preview and export HR reports across employees, attendance, leave and payroll</p>
      </header>

      <div className="report-layout">
        <nav className="report-nav">
          {catalogQuery.isLoading ? (
            <p className="muted" style={{ padding: 10 }}>Loading reports…</p>
          ) : grouped.length === 0 ? (
            <p className="muted" style={{ padding: 10 }}>No reports available.</p>
          ) : (
            grouped.map((g) => (
              <div key={g.cat}>
                <div className="rn-cat">{CATEGORY_LABEL[g.cat]}</div>
                {g.items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`rn-item${item.key === selectedKey ? ' active' : ''}`}
                    title={item.description}
                    onClick={() => setSelectedKey(item.key)}
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            ))
          )}
        </nav>

        <section>
          {!selected ? (
            <div className="panel pad muted">Select a report from the list to get started.</div>
          ) : (
            <>
              <div className="report-toolbar">
                {has('dateRange') && (
                  <>
                    <label className="rt-field">From
                      <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                    </label>
                    <label className="rt-field">To
                      <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                    </label>
                  </>
                )}
                {has('month') && (
                  <label className="rt-field">Month
                    <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                      {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                  </label>
                )}
                {has('year') && (
                  <label className="rt-field">Year
                    <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
                      {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </label>
                )}
                {has('branch') && (
                  <label className="rt-field">Branch
                    <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                      <option value="">All branches</option>
                      {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </label>
                )}
                {has('department') && (
                  <label className="rt-field">Department
                    <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                      <option value="">All departments</option>
                      {departmentsQuery.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </label>
                )}
                {has('employee') && (
                  <label className="rt-field">Employee
                    <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                      <option value="">All employees</option>
                      {employeesQuery.data?.map((e) => (
                        <option key={e.id} value={e.id}>{e.fullName} — {e.employeeCode}</option>
                      ))}
                    </select>
                  </label>
                )}

                <div className="report-actions">
                  <button type="button" className="ghost sm" disabled={!hasExport} onClick={() => runExport('csv')}>
                    <Download size={14} /> CSV
                  </button>
                  <button type="button" className="ghost sm" disabled={!hasExport} onClick={() => runExport('excel')}>
                    <FileSpreadsheet size={14} /> Excel
                  </button>
                  <button type="button" className="ghost sm" disabled={!hasExport} onClick={() => runExport('pdf')}>
                    <Printer size={14} /> PDF
                  </button>
                </div>
              </div>

              {report?.summary && report.summary.length > 0 && (
                <div className="report-summary">
                  {report.summary.map((s, i) => (
                    <div key={`${s.label}-${i}`} className="rs-tile">
                      <div className="rs-label">{s.label}</div>
                      <div className="rs-value">{summaryValue(s)}</div>
                    </div>
                  ))}
                </div>
              )}

              <DataTable
                columns={columns}
                rows={tableRows}
                loading={reportQuery.isLoading}
                empty="No data for the selected filters."
                searchPlaceholder="Search rows…"
              />
            </>
          )}
        </section>
      </div>
    </>
  );
}
