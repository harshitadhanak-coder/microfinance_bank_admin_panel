import { ReactNode, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, Search, X } from './icons';

export interface Column<T> {
  header: string;
  render: (row: T) => ReactNode;
  /** Comparable value used for client-side sorting and searching. Omit to make the column non-sortable / excluded from search. */
  sortValue?: (row: T) => string | number | Date | null | undefined;
  /** Backend field key for server-driven sorting. Required for a column to be sortable in server mode. */
  sortKey?: string;
}

type SortDirection = 'asc' | 'desc';

/**
 * Server-driven table model. When supplied, the table stops doing any local
 * filtering/sorting/paging and instead reflects controlled state, delegating
 * every change back to the owner (which refetches from the API).
 */
export interface ServerTableModel {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  sort: { key: string; direction: SortDirection } | null;
  onSortChange: (key: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
}

const isEmpty = (value: unknown): boolean => value === null || value === undefined || value === '';

/** Generic comparison covering text (locale + numeric-aware), numbers and dates. Empty values sort last. */
function compareValues(a: unknown, b: unknown): number {
  if (isEmpty(a) && isEmpty(b)) return 0;
  if (isEmpty(a)) return 1;
  if (isEmpty(b)) return -1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  loading,
  empty,
  searchable = true,
  searchPlaceholder = 'Search records…',
  pageSize = 10,
  server,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  empty?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Rows per page for client-side pagination. Pass 0 to disable paging. Ignored in server mode. */
  pageSize?: number;
  /** Enables API-driven pagination/sorting/search. When omitted the table pages locally. */
  server?: ServerTableModel;
}) {
  const isServer = !!server;
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ index: number; direction: SortDirection } | null>(null);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (isServer) return rows;
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      columns.some((c) => c.sortValue && String(c.sortValue(row) ?? '').toLowerCase().includes(q)),
    );
  }, [rows, columns, query, isServer]);

  const sorted = useMemo(() => {
    if (isServer || !sort) return filtered;
    const column = columns[sort.index];
    if (!column?.sortValue) return filtered;
    const accessor = column.sortValue;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const result = compareValues(accessor(a), accessor(b));
      return sort.direction === 'asc' ? result : -result;
    });
    return copy;
  }, [filtered, sort, columns, isServer]);

  const clientPaged = !isServer && pageSize > 0;
  const clientTotalPages = clientPaged ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;

  // Snap back to a valid page whenever the local result set shrinks (new search
  // or filter) so we never strand the user on an empty page. Server mode owns
  // its own page, so this only runs locally.
  useEffect(() => {
    if (!isServer) setPage((p) => Math.min(Math.max(1, p), clientTotalPages));
  }, [clientTotalPages, isServer]);

  const clientPageRows = useMemo(() => {
    if (!clientPaged) return sorted;
    const start = (Math.min(page, clientTotalPages) - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page, clientTotalPages, pageSize, clientPaged]);

  const toggleSort = (index: number) => {
    setSort((previous) => {
      if (!previous || previous.index !== index) return { index, direction: 'asc' };
      if (previous.direction === 'asc') return { index, direction: 'desc' };
      return null; // third click clears sorting
    });
  };

  if (loading) return <div className="panel pad muted">Loading…</div>;

  // ── Derived view state, unified across client/server modes ──
  const displayRows = isServer ? rows : clientPageRows;
  const searchValue = isServer ? server!.search : query;
  const hasSearch = searchValue.trim().length > 0;
  const rowsEmpty = displayRows.length === 0;
  const showSearch = searchable && (isServer || rows.length > 0 || hasSearch);

  const onSearch = (value: string) => (isServer ? server!.onSearchChange(value) : (setQuery(value), setPage(1)));
  const clearSearch = () => onSearch('');

  const totalItems = isServer ? server!.totalItems : sorted.length;
  const activePageSize = isServer ? server!.pageSize : pageSize;
  const currentPage = isServer ? server!.page : Math.min(page, clientTotalPages);
  const totalPages = isServer ? Math.max(1, Math.ceil(totalItems / activePageSize)) : clientTotalPages;
  const showPager = (isServer || clientPaged) && totalPages > 1;
  const goToPage = (p: number) => (isServer ? server!.onPageChange(p) : setPage(p));

  const columnSortable = (c: Column<T>) => (isServer ? !!c.sortKey : !!c.sortValue);
  const columnActive = (c: Column<T>, index: number) =>
    isServer ? server!.sort?.key === c.sortKey : sort?.index === index;
  const activeDirection: SortDirection | undefined = isServer ? server!.sort?.direction : sort?.direction;
  const onHeaderClick = (c: Column<T>, index: number) =>
    isServer ? server!.onSortChange(c.sortKey!) : toggleSort(index);

  return (
    <>
      {showSearch && (
        <div className="table-search">
          <Search size={16} />
          <input value={searchValue} onChange={(e) => onSearch(e.target.value)} placeholder={searchPlaceholder} aria-label="Search table" />
          {hasSearch && (
            <button type="button" className="table-search-clear" onClick={clearSearch} aria-label="Clear search"><X size={14} /></button>
          )}
        </div>
      )}

      {rowsEmpty ? (
        <div className="panel pad muted">{hasSearch ? 'No records match your search.' : empty ?? 'Nothing here yet.'}</div>
      ) : (
        <div className="panel">
          <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {columns.map((c, index) => {
                  const sortableCol = columnSortable(c);
                  const active = sortableCol && columnActive(c, index);
                  return (
                    <th
                      key={c.header}
                      className={sortableCol ? 'sortable' : undefined}
                      onClick={sortableCol ? () => onHeaderClick(c, index) : undefined}
                      aria-sort={active ? (activeDirection === 'asc' ? 'ascending' : 'descending') : undefined}
                    >
                      <span className="th-inner">
                        {c.header}
                        {sortableCol && (
                          <span className={`sort-caret ${active ? activeDirection : 'idle'}`} aria-hidden="true">
                            {active
                              ? (activeDirection === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />)
                              : <ChevronsUpDown size={13} />}
                          </span>
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row) => (
                <tr key={row.id}>{columns.map((c) => <td key={c.header}>{c.render(row)}</td>)}</tr>
              ))}
            </tbody>
          </table>
          </div>

          {showPager && (
            <div className="table-pager">
              <span className="muted sm-text">
                {(currentPage - 1) * activePageSize + 1}–{Math.min(currentPage * activePageSize, totalItems)} of {totalItems}
              </span>
              <div className="pager-controls">
                <button type="button" className="sm ghost" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}>
                  Previous
                </button>
                <span className="sm-text">Page {currentPage} of {totalPages}</span>
                <button type="button" className="sm ghost" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages}>
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
