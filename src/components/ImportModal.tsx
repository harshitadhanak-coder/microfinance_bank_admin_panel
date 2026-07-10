import { useState } from 'react';
import axios from 'axios';
import { api } from '../api/client';
import { parseSpreadsheet, readCell, downloadCsvTemplate } from '../lib/importFile';
import { AlertCircle, Check, CheckCircle, Download, Loader, Upload, X } from './icons';

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
      <div className="modal modal-wide" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close dialog"><X size={18} /></button>
        </div>

        {!summary ? (
          <>
            <div className="modal-body">
              {/* Step 1 — get the template */}
              <div className="import-step">
                <span className="step-badge" aria-hidden="true">1</span>
                <div className="step-body">
                  <span className="step-title">Download the sample template</span>
                  <p className="step-hint">
                    Your file's header row must match these columns. Start from the template to get them right.
                  </p>
                  <ul className="import-cols">
                    {columns.map((c) => (
                      <li key={c.field} className="import-col">
                        <code>{c.header}</code>
                        <span className={`import-tag ${c.required ? 'req' : 'opt'}`}>{c.required ? 'Required' : 'Optional'}</span>
                      </li>
                    ))}
                  </ul>
                  <div>
                    <button type="button" className="ghost sm" onClick={downloadTemplate}>
                      <Download size={14} /> Download sample
                    </button>
                  </div>
                </div>
              </div>

              {/* Step 2 — upload the filled-in file */}
              <div className={`import-step${ready ? ' done' : ''}`}>
                <span className="step-badge" aria-hidden="true">{ready ? <Check size={15} /> : '2'}</span>
                <div className="step-body">
                  <span className="step-title">Upload your file</span>
                  <label className={`dropzone ${ready ? 'has-file' : ''}`}>
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ''; }}
                    />
                    <span className="dz-icon" aria-hidden="true">
                      {ready ? <Check size={20} /> : <Upload size={20} />}
                    </span>
                    <span className="dz-title">{fileName || 'Choose a file to upload'}</span>
                    <span className="dz-sub">
                      {ready
                        ? `${rows.length} row${rows.length === 1 ? '' : 's'} ready to import`
                        : 'Click to browse — .csv or .xlsx'}
                    </span>
                  </label>
                </div>
              </div>

              {busy && (
                <div className="progress-track" role="progressbar" aria-label="Import in progress">
                  <div className="progress-fill" />
                </div>
              )}

              {error && <div className="error-box"><AlertCircle size={16} /><span>{error}</span></div>}
            </div>

            <div className="modal-actions">
              <button type="button" className="ghost" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="button" disabled={busy || !ready} onClick={submit}>
                {busy ? <><Loader size={15} /> Importing…</>
                  : ready ? <><Upload size={15} /> Import {rows.length} row{rows.length === 1 ? '' : 's'}</>
                  : 'Import'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="modal-body">
              <div className={summary.failed === 0 ? 'success-box' : 'error-box'}>
                {summary.failed === 0 ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                <span>
                  Imported {summary.created} row{summary.created === 1 ? '' : 's'} successfully
                  {summary.failed > 0 ? `, ${summary.failed} could not be imported.` : '.'}
                </span>
              </div>
              {summary.failed > 0 && (
                <div className="panel table-scroll" style={{ maxHeight: '38vh' }}>
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
