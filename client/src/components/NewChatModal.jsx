import { useState, useEffect } from 'react';
import { apiUrl } from '../utils/api';

export default function NewChatModal({ onClose, onCreated }) {
  const [search, setSearch] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    (async () => {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl('/api/users'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setAllUsers(await res.json());
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
    const token = localStorage.getItem('token');
    const type = selected.length === 1 ? 'direct' : 'group';
    const res = await fetch(apiUrl('/api/conversations'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type, participantIds: selected }),
    });
    if (res.ok) onCreated(await res.json());
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>New Conversation</h2>
        <input placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} autoFocus />
        <div className="user-list">
          {users.map(u => (
            <div key={u.id} className="user-item" onClick={() => toggleUser(u.id)}>
              <input type="checkbox" checked={selected.includes(u.id)} readOnly />
              <label>{u.username}</label>
            </div>
          ))}
          {allUsers.length === 0 && <div style={{ color: '#555' }}>No other users registered</div>}
          {search && allUsers.length > 0 && users.length === 0 && <div style={{ color: '#555' }}>No users found</div>}
        </div>
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleCreate} disabled={selected.length === 0}>
            Start Chat
          </button>
        </div>
      </div>
    </div>
  );
}
