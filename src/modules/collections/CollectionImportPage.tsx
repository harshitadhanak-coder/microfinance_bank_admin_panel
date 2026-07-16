import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/Card';
import { Badge, BadgeTone } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { useToast } from '../../components/Toast';
import { Loader, Upload } from '../../components/icons';
import { apiMessage, fmtDate } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { canAccessModule } from '../auth/permissions';

interface PreviewRow {
  rowNumber: number; sheetName: string; transactionId: string | null; loanAccountNumber: string | null;
  customerName: string | null; amount: number; collectionDate: string | null;
  status: 'COLLECTED' | 'REJECTED'; resolvedBranch: string | null; resolvedOfficer: string | null;
  action: 'CREATE' | 'UPDATE' | 'SKIP'; errors: string[]; warnings: string[];
}
interface Preview {
  summary: { total: number; valid: number; create: number; update: number; invalid: number; warnings: number; unmatchedBranches: number; unmatchedOfficers: number; rejected: number };
  unresolvedBranches: string[];
  unresolvedOfficers: string[];
  rows: PreviewRow[];
}
interface ImportResult {
  batchId: string; status: string;
  summary: { total: number; created: number; updated: number; skipped: number; failed: number; unmatchedBranches: number; unmatchedOfficers: number; rejected: number };
  errors: { rowNumber: number; transactionId: string | null; messages: string[] }[];
}
interface Batch {
  id: string; fileName: string | null; status: string; totalRows: number;
  createdCount: number; updatedCount: number; skippedCount: number; failedCount: number; createdAt: string;
}

const ACTION_TONE: Record<string, BadgeTone> = { CREATE: 'success', UPDATE: 'info', SKIP: 'danger' };
const STATUS_TONE: Record<string, BadgeTone> = { COLLECTED: 'success', REJECTED: 'warning' };
const ROW_CAP = 100; // preview can be 10k+ rows — cap what we render to the DOM
const inr = (n: number) => `₹${Number(n).toLocaleString('en-IN')}`;

/**
 * Collections — Import. Super Admin uploads the client's Business-Correspondent
 * collection workbook (.xlsx, e.g. the "MTD" / "Reject" sheets). The page
 * previews every row (create/update/skip + warnings), then confirms. Rows are
 * upserted on the bank's unique Transaction Id, so re-uploading the same file
 * updates in place and never creates duplicates. Mirrors the employee-import
 * page.
 */
