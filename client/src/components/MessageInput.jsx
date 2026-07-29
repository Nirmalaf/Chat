import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

export default function MessageInput({ conversation, onConversationsChange }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState('');
  const { user } = useAuth();
  const { socket } = useSocket();
  const messagesEndRef = useRef(null);
  const typingTimeout = useRef(null);

  useEffect(() => {
    if (!conversation) return;
    const token = localStorage.getItem('token');
    fetch(`/api/conversations/${conversation.id}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.ok ? res.json() : [])
      .then(setMessages);
    socket?.emit('join_conversation', conversation.id);
    setTyping('');
  }, [conversation?.id]);

  useEffect(() => {
    if (!socket) return;
    const handler = ({ conversationId, message }) => {
      if (conversationId === conversation?.id) {
        setMessages(prev => [...prev, message]);
        onConversationsChange();
      }
    };
    const typingHandler = ({ conversationId, username }) => {
      if (conversationId === conversation?.id) setTyping(`${username} is typing...`);
    };
    const stopTypingHandler = ({ conversationId }) => {
      if (conversationId === conversation?.id) setTyping('');
    };
    socket.on('new_message', handler);
    socket.on('typing', typingHandler);
    socket.on('stop_typing', stopTypingHandler);
    return () => {
      socket.off('new_message', handler);
      socket.off('typing', typingHandler);
      socket.off('stop_typing', stopTypingHandler);
    };
  }, [socket, conversation?.id]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  function handleSend(e) {
    e.preventDefault();
    if (!input.trim() || !socket || !conversation) return;
    socket.emit('send_message', { conversationId: conversation.id, content: input.trim() });
    setInput('');
    socket.emit('stop_typing', { conversationId: conversation.id });
  }

  function handleInput(e) {
    setInput(e.target.value);
    if (!socket || !conversation) return;
    socket.emit('typing', { conversationId: conversation.id });
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socket.emit('stop_typing', { conversationId: conversation.id });
    }, 1500);
  }

  return (
    <>
      <div className="messages">
        {messages.map(msg => (
          <div key={msg.id} className={`message ${msg.senderId === user?.id ? 'mine' : 'other'}`}>
            <div>{msg.content}</div>
            <div className="message-meta">
              {msg.sender?.username || ''} {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      {typing && <div className="typing-indicator">{typing}</div>}
      <form className="message-input-area" onSubmit={handleSend}>
        <input
          value={input}
          onChange={handleInput}
          placeholder="Type a message..."
        />
        <button type="submit" disabled={!input.trim()}>Send</button>
      </form>
    </>
  );
}
