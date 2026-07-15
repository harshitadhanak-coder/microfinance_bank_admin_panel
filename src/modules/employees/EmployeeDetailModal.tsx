import { FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Modal, ConfirmDialog } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { Skeleton } from '../../components/Skeleton';
import { Briefcase, Loader, Plus, Upload, Trash2, Lock } from '../../components/icons';
import { inr, fmtDate, titleCase, apiMessage } from '../../lib/format';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';

interface Props {
  employeeId: string;
  canManage: boolean;
  onClose: () => void;
  /** Tab to open on mount. Defaults to the read-only personal view. */
  initialTab?: Tab;
}

interface BranchOption { id: string; name: string; code: string }

// ── Organization-master option shapes (from /masters/*/options) ──
interface DepartmentOption { id: string; name: string; code: string }
interface DesignationOption { id: string; name: string; code: string; department: { id: string; name: string } | null }
interface GradeOption { id: string; name: string; code: string; level?: number }
interface EmploymentTypeOption { id: string; name: string; code: string }
interface ShiftOption { id: string; name: string; code: string; startTime?: string; endTime?: string }
/** Master relation object embedded on GET /employees/:id. */
interface MasterRef { id: string; name: string; code?: string | null }

interface EmployeeDocument {
  id: string; documentType: string; category: string; fileName: string;
  isVerified: boolean; verifiedAt?: string | null; isMandatory?: boolean;
  expiryDate?: string | null; version?: number; createdAt: string; uploadedById?: string | null;
}
interface DocTypeConfig {
  id: string; category: string; documentType: string;
  isMandatory: boolean; isExpiryTracked: boolean; isActive: boolean;
}
interface MandatoryStatus { category: string; documentType: string; present: boolean }
interface DocVersion { version: number; fileName: string; isSuperseded: boolean; createdAt: string }
interface SalaryStructure {
  basicSalary: string; houseRentAllowance: string; dearnessAllowance: string; specialAllowance: string;
  conveyanceAllowance: string; medicalAllowance: string; travelAllowance: string; foodAllowance: string;
  mobileAllowance: string; otherAllowance: string;
  isProvidentFundApplicable: boolean; isStateInsuranceApplicable: boolean; isProfessionalTaxApplicable: boolean;
  effectiveFrom: string;
}
interface EmployeeDetail {
  id: string; employeeCode: string; fullName: string; phoneNumber: string; email?: string | null;
  designation: string; employmentStatus: string; joiningDate: string; branchId?: string | null;
  branch?: { name: string; code?: string | null; city?: string | null; state?: string | null } | null;
  bankIfscCode?: string | null; bankAccountMasked?: string | null;
  panMasked?: string | null; salaryStructure?: SalaryStructure | null;
  // HR profile
  department?: string | null; reportsToId?: string | null;
  dateOfBirth?: string | null; gender?: string | null; maritalStatus?: string | null;
  addressLine?: string | null;
  emergencyContactName?: string | null; emergencyContactPhone?: string | null; emergencyContactRelation?: string | null;
  employeeType?: string | null; confirmationDate?: string | null;
  uanNumber?: string | null; providentFundNumber?: string | null; stateInsuranceNumber?: string | null;
  // Organization-master relations (embedded on GET /employees/:id)
  departmentRef?: MasterRef | null; designationRef?: MasterRef | null; grade?: MasterRef | null;
  employmentTypeRef?: MasterRef | null; shift?: MasterRef | null;
  departmentId?: string | null; designationId?: string | null; gradeId?: string | null;
  employmentTypeId?: string | null; shiftId?: string | null;
}
interface EmployeeLite { id: string; fullName: string; designation: string }

interface LeaveBalance {
  leaveType: string; isPaid: boolean; annualEntitlement: number;
  opening: number; accrued: number; used: number; encashed: number; available: number;
}

// ── Login-account (Account tab) ──
interface LoginHistoryEntry { success: boolean; reason?: string | null; ipAddress?: string | null; createdAt: string }
interface AccountInfo {
  hasAccount: boolean;
  userId?: string; username?: string; officialEmail?: string; role?: string;
  status?: 'ACTIVE' | 'INACTIVE'; isLocked?: boolean; forcePasswordChange?: boolean;
  failedLoginAttempts?: number; lastLoginAt?: string | null; passwordChangedAt?: string | null;
  loginHistory?: LoginHistoryEntry[];
}
/** Shape returned by send/resend/reset-password — carries a temp password in dev. */
interface CredentialResult {
  username: string; officialEmail: string;
  delivery: 'SMTP' | 'DEV_FALLBACK'; temporaryPassword?: string;
}

