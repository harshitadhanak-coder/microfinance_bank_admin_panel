import { useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Column, DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { FilterBar, FilterChip } from '../../components/FilterBar';
import { Badge, BadgeTone } from '../../components/Badge';
import { StatCard } from '../../components/StatCard';
import { useToast } from '../../components/Toast';
import { ChevronDown, ChevronUp, Download, FileSpreadsheet, Loader, Search, X } from '../../components/icons';
import { useServerTable } from '../../components/useServerTable';
import { MultiSelect } from '../../components/MultiSelect';
import { inr, fmtDate, titleCase, isoLocalDate, apiMessage } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { canAccessModule } from '../auth/permissions';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RecordRow {
  id: string;
  transactionId: string;
  loanAccountNumber: string;
  urn: string | null;
  customerName: string;
  amount: string | number;
  collectionDate: string;
  servicingBranchRaw: string;
  executiveCode: string;
  staffNameRaw: string | null;
  paymentMode: string;
  settlementId: string;
  settlementAuthStatus: string;
  status: 'COLLECTED' | 'REJECTED';
  linkedPaymentId: string | null;
  createdAt: string;
  branch: { name: string; code: string } | null;
  collectedByEmployee: { fullName: string; employeeCode: string } | null;
}
interface StatusSummary { count: number; amount: number }
interface RecordsResponse {
  items: RecordRow[];
  page: number; pageSize: number; totalItems: number; totalPages: number;
  totalAmount: string | number;
  summary: { collected: StatusSummary; rejected: StatusSummary };
}
interface BranchOption { id: string; name: string; code?: string }

// ── Filter model ──────────────────────────────────────────────────────────────

interface FilterState {
  status: string;
  preset: string;              // '', today, yesterday, last7, last30, thisMonth, prevMonth, custom
  from: string; to: string;    // used when preset === 'custom'
  branchIds: string[];
  officerIds: string[];
  paymentMode: string;
  minAmount: string; maxAmount: string;
  settlementAuthStatus: string;
}
const EMPTY_FILTERS: FilterState = {
  status: '', preset: '', from: '', to: '',
  branchIds: [], officerIds: [], paymentMode: '', minAmount: '', maxAmount: '',
  settlementAuthStatus: '',
};

const STATUSES = ['', 'COLLECTED', 'REJECTED'];
const PAYMENT_MODES = ['', 'CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE'];
const STATUS_TONE: Record<string, BadgeTone> = { COLLECTED: 'success', REJECTED: 'warning' };
const DATE_PRESETS: { value: string; label: string }[] = [
  { value: '', label: 'Any date' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'prevMonth', label: 'Previous month' },
  { value: 'custom', label: 'Custom range' },
];

/** Resolve a preset (or custom inputs) into a concrete yyyy-mm-dd from/to pair. */
function presetRange(f: FilterState): { from?: string; to?: string } {
  const today = new Date();
  const shift = (days: number) => { const d = new Date(today); d.setDate(d.getDate() + days); return d; };
  switch (f.preset) {
    case 'today': return { from: isoLocalDate(today), to: isoLocalDate(today) };
    case 'yesterday': return { from: isoLocalDate(shift(-1)), to: isoLocalDate(shift(-1)) };
    case 'last7': return { from: isoLocalDate(shift(-6)), to: isoLocalDate(today) };
    case 'last30': return { from: isoLocalDate(shift(-29)), to: isoLocalDate(today) };
    case 'thisMonth': return { from: isoLocalDate(new Date(today.getFullYear(), today.getMonth(), 1)), to: isoLocalDate(today) };
    case 'prevMonth': return {
      from: isoLocalDate(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      to: isoLocalDate(new Date(today.getFullYear(), today.getMonth(), 0)),
    };
    case 'custom': return { from: f.from || undefined, to: f.to || undefined };
    default: return {};
  }
}

/** Count of active advanced filters (everything except the free-text search). */
function activeCount(f: FilterState): number {
  let n = 0;
  if (f.status) n++;
  if (f.preset) n++;
  if (f.branchIds.length) n++;
  if (f.officerIds.length) n++;
  if (f.paymentMode) n++;
  if (f.minAmount || f.maxAmount) n++;
  if (f.settlementAuthStatus.trim()) n++;
  return n;
}

/** Encode the filter state as query params (optionally with the search term). */
function toParams(f: FilterState, search?: string): URLSearchParams {
  const p = new URLSearchParams();
  if (f.status) p.set('status', f.status);
  if (f.preset) {
    const r = presetRange(f);
    if (r.from) p.set('from', r.from);
    if (r.to) p.set('to', r.to);
  }
  if (f.branchIds.length) p.set('branchIds', f.branchIds.join(','));
  if (f.officerIds.length) p.set('officerIds', f.officerIds.join(','));
  if (f.paymentMode) p.set('paymentMode', f.paymentMode);
  if (f.minAmount) p.set('minAmount', f.minAmount);
  if (f.maxAmount) p.set('maxAmount', f.maxAmount);
  if (f.settlementAuthStatus.trim()) p.set('settlementAuthStatus', f.settlementAuthStatus.trim());
  if (search) p.set('search', search);
  return p;
}

// ── Table columns (fixed, bank-standard set) ───────────────────────────────────

const money = (v: string | number) => <span className="num">{inr(v as number)}</span>;
const COLUMNS: Column<RecordRow>[] = [
  { header: 'Collection Date', sortKey: 'collectionDate', render: (r) => fmtDate(r.collectionDate) },
  { header: 'Transaction ID', sortKey: 'transactionId', render: (r) => <code className="sm-text">{r.transactionId}</code> },
  { header: 'Loan Account', sortKey: 'loanAccountNumber', render: (r) => <span className="sm-text">{r.loanAccountNumber}</span> },
  { header: 'Customer Name', sortKey: 'customerName', render: (r) => r.customerName },
  { header: 'URN', render: (r) => <span className="sm-text">{r.urn ?? '—'}</span> },
  { header: 'Amount', sortKey: 'amount', render: (r) => money(r.amount) },
  { header: 'Payment Mode', render: (r) => titleCase(r.paymentMode.replaceAll('_', ' ')) },
  { header: 'Branch', render: (r) => r.branch?.name ?? <span className="muted sm-text">{r.servicingBranchRaw} (unmatched)</span> },
  { header: 'Field Officer', render: (r) => r.collectedByEmployee?.fullName ?? <span className="muted sm-text">{r.executiveCode} (unmatched)</span> },
  { header: 'Status', sortKey: 'status', render: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge> },
];

// ── Saved filters (localStorage) ───────────────────────────────────────────────

const SAVED_KEY = 'collectionRecords.savedFilters';
interface SavedFilter { name: string; state: FilterState }
const loadSaved = (): SavedFilter[] => { try { return JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]'); } catch { return []; } };

/**
 * Collections — Records. Enterprise, banking-style browser over the imported
 * external (Business-Correspondent) collection ledger: a sticky filter bar with
 * global search, quick status/date filters and a collapsible advanced panel,
 * active-filter chips, saved filters, and a filtered Excel/CSV export. All
 * filtering/sorting/paging happens server-side (see collection-import service),
 * so it scales to very large ledgers. These are NOT internal loan payments — the
 * client file carries no loan master — so they live here.
 */
export default function CollectionRecordsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const table = useServerTable({ pageSize: 20 });

  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saved, setSaved] = useState<SavedFilter[]>(loadSaved);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const allowed = canAccessModule(user?.role, 'collectionRecords');
  const branchScoped = !!user?.branchId; // branch managers are auto-scoped, no branch picker

  // Close the export menu on any outside click.
  useEffect(() => {
    if (!exportMenuOpen) return;
    const onDown = (e: MouseEvent) => { if (!exportMenuRef.current?.contains(e.target as Node)) setExportMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [exportMenuOpen]);

  // Branch options for the advanced panel (cross-branch roles only).
  const branchQuery = useQuery({
    queryKey: ['/branches', 'collection-records'],
    enabled: allowed && !branchScoped,
    queryFn: () => api.get('/branches?pageSize=100').then((r) => r.data.data as BranchOption[]),
  });
  // Field-officer options (distinct officers present in the ledger, role-scoped).
  const officerQuery = useQuery({
    queryKey: ['/collections/import/records/officers'],
    enabled: allowed,
    queryFn: () => api.get('/collections/import/records/officers').then((r) => r.data.data as { id: string; fullName: string; employeeCode: string }[]),
  });

  const filterParams = useMemo(() => toParams(filters).toString(), [filters]);
  const listUrl = `/collections/import/records?${table.params}${filterParams ? `&${filterParams}` : ''}`;
  const listQuery = useQuery({
    queryKey: [listUrl],
    enabled: allowed,
    queryFn: () => api.get(listUrl).then((r) => r.data.data as RecordsResponse),
    placeholderData: keepPreviousData,
  });

  if (!allowed) return <p className="muted">You do not have permission to view collection records.</p>;

  const rows = listQuery.data?.items ?? [];
  const totalItems = listQuery.data?.totalItems ?? 0;
  const totalAmount = listQuery.data?.totalAmount ?? 0;
  const summary = listQuery.data?.summary;
  const nActive = activeCount(filters);
  const anythingActive = nActive > 0 || !!table.search;

  // Any filter change goes back to page 1.
  const patch = (next: Partial<FilterState>) => { setFilters((f) => ({ ...f, ...next })); table.setPage(1); };
  // One reset for EVERYTHING — advanced filters, quick filters and the search box.
  const resetAll = () => { setFilters(EMPTY_FILTERS); table.onSearchChange(''); table.setPage(1); };

  // Picking "Custom range" opens the advanced panel so the From/To inputs are
  // immediately visible — otherwise the date fields are hidden and unreachable.
  const onPresetChange = (value: string) => {
    patch({ preset: value, ...(value !== 'custom' ? { from: '', to: '' } : {}) });
    if (value === 'custom') setAdvancedOpen(true);
  };

  // ── Chips ──
  const chips: FilterChip[] = [];
  if (filters.status) chips.push({ key: 'status', label: `Status: ${titleCase(filters.status)}`, onRemove: () => patch({ status: '' }) });
  if (filters.preset) {
    const lbl = DATE_PRESETS.find((p) => p.value === filters.preset)?.label ?? filters.preset;
    chips.push({ key: 'date', label: `Collection date: ${lbl}`, onRemove: () => patch({ preset: '', from: '', to: '' }) });
  }
  if (filters.branchIds.length) {
    const names = filters.branchIds.map((id) => branchQuery.data?.find((b) => b.id === id)?.name ?? id);
    chips.push({ key: 'branch', label: `Branch: ${names.length > 2 ? `${names.length} selected` : names.join(', ')}`, onRemove: () => patch({ branchIds: [] }) });
  }
  if (filters.officerIds.length) {
    const names = filters.officerIds.map((id) => officerQuery.data?.find((o) => o.id === id)?.fullName ?? id);
    chips.push({ key: 'officer', label: `Officer: ${names.length > 2 ? `${names.length} selected` : names.join(', ')}`, onRemove: () => patch({ officerIds: [] }) });
  }
  if (filters.paymentMode) chips.push({ key: 'mode', label: `Mode: ${titleCase(filters.paymentMode.replaceAll('_', ' '))}`, onRemove: () => patch({ paymentMode: '' }) });
  if (filters.minAmount || filters.maxAmount) chips.push({ key: 'amt', label: `Amount: ${filters.minAmount || '0'}–${filters.maxAmount || '∞'}`, onRemove: () => patch({ minAmount: '', maxAmount: '' }) });
  if (filters.settlementAuthStatus.trim()) chips.push({ key: 'auth', label: `Auth: ${filters.settlementAuthStatus.trim()}`, onRemove: () => patch({ settlementAuthStatus: '' }) });

  // ── Saved filters ──
  const saveCurrent = () => {
    const name = window.prompt('Name this filter set (e.g. "Rejected — this month")');
    if (!name?.trim()) return;
    const next = [...saved.filter((s) => s.name !== name.trim()), { name: name.trim(), state: filters }].slice(-12);
    setSaved(next);
    localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    toast.success('Filter saved.');
  };
  const applySaved = (s: SavedFilter) => { setFilters({ ...EMPTY_FILTERS, ...s.state, branchIds: s.state.branchIds ?? [], officerIds: s.state.officerIds ?? [] }); table.setPage(1); };
  const deleteSaved = (name: string) => {
    const next = saved.filter((s) => s.name !== name);
    setSaved(next);
    localStorage.setItem(SAVED_KEY, JSON.stringify(next));
  };

  // ── Export the full filtered set (Excel or CSV), in the MTD column order ──
  const doExport = async (format: 'xlsx' | 'csv') => {
    setExportMenuOpen(false);
    setExporting(true);
    try {
      const params = toParams(filters, table.search || undefined);
      params.set('format', format);
      const res = await api.get(`/collections/import/records/export?${params.toString()}`, { responseType: 'blob' });
      const objectUrl = window.URL.createObjectURL(res.data as Blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `Collection-Records-${isoLocalDate(new Date())}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
      toast.success(`${format === 'xlsx' ? 'Excel' : 'CSV'} export started — check your downloads.`);
    } catch (e) {
      toast.error(apiMessage(e, 'Export failed.'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Operations' }, { label: 'Collections', to: '/collections' }, { label: 'Records' }]}
        title="Collection records"
        subtitle="Imported client (Business-Correspondent) collection ledger. Separate from internal loan payments."
      />

      <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 16 }}>
        <StatCard label="Records (filtered)" value={totalItems.toLocaleString('en-IN')} />
        <StatCard label="Total amount (filtered)" value={inr(totalAmount as number)} />
        <StatCard label="Collected" value={summary ? `${summary.collected.count.toLocaleString('en-IN')} · ${inr(summary.collected.amount)}` : '—'} />
        <StatCard label="Rejected" value={summary ? `${summary.rejected.count.toLocaleString('en-IN')} · ${inr(summary.rejected.amount)}` : '—'} />
      </div>

      {/* Sticky filter surface */}
      <div style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--paper)', paddingTop: 4, marginBottom: 12 }}>
        <FilterBar
          chips={chips}
          onClearAll={anythingActive ? resetAll : undefined}
          search={
            <div className="table-search" style={{ margin: 0 }}>
              <Search size={16} />
              <input
                value={table.search}
                onChange={(e) => table.onSearchChange(e.target.value)}
                placeholder="Search transaction id, account, URN, customer, officer, settlement…"
                aria-label="Global search"
              />
              {table.search && (
                <button type="button" className="table-search-clear" onClick={() => table.onSearchChange('')} aria-label="Clear search"><X size={14} /></button>
              )}
            </div>
          }
          actions={
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div ref={exportMenuRef} style={{ position: 'relative' }}>
                <button type="button" className="ghost" onClick={() => setExportMenuOpen((o) => !o)} disabled={exporting} aria-haspopup="menu" aria-expanded={exportMenuOpen}>
                  {exporting ? <Loader size={15} /> : <Download size={15} />} Export
                </button>
                {exportMenuOpen && (
                  <div className="panel" role="menu" style={{ position: 'absolute', right: 0, top: '110%', zIndex: 20, minWidth: 190, padding: 6, boxShadow: '0 8px 24px rgba(0,0,0,.12)' }}>
                    <button type="button" role="menuitem" className="ghost sm" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => doExport('xlsx')}>
                      <FileSpreadsheet size={15} /> Excel (.xlsx)
                    </button>
                    <button type="button" role="menuitem" className="ghost sm" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => doExport('csv')}>
                      <Download size={15} /> CSV (.csv)
                    </button>
                  </div>
                )}
              </div>
              <button type="button" className="ghost" onClick={() => setAdvancedOpen((o) => !o)} aria-expanded={advancedOpen}>
                {advancedOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />} Advanced
                {/* Count badge with a permanently-reserved footprint, so toggling
                    a filter never changes the button width (no toolbar shift). */}
                <span
                  aria-hidden={nActive === 0}
                  style={{
                    marginLeft: 6, minWidth: 20, height: 18, padding: '0 6px', borderRadius: 9,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700,
                    background: nActive > 0 ? 'var(--brass)' : 'transparent',
                    color: nActive > 0 ? '#fff' : 'transparent',
                  }}
                >
                  {nActive || 0}
                </span>
              </button>
            </div>
          }
        >
          {/* Label-less, single-height controls so the toolbar reads as one clean
              aligned row. The default option ("All statuses" / "Any date") names
              each control; Reset lives in the chip row below, not up here. */}
          <select className="filter-control" value={filters.status} onChange={(e) => patch({ status: e.target.value })} aria-label="Collection status" title="Collection status">
            {STATUSES.map((s) => <option key={s} value={s}>{s ? titleCase(s) : 'All statuses'}</option>)}
          </select>
          <select className="filter-control" value={filters.preset} onChange={(e) => onPresetChange(e.target.value)} aria-label="Collection date range" title="Collection date">
            {DATE_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.value ? p.label : 'Any date'}</option>)}
          </select>
        </FilterBar>

        {advancedOpen && (
          <div className="adv-panel">
            <div className="adv-grid">
              {!branchScoped && (
                <div className="adv-field">
                  <span>Branches</span>
                  <MultiSelect
                    options={branchQuery.data ?? []}
                    selected={filters.branchIds}
                    onChange={(ids) => patch({ branchIds: ids })}
                    allLabel="All branches"
                    noun="branch"
                  />
                </div>
              )}
              <div className="adv-field">
                <span>Field officer</span>
                <MultiSelect
                  options={(officerQuery.data ?? []).map((o) => ({ id: o.id, name: o.fullName }))}
                  selected={filters.officerIds}
                  onChange={(ids) => patch({ officerIds: ids })}
                  allLabel="All officers"
                  noun="officer"
                />
              </div>
              {filters.preset === 'custom' && (
                <>
                  <label>From date<input type="date" value={filters.from} onChange={(e) => patch({ from: e.target.value })} /></label>
                  <label>To date<input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => patch({ to: e.target.value })} /></label>
                </>
              )}
              <label>Payment mode
                <select value={filters.paymentMode} onChange={(e) => patch({ paymentMode: e.target.value })}>
                  {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m ? titleCase(m.replaceAll('_', ' ')) : 'Any mode'}</option>)}
                </select>
              </label>
              <label>Min amount
                <input type="number" inputMode="decimal" value={filters.minAmount} onChange={(e) => patch({ minAmount: e.target.value })} placeholder="0" />
              </label>
              <label>Max amount
                <input type="number" inputMode="decimal" value={filters.maxAmount} onChange={(e) => patch({ maxAmount: e.target.value })} placeholder="Any" />
              </label>
              <label>Settlement auth
                <input value={filters.settlementAuthStatus} onChange={(e) => patch({ settlementAuthStatus: e.target.value })} placeholder="e.g. AUTHORIZED" />
              </label>
              {filters.preset === 'custom' && !filters.from && !filters.to && (
                <p className="adv-hint">Pick a From and/or To date to apply the custom range.</p>
              )}
            </div>

            <div className="adv-foot">
              <button type="button" className="sm" onClick={saveCurrent}>Save filter</button>
              {saved.length > 0 && (
                <div className="adv-saved">
                  <span className="muted sm-text">Saved:</span>
                  {saved.map((s) => (
                    <span key={s.name} className="adv-saved-tag">
                      <button type="button" onClick={() => applySaved(s)} title={`Apply "${s.name}"`}>{s.name}</button>
                      <button type="button" aria-label={`Delete ${s.name}`} onClick={() => deleteSaved(s.name)}><X size={12} /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <DataTable
        columns={COLUMNS}
        rows={rows}
        loading={listQuery.isLoading}
        empty="No collection records match these filters."
        searchable={false}
        server={{
          page: table.page, pageSize: table.pageSize, totalItems,
          onPageChange: table.setPage, sort: table.sort, onSortChange: table.onSortChange,
          search: table.search, onSearchChange: table.onSearchChange,
        }}
      />
    </>
  );
}
