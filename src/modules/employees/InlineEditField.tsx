import { KeyboardEvent, ReactNode, useState } from 'react';
import { Check, Loader, Pencil, X } from '../../components/icons';

export type InlineKind = 'text' | 'email' | 'number' | 'date' | 'select';
export interface InlineOption { value: string; label: string }

interface Props {
  label: string;
  /** Raw current value, used to prefill the editor (ignored for `sensitive`). */
  value: string;
  /** What renders in read mode. Defaults to `value || '—'`. */
  display?: ReactNode;
  kind?: InlineKind;
  /** Options for `kind="select"`. */
  options?: InlineOption[];
  /** Normalises the draft before saving (e.g. upper-casing PAN / IFSC). */
  transform?: (value: string) => string;
  placeholder?: string;
  /** Format hint under the editor (e.g. "12 digits"). */
  hint?: string;
  /**
   * Encrypted / write-only fields (Aadhaar, PAN, bank account). The editor opens
   * blank with a "leave blank to keep" note, so the masked value is never
   * round-tripped back as if it were the real one.
   */
  sensitive?: boolean;
  canEdit?: boolean;
  /** Persists the new value; reject to keep the editor open for a retry. */
  onSave: (value: string) => Promise<unknown>;
}

/**
 * One row of a `detail-list` that turns into an inline editor on double-click
 * (or the hover pencil), for HR / Super Admin. Enter or the check saves; Escape
 * or the ✕ cancels. An empty draft — and, for plain fields, an unchanged one —
 * is a no-op, matching the "leave blank to keep" rule the Edit form already uses.
 *
 * Renders the `<div><dt/><dd/></div>` a `.detail-list` expects, so it drops
 * straight into the existing markup in place of a static row.
 */
export function InlineEditField({
  label, value, display, kind = 'text', options, transform,
  placeholder, hint, sensitive = false, canEdit = false, onSave,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const start = () => {
    if (!canEdit || saving) return;
    setDraft(sensitive ? '' : value);
    setEditing(true);
  };
  const cancel = () => { setEditing(false); setDraft(''); };
  const commit = async () => {
    const next = (transform ? transform(draft) : draft).trim();
    // Blank keeps the current value (and is the only "keep" path for sensitive
    // fields); an unchanged plain value needs no round-trip either.
    if (!next || (!sensitive && next === value)) { cancel(); return; }
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
      setDraft('');
    } catch {
      /* the page toasts the error; leave the editor open so it can be retried */
    } finally {
      setSaving(false);
    }
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && kind !== 'select') { event.preventDefault(); void commit(); }
    if (event.key === 'Escape') { event.preventDefault(); cancel(); }
  };

  if (editing) {
    return (
      <div className="editing">
        <dt>{label}</dt>
        <dd>
          <div className="inline-edit">
            {kind === 'select' ? (
              <select value={draft} autoFocus onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey}>
                <option value="">— Select —</option>
                {options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input
                type={kind === 'date' ? 'date' : kind === 'number' ? 'number' : kind === 'email' ? 'email' : 'text'}
                value={draft}
                autoFocus
                placeholder={sensitive ? 'leave blank to keep' : placeholder}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKey}
              />
            )}
            <button type="button" className="icon-btn" title="Save" disabled={saving} onClick={() => void commit()}>
              {saving ? <Loader size={14} /> : <Check size={14} />}
            </button>
            <button type="button" className="icon-btn" title="Cancel" disabled={saving} onClick={cancel}>
              <X size={14} />
            </button>
          </div>
          {(hint || sensitive) && (
            <div className="inline-edit-hint">{hint ?? 'Leave blank to keep the current value.'}</div>
          )}
        </dd>
      </div>
    );
  }

  return (
    <div className={canEdit ? 'editable' : undefined}>
      <dt>{label}</dt>
      <dd onDoubleClick={start} title={canEdit ? 'Double-click to edit' : undefined}>
        <span className="inline-value">{display ?? (value || '—')}</span>
        {canEdit && (
          <button type="button" className="icon-btn edit-pencil" title={`Edit ${label.toLowerCase()}`} onClick={start}>
            <Pencil size={13} />
          </button>
        )}
      </dd>
    </div>
  );
}
