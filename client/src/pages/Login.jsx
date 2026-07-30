import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');

      login(data.token, data.user);
      navigate('/chat');
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
        <h1>Welcome Back</h1>
        <p>Sign in to continue</p>
        {error && (
          <div className="error" style={{
            background: '#3a1a1a',
            padding: '10px',
            borderRadius: '8px',
            border: '1px solid #e74c3c',
            marginBottom: '1rem',
            fontSize: '0.9rem',
          }}>
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Username</label>
            <input value={username} onChange={e => setUsername(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <div style={{ textAlign: 'center', marginTop: '0.8rem' }}>
          <Link to="/forgot-password" style={{ color: '#888', fontSize: '0.85rem' }}>Forgot Password?</Link>
        </div>
        <div className="auth-link">
          Don't have an account? <Link to="/signup">Sign Up</Link>
        </div>
      </div>
    </div>
  );
}
