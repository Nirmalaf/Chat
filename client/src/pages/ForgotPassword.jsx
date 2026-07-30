import { useState } from 'react';
import { Link } from 'react-router-dom';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetToken, setResetToken] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    setResetToken('');

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);

      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');

      setResetToken(data.resetToken);
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

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>Forgot Password</h1>
        <p>Enter your email to get a reset token</p>
        {error && (
          <div className="error" style={{
            background: '#3a1a1a', padding: '10px', borderRadius: '8px',
            border: '1px solid #e74c3c', marginBottom: '1rem', fontSize: '0.9rem',
          }}>
            {error}
          </div>
        )}
        {resetToken ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#4caf50', marginBottom: '1rem' }}>Reset token generated!</p>
            <div style={{
              background: '#1a1a2e', padding: '1rem', borderRadius: '8px',
              border: '1px solid #4a90d9', fontSize: '1.5rem', fontWeight: 'bold',
              letterSpacing: '0.3rem', textAlign: 'center', color: '#4a90d9',
              marginBottom: '1rem', fontFamily: 'monospace',
            }}>
              {resetToken}
            </div>
            <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: '1rem' }}>
              This token expires in 1 hour. Copy it and use it to reset your password.
            </p>
            <Link to={`/reset-password?email=${encodeURIComponent(email)}`} className="btn btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
              Reset Password
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Sending...' : 'Send Reset Token'}
            </button>
          </form>
        )}
        <div className="auth-link">
          <Link to="/login">Back to Sign In</Link>
        </div>
      </div>
    </div>
  );
}