import { FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { Modal, ConfirmDialog } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/Card';
import { Tabs, TabDef } from '../../components/Tabs';
import { Badge } from '../../components/Badge';
import { Form, FormGrid, Field, FormActions } from '../../components/Form';
import { EmptyState } from '../../components/EmptyState';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { Loader, Plus, Upload, Trash2, Lock, Pencil, Briefcase } from '../../components/icons';
import { inr, fmtDate, titleCase, apiMessage } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import {
  SALARY_COMPONENTS, DOCUMENT_CATEGORIES, isExpiringSoon,
} from './shared';

// ── Shapes ──
interface MasterRef { id: string; name: string; code?: string | null }
interface SalaryStructure {
  basicSalary: string; houseRentAllowance: string; dearnessAllowance: string; specialAllowance: string;
  conveyanceAllowance: string; medicalAllowance: string; travelAllowance: string; foodAllowance: string;
  mobileAllowance: string; otherAllowance: string; monthlyBonus: string; mediclaimDeduction: string;
  isProvidentFundApplicable: boolean; isStateInsuranceApplicable: boolean; isProfessionalTaxApplicable: boolean;
  effectiveFrom: string;
}
interface SalaryBreakdown {
  gross: number; monthlyBonus: number; providentFund: number; stateInsurance: number;
  professionalTax: number; mediclaim: number; totalDeductions: number; takeHome: number;
  advanceRecovery: number; finalPayable: number;
}
interface EmployeeDetail {
  id: string; employeeCode: string; fullName: string; phoneNumber: string; email?: string | null;
  designation: string; employmentStatus: string; joiningDate: string; branchId?: string | null;
  branch?: { name: string; code?: string | null; city?: string | null; state?: string | null; manager?: { id: string; fullName: string; designation?: string | null } | null } | null;
  bankIfscCode?: string | null; bankAccountMasked?: string | null; panMasked?: string | null;
  bankAccountNumber?: string | null; panNumber?: string | null; aadhaarNumber?: string | null;
  bankName?: string | null; bankAccountHolderName?: string | null;
  salaryStructure?: SalaryStructure | null;
  salaryBreakdown?: SalaryBreakdown | null;
  department?: string | null; reportsToId?: string | null;
  dateOfBirth?: string | null; gender?: string | null; maritalStatus?: string | null; addressLine?: string | null;
  emergencyContactName?: string | null; emergencyContactPhone?: string | null; emergencyContactRelation?: string | null;
  employeeType?: string | null; confirmationDate?: string | null;
  uanNumber?: string | null; providentFundNumber?: string | null; stateInsuranceNumber?: string | null;
  departmentRef?: MasterRef | null; designationRef?: MasterRef | null; grade?: MasterRef | null;
  employmentTypeRef?: MasterRef | null; shift?: MasterRef | null;
}
interface EmployeeLite { id: string; fullName: string }
interface EmployeeDocument {
  id: string; documentType: string; category: string; fileName: string;
  isVerified: boolean; isMandatory?: boolean; expiryDate?: string | null; version?: number; createdAt: string;
}
interface DocTypeConfig { id: string; category: string; documentType: string; isMandatory: boolean; isExpiryTracked: boolean; isActive: boolean }
interface MandatoryStatus { category: string; documentType: string; present: boolean }
interface DocVersion { version: number; fileName: string; isSuperseded: boolean; createdAt: string }
interface LeaveBalance { leaveType: string; isPaid: boolean; annualEntitlement: number; used: number; available: number }
interface LoginHistoryEntry { success: boolean; reason?: string | null; ipAddress?: string | null; createdAt: string }
interface AccountInfo {
  hasAccount: boolean; userId?: string; username?: string; officialEmail?: string; role?: string;
  status?: 'ACTIVE' | 'INACTIVE'; isLocked?: boolean; forcePasswordChange?: boolean;
  failedLoginAttempts?: number; lastLoginAt?: string | null; passwordChangedAt?: string | null;
  loginHistory?: LoginHistoryEntry[];
}
interface CredentialResult { username: string; officialEmail: string; delivery: 'SMTP' | 'DEV_FALLBACK'; temporaryPassword?: string }

const emptySalary = {
  basicSalary: '', houseRentAllowance: '', dearnessAllowance: '', specialAllowance: '',
  conveyanceAllowance: '', medicalAllowance: '', travelAllowance: '', foodAllowance: '',
  mobileAllowance: '', otherAllowance: '', monthlyBonus: '', mediclaimDeduction: '', effectiveFrom: '',
  isProvidentFundApplicable: true, isStateInsuranceApplicable: false, isProfessionalTaxApplicable: true,
};
type SalaryForm = typeof emptySalary;

type TabKey = 'overview' | 'documents' | 'salary' | 'leave' | 'account';

/** Employee — Details. Tabbed profile page (replaces the detail modal). */
export default function EmployeeDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = can(user?.role, 'employee:update');
  const canDocs = can(user?.role, 'document:manage');
  const canAccount = can(user?.role, 'account:manage');

  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as TabKey) || 'overview';
  const setTab = (t: TabKey) => setParams((p) => { p.set('tab', t); return p; }, { replace: true });

  const detailQuery = useQuery({
    queryKey: ['/employees', id],
    queryFn: () => api.get(`/employees/${id}`).then((r) => r.data.data as EmployeeDetail),
  });
  const detail = detailQuery.data;

  const directoryQuery = useQuery({
    queryKey: ['/employees', 'directory'],
    queryFn: () => api.get('/employees?pageSize=200').then((r) => r.data.data as EmployeeLite[]),
    enabled: !!detail?.reportsToId,
  });
  const reportsToName = detail?.reportsToId
    ? directoryQuery.data?.find((e) => e.id === detail.reportsToId)?.fullName ?? '…'
    : '—';

  // ── Salary revise ──
  const [salaryForm, setSalaryForm] = useState<SalaryForm>(emptySalary);
  const [salaryError, setSalaryError] = useState('');
  useEffect(() => {
    const s = detail?.salaryStructure;
    if (!s) { setSalaryForm(emptySalary); return; }
    setSalaryForm({
      basicSalary: String(s.basicSalary ?? ''), houseRentAllowance: String(s.houseRentAllowance ?? ''),
      dearnessAllowance: String(s.dearnessAllowance ?? ''), specialAllowance: String(s.specialAllowance ?? ''),
      conveyanceAllowance: String(s.conveyanceAllowance ?? ''), medicalAllowance: String(s.medicalAllowance ?? ''),
      travelAllowance: String(s.travelAllowance ?? ''), foodAllowance: String(s.foodAllowance ?? ''),
      mobileAllowance: String(s.mobileAllowance ?? ''), otherAllowance: String(s.otherAllowance ?? ''),
      monthlyBonus: String(s.monthlyBonus ?? ''), mediclaimDeduction: String(s.mediclaimDeduction ?? ''),
      effectiveFrom: s.effectiveFrom ? s.effectiveFrom.slice(0, 10) : '',
      isProvidentFundApplicable: s.isProvidentFundApplicable ?? true,
      isStateInsuranceApplicable: s.isStateInsuranceApplicable ?? false,
      isProfessionalTaxApplicable: s.isProfessionalTaxApplicable ?? true,
    });
  }, [detail]);
  const salaryFormGross = SALARY_COMPONENTS.reduce((sum, c) => sum + (Number(salaryForm[c.key]) || 0), 0);

  const reviseSalary = useMutation({
    mutationFn: () => api.put(`/employees/${id}/salary`, {
      ...Object.fromEntries(SALARY_COMPONENTS.map((c) => [c.key, Number(salaryForm[c.key] || 0)])),
      mediclaimDeduction: Number(salaryForm.mediclaimDeduction || 0),
      isProvidentFundApplicable: salaryForm.isProvidentFundApplicable,
      isStateInsuranceApplicable: salaryForm.isStateInsuranceApplicable,
      isProfessionalTaxApplicable: salaryForm.isProfessionalTaxApplicable,
      effectiveFrom: salaryForm.effectiveFrom,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/employees', id] });
      qc.invalidateQueries({ queryKey: ['/employees'] });
      setSalaryError('');
      toast.success('Salary structure revised.');
    },
    onError: (err) => setSalaryError(apiMessage(err, 'Could not revise the salary structure.')),
  });
  const submitSalary = (e: FormEvent) => {
    e.preventDefault(); setSalaryError('');
    if (!salaryForm.effectiveFrom) { setSalaryError('An effective-from date is required.'); return; }
    reviseSalary.mutate();
  };

  // ── Leave ──
  const leaveQuery = useQuery({
    queryKey: ['/human-resources/leaves/balances', id],
    queryFn: () => api.get(`/human-resources/leaves/balances?employeeId=${id}`).then((r) => r.data.data as { year: number; balances: LeaveBalance[] }),
    enabled: canManage && tab === 'leave',
  });

  // ── Account ──
  const accountQuery = useQuery({
    queryKey: ['/employees', id, 'account'],
    queryFn: () => api.get(`/employees/${id}/account`).then((r) => r.data.data as AccountInfo),
    enabled: canManage && tab === 'account',
  });
  const account = accountQuery.data;
  const [tempCred, setTempCred] = useState<CredentialResult | null>(null);
  const accountAction = useMutation({
    mutationFn: (action: string) => api.post(`/employees/${id}/account/${action}`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['/employees', id, 'account'] });
      const data = res.data.data as Partial<CredentialResult> | undefined;
      setTempCred(data?.temporaryPassword ? (data as CredentialResult) : null);
      toast.success(res.data.message ?? 'Done.');
    },
    onError: (err) => toast.error(apiMessage(err, 'The account action could not be completed.')),
  });

  // ── Documents ──
  const documentsQuery = useQuery({
    queryKey: ['/documents', id],
    queryFn: () => api.get(`/documents?employeeId=${id}`).then((r) => r.data.data as EmployeeDocument[]),
    enabled: tab === 'documents',
  });
  const typeConfigsQuery = useQuery({
    queryKey: ['/documents/type-configs'],
    queryFn: () => api.get('/documents/type-configs').then((r) => r.data.data as DocTypeConfig[]),
    enabled: tab === 'documents',
  });
  const mandatoryStatusQuery = useQuery({
    queryKey: ['/documents/mandatory-status', id],
    queryFn: () => api.get(`/documents/mandatory-status/${id}`).then((r) => r.data.data as MandatoryStatus[]),
    enabled: tab === 'documents',
  });
  const refreshDocs = () => { documentsQuery.refetch(); mandatoryStatusQuery.refetch(); };
  const documents = documentsQuery.data ?? [];
  const missingDocs = (mandatoryStatusQuery.data ?? []).filter((m) => !m.present);

  const downloadDoc = async (doc: EmployeeDocument) => {
    try {
      const res = await api.get(`/documents/${doc.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = doc.fileName; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Could not download the file.'); }
  };

  // Upload modal
  const [uploadOpen, setUploadOpen] = useState(false);
  const [upCategory, setUpCategory] = useState(DOCUMENT_CATEGORIES[0].key);
  const [upType, setUpType] = useState('');
  const [upExpiry, setUpExpiry] = useState('');
  const [upFile, setUpFile] = useState<File | null>(null);
  const upFileRef = useRef<HTMLInputElement>(null);
  const upTypeOptions = (typeConfigsQuery.data ?? []).filter((c) => c.category === upCategory && c.isActive);
  const upSelectedConfig = upTypeOptions.find((c) => c.documentType === upType) ?? null;
  const openUpload = () => {
    setUpCategory(DOCUMENT_CATEGORIES[0].key); setUpType(''); setUpExpiry(''); setUpFile(null);
    if (upFileRef.current) upFileRef.current.value = '';
    setUploadOpen(true);
  };
  const uploadDocument = useMutation({
    mutationFn: () => {
      const body = new FormData();
      body.append('employeeId', id); body.append('documentType', upType); body.append('category', upCategory);
      if (upSelectedConfig?.isMandatory) body.append('isMandatory', 'true');
      if (upExpiry) body.append('expiryDate', upExpiry);
      body.append('file', upFile as File);
      return api.post('/documents', body);
    },
    onSuccess: () => { setUploadOpen(false); refreshDocs(); toast.success('Document uploaded.'); },
    onError: (err) => toast.error(apiMessage(err, 'Upload failed. Use a PDF, JPG or PNG under 5 MB.')),
  });
  const submitDocumentUpload = (e: FormEvent) => {
    e.preventDefault();
    if (!upType) { toast.error('Choose a document type.'); return; }
    if (!upFile) { toast.error('Choose a file to upload.'); return; }
    uploadDocument.mutate();
  };

  // Replace / versions / verify / delete
  const [replaceTarget, setReplaceTarget] = useState<EmployeeDocument | null>(null);
  const [replaceExpiry, setReplaceExpiry] = useState('');
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const replaceFileRef = useRef<HTMLInputElement>(null);
  const openReplace = (doc: EmployeeDocument) => {
    setReplaceTarget(doc); setReplaceExpiry(doc.expiryDate ? doc.expiryDate.slice(0, 10) : ''); setReplaceFile(null);
    if (replaceFileRef.current) replaceFileRef.current.value = '';
  };
  const replaceDocument = useMutation({
    mutationFn: () => {
      const body = new FormData();
      body.append('file', replaceFile as File);
      if (replaceExpiry) body.append('expiryDate', replaceExpiry);
      return api.post(`/documents/${replaceTarget!.id}/replace`, body);
    },
    onSuccess: () => { setReplaceTarget(null); refreshDocs(); toast.success('New version uploaded.'); },
    onError: (err) => toast.error(apiMessage(err, 'Could not upload a new version.')),
  });
  const submitReplace = (e: FormEvent) => {
    e.preventDefault();
    if (!replaceFile) { toast.error('Choose a file to upload.'); return; }
    replaceDocument.mutate();
  };

  const [versionsTarget, setVersionsTarget] = useState<EmployeeDocument | null>(null);
  const versionsQuery = useQuery({
    queryKey: ['/documents', versionsTarget?.id, 'versions'],
    queryFn: () => api.get(`/documents/${versionsTarget!.id}/versions`).then((r) => r.data.data as DocVersion[]),
    enabled: !!versionsTarget,
  });
  const verifyDocument = useMutation({
    mutationFn: (docId: string) => api.patch(`/documents/${docId}/verify`),
    onSuccess: () => { refreshDocs(); toast.success('Document verified.'); },
    onError: (err) => toast.error(apiMessage(err, 'Could not verify the document.')),
  });
  const [deleteDocTarget, setDeleteDocTarget] = useState<EmployeeDocument | null>(null);
  const deleteDocument = useMutation({
    mutationFn: (docId: string) => api.delete(`/documents/${docId}`),
    onSuccess: () => { setDeleteDocTarget(null); refreshDocs(); toast.success('Document deleted.'); },
    onError: (err) => { setDeleteDocTarget(null); toast.error(apiMessage(err, 'Could not delete the document.')); },
  });

  const salary = detail?.salaryStructure;
  const breakdown = detail?.salaryBreakdown;
  const salaryGross = salary ? SALARY_COMPONENTS.reduce((sum, c) => sum + (Number(salary[c.key]) || 0), 0) : 0;

  const tabs: TabDef[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'documents', label: 'Documents' },
    { key: 'salary', label: 'Salary' },
    ...(canManage ? [{ key: 'leave', label: 'Leave' }] : []),
    ...(canManage ? [{ key: 'account', label: 'Account & Access' }] : []),
  ];

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: 'Human Resources' }, { label: 'Employees', to: '/employees' },
          { label: detail?.fullName ?? 'Employee' },
        ]}
        title={detail?.fullName ?? 'Employee'}
        subtitle={detail ? <>{detail.designationRef?.name ?? detail.designation} · <code>{detail.employeeCode}</code></> : undefined}
        meta={detail && <Badge status={detail.employmentStatus} />}
        actions={canManage && (
          <button className="btn-lg" onClick={() => navigate(`/employees/${id}/edit`)}><Pencil size={15} /> Edit</button>
        )}
        tabs={<Tabs tabs={tabs} active={tab} onChange={(t) => setTab(t as TabKey)} />}
      />

      {!detail ? (
        <Card><Skeleton height={20} /><Skeleton height={14} style={{ marginTop: 12 }} /><Skeleton height={14} style={{ marginTop: 8 }} /></Card>
      ) : (
        <>
          {tab === 'overview' && (
            <div className="detail-cols">
              <Card title="Personal details">
                <dl className="detail-list">
                  <div><dt>Employee code</dt><dd><code>{detail.employeeCode}</code></dd></div>
                  <div><dt>Designation</dt><dd>{detail.designationRef?.name ?? detail.designation}</dd></div>
                  <div><dt>Department</dt><dd>{detail.departmentRef?.name ?? detail.department ?? '—'}</dd></div>
                  <div><dt>Grade</dt><dd>{detail.grade?.name ?? '—'}</dd></div>
                  <div><dt>Reporting manager</dt><dd>{reportsToName}</dd></div>
                  <div><dt>Employment type</dt><dd>{detail.employmentTypeRef?.name ?? (detail.employeeType ? titleCase(detail.employeeType) : '—')}</dd></div>
                  <div><dt>Shift</dt><dd>{detail.shift?.name ?? '—'}</dd></div>
                  <div><dt>Phone</dt><dd>{detail.phoneNumber}</dd></div>
                  <div><dt>Email</dt><dd>{detail.email ?? '—'}</dd></div>
                  <div><dt>Date of birth</dt><dd>{fmtDate(detail.dateOfBirth)}</dd></div>
                  <div><dt>Gender</dt><dd>{detail.gender ? titleCase(detail.gender) : '—'}</dd></div>
                  <div><dt>Marital status</dt><dd>{detail.maritalStatus ? titleCase(detail.maritalStatus) : '—'}</dd></div>
                  <div><dt>Joining date</dt><dd>{fmtDate(detail.joiningDate)}</dd></div>
                  <div><dt>Confirmation date</dt><dd>{fmtDate(detail.confirmationDate)}</dd></div>
                  <div><dt>Address</dt><dd>{detail.addressLine ?? '—'}</dd></div>
                  <div><dt>Emergency contact</dt><dd>{detail.emergencyContactName
                    ? `${detail.emergencyContactName}${detail.emergencyContactRelation ? ` (${detail.emergencyContactRelation})` : ''}${detail.emergencyContactPhone ? ` · ${detail.emergencyContactPhone}` : ''}`
                    : '—'}</dd></div>
                  <div><dt>Aadhaar</dt><dd>{detail.aadhaarNumber ?? '—'}</dd></div>
                  <div><dt>PAN</dt><dd>{detail.panNumber ?? detail.panMasked ?? '—'}</dd></div>
                  <div><dt>UAN</dt><dd>{detail.uanNumber ?? '—'}</dd></div>
                  <div><dt>PF number</dt><dd>{detail.providentFundNumber ?? '—'}</dd></div>
                  <div><dt>ESI number</dt><dd>{detail.stateInsuranceNumber ?? '—'}</dd></div>
                  <div><dt>Bank name</dt><dd>{detail.bankName ?? '—'}</dd></div>
                  <div><dt>Bank account</dt><dd>{detail.bankAccountNumber ?? detail.bankAccountMasked ?? '—'}</dd></div>
                  <div><dt>Account holder</dt><dd>{detail.bankAccountHolderName ?? '—'}</dd></div>
                  <div><dt>IFSC</dt><dd>{detail.bankIfscCode ?? '—'}</dd></div>
                </dl>
              </Card>
              <Card title="Branch posting">
                {detail.branch ? (
                  <dl className="detail-list one-col">
                    <div><dt>Branch</dt><dd>{detail.branch.name}</dd></div>
                    <div><dt>Branch code</dt><dd>{detail.branch.code ? <code>{detail.branch.code}</code> : '—'}</dd></div>
                    <div><dt>City</dt><dd>{detail.branch.city ?? '—'}</dd></div>
                    <div><dt>State</dt><dd>{detail.branch.state ?? '—'}</dd></div>
                    <div><dt>Branch manager</dt><dd>{detail.branch.manager
                      ? `${detail.branch.manager.fullName}${detail.branch.manager.designation ? ` · ${titleCase(detail.branch.manager.designation)}` : ''}`
                      : '—'}</dd></div>
                  </dl>
                ) : (
                  <p className="muted">Not assigned to a branch yet.{canManage ? ' Use Edit to assign one.' : ''}</p>
                )}
              </Card>
            </div>
          )}

          {tab === 'documents' && (
            <Card
              title="Documents"
              action={canDocs && <button className="sm" onClick={openUpload}><Plus size={14} /> Upload document</button>}
            >
              {missingDocs.length > 0 && (
                <div className="doc-missing">
                  {missingDocs.map((m) => (
                    <span key={`${m.category}-${m.documentType}`} className="miss-chip">{m.documentType} · {titleCase(m.category)}</span>
                  ))}
                </div>
              )}
              {documentsQuery.isLoading ? (
                <div className="doc-list"><Skeleton height={46} /><Skeleton height={46} /><Skeleton height={46} /></div>
              ) : documents.length === 0 ? (
                <EmptyState variant="no-data" title="No documents yet" message={canDocs ? 'Upload the employee’s KYC and employment documents.' : undefined} />
              ) : (
                DOCUMENT_CATEGORIES.map((cat) => {
                  const catDocs = documents.filter((d) => d.category === cat.key);
                  return (
                    <div key={cat.key} className="doc-cat">
                      <div className="doc-cat-head"><h4>{cat.label}</h4></div>
                      {catDocs.length === 0 ? (
                        <p className="muted sm-text">No documents in this category.</p>
                      ) : (
                        <div className="doc-list">
                          {catDocs.map((d) => (
                            <div key={d.id} className="doc-row">
                              <div style={{ minWidth: 0 }}>
                                <div className="doc-name">{d.documentType}</div>
                                <div className="doc-meta">{d.fileName} · {fmtDate(d.createdAt)}</div>
                              </div>
                              <span className="row-actions" style={{ gap: '4px' }}>
                                <span className={`doc-badge ${d.isVerified ? 'verified' : 'unverified'}`}>{d.isVerified ? 'Verified' : 'Unverified'}</span>
                                {d.isMandatory && <span className="doc-badge mandatory">Mandatory</span>}
                                {d.version != null && <span className="doc-badge version">v{d.version}</span>}
                                {isExpiringSoon(d.expiryDate) && <span className="doc-badge expiring">Expiring</span>}
                              </span>
                              <div className="doc-actions">
                                <button type="button" className="sm ghost" onClick={() => downloadDoc(d)}>Download</button>
                                {canDocs && !d.isVerified && <button type="button" className="sm ghost" disabled={verifyDocument.isPending} onClick={() => verifyDocument.mutate(d.id)}>Verify</button>}
                                {canDocs && <button type="button" className="sm ghost" onClick={() => openReplace(d)}>Replace</button>}
                                <button type="button" className="sm ghost" onClick={() => setVersionsTarget(d)}>Versions</button>
                                {canDocs && <button type="button" className="sm ghost danger" onClick={() => setDeleteDocTarget(d)}>Delete</button>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </Card>
          )}

          {tab === 'salary' && (
            <div className="detail-cols">
              <Card title="Current structure">
                {salary ? (
                  <dl className="detail-list one-col">
                    {SALARY_COMPONENTS.map((c) => (
                      <div key={c.key}><dt>{c.label}</dt><dd className="num">{inr(salary[c.key])}</dd></div>
                    ))}
                    <div><dt>Gross (monthly)</dt><dd><strong className="num">{inr(breakdown?.gross ?? salaryGross)}</strong></dd></div>
                    <div><dt>Mediclaim deduction</dt><dd className="num">{inr(salary.mediclaimDeduction)}</dd></div>
                    <div><dt>PF applicable</dt><dd>{salary.isProvidentFundApplicable ? 'Yes' : 'No'}</dd></div>
                    <div><dt>ESI applicable</dt><dd>{salary.isStateInsuranceApplicable ? 'Yes' : 'No'}</dd></div>
                    <div><dt>Professional tax</dt><dd>{salary.isProfessionalTaxApplicable ? 'Yes' : 'No'}</dd></div>
                    <div><dt>Effective from</dt><dd>{fmtDate(salary.effectiveFrom)}</dd></div>
                  </dl>
                ) : <p className="muted">No salary structure on record.{canManage ? ' Use the form to create one.' : ''}</p>}
              </Card>
              {salary && breakdown && (
                <Card title="Monthly salary calculation">
                  <dl className="detail-list one-col">
                    <div><dt>Gross earnings</dt><dd><strong className="num">{inr(breakdown.gross)}</strong></dd></div>
                    <div><dt>PF (employee)</dt><dd className="num">− {inr(breakdown.providentFund)}</dd></div>
                    <div><dt>ESIC (employee)</dt><dd className="num">− {inr(breakdown.stateInsurance)}</dd></div>
                    <div><dt>Professional tax</dt><dd className="num">− {inr(breakdown.professionalTax)}</dd></div>
                    <div><dt>Mediclaim</dt><dd className="num">− {inr(breakdown.mediclaim)}</dd></div>
                    <div><dt>Total deductions</dt><dd className="num">− {inr(breakdown.totalDeductions)}</dd></div>
                    <div><dt>Take home</dt><dd><strong className="num">{inr(breakdown.takeHome)}</strong></dd></div>
                    <div><dt>Salary advance recovery</dt><dd className="num">− {inr(breakdown.advanceRecovery)}</dd></div>
                    <div><dt>Final payable</dt><dd><strong className="num">{inr(breakdown.finalPayable)}</strong></dd></div>
                  </dl>
                </Card>
              )}
              {canManage && (
                <Card title="Revise salary" action={<span className="muted sm-text">New gross: <strong className="num">{inr(salaryFormGross)}</strong></span>}>
                  <Form onSubmit={submitSalary}>
                    <FormGrid cols={2}>
                      {SALARY_COMPONENTS.map((c) => (
                        <Field key={c.key} label={c.label} required={c.key === 'basicSalary'}>
                          <input type="number" min="0" value={salaryForm[c.key]} onChange={(e) => setSalaryForm({ ...salaryForm, [c.key]: e.target.value })} required={c.key === 'basicSalary'} />
                        </Field>
                      ))}
                      <Field label="Mediclaim deduction">
                        <input type="number" min="0" value={salaryForm.mediclaimDeduction} onChange={(e) => setSalaryForm({ ...salaryForm, mediclaimDeduction: e.target.value })} />
                      </Field>
                      <Field label="Effective from" required><input type="date" value={salaryForm.effectiveFrom} onChange={(e) => setSalaryForm({ ...salaryForm, effectiveFrom: e.target.value })} required /></Field>
                    </FormGrid>
                    <div className="check-row">
                      <label className="check"><input type="checkbox" checked={salaryForm.isProvidentFundApplicable} onChange={(e) => setSalaryForm({ ...salaryForm, isProvidentFundApplicable: e.target.checked })} /> PF applicable</label>
                      <label className="check"><input type="checkbox" checked={salaryForm.isStateInsuranceApplicable} onChange={(e) => setSalaryForm({ ...salaryForm, isStateInsuranceApplicable: e.target.checked })} /> ESI applicable</label>
                      <label className="check"><input type="checkbox" checked={salaryForm.isProfessionalTaxApplicable} onChange={(e) => setSalaryForm({ ...salaryForm, isProfessionalTaxApplicable: e.target.checked })} /> Professional tax applicable</label>
                    </div>
                    {salaryError && <div className="error-box">{salaryError}</div>}
                    <FormActions>
                      <button type="submit" disabled={reviseSalary.isPending}>{reviseSalary.isPending ? <><Loader size={15} /> Saving…</> : 'Save revision'}</button>
                    </FormActions>
                  </Form>
                </Card>
              )}
            </div>
          )}

          {tab === 'leave' && canManage && (
            <Card title="Leave balances">
              {leaveQuery.isLoading ? (
                <p className="muted">Loading leave balances…</p>
              ) : leaveQuery.data && leaveQuery.data.balances.length > 0 ? (
                <dl className="detail-list">
                  {leaveQuery.data.balances.map((b) => (
                    <div key={b.leaveType}>
                      <dt>{titleCase(b.leaveType)}{b.isPaid ? '' : ' (unpaid)'}</dt>
                      <dd><strong>{b.available}</strong> available · {b.used} used of {b.annualEntitlement}/yr</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <EmptyState variant="no-data" title="No leave balances" message={leaveQuery.data ? `Nothing on record for ${leaveQuery.data.year}.` : undefined} />
              )}
            </Card>
          )}

          {tab === 'account' && canManage && (
            <Card title="Login account">
              {accountQuery.isLoading ? (
                <p className="muted">Loading account…</p>
              ) : !account ? (
                <p className="muted">Could not load the login account.</p>
              ) : !account.hasAccount ? (
                <EmptyState
                  variant="no-data"
                  title="No login account yet"
                  message="Create one and email the sign-in credentials to the employee."
                  action={canAccount && <button disabled={accountAction.isPending} onClick={() => accountAction.mutate('send-credentials')}>{accountAction.isPending ? 'Working…' : 'Send credentials'}</button>}
                />
              ) : (
                <>
                  <dl className="detail-list">
                    <div><dt>Username</dt><dd><code>{account.username}</code></dd></div>
                    <div><dt>Official email</dt><dd>{account.officialEmail ?? '—'}</dd></div>
                    <div><dt>Login role</dt><dd>{account.role ? titleCase(account.role) : '—'}</dd></div>
                    <div><dt>Status</dt><dd><Badge status={account.status ?? 'INACTIVE'} /></dd></div>
                    <div><dt>Locked</dt><dd>{account.isLocked ? 'Yes' : 'No'}</dd></div>
                    <div><dt>Must change password</dt><dd>{account.forcePasswordChange ? 'Yes' : 'No'}</dd></div>
                    <div><dt>Failed attempts</dt><dd>{account.failedLoginAttempts ?? 0}</dd></div>
                    <div><dt>Last login</dt><dd>{fmtDate(account.lastLoginAt)}</dd></div>
                    <div><dt>Password changed</dt><dd>{fmtDate(account.passwordChangedAt)}</dd></div>
                  </dl>
                  {canAccount && (
                    <div className="row-actions" style={{ flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem', justifyContent: 'flex-start' }}>
                      <button type="button" className="sm ghost" disabled={accountAction.isPending} onClick={() => accountAction.mutate('resend-credentials')}>Resend credentials</button>
                      <button type="button" className="sm ghost" disabled={accountAction.isPending} onClick={() => accountAction.mutate('reset-password')}>Reset password</button>
                      <button type="button" className="sm ghost" disabled={accountAction.isPending || account.forcePasswordChange} onClick={() => accountAction.mutate('force-reset')}>Force password reset</button>
                      {account.status === 'ACTIVE'
                        ? <button type="button" className="sm ghost" disabled={accountAction.isPending} onClick={() => accountAction.mutate('deactivate')}>Deactivate</button>
                        : <button type="button" className="sm ghost" disabled={accountAction.isPending} onClick={() => accountAction.mutate('activate')}>Activate</button>}
                      {account.isLocked
                        ? <button type="button" className="sm ghost" disabled={accountAction.isPending} onClick={() => accountAction.mutate('unlock')}><Lock size={14} /> Unlock</button>
                        : <button type="button" className="sm ghost danger" disabled={accountAction.isPending} onClick={() => accountAction.mutate('lock')}><Lock size={14} /> Lock</button>}
                    </div>
                  )}
                  {tempCred && (
                    <div className="success-box" style={{ marginTop: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', width: '100%' }}>
                        <div style={{ minWidth: 0 }}>
                          <strong>Temporary password</strong>
                          <div className="sm-text">{tempCred.delivery === 'SMTP' ? 'Emailed to the employee.' : 'No email configured (dev) — share this manually.'}</div>
                          <div style={{ marginTop: '0.35rem' }}>User <code>{tempCred.username}</code> · <code style={{ fontSize: '1rem' }}>{tempCred.temporaryPassword}</code></div>
                        </div>
                        <button type="button" className="sm ghost" onClick={() => { navigator.clipboard?.writeText(tempCred.temporaryPassword ?? ''); toast.success('Password copied.'); }}>Copy</button>
                      </div>
                    </div>
                  )}
                  {account.loginHistory && account.loginHistory.length > 0 && (
                    <div style={{ marginTop: '1rem' }}>
                      <h4 className="section-title">Recent sign-ins</h4>
                      <div className="doc-list">
                        {account.loginHistory.map((h, i) => (
                          <div key={i} className="doc-row">
                            <div style={{ minWidth: 0 }}>
                              <div className="doc-name">{h.success ? 'Success' : 'Failed'}{h.reason ? ` · ${h.reason}` : ''}</div>
                              <div className="doc-meta">{fmtDate(h.createdAt)}{h.ipAddress ? ` · ${h.ipAddress}` : ''}</div>
                            </div>
                            <span className={`doc-badge ${h.success ? 'verified' : 'unverified'}`}>{h.success ? 'OK' : 'Fail'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </Card>
          )}
        </>
      )}

      {/* Document upload / replace / versions / delete modals */}
      {uploadOpen && (
        <Modal size="md" onClose={() => setUploadOpen(false)} icon={<Upload size={20} />} title="Upload document" subtitle={detail?.fullName}
          footer={<>
            <button type="button" className="ghost" onClick={() => setUploadOpen(false)}>Cancel</button>
            <button type="submit" form="doc-upload-form" disabled={uploadDocument.isPending}>{uploadDocument.isPending ? 'Uploading…' : 'Upload'}</button>
          </>}>
          <form id="doc-upload-form" className="form-grid" onSubmit={submitDocumentUpload}>
            <label>Category
              <select value={upCategory} onChange={(e) => { setUpCategory(e.target.value); setUpType(''); }}>
                {DOCUMENT_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </label>
            <label>Document type
              <select value={upType} onChange={(e) => setUpType(e.target.value)} required>
                <option value="">— Select —</option>
                {upTypeOptions.map((c) => <option key={c.id} value={c.documentType}>{c.documentType}{c.isMandatory ? ' *' : ''}</option>)}
              </select>
            </label>
            {upSelectedConfig?.isExpiryTracked && (
              <label>Expiry date<input type="date" value={upExpiry} onChange={(e) => setUpExpiry(e.target.value)} /></label>
            )}
            <label className="span-all">File<input ref={upFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setUpFile(e.target.files?.[0] ?? null)} /></label>
            {typeConfigsQuery.isLoading && <p className="muted span-all">Loading document types…</p>}
            {!typeConfigsQuery.isLoading && upTypeOptions.length === 0 && <p className="muted span-all">No document types configured for this category.</p>}
          </form>
        </Modal>
      )}

      {replaceTarget && (
        <Modal size="md" onClose={() => setReplaceTarget(null)} icon={<Upload size={20} />} title="Upload new version" subtitle={replaceTarget.documentType}
          footer={<>
            <button type="button" className="ghost" onClick={() => setReplaceTarget(null)}>Cancel</button>
            <button type="submit" form="doc-replace-form" disabled={replaceDocument.isPending}>{replaceDocument.isPending ? 'Uploading…' : 'Upload version'}</button>
          </>}>
          <form id="doc-replace-form" className="form-grid" onSubmit={submitReplace}>
            <p className="muted span-all">Current file: {replaceTarget.fileName} (v{replaceTarget.version ?? 1})</p>
            <label>Expiry date<input type="date" value={replaceExpiry} onChange={(e) => setReplaceExpiry(e.target.value)} /></label>
            <label className="span-all">File<input ref={replaceFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setReplaceFile(e.target.files?.[0] ?? null)} /></label>
          </form>
        </Modal>
      )}

      {versionsTarget && (
        <Modal size="sm" onClose={() => setVersionsTarget(null)} icon={<Briefcase size={20} />} title="Version history" subtitle={versionsTarget.documentType}
          footer={<button onClick={() => setVersionsTarget(null)}>Close</button>}>
          {versionsQuery.isLoading ? (
            <p className="muted">Loading versions…</p>
          ) : versionsQuery.data && versionsQuery.data.length > 0 ? (
            <div className="doc-list">
              {versionsQuery.data.map((v) => (
                <div key={v.version} className="doc-row">
                  <div style={{ minWidth: 0 }}>
                    <div className="doc-name">Version {v.version}</div>
                    <div className="doc-meta">{v.fileName} · {fmtDate(v.createdAt)}</div>
                  </div>
                  <span className={`doc-badge ${v.isSuperseded ? 'unverified' : 'verified'}`}>{v.isSuperseded ? 'Superseded' : 'Current'}</span>
                </div>
              ))}
            </div>
          ) : <p className="muted">No version history found.</p>}
        </Modal>
      )}

      {deleteDocTarget && (
        <ConfirmDialog
          tone="danger" icon={<Trash2 size={20} />} title="Delete document?"
          message={`This removes "${deleteDocTarget.documentType}" (${deleteDocTarget.fileName}) and its version history.`}
          confirmLabel="Delete document" loading={deleteDocument.isPending}
          onConfirm={() => deleteDocument.mutate(deleteDocTarget.id)}
          onCancel={() => setDeleteDocTarget(null)}
        />
      )}
    </>
  );
}
