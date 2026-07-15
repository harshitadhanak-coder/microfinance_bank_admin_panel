import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { apiMessage } from '../../lib/format';
import { useAuth } from './AuthContext';
import { useToast } from '../../components/Toast';
import { Eye, EyeOff } from '../../components/icons';

/** Password policy the backend enforces — shown to the operator up front. */
const RULES = [
  'At least 10 characters long',
  'One uppercase and one lowercase letter',
  'At least one digit',
  'At least one symbol',
  'Not a recently used password',
];

/**
 * Forced first-login (or reset) password change. Reached when the login
 * response flags mustChangePassword; the router also pins the session here
 * until the flag clears. On success the flag is cleared and the user lands on
 * the app home.
 */
export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const { clearMustChangePassword } = useAuth();
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirm) {
      setError('The new password and its confirmation do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('Your new password must be different from the current one.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      clearMustChangePassword();
      toast.success('Password changed. Welcome aboard.');
      navigate('/');
    } catch (err) {
      setError(apiMessage(err, 'Could not change the password. Check the rules and try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand-mark">MF</div>
        <h1>Set a new password</h1>
        <p className="muted">For your security you must change the temporary password before continuing.</p>

        <label>
          Current (temporary) password
          <div className="password-field">
            <input
              type={showCurrent ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoFocus
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowCurrent((v) => !v)}
              aria-label={showCurrent ? 'Hide password' : 'Show password'}
              title={showCurrent ? 'Hide password' : 'Show password'}
            >
              {showCurrent ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>

        <label>
          New password
          <div className="password-field">
            <input
              type={showNew ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowNew((v) => !v)}
              aria-label={showNew ? 'Hide password' : 'Show password'}
              title={showNew ? 'Hide password' : 'Show password'}
            >
              {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>

        <label>
          Confirm new password
          <input
            type={showNew ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </label>

        <ul className="muted" style={{ margin: '0 0 0.25rem', paddingLeft: '1.1rem', fontSize: '0.85rem', textAlign: 'left' }}>
          {RULES.map((r) => <li key={r}>{r}</li>)}
        </ul>

        {error && <div className="error-box">{error}</div>}
        <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
      </form>
    </div>
  );
}
