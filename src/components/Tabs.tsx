import { ReactNode } from 'react';

export interface TabDef {
  key: string;
  label: ReactNode;
  /** Optional trailing count chip. */
  count?: number;
}

/**
 * One tab-strip component (brass underline). For sub-views of a single
 * record/page — not for jamming unrelated modules together. Controlled: the
 * owner keeps `active` (typically synced to a `?tab=` URL param) and reacts to
 * `onChange`. Overflowing tabs scroll horizontally, never wrap.
 */
export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={active === t.key}
          className={`tab${active === t.key ? ' active' : ''}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
          {t.count != null && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
