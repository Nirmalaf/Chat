import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../utils/api';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import NewChatModal from '../components/NewChatModal';

export default function Chat() {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [showNewChat, setShowNewChat] = useState(false);

  const activeConv = activeId ? conversations.find(c => c.id === activeId) || null : null;

  const fetchConversations = useCallback(async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(apiUrl('/api/conversations'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setConversations(await res.json());
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    }
  }, []);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  function handleSelect(conv) {
    setActiveId(conv.id);
  }

  return (
    <div className="chat-layout">
      <Sidebar
        conversations={conversations}
        activeConvId={activeId}
        onSelect={handleSelect}
        onNewChat={() => setShowNewChat(true)}
      />
      <ChatWindow
        conversation={activeConv}
        onConversationsChange={fetchConversations}
      />
      {showNewChat && (
        <NewChatModal
          onClose={() => setShowNewChat(false)}
          onCreated={(conv) => {
            setShowNewChat(false);
            setActiveId(conv.id);
            fetchConversations();
          }}
        />
      )}
    </div>
  );
}
