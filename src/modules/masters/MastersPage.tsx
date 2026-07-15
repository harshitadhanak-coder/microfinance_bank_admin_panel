import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { ArrowRight, Settings2 } from '../../components/icons';
import { MASTER_CONFIG, MASTER_ORDER, MasterKey } from './mastersConfig';

/**
 * Organization Masters — Hub. A card per reference dataset (with a live row
 * count) linking to its own list route (`/masters/:resource`), replacing the old
 * six-tab mega-page so each master is deep-linkable.
 */
export default function MastersPage() {
  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Administration' }, { label: 'Organization Masters' }]}
        title="Organization Masters"
        subtitle="Reference data that powers employee records, attendance and payroll"
      />
      <div className="hub-grid">
        {MASTER_ORDER.map((key) => <HubTile key={key} resourceKey={key} />)}
      </div>
    </>
  );
}

function HubTile({ resourceKey }: { resourceKey: MasterKey }) {
  const def = MASTER_CONFIG[resourceKey];
  const { data } = useQuery({
    queryKey: [`/masters/${resourceKey}`, 'count'],
    queryFn: () => api.get(`/masters/${resourceKey}?page=1&pageSize=1`).then((r) => r.data.pagination?.totalItems as number),
  });

  return (
    <Link to={`/masters/${resourceKey}`} className="hub-tile">
      <span className="hub-tile-icon"><Settings2 size={20} /></span>
      <div className="hub-tile-body">
        <div className="hub-tile-head">
          <h3>{def.label}</h3>
          <span className="hub-tile-count">{data ?? '—'}</span>
        </div>
        <p className="muted sm-text">{def.description}</p>
      </div>
      <ArrowRight size={16} className="hub-tile-go" />
    </Link>
  );
}
