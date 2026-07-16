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
  rowNumber: number; resolvedCode: string; fullName: string | null; branchName: string | null;
  action: 'CREATE' | 'UPDATE' | 'SKIP'; branchAction: 'EXISTING' | 'CREATE';
  errors: string[]; warnings: string[];
}
interface Preview {
  summary: { total: number; valid: number; create: number; update: number; invalid: number; warnings: number; branchesToCreate: number };
  branchesToCreate: string[];
  rows: PreviewRow[];
}
interface ImportResult {
  batchId: string; status: string;
  summary: { total: number; created: number; updated: number; skipped: number; failed: number; branchesCreated: number; advances: number; managersAssigned: number };
  errors: { rowNumber: number; employeeCode: string | null; messages: string[] }[];
}
interface Batch {
  id: string; fileName: string | null; status: string; totalRows: number;
  createdCount: number; updatedCount: number; skippedCount: number; failedCount: number;
  branchesCreated: number; managersAssigned: number; createdAt: string;
}

const ACTION_TONE: Record<string, BadgeTone> = { CREATE: 'success', UPDATE: 'info', SKIP: 'danger' };

/**
 * Employees — Import. Super Admin / HQ / HR upload the client salary workbook
 * (.xlsx); the page previews every row (create/update/skip + warnings), then
 * confirms the import. Branches are auto-created and managers auto-assigned by
 * the backend; re-uploading the same file updates in place (no duplicates).
 */
export default function EmployeeImportPage() {
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

  const allowed = canAccessModule(user?.role, 'employeeImport');
  const batches = useQuery({
    queryKey: ['/employees/import/batches'],
    queryFn: async () => (await api.get('/employees/import/batches')).data.data as Batch[],
    enabled: allowed,
  });

  if (!allowed) return <p className="muted">You do not have permission to import employees.</p>;

  const pick = (f: File | null) => { setFile(f); setPreview(null); setResult(null); setError(''); };

  const buildForm = () => { const fd = new FormData(); fd.append('file', file!); return fd; };

  const doPreview = async () => {
    if (!file) return;
    setBusy('preview'); setError(''); setResult(null);
    try {
      setPreview((await api.post('/employees/import/preview', buildForm())).data.data);
    } catch (e) { setError(apiMessage(e, 'Preview failed.')); } finally { setBusy(''); }
  };

  const doImport = async () => {
    if (!file) return;
    setBusy('import'); setError('');
    try {
      const fd = buildForm(); fd.append('mode', mode);
      const res = (await api.post('/employees/import', fd)).data.data as ImportResult;
      setResult(res);
      toast.success(`Import ${res.status.toLowerCase().replace(/_/g, ' ')}.`);
      qc.invalidateQueries({ queryKey: ['/employees/import/batches'] });
      qc.invalidateQueries({ queryKey: ['/employees'] });
    } catch (e) { setError(apiMessage(e, 'Import failed.')); } finally { setBusy(''); }
  };

  const s = preview?.summary;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Human Resources' }, { label: 'Employees', to: '/employees' }, { label: 'Import' }]}
        title="Import employees"
        subtitle="Upload the salary workbook (.xlsx). Branches are auto-created and re-uploads update in place."
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
            <span className="num">Branches to create: <strong>{s.branchesToCreate}</strong></span>
          </div>
          {preview!.branchesToCreate.length > 0 && (
            <p className="muted sm-text">New branches: {preview!.branchesToCreate.join(', ')}</p>
          )}
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Row</th><th>Code</th><th>Name</th><th>Branch</th><th>Action</th><th>Issues</th></tr>
              </thead>
              <tbody>
                {preview!.rows.map((r) => (
                  <tr key={r.rowNumber}>
                    <td>{r.rowNumber}</td>
                    <td>{r.resolvedCode}</td>
                    <td>{r.fullName ?? '—'}</td>
                    <td>{r.branchName ?? '—'}{r.branchAction === 'CREATE' && <span className="muted sm-text"> (new)</span>}</td>
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
            <span className="num">Branches created: <strong>{result.summary.branchesCreated}</strong></span>
            <span className="num">Advances: <strong>{result.summary.advances}</strong></span>
            <span className="num">Managers assigned: <strong>{result.summary.managersAssigned}</strong></span>
          </div>
          {result.errors.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p className="muted sm-text">Rows not imported:</p>
              {result.errors.map((e) => (
                <div key={e.rowNumber} className="sm-text" style={{ color: 'var(--red)' }}>Row {e.rowNumber}{e.employeeCode ? ` (${e.employeeCode})` : ''}: {e.messages.join('; ')}</div>
              ))}
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
                  <tr><th>When</th><th>File</th><th>Status</th><th>Total</th><th>Created</th><th>Updated</th><th>Skipped</th><th>Failed</th><th>Branches</th><th>Managers</th></tr>
                </thead>
                <tbody>
                  {batches.data.map((b) => (
                    <tr key={b.id}>
                      <td>{fmtDate(b.createdAt)}</td>
                      <td>{b.fileName ?? '—'}</td>
                      <td><Badge tone={b.failedCount ? 'warning' : b.status.startsWith('ROLLED') ? 'danger' : 'success'}>{b.status}</Badge></td>
                      <td>{b.totalRows}</td><td>{b.createdCount}</td><td>{b.updatedCount}</td>
                      <td>{b.skippedCount}</td><td>{b.failedCount}</td><td>{b.branchesCreated}</td><td>{b.managersAssigned}</td>
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
