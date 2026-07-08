import { FormEvent, useEffect, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';

interface Props {
  employeeId: string;
  canManage: boolean;
  onClose: () => void;
}

interface BranchOption { id: string; name: string; code: string }
interface EmployeeDocument { id: string; documentType: string; fileName: string; isVerified: boolean; createdAt: string }
interface SalaryStructure {
  basicSalary: string; houseRentAllowance: string; dearnessAllowance: string; specialAllowance: string;
  isProvidentFundApplicable: boolean; isStateInsuranceApplicable: boolean; effectiveFrom: string;
}
interface EmployeeDetail {
  id: string; employeeCode: string; fullName: string; phoneNumber: string; email?: string | null;
  designation: string; employmentStatus: string; joiningDate: string; branchId?: string | null;
  branch?: { name: string } | null; bankIfscCode?: string | null; bankAccountMasked?: string | null;
  panMasked?: string | null; salaryStructure?: SalaryStructure | null;
}

const DOCUMENT_TYPES = [
  'Aadhaar Card', 'PAN Card', 'Passport', 'Driving License', 'Voter ID',
  'Photograph', 'Offer Letter', 'Employment Contract', 'Other',
];

const inr = (v?: string | number | null): string =>
  v == null || v === '' ? '—' : `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtDate = (v?: string | null): string =>
  v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const apiMessage = (err: unknown, fb: string): string =>
  (err instanceof AxiosError && err.response?.data?.message) || fb;
const compact = <T extends Record<string, unknown>>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null)) as Partial<T>;

const emptyEdit = {
  fullName: '', phoneNumber: '', email: '', designation: '', branchId: '',
  joiningDate: '', employmentStatus: 'ACTIVE', bankAccountNumber: '', bankIfscCode: '', panNumber: '',
};

type Tab = 'details' | 'salary' | 'documents' | 'edit';

export default function EmployeeDetailModal({ employeeId, canManage, onClose }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('details');

  const detailQuery = useQuery({
    queryKey: ['/employees', employeeId],
    queryFn: () => api.get(`/employees/${employeeId}`).then((r) => r.data.data as EmployeeDetail),
  });
  const detail = detailQuery.data;

  // ── Edit form ──
  const [form, setForm] = useState(emptyEdit);
  const [editError, setEditError] = useState('');
  useEffect(() => {
    if (!detail) return;
    setForm({
      ...emptyEdit,
      fullName: detail.fullName,
      phoneNumber: detail.phoneNumber,
      email: detail.email ?? '',
      designation: detail.designation,
      branchId: detail.branchId ?? '',
      joiningDate: detail.joiningDate ? detail.joiningDate.slice(0, 10) : '',
      employmentStatus: detail.employmentStatus,
      bankIfscCode: detail.bankIfscCode ?? '',
    });
  }, [detail]);

  const branchesQuery = useQuery({
    queryKey: ['/branches', 'options'],
    queryFn: () => api.get('/branches?pageSize=100').then((r) => r.data.data as BranchOption[]),
    enabled: tab === 'edit',
  });

  const updateEmployee = useMutation({
    mutationFn: () => api.patch(`/employees/${employeeId}`, compact({
      fullName: form.fullName, phoneNumber: form.phoneNumber, email: form.email,
      designation: form.designation, branchId: form.branchId, joiningDate: form.joiningDate,
      employmentStatus: form.employmentStatus, bankAccountNumber: form.bankAccountNumber,
      bankIfscCode: form.bankIfscCode, panNumber: form.panNumber,
    })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/employees'] });
      detailQuery.refetch();
      setEditError('');
      setTab('details');
    },
    onError: (err) => setEditError(apiMessage(err, 'Could not save changes.')),
  });

  // ── Documents ──
  const documentsQuery = useQuery({
    queryKey: ['/documents', employeeId],
    queryFn: () => api.get(`/documents?employeeId=${employeeId}`).then((r) => r.data.data as EmployeeDocument[]),
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState(DOCUMENT_TYPES[0]);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docMsg, setDocMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const uploadDoc = useMutation({
    mutationFn: () => {
      const body = new FormData();
      body.append('file', docFile as File);
      body.append('employeeId', employeeId);
      body.append('documentType', docType);
      return api.post('/documents', body);
    },
    onSuccess: () => {
      setDocFile(null);
      if (fileRef.current) fileRef.current.value = '';
      setDocMsg({ ok: true, text: 'Document uploaded successfully.' });
      documentsQuery.refetch();
    },
    onError: (err) => setDocMsg({ ok: false, text: apiMessage(err, 'Upload failed. Use a PDF, JPG or PNG under 5 MB.') }),
  });

  const verifyDoc = useMutation({
    mutationFn: (id: string) => api.patch(`/documents/${id}/verify`),
    onSuccess: () => { setDocMsg({ ok: true, text: 'Document verified.' }); documentsQuery.refetch(); },
    onError: (err) => setDocMsg({ ok: false, text: apiMessage(err, 'Could not verify.') }),
  });

  const deleteDoc = useMutation({
    mutationFn: (id: string) => api.delete(`/documents/${id}`),
    onSuccess: () => { setDocMsg({ ok: true, text: 'Document deleted.' }); documentsQuery.refetch(); },
    onError: (err) => setDocMsg({ ok: false, text: apiMessage(err, 'Could not delete.') }),
  });

  const downloadDoc = async (doc: EmployeeDocument) => {
    setDocMsg(null);
    try {
      const res = await api.get(`/documents/${doc.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = doc.fileName; a.click();
      URL.revokeObjectURL(url);
    } catch {
      setDocMsg({ ok: false, text: 'Could not download the file.' });
    }
  };

  const submitUpload = (e: FormEvent) => {
    e.preventDefault();
    setDocMsg(null);
    if (!docFile) { setDocMsg({ ok: false, text: 'Please choose a file first.' }); return; }
    uploadDoc.mutate();
  };

  const submitEdit = (e: FormEvent) => { e.preventDefault(); setEditError(''); updateEmployee.mutate(); };

  const statusPill = (s: string) => <span className={`pill pill-${s.toLowerCase()}`}>{s.replaceAll('_', ' ')}</span>;
  const salary = detail?.salaryStructure;
  const documents = documentsQuery.data ?? [];

  const tabs: { key: Tab; label: string }[] = [
    { key: 'details', label: 'Details' },
    { key: 'salary', label: 'Salary' },
    { key: 'documents', label: `Documents${documents.length ? ` (${documents.length})` : ''}` },
    ...(canManage ? [{ key: 'edit' as Tab, label: 'Edit' }] : []),
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {!detail ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <header className="row">
              <div>
                <h2>{detail.fullName}</h2>
                <p className="muted">{detail.designation} · <code>{detail.employeeCode}</code></p>
              </div>
              {statusPill(detail.employmentStatus)}
            </header>

            <div className="tabs">
              {tabs.map((t) => (
                <button key={t.key} type="button" className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'details' && (
              <dl className="detail-list">
                <div><dt>Phone</dt><dd>{detail.phoneNumber}</dd></div>
                <div><dt>Email</dt><dd>{detail.email ?? '—'}</dd></div>
                <div><dt>Branch</dt><dd>{detail.branch?.name ?? '—'}</dd></div>
                <div><dt>Joining date</dt><dd>{fmtDate(detail.joiningDate)}</dd></div>
                <div><dt>Bank account</dt><dd>{detail.bankAccountMasked ?? '—'}</dd></div>
                <div><dt>IFSC</dt><dd>{detail.bankIfscCode ?? '—'}</dd></div>
                <div><dt>PAN</dt><dd>{detail.panMasked ?? '—'}</dd></div>
              </dl>
            )}

            {tab === 'salary' && (
              salary ? (
                <dl className="detail-list">
                  <div><dt>Basic</dt><dd>{inr(salary.basicSalary)}</dd></div>
                  <div><dt>HRA</dt><dd>{inr(salary.houseRentAllowance)}</dd></div>
                  <div><dt>Dearness</dt><dd>{inr(salary.dearnessAllowance)}</dd></div>
                  <div><dt>Special</dt><dd>{inr(salary.specialAllowance)}</dd></div>
                  <div><dt>Gross (monthly)</dt><dd><strong>{inr(
                    Number(salary.basicSalary) + Number(salary.houseRentAllowance) +
                    Number(salary.dearnessAllowance) + Number(salary.specialAllowance),
                  )}</strong></dd></div>
                  <div><dt>PF applicable</dt><dd>{salary.isProvidentFundApplicable ? 'Yes' : 'No'}</dd></div>
                  <div><dt>ESI applicable</dt><dd>{salary.isStateInsuranceApplicable ? 'Yes' : 'No'}</dd></div>
                  <div><dt>Effective from</dt><dd>{fmtDate(salary.effectiveFrom)}</dd></div>
                </dl>
              ) : <p className="muted">No salary structure on record.</p>
            )}

            {tab === 'documents' && (
              <>
                <div className="doc-list">
                  {documentsQuery.isLoading && <p className="muted">Loading…</p>}
                  {!documentsQuery.isLoading && documents.length === 0 && <p className="muted">No documents uploaded yet.</p>}
                  {documents.map((d) => (
                    <div key={d.id} className="doc-row">
                      <span className="doc-meta">
                        <strong>{d.documentType}</strong>
                        <span className="muted sm-text">{d.fileName} · {fmtDate(d.createdAt)}</span>
                      </span>
                      <span className="row-actions">
                        <span className={`pill ${d.isVerified ? 'pill-active' : 'pill-pending'}`}>{d.isVerified ? 'Verified' : 'Pending'}</span>
                        <button type="button" className="sm ghost" onClick={() => downloadDoc(d)}>Download</button>
                        {canManage && !d.isVerified && <button type="button" className="sm ghost" disabled={verifyDoc.isPending} onClick={() => verifyDoc.mutate(d.id)}>Verify</button>}
                        {canManage && <button type="button" className="sm ghost danger" disabled={deleteDoc.isPending} onClick={() => { if (window.confirm('Delete this document?')) deleteDoc.mutate(d.id); }}>Delete</button>}
                      </span>
                    </div>
                  ))}
                </div>

                {canManage && (
                  <form className="doc-upload" onSubmit={submitUpload}>
                    <select value={docType} onChange={(e) => setDocType(e.target.value)} aria-label="Document type">
                      {DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { setDocFile(e.target.files?.[0] ?? null); setDocMsg(null); }} />
                    <button type="submit" disabled={uploadDoc.isPending}>{uploadDoc.isPending ? 'Uploading…' : 'Upload'}</button>
                  </form>
                )}
                {docMsg && <div className={docMsg.ok ? 'success-box' : 'error-box'}>{docMsg.text}</div>}
              </>
            )}

            {tab === 'edit' && canManage && (
              <form className="form-grid" onSubmit={submitEdit}>
                <label>Full name<input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required /></label>
                <label>Phone<input value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} required /></label>
                <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
                <label>Designation<input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} required /></label>
                <label>Branch
                  <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                    <option value="">— Unassigned —</option>
                    {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
                  </select>
                </label>
                <label>Joining date<input type="date" value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} /></label>
                <label>Employment status
                  <select value={form.employmentStatus} onChange={(e) => setForm({ ...form, employmentStatus: e.target.value })}>
                    <option value="ONBOARDING">Onboarding</option>
                    <option value="ACTIVE">Active</option>
                    <option value="ON_NOTICE">On notice</option>
                    <option value="SEPARATED">Separated</option>
                  </select>
                </label>
                <label>Bank account no.<input value={form.bankAccountNumber} onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })} placeholder="leave blank to keep" /></label>
                <label>IFSC<input value={form.bankIfscCode} onChange={(e) => setForm({ ...form, bankIfscCode: e.target.value.toUpperCase() })} /></label>
                <label>PAN<input value={form.panNumber} onChange={(e) => setForm({ ...form, panNumber: e.target.value.toUpperCase() })} placeholder="leave blank to keep" /></label>
                {editError && <div className="error-box span-all">{editError}</div>}
                <div className="span-all row-actions">
                  <button type="submit" disabled={updateEmployee.isPending}>Save changes</button>
                  <button type="button" className="ghost" onClick={() => setTab('details')}>Cancel</button>
                </div>
              </form>
            )}

            <div className="modal-actions">
              <button onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
