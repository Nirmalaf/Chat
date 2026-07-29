import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../utils/api';

const POLL_INTERVAL = 2000;

export default function MessageInput({ conversation, onConversationsChange }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const { user } = useAuth();
  const messagesEndRef = useRef(null);
  const lastPollRef = useRef(null);
  const pollRef = useRef(null);

  const fetchMessages = useCallback(async () => {
    if (!conversation) return;
    const token = localStorage.getItem('token');
    const url = lastPollRef.current
      ? apiUrl(`/api/conversations/${conversation.id}/poll?since=${lastPollRef.current}`)
      : apiUrl(`/api/conversations/${conversation.id}/messages`);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const data = await res.json();
    if (lastPollRef.current) {
      if (data.messages?.length > 0) {
        setMessages(prev => [...prev, ...data.messages]);
        onConversationsChange();
      }
      if (data.serverTime) lastPollRef.current = data.serverTime;
    } else {
      setMessages(data);
      lastPollRef.current = new Date().toISOString();
    }
  }, [conversation, onConversationsChange]);

  useEffect(() => {
    setMessages([]);
    lastPollRef.current = null;
    if (conversation) {
      fetchMessages();
      pollRef.current = setInterval(fetchMessages, POLL_INTERVAL);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [conversation?.id, fetchMessages]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function handleSend(e) {
    e.preventDefault();
    if (!input.trim() || !conversation) return;
    const token = localStorage.getItem('token');
    const res = await fetch(apiUrl(`/api/conversations/${conversation.id}/messages`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content: input.trim() }),
    });
    if (res.ok) {
      setInput('');
      await fetchMessages();
    }
  }

  return (
    <>
      <div className="messages">
        {messages.map(msg => (
          <div key={msg.id} className={`message ${msg.senderId === user?.id ? 'mine' : 'other'}`}>
            <div>{msg.content}</div>
            <div className="message-meta">
              {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form className="message-input-area" onSubmit={handleSend}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type a message..."
        />
        <button type="submit" disabled={!input.trim()}>Send</button>
      </form>
    </>
  );
}
