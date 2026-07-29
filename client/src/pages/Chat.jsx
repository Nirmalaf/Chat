import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { SocketProvider } from '../context/SocketContext';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import NewChatModal from '../components/NewChatModal';

function ChatInner() {
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [showNewChat, setShowNewChat] = useState(false);

  const fetchConversations = useCallback(async () => {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/conversations', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setConversations(await res.json());
  }, []);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  return (
    <div className="chat-layout">
      <Sidebar
        conversations={conversations}
        activeConvId={activeConv?.id}
        onSelect={setActiveConv}
        onNewChat={() => setShowNewChat(true)}
        onConversationsChange={fetchConversations}
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
            setActiveConv(conv);
            fetchConversations();
          }}
        />
      )}
    </div>
  );
}

export default function Chat() {
  return (
    <SocketProvider>
      <ChatInner />
    </SocketProvider>
  );
}
