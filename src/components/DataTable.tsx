import { ReactNode, useMemo, useState } from 'react';

export interface Column<T> {
  header: string;
  render: (row: T) => ReactNode;
  /** Comparable value used for sorting and searching this column. Omit to make the column non-sortable / excluded from search. */
  sortValue?: (row: T) => string | number | Date | null | undefined;
}

type SortDirection = 'asc' | 'desc';

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
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  empty?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ index: number; direction: SortDirection } | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      columns.some((c) => c.sortValue && String(c.sortValue(row) ?? '').toLowerCase().includes(q)),
    );
  }, [rows, columns, query]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const column = columns[sort.index];
    if (!column?.sortValue) return filtered;
    const accessor = column.sortValue;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const result = compareValues(accessor(a), accessor(b));
      return sort.direction === 'asc' ? result : -result;
    });
    return copy;
  }, [filtered, sort, columns]);

  const toggleSort = (index: number) => {
    setSort((previous) => {
      if (!previous || previous.index !== index) return { index, direction: 'asc' };
      if (previous.direction === 'asc') return { index, direction: 'desc' };
      return null; // third click clears sorting
    });
  };

  if (loading) return <div className="panel pad muted">Loading…</div>;

  const showSearch = searchable && rows.length > 0;

  return (
    <>
      {showSearch && (
        <div className="table-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchPlaceholder} aria-label="Search table" />
          {query && (
            <button type="button" className="table-search-clear" onClick={() => setQuery('')} aria-label="Clear search">×</button>
          )}
        </div>
      )}

      {!sorted.length ? (
        <div className="panel pad muted">{query ? 'No records match your search.' : empty ?? 'Nothing here yet.'}</div>
      ) : (
        <div className="panel">
          <table>
            <thead>
              <tr>
                {columns.map((c, index) => {
                  const active = sort?.index === index;
                  return (
                    <th
                      key={c.header}
                      className={c.sortValue ? 'sortable' : undefined}
                      onClick={c.sortValue ? () => toggleSort(index) : undefined}
                      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                    >
                      <span className="th-inner">
                        {c.header}
                        {c.sortValue && (
                          <span className={`sort-caret ${active ? sort.direction : 'idle'}`} aria-hidden="true">
                            {active ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}
                          </span>
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.id}>{columns.map((c) => <td key={c.header}>{c.render(row)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
