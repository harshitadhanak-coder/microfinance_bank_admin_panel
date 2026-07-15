import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { CardsSkeleton } from '../../components/Skeleton';
import { ArrowRight, Search } from '../../components/icons';
import { CatalogItem, CATEGORY_LABEL, CATEGORY_ORDER } from './reportsShared';

/**
 * Reports — Catalog. The 30-report library grouped by its five categories; each
 * report is a card linking to its own runner route (`/reports/:reportKey`) so a
 * specific report is deep-linkable and shareable.
 */
export default function ReportsCatalogPage() {
  const [q, setQ] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['/human-resources/reports/catalog'],
    queryFn: () => api.get('/human-resources/reports/catalog').then((r) => r.data.data as CatalogItem[]),
  });
  const catalog = data ?? [];

  const query = q.trim().toLowerCase();
  const filtered = useMemo(
    () => (query ? catalog.filter((c) => `${c.title} ${c.description}`.toLowerCase().includes(query)) : catalog),
    [catalog, query],
  );
  const grouped = CATEGORY_ORDER
    .map((cat) => ({ cat, items: filtered.filter((c) => c.category === cat) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Insights' }, { label: 'Reports' }]}
        title="Reports"
        subtitle="Generate, preview and export HR reports across employees, attendance, leave and payroll"
      />

      <div className="table-search" style={{ maxWidth: 360 }}>
        <Search size={16} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reports…" aria-label="Search reports" />
      </div>

      {isLoading ? (
        <CardsSkeleton count={6} />
      ) : grouped.length === 0 ? (
        <EmptyState variant={query ? 'no-results' : 'no-data'} title={query ? 'No matching reports' : 'No reports available'} message={query ? 'Try a different search.' : undefined} />
      ) : (
        grouped.map((g) => (
          <section key={g.cat} style={{ marginBottom: '1.5rem' }}>
            <h2 className="section-title">{CATEGORY_LABEL[g.cat]}</h2>
            <div className="hub-grid">
              {g.items.map((item) => (
                <Link key={item.key} to={`/reports/${item.key}`} className="hub-tile">
                  <div className="hub-tile-body">
                    <div className="hub-tile-head"><h3>{item.title}</h3></div>
                    <p className="muted sm-text">{item.description}</p>
                  </div>
                  <ArrowRight size={16} className="hub-tile-go" />
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}
