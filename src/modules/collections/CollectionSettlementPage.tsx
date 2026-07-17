import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FilterBar } from '../../components/FilterBar';
import { StatCard } from '../../components/StatCard';
import { Badge, BadgeTone } from '../../components/Badge';
import { MultiSelect } from '../../components/MultiSelect';
import { useToast } from '../../components/Toast';
import { Download, Loader, Search, X } from '../../components/icons';
import { inr, fmtDate, isoLocalDate, apiMessage } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { canAccessModule } from '../auth/permissions';
import { BranchClosingReport, BranchClosingRow } from './shared';

type Tab = 'report' | 'fieldofficer';

/**
 * Collections — Branch Closing Report. Two views:
 *  • Branch Closing Report — the per-branch cash book (opening → collection →
 *    hospicash → AXIS/SBI/HDFC → total deposit → closing) for a chosen day,
 *    generated from the imported collection workbook's Cash Book sheet.
 *  • Field-officer settlements — the same report generated live from *approved*
 *    field-officer day-end settlements submitted through the app.
 */
export default function CollectionSettlementPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('report');
  const allowed = canAccessModule(user?.role, 'collectionSettlement');

  if (!allowed) return <p className="muted">You do not have permission to view settlement data.</p>;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Operations' }, { label: 'Collections', to: '/collections' }, { label: 'Branch Closing Report' }]}
        title="Branch Closing Report"
        subtitle="Per-branch cash book — opening, collection, hospicash, bank deposits (AXIS/SBI/HDFC) and closing balance — generated automatically, not entered by hand."
      />

      <div className="tabs" style={{ marginBottom: 16 }}>
        <button type="button" className={`tab ${tab === 'report' ? 'active' : ''}`} onClick={() => setTab('report')}>Branch Closing Report</button>
        <button type="button" className={`tab ${tab === 'fieldofficer' ? 'active' : ''}`} onClick={() => setTab('fieldofficer')}>Field-officer settlements</button>
      </div>

      {tab === 'report' ? <ImportedBranchReport /> : <FieldOfficerReport />}
    </>
  );
}

// ── Branch Closing Report from the imported Cash Book ─────────────────────────

type SettlementStatus = 'OPEN' | 'CLOSED' | 'DEPOSITED';
interface SettlementRow {
  id: string;
  statementDate: string;
  branchName: string;
  isTotal: boolean;
  settlementAmount: string | number;
  hospicash: string | number;
  openingBalance: string | number;
  totalCollection: string | number;
  axisDeposit: string | number;
  sbiDeposit: string | number;
  hdfcDeposit: string | number;
  totalDeposit: string | number;
  closingBalance: string | number;
  expectedClosing: number;
  difference: number;
  derivedStatus: SettlementStatus;
  managerName: string | null;
  region: string | null;
  updatedAt: string;
  branch: { name: string; code: string } | null;
}
interface SettlementTotals {
  openingBalance: string | number; hospicash: string | number; totalCollection: string | number;
  axisDeposit: string | number; sbiDeposit: string | number; hdfcDeposit: string | number;
  totalDeposit: string | number; closingBalance: string | number; settlementAmount: string | number;
}
interface SettlementFacets { branches: { id: string; name: string; code: string; state: string }[]; regions: string[] }
interface SettlementResponse {
  items: SettlementRow[];
  totalItems: number;
  totals: SettlementTotals;
  facets: SettlementFacets;
}

const money = (v: string | number) => <span className="num">{inr(v as number)}</span>;
const STATUS_TONE: Record<SettlementStatus, BadgeTone> = { DEPOSITED: 'success', OPEN: 'warning', CLOSED: 'neutral' };
const statusLabel = (s: SettlementStatus) => s.charAt(0) + s.slice(1).toLowerCase();

/** ISO date (yyyy-mm-dd) of a settlement's statement date. */
const toDateInput = (iso: string) => iso.slice(0, 10);
const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

interface SettleFilters { date: string; region: string; branchIds: string[]; statuses: string[]; banks: string[]; search: string }
const emptyFilters = (date = ''): SettleFilters => ({ date, region: '', branchIds: [], statuses: [], banks: [], search: '' });

