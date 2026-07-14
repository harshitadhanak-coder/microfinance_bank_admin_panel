import { FormEvent, useState } from 'react';
import { AxiosError } from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { CheckCircle, Lock } from '../../components/icons';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissions';
import EmployeeDetailModal from '../employees/EmployeeDetailModal';

interface Profile {
  id: string; employeeCode: string; fullName: string; phoneNumber: string; email?: string | null;
  designation: string; employmentStatus: string; joiningDate: string;
  branch?: { name: string; code?: string | null; manager?: { id: string; fullName: string } | null } | null;
}

const fmtDate = (v?: string | null): string =>
  v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const titleCase = (s?: string | null): string => (s ? s.charAt(0) + s.slice(1).toLowerCase().replaceAll('_', ' ') : '—');
const apiMessage = (err: unknown, fb: string): string =>
  (err instanceof AxiosError && err.response?.data?.message) || fb;
const initials = (name: string): string => {
  const p = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || 'U';
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="profile-field"><dt>{label}</dt><dd>{children ?? '—'}</dd></div>
);

export default function MyProfilePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const profileQuery = useQuery({
    queryKey: ['/employees/me'],
    queryFn: () => api.get('/employees/me').then((r) => r.data.data as Profile | null),
  });
  const profile = profileQuery.data ?? null;
  const hasEmployee = !!profile;
  const canEditEmployee = hasEmployee && can(user?.role, 'employee:update');

  const displayName = profile?.fullName ?? user?.fullName ?? 'My profile';
  const roleLabel = titleCase(user?.role);
  const branchName = profile?.branch?.name ?? user?.branch?.name ?? (user?.branchId ? '—' : 'All branches');
  // Reporting manager = the employee's branch manager (unless that is the person themselves).
  const reportingManager = profile?.branch?.manager && profile.branch.manager.id !== profile.id
    ? profile.branch.manager.fullName : '—';
  const statusValue = profile?.employmentStatus ?? user?.status ?? 'ACTIVE';

  return (
    <>
      <header className="page-head">
        <h1>My Profile</h1>
        <p className="muted">Your account and employment details</p>
      </header>

      {profileQuery.isLoading ? (
        <div className="panel pad muted">Loading your profile…</div>
      ) : (
        <div className="panel profile-page">
          {/* Header */}
          <div className="profile-top">
            <div className="profile-top-main">
              <span className="profile-avatar-lg" aria-hidden="true">{initials(displayName)}</span>
              <div className="profile-top-id">
                <h2>{displayName}</h2>
                <p className="profile-role">{roleLabel}</p>
                <div className="profile-top-meta">
                  {hasEmployee && <span><span className="m-label">Employee ID</span>{profile!.employeeCode}</span>}
                  {hasEmployee && <span><span className="m-label">Designation</span>{profile!.designation}</span>}
                  <span><span className="m-label">Branch</span>{branchName}</span>
                  <span className={`pill pill-${statusValue.toLowerCase()}`}>{titleCase(statusValue)}</span>
                </div>
              </div>
            </div>
            <div className="profile-top-actions">
              {canEditEmployee && <button type="button" onClick={() => setEditing(true)}>Edit profile</button>}
              <button type="button" className="ghost" onClick={() => setChangingPassword(true)}>Change password</button>
            </div>
          </div>

          <div className="profile-divider" />

          {/* Personal information */}
          <section className="profile-section">
            <h3>Personal Information</h3>
            <dl className="profile-fields">
              <Field label="Full name">{displayName}</Field>
              <Field label="Email">{profile?.email ?? user?.email ?? '—'}</Field>
              <Field label="Phone">{profile?.phoneNumber ?? user?.phoneNumber ?? '—'}</Field>
              <Field label="Gender">—</Field>
              <Field label="Date of birth">—</Field>
              <Field label="Address">—</Field>
            </dl>
          </section>

          {/* Employment details — only for accounts linked to an employee record */}
          {hasEmployee && (
            <>
              <div className="profile-divider" />
              <section className="profile-section">
                <h3>Employment Details</h3>
                <dl className="profile-fields">
                  <Field label="Employee code">{profile!.employeeCode}</Field>
                  <Field label="Designation">{profile!.designation}</Field>
                  <Field label="Department">—</Field>
                  <Field label="Reporting manager">{reportingManager}</Field>
                  <Field label="Branch">{profile!.branch?.name ?? '—'}{profile!.branch?.code ? ` (${profile!.branch.code})` : ''}</Field>
                  <Field label="Joining date">{fmtDate(profile!.joiningDate)}</Field>
                  <Field label="Employment type">—</Field>
                </dl>
              </section>
            </>
          )}
        </div>
      )}

      {editing && profile && (
        <EmployeeDetailModal
          employeeId={profile.id}
          canManage={can(user?.role, 'employee:update')}
          initialTab="edit"
          onClose={() => { setEditing(false); qc.invalidateQueries({ queryKey: ['/employees/me'] }); }}
        />
      )}

      {changingPassword && <ChangePasswordModal onClose={() => setChangingPassword(false)} />}
    </>
  );
}

// ── Change password ──────────────────────────────────────────────────────────
function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const save = useMutation({
    mutationFn: () => api.post('/auth/change-password', { currentPassword, newPassword }),
    onSuccess: () => setDone(true),
    onError: (err) => setError(apiMessage(err, 'Could not change your password.')),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) { setError('The new passwords do not match.'); return; }
    save.mutate();
  };

  return (
    <Modal
      size="md"
      onClose={onClose}
      icon={<Lock size={20} />}
      title="Change password"
      subtitle="Choose a strong password you don't use elsewhere."
      footer={done ? (
        <button type="button" onClick={onClose}>Done</button>
      ) : (
        <>
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="change-password-form" disabled={save.isPending || !currentPassword || !newPassword}>
            {save.isPending ? 'Saving…' : 'Update password'}
          </button>
        </>
      )}
    >
      {done ? (
        <div className="success-box"><CheckCircle size={16} /> Your password has been changed successfully.</div>
      ) : (
        <form id="change-password-form" onSubmit={submit} className="form-grid">
          <label className="span-all">Current password
            <input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </label>
          <label className="span-all">New password
            <input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
          </label>
          <label className="span-all">Confirm new password
            <input type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          </label>
          <p className="muted sm-text span-all" style={{ margin: 0 }}>
            At least 10 characters with an uppercase and lowercase letter, a digit and a special character.
          </p>
          {error && <div className="error-box span-all">{error}</div>}
        </form>
      )}
    </Modal>
  );
}
