import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import type { ModuleDef, NavSection } from '../modules/auth/permissions';
import { MODULE_ICONS } from '../modules/nav/moduleIcons';
import { topRoutes } from '../modules/nav/frequent';
import { Search } from './icons';

/** A module plus the group it lives in, so results can show "in Operations". */
interface Entry {
  module: ModuleDef;
  groupLabel: string;
}

/**
 * Ranks an entry against the typed query. Higher is better; 0 means no match.
 * Word-start hits beat mid-word hits so "rec" puts "Records" above "Reconcile
 * bank" only when the label genuinely starts that way, and the group name is
 * searchable too ("ops" finds everything under Operations).
 */
const score = (entry: Entry, q: string): number => {
  const label = entry.module.label.toLowerCase();
  const group = entry.groupLabel.toLowerCase();
  if (label.startsWith(q)) return 100;
  // A hit at the start of any word — "bank dep" style typing.
  if (label.split(/\s+/).some((w) => w.startsWith(q))) return 80;
  if (label.includes(q)) return 60;
  if (group.startsWith(q) || group.split(/\s+/).some((w) => w.startsWith(q))) return 40;
  if (group.includes(q)) return 20;
  return 0;
};

/**
 * Ctrl/⌘-K launcher over every nav module the signed-in role can reach. It is
 * the primary way to move around the panel: with ~35 screens, typing three
 * letters beats expanding a group and scanning it. With an empty query it lists
 * the user's most-visited screens so it doubles as a jump list.
 */
export function CommandPalette({ sections, onClose }: { sections: NavSection[]; onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const entries = useMemo<Entry[]>(
    () => sections.flatMap((s) => s.modules.map((module) => ({ module, groupLabel: s.label }))),
    [sections],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // No query: most-visited first (in visit order), then everything else.
      const ranked = topRoutes(6);
      const frequent = ranked
        .map((route) => entries.find((e) => e.module.to === route))
        .filter((e): e is Entry => e != null);
      const rest = entries.filter((e) => !frequent.includes(e));
      return { items: [...frequent, ...rest], frequentCount: frequent.length };
    }
    const items = entries
      .map((entry) => ({ entry, s: score(entry, q) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s || a.entry.module.label.localeCompare(b.entry.module.label))
      .map((r) => r.entry);
    return { items, frequentCount: 0 };
  }, [entries, query]);

  // Any change to the result set invalidates the highlighted row.
  useEffect(() => { setCursor(0); }, [query]);

  // Keep the highlighted row visible while arrowing through a long list.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const go = (module: ModuleDef) => { navigate(module.to); onClose(); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const last = results.items.length - 1;
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => (c >= last ? 0 : c + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => (c <= 0 ? last : c - 1)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = results.items[cursor];
      if (hit) go(hit.module);
    }
  };

  return createPortal(
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Jump to a page" onClick={(e) => e.stopPropagation()}>
        <div className="palette-search">
          <Search size={17} />
          <input
            autoFocus
            type="text"
            value={query}
            placeholder="Jump to a page…"
            aria-label="Search pages"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <kbd className="palette-kbd">Esc</kbd>
        </div>

        <div className="palette-results" ref={listRef} role="listbox" aria-label="Pages">
          {results.items.length === 0 && <p className="palette-empty">No page matches “{query.trim()}”.</p>}
          {results.items.map((entry, i) => (
            <div key={entry.module.to} className="palette-row-wrap">
              {results.frequentCount > 0 && i === 0 && <p className="palette-group">Frequent</p>}
              {results.frequentCount > 0 && i === results.frequentCount && <p className="palette-group">All pages</p>}
              <button
                type="button"
                role="option"
                aria-selected={i === cursor}
                data-active={i === cursor}
                className="palette-row"
                onMouseMove={() => setCursor(i)}
                onClick={() => go(entry.module)}
              >
                <span className="palette-row-icon">{MODULE_ICONS[entry.module.key]}</span>
                <span className="palette-row-label">{entry.module.label}</span>
                <span className="palette-row-group">{entry.groupLabel}</span>
              </button>
            </div>
          ))}
        </div>

        <div className="palette-foot">
          <span><kbd className="palette-kbd">↑</kbd><kbd className="palette-kbd">↓</kbd> to move</span>
          <span><kbd className="palette-kbd">↵</kbd> to open</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