const STATUS_OPTIONS = [
  { id: 'OPEN', name: 'Open' },
  { id: 'CLOSED', name: 'Closed' },
  { id: 'DEPOSITED', name: 'Deposited' },
];
const BANK_OPTIONS = [
  { id: 'AXIS', name: 'AXIS' },
  { id: 'SBI', name: 'SBI' },
  { id: 'HDFC', name: 'HDFC' },
];

/** Builds the settlement query params from a filter set (search passed in already debounced). */
function settlementParams(f: SettleFilters, search: string, paging = true): URLSearchParams {
  const p = new URLSearchParams({ view: 'BRANCH' });
  if (paging) { p.set('page', '1'); p.set('pageSize', '300'); }
  if (f.date) { p.set('from', f.date); p.set('to', f.date); }
  if (f.region) p.set('region', f.region);
  if (f.branchIds.length) p.set('branchIds', f.branchIds.join(','));
  if (f.statuses.length) p.set('statuses', f.statuses.join(','));
  if (f.banks.length) p.set('banks', f.banks.join(','));
  if (search.trim()) p.set('search', search.trim());
  return p;
}

function ImportedBranchReport() {
  const toast = useToast();
  // Filters apply live — every change refetches immediately, no "Apply" step.
  // Only the free-text search is debounced (below) so typing doesn't fire a
  // request per keystroke.
  const [filters, setFilters] = useState<SettleFilters>(emptyFilters());
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => clearTimeout(timer);
  }, [filters.search]);

  // Probe for the latest imported statement date so the report opens on real
  // data (rows are returned newest-first by the endpoint).
  const latestQuery = useQuery({
    queryKey: ['/collections/import/settlement', 'latest'],
    queryFn: () => api.get('/collections/import/settlement?view=BRANCH&page=1&pageSize=1').then((r) => r.data.data as SettlementResponse),
  });
  const latestDate = latestQuery.data?.items?.[0] ? toDateInput(latestQuery.data.items[0].statementDate) : '';
  useEffect(() => {
    if (!filters.date && latestDate) setFilters((f) => ({ ...f, date: latestDate }));
  }, [filters.date, latestDate]);

  const url = `/collections/import/settlement?${settlementParams(filters, debouncedSearch).toString()}`;
  const query = useQuery({
    queryKey: [url],
    enabled: !!filters.date,
    queryFn: () => api.get(url).then((r) => r.data.data as SettlementResponse),
    placeholderData: keepPreviousData,
  });

  const rows = query.data?.items ?? [];
  const t = query.data?.totals;
  const facets = query.data?.facets ?? latestQuery.data?.facets;
  const hasData = rows.length > 0;
  // Branch options narrow to the chosen region (region → branch dependency).
  const branchOptions = (facets?.branches ?? [])
    .filter((b) => !filters.region || b.state === filters.region)
    .map((b) => ({ id: b.id, name: b.name }));

  const reset = () => { setFilters(emptyFilters(latestDate)); setDebouncedSearch(''); };
  const setF = (patch: Partial<SettleFilters>) => setFilters((f) => ({ ...f, ...patch }));

  const doExport = async () => {
    setExporting(true);
    try {
      const res = await api.get(`/collections/import/settlement/export?${settlementParams(filters, debouncedSearch, false).toString()}`, { responseType: 'blob' });
      const [y, m, d] = (filters.date || isoLocalDate(new Date())).split('-');
      const objectUrl = window.URL.createObjectURL(res.data as Blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `Branch_Closing_Report_${d}-${m}-${y}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
      toast.success('Excel export started — check your downloads.');
    } catch (e) {
      toast.error(apiMessage(e, 'Export failed.'));
    } finally {
      setExporting(false);
    }
  };

  type Row = SettlementRow & { _total?: boolean };
  // Totals row summed from the loaded per-branch rows (all rows are loaded).
  const num = (v: string | number) => Number(v);
  const totalRow: Row | null = hasData
    ? {
        id: '__all__', _total: true, statementDate: filters.date, branchName: 'ALL BRANCHES', isTotal: true, branch: null,
        managerName: null, region: null, updatedAt: '',
        settlementAmount: 0,
        openingBalance: rows.reduce((s, r) => s + num(r.openingBalance), 0),
        hospicash: rows.reduce((s, r) => s + num(r.hospicash), 0),
        totalCollection: rows.reduce((s, r) => s + num(r.totalCollection), 0),
        axisDeposit: rows.reduce((s, r) => s + num(r.axisDeposit), 0),
        sbiDeposit: rows.reduce((s, r) => s + num(r.sbiDeposit), 0),
        hdfcDeposit: rows.reduce((s, r) => s + num(r.hdfcDeposit), 0),
        totalDeposit: rows.reduce((s, r) => s + num(r.totalDeposit), 0),
        closingBalance: rows.reduce((s, r) => s + num(r.closingBalance), 0),
        expectedClosing: 0,
        difference: Math.round(rows.reduce((s, r) => s + r.difference, 0) * 100) / 100,
        derivedStatus: 'CLOSED',
      }
    : null;
  const displayRows: Row[] = totalRow ? [...rows, totalRow] : rows;

  const diffCell = (r: Row) => {
    const zero = Math.abs(r.difference) < 0.005;
    return <span className="num" style={{ color: zero ? '#1d7a4f' : '#b3392f', fontWeight: zero ? 500 : 700 }}>{inr(r.difference)}</span>;
  };

  const columns: Column<Row>[] = [
    { header: 'Branch', render: (r) => <strong>{r._total ? 'All branches' : (r.branch?.name ?? r.branchName)}</strong> },
    { header: 'Branch Manager', render: (r) => (r._total ? <span className="muted">—</span> : (r.managerName ?? <span className="muted sm-text">—</span>)) },
    { header: 'Opening', render: (r) => (r._total ? <span className="muted">—</span> : money(r.openingBalance)) },
    { header: 'Hospicash', render: (r) => (r._total ? <span className="muted">—</span> : money(r.hospicash)) },
    { header: 'Collection', render: (r) => money(r.totalCollection) },
    { header: 'AXIS', render: (r) => (r._total ? <span className="muted">—</span> : money(r.axisDeposit)) },
    { header: 'SBI', render: (r) => (r._total ? <span className="muted">—</span> : money(r.sbiDeposit)) },
    { header: 'HDFC', render: (r) => (r._total ? <span className="muted">—</span> : money(r.hdfcDeposit)) },
    { header: 'Total deposit', render: (r) => money(r.totalDeposit) },
    { header: 'Closing', render: (r) => <span className="num"><strong>{inr(r.closingBalance as number)}</strong></span> },
    { header: 'Difference', render: diffCell },
    { header: 'Status', render: (r) => (r._total ? <span className="muted">—</span> : <Badge tone={STATUS_TONE[r.derivedStatus]}>{statusLabel(r.derivedStatus)}</Badge>) },
    { header: 'Last Updated', render: (r) => (r._total ? <span className="muted">—</span> : <span className="sm-text">{fmtDateTime(r.updatedAt)}</span>) },
  ];

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
        <StatCard label="Branches settled" value={hasData ? String(rows.length) : '—'} />
        <StatCard label="Total collection" value={t ? inr(t.totalCollection as number) : '—'} />
        <StatCard label="Total deposit" value={t ? inr(t.totalDeposit as number) : '—'} />
        <StatCard label="Total closing" value={t ? inr(t.closingBalance as number) : '—'} />
      </div>

      {/* Professional filter panel — every control applies live (no Apply step). */}
      <div className="adv-panel" style={{ marginBottom: 16 }}>
        <div className="adv-grid">
          <label>Statement date
            <input type="date" value={filters.date} onChange={(e) => setF({ date: e.target.value })} />
          </label>
          <label>Region
            <select value={filters.region} onChange={(e) => setF({ region: e.target.value, branchIds: [] })}>
              <option value="">All regions</option>
              {(facets?.regions ?? []).map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <div className="adv-field">
            <span>Branch</span>
            <MultiSelect options={branchOptions} selected={filters.branchIds} onChange={(ids) => setF({ branchIds: ids })} allLabel="All branches" noun="branch" />
          </div>
          <div className="adv-field">
            <span>Status</span>
            <MultiSelect options={STATUS_OPTIONS} selected={filters.statuses} onChange={(ids) => setF({ statuses: ids })} allLabel="All statuses" noun="status" />
          </div>
          <div className="adv-field">
            <span>Bank</span>
            <MultiSelect options={BANK_OPTIONS} selected={filters.banks} onChange={(ids) => setF({ banks: ids })} allLabel="All banks" noun="bank" />
          </div>
          <label>Search
            <div className="table-search" style={{ margin: 0 }}>
              <Search size={16} />
              <input value={filters.search} onChange={(e) => setF({ search: e.target.value })} placeholder="Branch, code, manager, region…" aria-label="Search settlements" />
              {filters.search && (
                <button type="button" className="table-search-clear" onClick={() => setF({ search: '' })} aria-label="Clear search"><X size={14} /></button>
              )}
            </div>
          </label>
        </div>
        <div className="adv-foot">
          <button type="button" className="ghost" onClick={reset}>Reset filter</button>
          <button type="button" className="ghost" onClick={doExport} disabled={exporting || !hasData} style={{ marginLeft: 'auto' }}>
            {exporting ? <Loader size={15} /> : <Download size={15} />} Export Excel
          </button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={displayRows}
        loading={latestQuery.isLoading || query.isLoading}
        searchable={false}
        pageSize={0}
        empty="No branch settlement rows for this date. Import a collection workbook (the Cash Book sheet), or pick a date within the imported month."
      />
    </>
  );
}

// ── Branch Closing Report from approved field-officer settlements ─────────────

function FieldOfficerReport() {
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const [from, setFrom] = useState(iso(new Date()));
  const [to, setTo] = useState(iso(new Date()));

  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const url = `/collections/settlements/branch-report?${params.toString()}`;
  const query = useQuery({
    queryKey: [url],
    queryFn: () => api.get(url).then((r) => r.data.data as BranchClosingReport),
    placeholderData: keepPreviousData,
  });

  const rows = query.data?.rows ?? [];
  const t = query.data?.totals;

  type Row = BranchClosingRow & { id: string };
  const displayRows: Row[] = t && rows.length > 0
    ? [...rows.map((r) => ({ ...r, id: r.branchId ?? r.branchName })), { branchId: null, branchName: 'All branches', ...t, id: '__all__' }]
    : rows.map((r) => ({ ...r, id: r.branchId ?? r.branchName }));

  const cash = (v: number) => <span className="num">{inr(v)}</span>;
  const columns: Column<Row>[] = [
    { header: 'Branch', render: (r) => <strong>{r.branchName}</strong> },
    { header: 'Opening', render: (r) => cash(r.openingBalance) },
    { header: 'Hospicash', render: (r) => cash(r.hospicash) },
    { header: 'Collection', render: (r) => cash(r.collection) },
    { header: 'AXIS', render: (r) => cash(r.axisDeposit) },
    { header: 'SBI', render: (r) => cash(r.sbiDeposit) },
    { header: 'HDFC', render: (r) => cash(r.hdfcDeposit) },
    { header: 'Total deposit', render: (r) => cash(r.totalDeposit) },
    { header: 'Closing', render: (r) => <span className="num"><strong>{inr(r.closingBalance)}</strong></span> },
    { header: 'Officers', render: (r) => <span className="num">{r.officerCount}</span> },
  ];

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
        <StatCard label="Total collection" value={t ? inr(t.collection) : '—'} />
        <StatCard label="Total deposit" value={t ? inr(t.totalDeposit) : '—'} />
        <StatCard label="Total closing" value={t ? inr(t.closingBalance) : '—'} />
        <StatCard label="Approved settlements" value={t ? String(t.settlementCount) : '—'} />
      </div>

      <FilterBar>
        <label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" /></label>
        <label>To<input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To date" /></label>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={displayRows}
        loading={query.isLoading}
        searchable={false}
        pageSize={0}
        empty="No approved field-officer settlements in this date range yet. Once a branch manager verifies and an admin approves a settlement, it appears here."
      />
    </>
  );
}