export default function CollectionImportPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [mode, setMode] = useState<'SKIP_INVALID' | 'ALL_OR_NOTHING'>('SKIP_INVALID');
  const [busy, setBusy] = useState<'' | 'preview' | 'import'>('');
  const [error, setError] = useState('');

  const allowed = canAccessModule(user?.role, 'collectionImport');
  const batches = useQuery({
    queryKey: ['/collections/import/batches'],
    queryFn: async () => (await api.get('/collections/import/batches')).data.data as Batch[],
    enabled: allowed,
  });

  if (!allowed) return <p className="muted">You do not have permission to import collections.</p>;

  const pick = (f: File | null) => { setFile(f); setPreview(null); setResult(null); setError(''); };

  const buildForm = () => { const fd = new FormData(); fd.append('file', file!); return fd; };

  const doPreview = async () => {
    if (!file) return;
    setBusy('preview'); setError(''); setResult(null);
    try {
      setPreview((await api.post('/collections/import/preview', buildForm())).data.data);
    } catch (e) { setError(apiMessage(e, 'Preview failed.')); } finally { setBusy(''); }
  };

  const doImport = async () => {
    if (!file) return;
    setBusy('import'); setError('');
    try {
      const fd = buildForm(); fd.append('mode', mode);
      const res = (await api.post('/collections/import', fd)).data.data as ImportResult;
      setResult(res);
      toast.success(`Import ${res.status.toLowerCase().replace(/_/g, ' ')}.`);
      qc.invalidateQueries({ queryKey: ['/collections/import/batches'] });
    } catch (e) { setError(apiMessage(e, 'Import failed.')); } finally { setBusy(''); }
  };

  const s = preview?.summary;
  const shownRows = preview?.rows.slice(0, ROW_CAP) ?? [];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Operations' }, { label: 'Collections', to: '/collections' }, { label: 'Import' }]}
        title="Import collections"
        subtitle="Upload the client collection workbook (.xlsx). Rows are matched on the bank's Transaction Id — re-uploads update in place, never duplicate."
      />

      <Card title="Upload workbook">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
          <div className="check-row">
            <label className="check"><input type="radio" name="mode" checked={mode === 'SKIP_INVALID'} onChange={() => setMode('SKIP_INVALID')} /> Skip invalid rows (import the rest)</label>
            <label className="check"><input type="radio" name="mode" checked={mode === 'ALL_OR_NOTHING'} onChange={() => setMode('ALL_OR_NOTHING')} /> All or nothing (roll back if any row is invalid)</label>
          </div>
          {error && <div className="error-box">{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={doPreview} disabled={!file || busy !== ''}>
              {busy === 'preview' ? <><Loader size={15} /> Validating…</> : 'Preview'}
            </button>
            <button type="button" onClick={doImport} disabled={!file || busy !== '' || (!!s && s.valid === 0)}>
              {busy === 'import' ? <><Loader size={15} /> Importing…</> : <><Upload size={15} /> Confirm import</>}
            </button>
          </div>
        </div>
      </Card>

      {s && (
        <Card title="Preview">
          <div className="stat-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 12 }}>
            <span>Total: <strong>{s.total}</strong></span>
            <span className="num">New: <strong>{s.create}</strong></span>
            <span className="num">Update: <strong>{s.update}</strong></span>
            <span className="num">Skip: <strong>{s.invalid}</strong></span>
            <span className="num">With warnings: <strong>{s.warnings}</strong></span>
            <span className="num">Rejected rows: <strong>{s.rejected}</strong></span>
            <span className="num">Unmatched officers: <strong>{s.unmatchedOfficers}</strong></span>
            <span className="num">Unmatched branches: <strong>{s.unmatchedBranches}</strong></span>
          </div>
          {preview!.unresolvedOfficers.length > 0 && (
            <p className="muted sm-text">Unmatched executive codes (imported without an officer link): {preview!.unresolvedOfficers.join(', ')}</p>
          )}
          {preview!.unresolvedBranches.length > 0 && (
            <p className="muted sm-text">Unmatched branches (imported without a branch link): {preview!.unresolvedBranches.join(', ')}</p>
          )}
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Row</th><th>Txn Id</th><th>Customer</th><th>Amount</th><th>Date</th><th>Branch</th><th>Officer</th><th>Status</th><th>Action</th><th>Issues</th></tr>
              </thead>
              <tbody>
                {shownRows.map((r) => (
                  <tr key={`${r.sheetName}-${r.rowNumber}`}>
                    <td>{r.rowNumber}</td>
                    <td className="sm-text">{r.transactionId ?? '—'}</td>
                    <td>{r.customerName ?? '—'}</td>
                    <td className="num">{inr(r.amount)}</td>
                    <td>{r.collectionDate ?? '—'}</td>
                    <td>{r.resolvedBranch ?? <span className="muted sm-text">unmatched</span>}</td>
                    <td>{r.resolvedOfficer ?? <span className="muted sm-text">unmatched</span>}</td>
                    <td><Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge></td>
                    <td><Badge tone={ACTION_TONE[r.action]}>{r.action}</Badge></td>
                    <td>
                      {r.errors.map((m, i) => <div key={`e${i}`} className="sm-text" style={{ color: 'var(--red)' }}>⚠ {m}</div>)}
                      {r.warnings.map((m, i) => <div key={`w${i}`} className="muted sm-text">• {m}</div>)}
                      {r.errors.length === 0 && r.warnings.length === 0 && <span className="muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview!.rows.length > ROW_CAP && (
            <p className="muted sm-text" style={{ marginTop: 8 }}>Showing first {ROW_CAP} of {preview!.rows.length} rows. All rows will be imported per the summary above.</p>
          )}
        </Card>
      )}

      {result && (
        <Card title="Import result">
          <div className="stat-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            <span>Status: <Badge tone={result.summary.failed ? 'warning' : 'success'}>{result.status}</Badge></span>
            <span className="num">Created: <strong>{result.summary.created}</strong></span>
            <span className="num">Updated: <strong>{result.summary.updated}</strong></span>
            <span className="num">Skipped: <strong>{result.summary.skipped}</strong></span>
            <span className="num">Failed: <strong>{result.summary.failed}</strong></span>
            <span className="num">Rejected: <strong>{result.summary.rejected}</strong></span>
            <span className="num">Unmatched officers: <strong>{result.summary.unmatchedOfficers}</strong></span>
          </div>
          {result.errors.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p className="muted sm-text">Rows not imported:</p>
              {result.errors.slice(0, 100).map((e, i) => (
                <div key={`${e.rowNumber}-${i}`} className="sm-text" style={{ color: 'var(--red)' }}>Row {e.rowNumber}{e.transactionId ? ` (${e.transactionId})` : ''}: {e.messages.join('; ')}</div>
              ))}
              {result.errors.length > 100 && <p className="muted sm-text">…and {result.errors.length - 100} more.</p>}
            </div>
          )}
        </Card>
      )}

      <Card title="Recent imports">
        {batches.isLoading ? <p className="muted">Loading…</p>
          : !batches.data || batches.data.length === 0 ? <EmptyState title="No imports yet" message="Uploaded imports will appear here." />
          : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>When</th><th>File</th><th>Status</th><th>Total</th><th>Created</th><th>Updated</th><th>Skipped</th><th>Failed</th></tr>
                </thead>
                <tbody>
                  {batches.data.map((b) => (
                    <tr key={b.id}>
                      <td>{fmtDate(b.createdAt)}</td>
                      <td>{b.fileName ?? '—'}</td>
                      <td><Badge tone={b.failedCount ? 'warning' : b.status.startsWith('ROLLED') ? 'danger' : 'success'}>{b.status}</Badge></td>
                      <td>{b.totalRows}</td><td>{b.createdCount}</td><td>{b.updatedCount}</td>
                      <td>{b.skippedCount}</td><td>{b.failedCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>
    </>
  );
}