const DOCUMENT_TYPES = [
  'Aadhaar Card', 'PAN Card', 'Passport', 'Driving License', 'Voter ID',
  'Photograph', 'Offer Letter', 'Employment Contract', 'Other',
];

/** The four fixed document categories, in display order. */
const DOCUMENT_CATEGORIES: { key: string; label: string }[] = [
  { key: 'PERSONAL', label: 'Personal' },
  { key: 'EMPLOYMENT', label: 'Employment' },
  { key: 'FINANCIAL', label: 'Financial' },
  { key: 'OTHER', label: 'Other' },
];

const MS_PER_DAY = 86_400_000;
/** True when a document expires within the next 30 days (or is already past due). */
const isExpiringSoon = (expiryDate?: string | null): boolean =>
  !!expiryDate && (new Date(expiryDate).getTime() - Date.now()) <= 30 * MS_PER_DAY;

type SalaryComponentKey =
  | 'basicSalary' | 'houseRentAllowance' | 'dearnessAllowance' | 'specialAllowance'
  | 'conveyanceAllowance' | 'medicalAllowance' | 'travelAllowance' | 'foodAllowance'
  | 'mobileAllowance' | 'otherAllowance';

const SALARY_COMPONENTS: { key: SalaryComponentKey; label: string }[] = [
  { key: 'basicSalary', label: 'Basic' },
  { key: 'houseRentAllowance', label: 'House rent allowance' },
  { key: 'dearnessAllowance', label: 'Dearness allowance' },
  { key: 'specialAllowance', label: 'Special allowance' },
  { key: 'conveyanceAllowance', label: 'Conveyance allowance' },
  { key: 'medicalAllowance', label: 'Medical allowance' },
  { key: 'travelAllowance', label: 'Travel allowance' },
  { key: 'foodAllowance', label: 'Food allowance' },
  { key: 'mobileAllowance', label: 'Mobile allowance' },
  { key: 'otherAllowance', label: 'Other allowance' },
];

const emptyEdit = {
  fullName: '', phoneNumber: '', email: '', designation: '', branchId: '',
  joiningDate: '', employmentStatus: 'ACTIVE', bankAccountNumber: '', bankIfscCode: '', panNumber: '',
  departmentId: '', designationId: '', gradeId: '', employmentTypeId: '', shiftId: '',
};

const emptySalary = {
  basicSalary: '', houseRentAllowance: '', dearnessAllowance: '', specialAllowance: '',
  conveyanceAllowance: '', medicalAllowance: '', travelAllowance: '', foodAllowance: '',
  mobileAllowance: '', otherAllowance: '', effectiveFrom: '',
  isProvidentFundApplicable: true, isStateInsuranceApplicable: false, isProfessionalTaxApplicable: true,
};
type SalaryForm = typeof emptySalary;

const compact = <T extends Record<string, unknown>>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null)) as Partial<T>;

type Tab = 'personal' | 'branch' | 'kyc' | 'documents' | 'salary' | 'leave' | 'account' | 'edit';

/**
 * Employee workspace under Employee Management. Splits the profile into the
 * sections HR works with: personal details, posting (branch), KYC documents,
 * salary (with revision), leave balances — plus an edit form for HR managers.
 */
