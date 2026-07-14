import { CSSProperties } from 'react';

/**
 * Neutral-grey skeleton placeholder with a subtle shimmer. Used instead of a
 * spinner so loading states mirror the shape of the real content (tables,
 * cards) and the layout never jumps when data arrives.
 */
export function Skeleton({ width, height = 14, radius = 6, style }: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: CSSProperties;
}) {
  return <span className="skeleton" style={{ width: width ?? '100%', height, borderRadius: radius, ...style }} aria-hidden="true" />;
}

/** Deterministic-looking varied bar widths so rows don't read as a uniform grid. */
const barWidth = (row: number, col: number, last: boolean) =>
  last ? '48%' : `${58 + ((row * 7 + col * 13) % 4) * 10}%`;

/** Table-shaped placeholder that mirrors the real table's header + rows. */
export function TableSkeleton({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="panel" role="status" aria-busy="true" aria-label="Loading">
      <div className="table-scroll">
        <table className="skeleton-table">
          <thead>
            <tr>
              {Array.from({ length: columns }).map((_, c) => (
                <th key={c}><Skeleton width={c === 0 ? '55%' : '40%'} height={11} /></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, r) => (
              <tr key={r}>
                {Array.from({ length: columns }).map((_, c) => (
                  <td key={c}><Skeleton width={barWidth(r, c, c === columns - 1)} height={13} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Stat-card grid placeholder (dashboards, summaries). */
export function CardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="stat-grid" role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div className="stat" key={i}>
          <Skeleton width="45%" height={10} />
          <Skeleton width="72%" height={22} style={{ marginTop: 12 }} />
        </div>
      ))}
    </div>
  );
}
