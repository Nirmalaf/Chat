import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [resetToken, setResetToken] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);

      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, resetToken, password }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');

      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Server not responding. Try again later.');
      } else {
        setError(err.message || 'Connection error');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="auth-container">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <h1>Password Reset!</h1>
          <p style={{ color: '#4caf50', margin: '1rem 0' }}>Your password has been reset successfully.</p>
          <p style={{ color: '#888' }}>Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>Reset Password</h1>
        <p>Enter your reset token and new password</p>
        {error && (
          <div className="error" style={{
            background: '#3a1a1a', padding: '10px', borderRadius: '8px',
            border: '1px solid #e74c3c', marginBottom: '1rem', fontSize: '0.9rem',
          }}>
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Reset Token</label>
            <input value={resetToken} onChange={e => setResetToken(e.target.value.toUpperCase())} required placeholder="e.g. A3B7X9" />
          </div>
          <div className="form-group">
            <label>New Password (min 4 characters)</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={4} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>
        <div className="auth-link">
          <Link to="/forgot-password">Get new token</Link> &middot; <Link to="/login">Back to Sign In</Link>
        </div>
      </div>
    </div>
  );
}