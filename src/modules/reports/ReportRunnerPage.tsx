import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FilterBar, FilterChip } from '../../components/FilterBar';
import { ConfirmDialog } from '../../components/Modal';
import { ActionMenu } from '../../components/ActionMenu';
import { useToast } from '../../components/Toast';
import { Download, FileSpreadsheet, Printer, Plus, AlertCircle, X } from '../../components/icons';
import { apiMessage } from '../../lib/format';
import {
  CatalogItem, FilterKey, MONTHS, ReportData, LARGE_EXPORT_THRESHOLD,
  displayCell, sortCell, summaryValue, exportCsv, exportExcel, exportPdf,
} from './reportsShared';

interface BranchOption { id: string; name: string }
interface DepartmentOption { id: string; name: string }
interface EmployeeOption { id: string; fullName: string; employeeCode: string }
type TableRow = Record<string, unknown> & { id: string };

interface SavedView { name: string; params: Record<string, string> }
const viewsKey = (reportKey: string) => `mf-report-views:${reportKey}`;
const loadViews = (reportKey: string): SavedView[] => {
  try { return JSON.parse(localStorage.getItem(viewsKey(reportKey)) || '[]') as SavedView[]; } catch { return []; }
};

/** Reports — Runner. One report: filters (URL-synced) → results → export, with per-report saved views. */
export default function ReportRunnerPage() {
  const { reportKey = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const now = new Date();

  const [params, setParams] = useSearchParams();
  const [views, setViews] = useState<SavedView[]>(() => loadViews(reportKey));
  const [confirmExport, setConfirmExport] = useState<null | 'csv' | 'excel' | 'pdf'>(null);

  const from = params.get('from') || '';
  const to = params.get('to') || '';
  const branchId = params.get('branchId') || '';
  const departmentId = params.get('departmentId') || '';
  const employeeId = params.get('employeeId') || '';
  const month = Number(params.get('month')) || now.getMonth() + 1;
  const year = Number(params.get('year')) || now.getFullYear();

  const setFilter = (patch: Record<string, string>) =>
    setParams((p) => { Object.entries(patch).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k))); return p; }, { replace: true });

  const catalogQuery = useQuery({
    queryKey: ['/human-resources/reports/catalog'],
    queryFn: () => api.get('/human-resources/reports/catalog').then((r) => r.data.data as CatalogItem[]),
  });
  const selected = (catalogQuery.data ?? []).find((c) => c.key === reportKey) ?? null;
  const has = (f: FilterKey): boolean => !!selected?.filters.includes(f);

  const branchesQuery = useQuery({ queryKey: ['/branches', 'reports-filter'], queryFn: () => api.get('/branches?pageSize=100').then((r) => r.data.data as BranchOption[]), enabled: has('branch') });
  const departmentsQuery = useQuery({ queryKey: ['/masters/departments/options', 'reports-filter'], queryFn: () => api.get('/masters/departments/options').then((r) => r.data.data as DepartmentOption[]), enabled: has('department') });
  const employeesQuery = useQuery({ queryKey: ['/employees', 'reports-filter'], queryFn: () => api.get('/employees?pageSize=200').then((r) => r.data.data as EmployeeOption[]), enabled: has('employee') });

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

  const reportUrl = selected ? `/human-resources/reports/${selected.key}${reportParams.toString() ? `?${reportParams.toString()}` : ''}` : '';
  const reportQuery = useQuery({
    queryKey: [reportUrl],
    queryFn: () => api.get(reportUrl).then((r) => r.data.data as ReportData),
    enabled: !!reportUrl,
    placeholderData: keepPreviousData,
  });
  const report = reportQuery.data ?? null;

  const columns: Column<TableRow>[] = useMemo(() => (report?.columns ?? []).map((c) => ({
    header: c.label,
    render: (row: TableRow) => displayCell(row[c.key], c.type),
    sortValue: (row: TableRow) => sortCell(row[c.key], c.type),
  })), [report]);
  const tableRows: TableRow[] = useMemo(() => (report?.rows ?? []).map((row, i) => ({ ...row, id: row.id != null ? String(row.id) : String(i) })), [report]);

  const periodLine = useMemo(() => {
    if (!selected) return '';
    const parts: string[] = [];
    if (has('month') || has('year')) parts.push(`${MONTHS[month - 1]} ${year}`);
    if (has('dateRange') && (from || to)) parts.push(`${from || '…'} to ${to || '…'}`);
    if (has('branch') && branchId) parts.push(`Branch: ${branchesQuery.data?.find((b) => b.id === branchId)?.name ?? branchId}`);
    if (has('department') && departmentId) parts.push(`Dept: ${departmentsQuery.data?.find((d) => d.id === departmentId)?.name ?? departmentId}`);
    if (has('employee') && employeeId) { const e = employeesQuery.data?.find((x) => x.id === employeeId); parts.push(`Employee: ${e ? `${e.fullName} — ${e.employeeCode}` : employeeId}`); }
    return parts.join('   |   ');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, month, year, from, to, branchId, departmentId, employeeId, branchesQuery.data, departmentsQuery.data, employeesQuery.data]);

  if (catalogQuery.data && !selected) return <Navigate to="/reports" replace />;

  const doExport = (kind: 'csv' | 'excel' | 'pdf') => {
    if (!report) return;
    try {
      if (kind === 'csv') exportCsv(report);
      else if (kind === 'excel') exportExcel(report);
      else exportPdf(report, periodLine);
      toast.success(`${kind.toUpperCase()} export ready.`);
    } catch (err) { toast.error(apiMessage(err, 'Export failed.')); }
  };
  const requestExport = (kind: 'csv' | 'excel' | 'pdf') => {
    if (report && report.rows.length > LARGE_EXPORT_THRESHOLD) setConfirmExport(kind);
    else doExport(kind);
  };

  const hasExport = !!report && report.rows.length > 0;
  const yearOptions: number[] = [];
  for (let y = now.getFullYear() - 3; y <= now.getFullYear() + 1; y += 1) yearOptions.push(y);

  // ── Saved views ──
  const currentParams = (): Record<string, string> => Object.fromEntries(reportParams.entries());
  const saveView = () => {
    const name = window.prompt('Name this view');
    if (!name?.trim()) return;
    const next = [...views.filter((v) => v.name !== name.trim()), { name: name.trim(), params: currentParams() }];
    localStorage.setItem(viewsKey(reportKey), JSON.stringify(next));
    setViews(next);
    toast.success(`Saved view “${name.trim()}”.`);
  };
  const applyView = (v: SavedView) => setParams(new URLSearchParams(v.params), { replace: true });
  const deleteView = (name: string) => {
    const next = views.filter((v) => v.name !== name);
    localStorage.setItem(viewsKey(reportKey), JSON.stringify(next));
    setViews(next);
  };

  const activeChips: FilterChip[] = [
    ...(has('dateRange') && from ? [{ key: 'from', label: `From ${from}`, onRemove: () => setFilter({ from: '' }) }] : []),
    ...(has('dateRange') && to ? [{ key: 'to', label: `To ${to}`, onRemove: () => setFilter({ to: '' }) }] : []),
    ...(has('branch') && branchId ? [{ key: 'branch', label: `Branch: ${branchesQuery.data?.find((b) => b.id === branchId)?.name ?? '…'}`, onRemove: () => setFilter({ branchId: '' }) }] : []),
    ...(has('department') && departmentId ? [{ key: 'dept', label: `Dept: ${departmentsQuery.data?.find((d) => d.id === departmentId)?.name ?? '…'}`, onRemove: () => setFilter({ departmentId: '' }) }] : []),
    ...(has('employee') && employeeId ? [{ key: 'emp', label: `Employee: ${employeesQuery.data?.find((e) => e.id === employeeId)?.fullName ?? '…'}`, onRemove: () => setFilter({ employeeId: '' }) }] : []),
  ];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Insights' }, { label: 'Reports', to: '/reports' }, { label: selected?.title ?? 'Report' }]}
        title={selected?.title ?? 'Report'}
        subtitle={selected?.description}
        actions={(
          <>
            <button className="ghost" onClick={saveView} disabled={!selected}><Plus size={15} /> Save view</button>
            <ActionMenu
              label="Export"
              disabled={!hasExport}
              items={[
                { key: 'csv', label: 'Export CSV', icon: <Download size={15} />, onSelect: () => requestExport('csv') },
                { key: 'excel', label: 'Export Excel', icon: <FileSpreadsheet size={15} />, onSelect: () => requestExport('excel') },
                { key: 'pdf', label: 'Export PDF', icon: <Printer size={15} />, onSelect: () => requestExport('pdf') },
              ]}
            />
          </>
        )}
      />

      {views.length > 0 && (
        <div className="saved-views">
          <span className="muted sm-text">Saved views:</span>
          {views.map((v) => (
            <span key={v.name} className="filter-chip saved-view-chip">
              <button type="button" onClick={() => applyView(v)}>{v.name}</button>
              <button type="button" aria-label={`Delete view ${v.name}`} onClick={() => deleteView(v.name)}><X size={12} /></button>
            </span>
          ))}
        </div>
      )}

      {selected && (
        <FilterBar chips={activeChips} onReset={activeChips.length ? () => setFilter({ from: '', to: '', branchId: '', departmentId: '', employeeId: '' }) : undefined}>
          {has('dateRange') && <><label>From<input type="date" value={from} onChange={(e) => setFilter({ from: e.target.value })} /></label><label>To<input type="date" value={to} onChange={(e) => setFilter({ to: e.target.value })} /></label></>}
          {has('month') && <label>Month<select value={month} onChange={(e) => setFilter({ month: e.target.value })}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label>}
          {has('year') && <label>Year<select value={year} onChange={(e) => setFilter({ year: e.target.value })}>{yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}</select></label>}
          {has('branch') && <label>Branch<select value={branchId} onChange={(e) => setFilter({ branchId: e.target.value })}><option value="">All branches</option>{branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}
          {has('department') && <label>Department<select value={departmentId} onChange={(e) => setFilter({ departmentId: e.target.value })}><option value="">All departments</option>{departmentsQuery.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>}
          {has('employee') && <label>Employee<select value={employeeId} onChange={(e) => setFilter({ employeeId: e.target.value })}><option value="">All employees</option>{employeesQuery.data?.map((e) => <option key={e.id} value={e.id}>{e.fullName} — {e.employeeCode}</option>)}</select></label>}
        </FilterBar>
      )}

      {report?.summary && report.summary.length > 0 && (
        <div className="report-summary">
          {report.summary.map((s, i) => (
            <div key={`${s.label}-${i}`} className="rs-tile"><div className="rs-label">{s.label}</div><div className="rs-value">{summaryValue(s)}</div></div>
          ))}
        </div>
      )}

      <DataTable
        columns={columns}
        rows={tableRows}
        loading={reportQuery.isLoading}
        empty="No data for the selected filters."
        searchPlaceholder="Search rows…"
        pageSize={25}
      />

      {confirmExport && (
        <ConfirmDialog
          icon={<AlertCircle size={20} />}
          title="Export a large report?"
          message={`This report has ${report?.rows.length.toLocaleString('en-IN')} rows. It is generated in your browser, which may be slow or memory-heavy for very large sets. Continue?`}
          confirmLabel="Export anyway"
          onConfirm={() => { const k = confirmExport; setConfirmExport(null); doExport(k); }}
          onCancel={() => setConfirmExport(null)}
        />
      )}
    </>
  );
}
