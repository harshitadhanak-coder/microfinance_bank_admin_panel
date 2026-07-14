/**
 * Lightweight, dependency-free SVG/CSS charts themed to the admin design system.
 * Kept intentionally small — a donut, a vertical bar chart, a line/area trend and
 * a horizontal bar list — so the HR dashboard reads as one consistent surface
 * without pulling in a charting library.
 */

/** Ordered categorical palette drawn from the app's ledger theme tokens. */
export const CHART_COLORS = ['#b08a3c', '#1d7a4f', '#3c4a8f', '#a36a10', '#b3392f', '#2e4a3d', '#7a8ca0', '#8f6e2c'];

export interface Slice { label: string; value: number; color?: string }

const withColors = (data: Slice[]): Required<Slice>[] =>
  data.map((d, i) => ({ ...d, color: d.color ?? CHART_COLORS[i % CHART_COLORS.length] }));

// ── Donut ───────────────────────────────────────────────────────────────────
export function DonutChart({
  data, size = 152, thickness = 22, centerValue, centerLabel,
}: { data: Slice[]; size?: number; thickness?: number; centerValue?: string | number; centerLabel?: string }) {
  const slices = withColors(data);
  const total = slices.reduce((s, d) => s + d.value, 0);
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="donut" role="img" aria-label="Donut chart">
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={thickness} />
        {total > 0 && slices.map((d, i) => {
          const len = (d.value / total) * circ;
          const el = (
            <circle
              key={i} cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={d.color} strokeWidth={thickness}
              strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-offset}
            />
          );
          offset += len;
          return el;
        })}
      </g>
      {centerValue != null && (
        <text x="50%" y="47%" textAnchor="middle" className="donut-value">{centerValue}</text>
      )}
      {centerLabel && (
        <text x="50%" y="47%" dy="1.35em" textAnchor="middle" className="donut-label">{centerLabel}</text>
      )}
    </svg>
  );
}

export function ChartLegend({ data }: { data: Slice[] }) {
  const slices = withColors(data);
  const total = slices.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <ul className="chart-legend">
      {slices.map((d) => (
        <li key={d.label}>
          <span className="legend-dot" style={{ background: d.color }} />
          <span className="legend-label">{d.label}</span>
          <span className="legend-value">{d.value}<span className="muted"> · {Math.round((d.value / total) * 100)}%</span></span>
        </li>
      ))}
    </ul>
  );
}

// ── Vertical bars ─────────────────────────────────────────────────────────────
export function VBarChart({
  data, height = 170, color = '#b08a3c', valueSuffix = '',
}: { data: Slice[]; height?: number; color?: string; valueSuffix?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="vbar" style={{ height }}>
      {data.map((d) => (
        <div key={d.label} className="vbar-col" title={`${d.label}: ${d.value}${valueSuffix}`}>
          <span className="vbar-value">{d.value}</span>
          <span className="vbar-fill" style={{ height: `${(d.value / max) * 100}%`, background: d.color ?? color }} />
          <span className="vbar-label">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Line / area trend ─────────────────────────────────────────────────────────
export function LineChart({
  points, labels, color = '#1d7a4f', height = 180,
}: { points: number[]; labels: string[]; color?: string; height?: number }) {
  const W = 360;
  const H = height;
  const padX = 26;
  const padTop = 16;
  const padBottom = 26;
  const max = Math.max(1, ...points);
  const innerW = W - padX * 2;
  const innerH = H - padTop - padBottom;
  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;
  const xy = points.map((p, i) => [padX + i * stepX, padTop + innerH - (p / max) * innerH] as const);
  const line = xy.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${(padX + innerW).toFixed(1)},${(padTop + innerH).toFixed(1)} L${padX},${(padTop + innerH).toFixed(1)} Z`;
  const gridLines = [0, 0.5, 1];

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="linechart" role="img" aria-label="Trend chart" preserveAspectRatio="xMidYMid meet">
      {gridLines.map((g) => {
        const y = padTop + innerH - g * innerH;
        return <line key={g} x1={padX} y1={y} x2={W - padX} y2={y} className="chart-grid" />;
      })}
      <path d={area} fill={color} opacity={0.1} />
      <path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {xy.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={3} fill="#fff" stroke={color} strokeWidth={2} />)}
      {labels.map((l, i) => (
        <text key={i} x={xy[i]?.[0] ?? padX} y={H - 8} textAnchor="middle" className="chart-axis">{l}</text>
      ))}
    </svg>
  );
}

// ── Horizontal bar list (labelled distributions) ─────────────────────────────
export function BarList({ data, valueSuffix = '' }: { data: Slice[]; valueSuffix?: string }) {
  const slices = withColors(data);
  const max = Math.max(1, ...slices.map((d) => d.value));
  return (
    <ul className="bar-list">
      {slices.map((d) => (
        <li key={d.label}>
          <span className="bar-list-label" title={d.label}>{d.label}</span>
          <span className="bar-list-track">
            <span className="bar-list-fill" style={{ width: `${(d.value / max) * 100}%`, background: d.color }} />
          </span>
          <span className="bar-list-value">{d.value}{valueSuffix}</span>
        </li>
      ))}
    </ul>
  );
}
