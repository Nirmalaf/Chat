import MessageInput from './MessageInput';

export default function ChatWindow({ conversation, onConversationsChange }) {
  if (!conversation) {
    return <div className="main-area"><div className="no-chat">Select a conversation to start chatting</div></div>;
  }

  return (
    <div className="main-area">
      <div className="chat-header">{conversation.name}</div>
      <MessageInput conversation={conversation} onConversationsChange={onConversationsChange} />
    </div>
  );
}
