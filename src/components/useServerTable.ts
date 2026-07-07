import { useEffect, useMemo, useState } from 'react';

export type SortDirection = 'asc' | 'desc';
export interface SortState { key: string; direction: SortDirection }

/**
 * State container for a server-driven table: page, debounced search and a
 * single sort column. It exposes the encoded query string the list endpoints
 * expect (`page`, `pageSize`, `search`, `sortBy`, `sortOrder`) plus the handlers
 * the DataTable's server model needs.
 */
export function useServerTable(options?: {
  pageSize?: number;
  initialSort?: SortState;
}) {
  const pageSize = options?.pageSize ?? 10;
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState<SortState | null>(options?.initialSort ?? null);

  // Debounce the search box so we hit the API at most once per pause in typing,
  // and always jump back to page 1 when the query changes.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const onSearchChange = (value: string) => setSearch(value);

  // Cycle a column through asc → desc → unsorted, resetting to page 1.
  const onSortChange = (key: string) => {
    setPage(1);
    setSort((previous) => {
      if (!previous || previous.key !== key) return { key, direction: 'asc' };
      if (previous.direction === 'asc') return { key, direction: 'desc' };
      return null;
    });
  };

  // Extra query params (e.g. a status filter) are merged by the caller.
  const params = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set('page', String(page));
    qs.set('pageSize', String(pageSize));
    if (debouncedSearch) qs.set('search', debouncedSearch);
    if (sort) {
      qs.set('sortBy', sort.key);
      qs.set('sortOrder', sort.direction);
    }
    return qs.toString();
  }, [page, pageSize, debouncedSearch, sort]);

  return {
    page,
    pageSize,
    search,
    sort,
    params,
    setPage,
    onSearchChange,
    onSortChange,
  };
}
