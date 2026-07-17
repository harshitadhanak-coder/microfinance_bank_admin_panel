import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from './icons';

export interface MultiSelectOption {
  id: string;
  name: string;
}

/**
 * Checkbox dropdown for selecting many options at once — a searchable popover
 * with Select-all / Clear, closing on outside click. The trigger reads the
 * `allLabel` when nothing is picked, the option name for exactly one, and
 * "N selected" otherwise. Shared by the collection Records and Branch Closing
 * Report filter panels so both behave identically.
 */
export function MultiSelect({ options, selected, onChange, allLabel, noun }: {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  allLabel: string;
  noun: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const label = selected.length === 0
    ? allLabel
    : selected.length === 1
      ? (options.find((o) => o.id === selected[0])?.name ?? '1 selected')
      : `${selected.length} selected`;
  const filtered = options.filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div className="multiselect" ref={ref}>
      <button type="button" className={`ghost ms-trigger${selected.length ? ' has-value' : ''}`} onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="ms-label">{label}</span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="ms-pop" role="listbox">
          <input className="ms-search" placeholder={`Search ${noun}…`} value={q} onChange={(e) => setQ(e.target.value)} autoFocus aria-label={`Search ${noun}`} />
          <div className="ms-actions">
            <button type="button" onClick={() => onChange(options.map((o) => o.id))}>Select all</button>
            <button type="button" onClick={() => onChange([])}>Clear</button>
          </div>
          <div className="ms-list">
            {filtered.map((o) => (
              <label key={o.id} className="ms-opt">
                <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} />
                <span>{o.name}</span>
              </label>
            ))}
            {filtered.length === 0 && <div className="muted sm-text" style={{ padding: '0.4rem 0.5rem' }}>No {noun} found.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
