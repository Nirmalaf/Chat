import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { findById, findAll, insertOne, findOne, updateOne, pushToArray } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, (req, res) => {
  const all = findAll('conversations').filter(c =>
    c.participants.includes(req.user.id)
  );
  const enriched = all.map(c => {
    const lastMsg = c.messages?.length > 0 ? c.messages[c.messages.length - 1] : null;
    const otherIds = c.participants.filter(p => p !== req.user.id);
    const otherUsers = otherIds.map(id => {
      const u = findById('users', id);
      return u ? { id: u.id, username: u.username, avatar: u.avatar } : null;
    }).filter(Boolean);
    return {
      id: c.id,
      type: c.type,
      name: c.name || otherUsers.map(u => u.username).join(', '),
      participants: c.participants,
      otherUsers,
      lastMessage: lastMsg ? { content: lastMsg.content, senderId: lastMsg.senderId, createdAt: lastMsg.createdAt } : null,
      createdAt: c.createdAt,
    };
  });
  enriched.sort((a, b) => {
    const aTime = a.lastMessage?.createdAt || a.createdAt;
    const bTime = b.lastMessage?.createdAt || b.createdAt;
    return new Date(bTime) - new Date(aTime);
  });
  res.json(enriched);
});

router.post('/', authMiddleware, (req, res) => {
  const { type, participantIds, name } = req.body;
  if (!type || !participantIds || participantIds.length === 0)
    return res.status(400).json({ error: 'Invalid conversation data' });

  const participants = [...new Set([req.user.id, ...participantIds])];

  if (type === 'direct' && participants.length === 2) {
    const existing = findAll('conversations').find(c =>
      c.type === 'direct' &&
      c.participants.length === 2 &&
      participants.every(p => c.participants.includes(p))
    );
    if (existing) return res.json(existing);
  }

  const conv = {
    id: uuid(),
    type,
    name: name || '',
    participants,
    messages: [],
    createdAt: new Date().toISOString(),
  };
  insertOne('conversations', conv);
  res.status(201).json(conv);
});

router.get('/:id/messages', authMiddleware, (req, res) => {
  const conv = findById('conversations', req.params.id);
  if (!conv) return res.status(404).json({ error: 'Not found' });
  if (!conv.participants.includes(req.user.id))
    return res.status(403).json({ error: 'Forbidden' });
  const { since } = req.query;
  let messages = conv.messages || [];
  if (since) messages = messages.filter(m => m.createdAt > since);
  res.json({ messages, serverTime: new Date().toISOString() });
});

router.post('/:id/messages', authMiddleware, (req, res) => {
  const conv = findById('conversations', req.params.id);
  if (!conv) return res.status(404).json({ error: 'Not found' });
  if (!conv.participants.includes(req.user.id))
    return res.status(403).json({ error: 'Forbidden' });
  if (!req.body.content || !req.body.content.trim())
    return res.status(400).json({ error: 'Content required' });

  const msg = {
    id: uuid(),
    senderId: req.user.id,
    content: req.body.content.trim(),
    createdAt: new Date().toISOString(),
  };
  pushToArray('conversations', req.params.id, 'messages', msg);
  const sender = findById('users', req.user.id);
  global.io?.to(conv.id).emit('new_message', {
    conversationId: conv.id,
    message: { ...msg, sender: sender ? { id: sender.id, username: sender.username } : undefined },
  });
  res.status(201).json(msg);
});

export default router;
