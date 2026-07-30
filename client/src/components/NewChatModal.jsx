import { useState, useEffect } from 'react';
import { apiUrl } from '../utils/api';

export default function NewChatModal({ onClose, onCreated }) {
  const [search, setSearch] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(apiUrl('/api/users'), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to load users');
        }
        setAllUsers(await res.json());
      } catch (err) {
        setError(err.message || 'Connection error');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const users = allUsers.filter(u =>
    !search || u.username.toLowerCase().includes(search.toLowerCase())
  );

  function toggleUser(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleCreate() {
    if (selected.length === 0) return;
    setError('');
    try {
      const token = localStorage.getItem('token');
      const type = selected.length === 1 ? 'direct' : 'group';
      const res = await fetch(apiUrl('/api/conversations'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type, participantIds: selected }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create conversation');
      onCreated(data);
    } catch (err) {
      setError(err.message || 'Connection error');
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>New Conversation</h2>
        {error && (
          <div className="error" style={{
            background: '#3a1a1a', padding: '10px', borderRadius: '8px',
            border: '1px solid #e74c3c', marginBottom: '1rem', fontSize: '0.9rem',
          }}>
            {error}
          </div>
        )}
        <input placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} autoFocus />
        <div className="user-list">
          {loading && <div style={{ color: '#555', textAlign: 'center', padding: '1rem' }}>Loading users...</div>}
          {!loading && users.map(u => (
            <div key={u.id} className="user-item" onClick={() => toggleUser(u.id)}>
              <input type="checkbox" checked={selected.includes(u.id)} readOnly />
              <label>{u.username}</label>
            </div>
          ))}
          {!loading && allUsers.length === 0 && !error && <div style={{ color: '#555', textAlign: 'center', padding: '1rem' }}>No other users registered</div>}
          {!loading && search && allUsers.length > 0 && users.length === 0 && <div style={{ color: '#555', textAlign: 'center', padding: '1rem' }}>No users found</div>}
        </div>
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleCreate} disabled={selected.length === 0 || loading}>
            Start Chat
          </button>
        </div>
      </div>
    </div>
  );
}
