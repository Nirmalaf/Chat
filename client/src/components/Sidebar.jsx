import { useAuth } from '../context/AuthContext';

export default function Sidebar({ conversations, activeConvId, onSelect, onNewChat }) {
  const { user, logout } = useAuth();

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>Chats</h2>
        <button onClick={onNewChat} title="New Chat">+</button>
      </div>
      <div className="user-info">
        <span>{user?.username}</span>
        <button onClick={logout}>Logout</button>
      </div>
      <div className="conversations">
        {conversations.map(conv => (
          <div
            key={conv.id}
            className={`conversation-item ${conv.id === activeConvId ? 'active' : ''}`}
            onClick={() => onSelect(conv)}
          >
            <div className="conversation-name">{conv.name}</div>
            <div className="conversation-preview">
              {conv.lastMessage ? conv.lastMessage.content : 'No messages yet'}
            </div>
          </div>
        ))}
        {conversations.length === 0 && (
          <div style={{ padding: '1rem', color: '#555', textAlign: 'center' }}>
            No conversations yet. Click + to start one.
          </div>
        )}
      </div>
    </div>
  );
}
