import { useState } from 'react';
import axios from 'axios';
import { api } from '../api/client';
import { parseSpreadsheet, readCell, downloadCsvTemplate } from '../lib/importFile';

export interface ImportColumn {
  /** API payload field name this column maps to. */
  field: string;
  /** Spreadsheet column header (also used in the template). */
  header: string;
  example: string;
  required?: boolean;
  numeric?: boolean;
}

interface ImportResultRow {
  row: number;
  status: 'created' | 'failed';
  error?: string;
}
interface ImportSummary {
  created: number;
  failed: number;
  results: ImportResultRow[];
}

const apiMessage = (err: unknown, fallback: string): string =>
  (axios.isAxiosError(err) && err.response?.data?.message) || fallback;

/**
 * Generic CSV/Excel import dialog. Parses the file on the client, maps each row
 * to the API field names via `columns`, POSTs the batch, and shows a per-row
 * result summary. The backend validates every row and reports which succeeded.
 */
export default function ImportModal({
  title,
  endpoint,
  templateName,
  columns,
  onClose,
  onDone,
}: {
  title: string;
  endpoint: string;
  templateName: string;
  columns: ImportColumn[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const buildRows = (parsed: Record<string, unknown>[]): Record<string, unknown>[] =>
    parsed
      .map((raw) => {
        const payload: Record<string, unknown> = {};
        for (const column of columns) {
          const cell = readCell(raw, column.header);
          if (cell === undefined || cell === null || String(cell).trim() === '') continue;
          payload[column.field] = column.numeric ? Number(cell) : String(cell).trim();
        }
        return payload;
      })
      // Drop entirely blank rows (trailing lines in a spreadsheet).
      .filter((payload) => Object.keys(payload).length > 0);

  const onFile = async (file: File) => {
    setError('');
    setSummary(null);
    try {
      const parsed = await parseSpreadsheet(file);
      const mapped = buildRows(parsed);
      if (mapped.length === 0) {
        setError('No data rows were found in this file. Use the template as a guide.');
        setRows([]);
      } else {
        setRows(mapped);
      }
      setFileName(file.name);
    } catch {
      setError('Could not read this file. Please upload a .csv or .xlsx file.');
      setRows([]);
      setFileName('');
    }
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post(endpoint, { rows });
      setSummary(data.data as ImportSummary);
      onDone();
    } catch (err) {
      setError(apiMessage(err, 'The import could not be completed.'));
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () =>
    downloadCsvTemplate(templateName, columns.map((c) => c.header), columns.map((c) => c.example));

  const ready = rows.length > 0 && !error;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h2>{title}</h2>
          <button type="button" className="ghost sm" onClick={onClose}>Close</button>
        </div>

        {!summary ? (
          <>
            <div className="modal-body">
              <p className="muted sm-text" style={{ margin: 0 }}>
                Upload a CSV or Excel (.xlsx) file whose header row matches these columns:
              </p>

              <ul className="import-cols">
                {columns.map((c) => (
                  <li key={c.field} className="import-col">
                    <code>{c.header}</code>
                    <span className={`import-tag ${c.required ? 'req' : 'opt'}`}>{c.required ? 'Required' : 'Optional'}</span>
                  </li>
                ))}
              </ul>

              <label className={`dropzone ${ready ? 'has-file' : ''}`}>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ''; }}
                />
                <span className="dz-icon" aria-hidden="true">
                  {ready ? '✓' : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  )}
                </span>
                <span className="dz-title">{fileName || 'Choose a file to upload'}</span>
                <span className="dz-sub">
                  {ready
                    ? `${rows.length} row${rows.length === 1 ? '' : 's'} ready to import`
                    : 'Click to browse — .csv or .xlsx'}
                </span>
              </label>

              <button type="button" className="link-btn" onClick={downloadTemplate}>Download a template file</button>

              {error && <div className="error-box">{error}</div>}
            </div>

            <div className="modal-actions">
              <button type="button" className="ghost" onClick={onClose}>Cancel</button>
              <button type="button" disabled={busy || !ready} onClick={submit}>
                {busy ? 'Importing…' : ready ? `Import ${rows.length} row${rows.length === 1 ? '' : 's'}` : 'Import'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="modal-body">
              <div className={summary.failed === 0 ? 'success-box' : 'error-box'}>
                Imported {summary.created} row{summary.created === 1 ? '' : 's'} successfully
                {summary.failed > 0 ? `, ${summary.failed} could not be imported.` : '.'}
              </div>
              {summary.failed > 0 && (
                <div className="panel table-scroll" style={{ maxHeight: '38vh', overflowY: 'auto' }}>
                  <table>
                    <thead><tr><th>Row</th><th>Reason</th></tr></thead>
                    <tbody>
                      {summary.results.filter((r) => r.status === 'failed').map((r) => (
                        <tr key={r.row}><td>{r.row}</td><td className="wrap">{r.error}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button type="button" onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
