import { v4 as uuid } from 'uuid';
import { findById, findAll, pushToArray } from '../db.js';

export function setupSocket(io) {
  global.io = io;
  const onlineUsers = new Map();

  io.on('connection', (socket) => {
    let currentUserId = null;

    socket.on('join', ({ userId, username }) => {
      currentUserId = userId;
      socket.data.userId = userId;
      socket.data.username = username;
      onlineUsers.set(userId, { userId, username, socketId: socket.id });
      io.emit('online_users', Array.from(onlineUsers.values()));

      const convs = findAll('conversations').filter(c => c.participants.includes(userId));
      convs.forEach(c => socket.join(c.id));
    });

    socket.on('join_conversation', (conversationId) => {
      socket.join(conversationId);
    });

    socket.on('send_message', ({ conversationId, content }) => {
      if (!currentUserId || !content) return;
      const msg = {
        id: uuid(),
        senderId: currentUserId,
        content,
        createdAt: new Date().toISOString(),
      };
      pushToArray('conversations', conversationId, 'messages', msg);
      const sender = findById('users', currentUserId);
      io.to(conversationId).emit('new_message', {
        conversationId,
        message: { ...msg, sender: sender ? { id: sender.id, username: sender.username } : undefined },
      });
    });

    socket.on('typing', ({ conversationId }) => {
      socket.to(conversationId).emit('typing', {
        conversationId,
        userId: currentUserId,
        username: socket.data.username,
      });
    });

    socket.on('stop_typing', ({ conversationId }) => {
      socket.to(conversationId).emit('stop_typing', { conversationId, userId: currentUserId });
    });

    socket.on('disconnect', () => {
      if (currentUserId) {
        onlineUsers.delete(currentUserId);
        io.emit('online_users', Array.from(onlineUsers.values()));
      }
    });
  });
}