export default function EmployeeDetailModal({ employeeId, canManage, onClose, initialTab }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const canDocs = can(user?.role, 'document:manage');
  const canAccount = can(user?.role, 'account:manage');
  const [tab, setTab] = useState<Tab>(initialTab && (initialTab !== 'edit' || canManage) ? initialTab : 'personal');

  const detailQuery = useQuery({
    queryKey: ['/employees', employeeId],
    queryFn: () => api.get(`/employees/${employeeId}`).then((r) => r.data.data as EmployeeDetail),
  });
  const detail = detailQuery.data;

  // Directory used to resolve the reporting-manager name from its id.
  const directoryQuery = useQuery({
    queryKey: ['/employees', 'directory'],
    queryFn: () => api.get('/employees?pageSize=200').then((r) => r.data.data as EmployeeLite[]),
    enabled: !!detail?.reportsToId,
  });
  const reportsToName = detail?.reportsToId
    ? directoryQuery.data?.find((e) => e.id === detail.reportsToId)?.fullName ?? '…'
    : '—';

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
      departmentId: detail.departmentRef?.id ?? detail.departmentId ?? '',
      designationId: detail.designationRef?.id ?? detail.designationId ?? '',
      gradeId: detail.grade?.id ?? detail.gradeId ?? '',
      employmentTypeId: detail.employmentTypeRef?.id ?? detail.employmentTypeId ?? '',
      shiftId: detail.shift?.id ?? detail.shiftId ?? '',
    });
  }, [detail]);

  const branchesQuery = useQuery({
    queryKey: ['/branches', 'options'],
    queryFn: () => api.get('/branches?pageSize=100').then((r) => r.data.data as BranchOption[]),
    enabled: tab === 'edit',
  });

  // Organization-master options for the Edit tab selects.
  const departmentsQuery = useQuery({
    queryKey: ['/masters/departments/options'],
    queryFn: () => api.get('/masters/departments/options').then((r) => r.data.data as DepartmentOption[]),
    enabled: tab === 'edit',
  });
  const designationsQuery = useQuery({
    queryKey: ['/masters/designations/options'],
    queryFn: () => api.get('/masters/designations/options').then((r) => r.data.data as DesignationOption[]),
    enabled: tab === 'edit',
  });
  const gradesQuery = useQuery({
    queryKey: ['/masters/grades/options'],
    queryFn: () => api.get('/masters/grades/options').then((r) => r.data.data as GradeOption[]),
    enabled: tab === 'edit',
  });
  const employmentTypesQuery = useQuery({
    queryKey: ['/masters/employment-types/options'],
    queryFn: () => api.get('/masters/employment-types/options').then((r) => r.data.data as EmploymentTypeOption[]),
    enabled: tab === 'edit',
  });
  const shiftsQuery = useQuery({
    queryKey: ['/masters/shifts/options'],
    queryFn: () => api.get('/masters/shifts/options').then((r) => r.data.data as ShiftOption[]),
    enabled: tab === 'edit',
  });
  const designationOptions = (designationsQuery.data ?? []).filter(
    (d) => !form.departmentId || d.department?.id === form.departmentId || !d.department,
  );

  const updateEmployee = useMutation({
    mutationFn: () => api.patch(`/employees/${employeeId}`, compact({
      fullName: form.fullName, phoneNumber: form.phoneNumber, email: form.email,
      designation: form.designation, branchId: form.branchId, joiningDate: form.joiningDate,
      employmentStatus: form.employmentStatus, bankAccountNumber: form.bankAccountNumber,
      bankIfscCode: form.bankIfscCode, panNumber: form.panNumber,
      departmentId: form.departmentId, designationId: form.designationId, gradeId: form.gradeId,
      employmentTypeId: form.employmentTypeId, shiftId: form.shiftId,
    })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/employees'] });
      detailQuery.refetch();
      setEditError('');
      toast.success('Employee updated.');
      setTab('personal');
    },
    onError: (err) => setEditError(apiMessage(err, 'Could not save changes.')),
  });

  // ── Revise salary ──
  const [salaryForm, setSalaryForm] = useState<SalaryForm>(emptySalary);
  const [salaryError, setSalaryError] = useState('');
  useEffect(() => {
    const s = detail?.salaryStructure;
    if (!s) { setSalaryForm(emptySalary); return; }
    setSalaryForm({
      basicSalary: String(s.basicSalary ?? ''),
      houseRentAllowance: String(s.houseRentAllowance ?? ''),
      dearnessAllowance: String(s.dearnessAllowance ?? ''),
      specialAllowance: String(s.specialAllowance ?? ''),
      conveyanceAllowance: String(s.conveyanceAllowance ?? ''),
      medicalAllowance: String(s.medicalAllowance ?? ''),
      travelAllowance: String(s.travelAllowance ?? ''),
      foodAllowance: String(s.foodAllowance ?? ''),
      mobileAllowance: String(s.mobileAllowance ?? ''),
      otherAllowance: String(s.otherAllowance ?? ''),
      effectiveFrom: s.effectiveFrom ? s.effectiveFrom.slice(0, 10) : '',
      isProvidentFundApplicable: s.isProvidentFundApplicable ?? true,
      isStateInsuranceApplicable: s.isStateInsuranceApplicable ?? false,
      isProfessionalTaxApplicable: s.isProfessionalTaxApplicable ?? true,
    });
  }, [detail]);

  const salaryFormGross = SALARY_COMPONENTS.reduce((sum, c) => sum + (Number(salaryForm[c.key]) || 0), 0);

  const reviseSalary = useMutation({
    mutationFn: () => api.put(`/employees/${employeeId}/salary`, {
      basicSalary: Number(salaryForm.basicSalary || 0),
      houseRentAllowance: Number(salaryForm.houseRentAllowance || 0),
      dearnessAllowance: Number(salaryForm.dearnessAllowance || 0),
      specialAllowance: Number(salaryForm.specialAllowance || 0),
      conveyanceAllowance: Number(salaryForm.conveyanceAllowance || 0),
      medicalAllowance: Number(salaryForm.medicalAllowance || 0),
      travelAllowance: Number(salaryForm.travelAllowance || 0),
      foodAllowance: Number(salaryForm.foodAllowance || 0),
      mobileAllowance: Number(salaryForm.mobileAllowance || 0),
      otherAllowance: Number(salaryForm.otherAllowance || 0),
      isProvidentFundApplicable: salaryForm.isProvidentFundApplicable,
      isStateInsuranceApplicable: salaryForm.isStateInsuranceApplicable,
      isProfessionalTaxApplicable: salaryForm.isProfessionalTaxApplicable,
      effectiveFrom: salaryForm.effectiveFrom,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/employees', employeeId] });
      qc.invalidateQueries({ queryKey: ['/employees'] });
      detailQuery.refetch();
      setSalaryError('');
      toast.success('Salary structure revised.');
    },
    onError: (err) => setSalaryError(apiMessage(err, 'Could not revise the salary structure.')),
  });

  const submitSalary = (e: FormEvent) => {
    e.preventDefault();
    setSalaryError('');
    if (!salaryForm.effectiveFrom) { setSalaryError('An effective-from date is required.'); return; }
    reviseSalary.mutate();
  };

  // ── Leave balances ──
  const leaveQuery = useQuery({
    queryKey: ['/human-resources/leaves/balances', employeeId],
    queryFn: () => api.get(`/human-resources/leaves/balances?employeeId=${employeeId}`).then((r) => r.data.data as { year: number; balances: LeaveBalance[] }),
    enabled: canManage && tab === 'leave',
  });

  // ── Login account ──
  const accountQuery = useQuery({
    queryKey: ['/employees', employeeId, 'account'],
    queryFn: () => api.get(`/employees/${employeeId}/account`).then((r) => r.data.data as AccountInfo),
    enabled: tab === 'account',
  });
  const account = accountQuery.data;
  const [tempCred, setTempCred] = useState<CredentialResult | null>(null);

  /** Runs any /account/:action POST; surfaces the temp password when returned. */
  const accountAction = useMutation({
    mutationFn: (action: string) => api.post(`/employees/${employeeId}/account/${action}`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['/employees', employeeId, 'account'] });
      const data = res.data.data as Partial<CredentialResult> | undefined;
      if (data?.temporaryPassword) {
        setTempCred(data as CredentialResult);
      } else {
        setTempCred(null);
      }
      toast.success(res.data.message ?? 'Done.');
    },
    onError: (err) => toast.error(apiMessage(err, 'The account action could not be completed.')),
  });

  // ── KYC documents ──
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

  // ── Documents tab (categorised, versioned) ──
  const typeConfigsQuery = useQuery({
    queryKey: ['/documents/type-configs'],
    queryFn: () => api.get('/documents/type-configs').then((r) => r.data.data as DocTypeConfig[]),
    enabled: tab === 'documents',
  });
  const mandatoryStatusQuery = useQuery({
    queryKey: ['/documents/mandatory-status', employeeId],
    queryFn: () => api.get(`/documents/mandatory-status/${employeeId}`).then((r) => r.data.data as MandatoryStatus[]),
    enabled: tab === 'documents',
  });
  const refreshDocs = () => { documentsQuery.refetch(); mandatoryStatusQuery.refetch(); };

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
      body.append('employeeId', employeeId);
      body.append('documentType', upType);
      body.append('category', upCategory);
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

  // Replace modal (new version)
  const [replaceTarget, setReplaceTarget] = useState<EmployeeDocument | null>(null);
  const [replaceExpiry, setReplaceExpiry] = useState('');
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const replaceFileRef = useRef<HTMLInputElement>(null);

  const openReplace = (doc: EmployeeDocument) => {
    setReplaceTarget(doc);
    setReplaceExpiry(doc.expiryDate ? doc.expiryDate.slice(0, 10) : '');
    setReplaceFile(null);
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

  // Version history modal
  const [versionsTarget, setVersionsTarget] = useState<EmployeeDocument | null>(null);
  const versionsQuery = useQuery({
    queryKey: ['/documents', versionsTarget?.id, 'versions'],
    queryFn: () => api.get(`/documents/${versionsTarget!.id}/versions`).then((r) => r.data.data as DocVersion[]),
    enabled: !!versionsTarget,
  });

  // Verify / delete
  const verifyDocument = useMutation({
    mutationFn: (id: string) => api.patch(`/documents/${id}/verify`),
    onSuccess: () => { refreshDocs(); toast.success('Document verified.'); },
    onError: (err) => toast.error(apiMessage(err, 'Could not verify the document.')),
  });
  const [deleteDocTarget, setDeleteDocTarget] = useState<EmployeeDocument | null>(null);
  const deleteDocument = useMutation({
    mutationFn: (id: string) => api.delete(`/documents/${id}`),
    onSuccess: () => { setDeleteDocTarget(null); refreshDocs(); toast.success('Document deleted.'); },
    onError: (err) => { setDeleteDocTarget(null); toast.error(apiMessage(err, 'Could not delete the document.')); },
  });

  const submitEdit = (e: FormEvent) => { e.preventDefault(); setEditError(''); updateEmployee.mutate(); };

  const statusPill = (s: string) => <span className={`pill pill-${s.toLowerCase()}`}>{s.replaceAll('_', ' ')}</span>;
  const salary = detail?.salaryStructure;
  const salaryGross = salary
    ? SALARY_COMPONENTS.reduce((sum, c) => sum + (Number(salary[c.key]) || 0), 0)
    : 0;
  const documents = documentsQuery.data ?? [];
  const missingDocs = (mandatoryStatusQuery.data ?? []).filter((m) => !m.present);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'personal', label: 'Personal Details' },
    { key: 'branch', label: 'Branch' },
    { key: 'kyc', label: `KYC Document${documents.length ? ` (${documents.length})` : ''}` },
    { key: 'documents', label: 'Documents' },
    { key: 'salary', label: 'Salary' },
    ...(canManage ? [{ key: 'leave' as Tab, label: 'Leave' }] : []),
    ...(canManage ? [{ key: 'account' as Tab, label: 'Account' }] : []),
    ...(canManage ? [{ key: 'edit' as Tab, label: 'Edit' }] : []),
  ];

  const checkboxStyle = { flexDirection: 'row' as const, alignItems: 'center', gap: '0.5rem' };

  return (
    <>
    <Modal
      size="lg"
      onClose={onClose}
      icon={<Briefcase size={20} />}
      title={detail ? detail.fullName : 'Employee'}
      subtitle={detail ? <>{detail.designation} · <code>{detail.employeeCode}</code></> : undefined}
      headerAside={detail ? statusPill(detail.employmentStatus) : undefined}
      footer={<button onClick={onClose}>Close</button>}
    >
      {!detail ? (
        <div className="modal-loading"><Loader size={22} /><span>Loading employee…</span></div>
      ) : (
        <>
            <div className="tabs">
              {tabs.map((t) => (
                <button key={t.key} type="button" className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'personal' && (
              <dl className="detail-list">
                <div><dt>Employee code</dt><dd><code>{detail.employeeCode}</code></dd></div>
                <div><dt>Designation</dt><dd>{detail.designationRef?.name ?? detail.designation}</dd></div>
                <div><dt>Department</dt><dd>{detail.departmentRef?.name ?? detail.department ?? '—'}</dd></div>
                <div><dt>Grade</dt><dd>{detail.grade?.name ?? '—'}</dd></div>
                <div><dt>Reporting manager</dt><dd>{reportsToName}</dd></div>
                <div><dt>Employment type</dt><dd>{detail.employmentTypeRef?.name ?? (detail.employeeType ? titleCase(detail.employeeType) : '—')}</dd></div>
                <div><dt>Shift</dt><dd>{detail.shift?.name ?? '—'}</dd></div>
                <div><dt>Status</dt><dd>{statusPill(detail.employmentStatus)}</dd></div>
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
                <div><dt>UAN</dt><dd>{detail.uanNumber ?? '—'}</dd></div>
                <div><dt>PF number</dt><dd>{detail.providentFundNumber ?? '—'}</dd></div>
                <div><dt>ESI number</dt><dd>{detail.stateInsuranceNumber ?? '—'}</dd></div>
                <div><dt>PAN</dt><dd>{detail.panMasked ?? '—'}</dd></div>
                <div><dt>Bank account</dt><dd>{detail.bankAccountMasked ?? '—'}</dd></div>
                <div><dt>IFSC</dt><dd>{detail.bankIfscCode ?? '—'}</dd></div>
              </dl>
            )}

            {tab === 'branch' && (
              detail.branch ? (
                <dl className="detail-list">
                  <div><dt>Branch</dt><dd>{detail.branch.name}</dd></div>
                  <div><dt>Branch code</dt><dd>{detail.branch.code ? <code>{detail.branch.code}</code> : '—'}</dd></div>
                  <div><dt>City</dt><dd>{detail.branch.city ?? '—'}</dd></div>
                  <div><dt>State</dt><dd>{detail.branch.state ?? '—'}</dd></div>
                </dl>
              ) : (
                <p className="muted">This employee is not assigned to a branch yet.{canManage ? ' Use the Edit tab to assign one.' : ''}</p>
              )
            )}

            {tab === 'kyc' && (
              <>
                <div className="doc-list">
                  {documentsQuery.isLoading && <p className="muted">Loading…</p>}
                  {!documentsQuery.isLoading && documents.length === 0 && <p className="muted">No KYC documents uploaded yet.</p>}
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

            {tab === 'documents' && (
              <>
                {canDocs && (
                  <div className="row-actions" style={{ justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
                    <button type="button" onClick={openUpload}><Plus size={14} /> Upload document</button>
                  </div>
                )}

                {missingDocs.length > 0 && (
                  <div className="doc-missing">
                    {missingDocs.map((m) => (
                      <span key={`${m.category}-${m.documentType}`} className="miss-chip">{m.documentType} · {titleCase(m.category)}</span>
                    ))}
                  </div>
                )}

                {documentsQuery.isLoading ? (
                  <div className="doc-list">
                    <Skeleton height={46} /><Skeleton height={46} /><Skeleton height={46} />
                  </div>
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
              </>
            )}

            {tab === 'salary' && (
              <>
                {salary ? (
                  <dl className="detail-list">
                    {SALARY_COMPONENTS.map((c) => (
                      <div key={c.key}><dt>{c.label}</dt><dd>{inr(salary[c.key])}</dd></div>
                    ))}
                    <div><dt>Gross (monthly)</dt><dd><strong>{inr(salaryGross)}</strong></dd></div>
                    <div><dt>PF applicable</dt><dd>{salary.isProvidentFundApplicable ? 'Yes' : 'No'}</dd></div>
                    <div><dt>ESI applicable</dt><dd>{salary.isStateInsuranceApplicable ? 'Yes' : 'No'}</dd></div>
                    <div><dt>Professional tax</dt><dd>{salary.isProfessionalTaxApplicable ? 'Yes' : 'No'}</dd></div>
                    <div><dt>Effective from</dt><dd>{fmtDate(salary.effectiveFrom)}</dd></div>
                  </dl>
                ) : <p className="muted">No salary structure on record.{canManage ? ' Use the form below to create one.' : ''}</p>}

                {canManage && (
                  <form className="form-grid" onSubmit={submitSalary}>
                    <div className="span-all"><h3 className="section-title">Revise salary</h3></div>
                    {SALARY_COMPONENTS.map((c) => (
                      <label key={c.key}>{c.label}
                        <input type="number" min="0" value={salaryForm[c.key]}
                          onChange={(e) => setSalaryForm({ ...salaryForm, [c.key]: e.target.value })}
                          required={c.key === 'basicSalary'} />
                      </label>
                    ))}
                    <label>Effective from<input type="date" value={salaryForm.effectiveFrom} onChange={(e) => setSalaryForm({ ...salaryForm, effectiveFrom: e.target.value })} required /></label>
                    <label style={checkboxStyle}>
                      <input type="checkbox" checked={salaryForm.isProvidentFundApplicable} onChange={(e) => setSalaryForm({ ...salaryForm, isProvidentFundApplicable: e.target.checked })} style={{ width: 'auto' }} />
                      PF applicable
                    </label>
                    <label style={checkboxStyle}>
                      <input type="checkbox" checked={salaryForm.isStateInsuranceApplicable} onChange={(e) => setSalaryForm({ ...salaryForm, isStateInsuranceApplicable: e.target.checked })} style={{ width: 'auto' }} />
                      ESI applicable
                    </label>
                    <label style={checkboxStyle}>
                      <input type="checkbox" checked={salaryForm.isProfessionalTaxApplicable} onChange={(e) => setSalaryForm({ ...salaryForm, isProfessionalTaxApplicable: e.target.checked })} style={{ width: 'auto' }} />
                      Professional tax applicable
                    </label>
                    <div className="span-all row" style={{ justifyContent: 'space-between' }}>
                      <span className="muted">New gross / CTC (monthly)</span>
                      <strong>{inr(salaryFormGross)}</strong>
                    </div>
                    {salaryError && <div className="error-box span-all">{salaryError}</div>}
                    <div className="span-all row-actions">
                      <button type="submit" disabled={reviseSalary.isPending}>Save revision</button>
                    </div>
                  </form>
                )}
              </>
            )}

            {tab === 'leave' && canManage && (
              leaveQuery.isLoading ? (
                <p className="muted">Loading leave balances…</p>
              ) : leaveQuery.data && leaveQuery.data.balances.length > 0 ? (
                <dl className="detail-list">
                  {leaveQuery.data.balances.map((b) => (
                    <div key={b.leaveType}>
                      <dt>{titleCase(b.leaveType)}{b.isPaid ? '' : ' (unpaid)'}</dt>
                      <dd><strong>{b.available}</strong> available · {b.used} used of {b.annualEntitlement} / yr</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="muted">No leave balances on record{leaveQuery.data ? ` for ${leaveQuery.data.year}` : ''}.</p>
              )
            )}

            {tab === 'account' && canManage && (
              <>
                {accountQuery.isLoading ? (
                  <p className="muted">Loading account…</p>
                ) : !account ? (
                  <p className="muted">Could not load the login account.</p>
                ) : !account.hasAccount ? (
                  <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                    <p className="muted">No login account yet. Create one and email the sign-in credentials to the employee.</p>
                    {canAccount && (
                      <button type="button" disabled={accountAction.isPending} onClick={() => accountAction.mutate('send-credentials')}>
                        {accountAction.isPending ? 'Working…' : 'Send credentials'}
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <dl className="detail-list">
                      <div><dt>Username</dt><dd><code>{account.username}</code></dd></div>
                      <div><dt>Official email</dt><dd>{account.officialEmail ?? '—'}</dd></div>
                      <div><dt>Login role</dt><dd>{account.role ? titleCase(account.role) : '—'}</dd></div>
                      <div><dt>Status</dt><dd><span className={`pill ${account.status === 'ACTIVE' ? 'pill-active' : 'pill-pending'}`}>{account.status ?? '—'}</span></dd></div>
                      <div><dt>Locked</dt><dd>{account.isLocked ? 'Yes' : 'No'}</dd></div>
                      <div><dt>Must change password</dt><dd>{account.forcePasswordChange ? 'Yes' : 'No'}</dd></div>
                      <div><dt>Failed attempts</dt><dd>{account.failedLoginAttempts ?? 0}</dd></div>
                      <div><dt>Last login</dt><dd>{fmtDate(account.lastLoginAt)}</dd></div>
                      <div><dt>Password changed</dt><dd>{fmtDate(account.passwordChangedAt)}</dd></div>
                    </dl>

                    {canAccount && (
                      <div className="row-actions" style={{ flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
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
                  </>
                )}

                {tempCred && (
                  <div className="success-box" style={{ marginTop: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                      <div style={{ minWidth: 0 }}>
                        <strong>Temporary password</strong>
                        <div className="sm-text">{tempCred.delivery === 'SMTP' ? 'Emailed to the employee.' : 'No email configured (dev) — share this manually.'}</div>
                        <div style={{ marginTop: '0.35rem' }}>User <code>{tempCred.username}</code> · <code style={{ fontSize: '1rem' }}>{tempCred.temporaryPassword}</code></div>
                      </div>
                      <button type="button" className="sm ghost" onClick={() => { navigator.clipboard?.writeText(tempCred.temporaryPassword ?? ''); toast.success('Password copied.'); }}>Copy</button>
                    </div>
                  </div>
                )}

                {account?.hasAccount && account.loginHistory && account.loginHistory.length > 0 && (
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

            {tab === 'edit' && canManage && (
              <form className="form-grid" onSubmit={submitEdit}>
                <label>Full name<input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required /></label>
                <label>Phone<input value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} required /></label>
                <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
                <label>Designation (label)<input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="Free-text title" required={!form.designationId} /></label>
                <label>Branch
                  <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                    <option value="">— Unassigned —</option>
                    {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
                  </select>
                </label>
                <label>Department
                  <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value, designationId: '' })}>
                    <option value="">— Select —</option>
                    {departmentsQuery.data?.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
                  </select>
                </label>
                <label>Designation
                  <select value={form.designationId} onChange={(e) => setForm({ ...form, designationId: e.target.value })}>
                    <option value="">— Select —</option>
                    {designationOptions.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
                  </select>
                </label>
                <label>Grade
                  <select value={form.gradeId} onChange={(e) => setForm({ ...form, gradeId: e.target.value })}>
                    <option value="">— Select —</option>
                    {gradesQuery.data?.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.code})</option>)}
                  </select>
                </label>
                <label>Employment type
                  <select value={form.employmentTypeId} onChange={(e) => setForm({ ...form, employmentTypeId: e.target.value })}>
                    <option value="">— Select —</option>
                    {employmentTypesQuery.data?.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
                  </select>
                </label>
                <label>Shift
                  <select value={form.shiftId} onChange={(e) => setForm({ ...form, shiftId: e.target.value })}>
                    <option value="">— Select —</option>
                    {shiftsQuery.data?.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
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
                  <button type="button" className="ghost" onClick={() => setTab('personal')}>Cancel</button>
                </div>
              </form>
            )}

        </>
      )}
    </Modal>

    {uploadOpen && (
      <Modal
        size="md"
        onClose={() => setUploadOpen(false)}
        icon={<Upload size={20} />}
        title="Upload document"
        subtitle={detail?.fullName}
        footer={<>
          <button type="button" className="ghost" onClick={() => setUploadOpen(false)}>Cancel</button>
          <button type="submit" form="doc-upload-form" disabled={uploadDocument.isPending}>{uploadDocument.isPending ? 'Uploading…' : 'Upload'}</button>
        </>}
      >
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
      <Modal
        size="md"
        onClose={() => setReplaceTarget(null)}
        icon={<Upload size={20} />}
        title="Upload new version"
        subtitle={replaceTarget.documentType}
        footer={<>
          <button type="button" className="ghost" onClick={() => setReplaceTarget(null)}>Cancel</button>
          <button type="submit" form="doc-replace-form" disabled={replaceDocument.isPending}>{replaceDocument.isPending ? 'Uploading…' : 'Upload version'}</button>
        </>}
      >
        <form id="doc-replace-form" className="form-grid" onSubmit={submitReplace}>
          <p className="muted span-all">Current file: {replaceTarget.fileName} (v{replaceTarget.version ?? 1})</p>
          <label>Expiry date<input type="date" value={replaceExpiry} onChange={(e) => setReplaceExpiry(e.target.value)} /></label>
          <label className="span-all">File<input ref={replaceFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setReplaceFile(e.target.files?.[0] ?? null)} /></label>
        </form>
      </Modal>
    )}

    {versionsTarget && (
      <Modal
        size="sm"
        onClose={() => setVersionsTarget(null)}
        icon={<Briefcase size={20} />}
        title="Version history"
        subtitle={versionsTarget.documentType}
        footer={<button onClick={() => setVersionsTarget(null)}>Close</button>}
      >
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
        tone="danger"
        icon={<Trash2 size={20} />}
        title="Delete document?"
        message={`This removes "${deleteDocTarget.documentType}" (${deleteDocTarget.fileName}) and its version history.`}
        confirmLabel="Delete document"
        loading={deleteDocument.isPending}
        onConfirm={() => deleteDocument.mutate(deleteDocTarget.id)}
        onCancel={() => setDeleteDocTarget(null)}
      />
    )}
    </>
  );
}
