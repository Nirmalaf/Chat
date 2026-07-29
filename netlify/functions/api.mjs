import { getStore } from '@netlify/blobs';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';

const JWT_SECRET = process.env.JWT_SECRET || 'chat-app-secret';

function getAuthUser(event) {
  const header = event.headers.authorization || event.headers.Authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(header.split(' ')[1], JWT_SECRET);
  } catch {
    return null;
  }
}

function json(body, status = 200) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}

export async function handler(event) {
  const path = event.path.replace('/.netlify/functions/api', '').replace('/api', '') || '/';
  const method = event.httpMethod;

  if (method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      },
      body: '',
    };
  }

  try {
    if (path === '/auth/login' && method === 'POST') return handleLogin(event);
    if (path === '/auth/signup' && method === 'POST') return handleSignup(event);
    if (path === '/users' && method === 'GET') return handleUsers(event);
    if (path === '/conversations' && method === 'GET') return handleGetConversations(event);
    if (path === '/conversations' && method === 'POST') return handleCreateConversation(event);
    if (path.match(/^\/conversations\/[\w-]+\/messages$/) && method === 'GET') return handleGetMessages(event);
    if (path.match(/^\/conversations\/[\w-]+\/messages$/) && method === 'POST') return handlePostMessage(event);
    if (path.match(/^\/conversations\/[\w-]+\/poll$/) && method === 'GET') return handlePollMessages(event);

    return json({ error: 'Not found' }, 404);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

async function getStoreData(store, key, defaultVal = null) {
  const item = await store.get(key, { type: 'json' });
  return item ? item.body : defaultVal;
}

async function handleSignup(event) {
  const { username, email, password } = JSON.parse(event.body);
  if (!username || !email || !password) return json({ error: 'All fields required' }, 400);

  const store = getStore('chat-data');
  const users = (await getStoreData(store, 'users')) || [];

  if (users.find(u => u.username === username)) return json({ error: 'Username taken' }, 409);
  if (users.find(u => u.email === email)) return json({ error: 'Email already registered' }, 409);

  const hashed = await bcrypt.hash(password, 10);
  const user = {
    id: uuid(), username, email, password: hashed, avatar: '', createdAt: new Date().toISOString(),
  };
  users.push(user);
  await store.setJSON('users', users);

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  return json({ token, user: { id: user.id, username: user.username, email: user.email, avatar: user.avatar } }, 201);
}

async function handleLogin(event) {
  const { username, password } = JSON.parse(event.body);
  if (!username || !password) return json({ error: 'All fields required' }, 400);

  const store = getStore('chat-data');
  const users = (await getStoreData(store, 'users')) || [];
  const user = users.find(u => u.username === username);
  if (!user) return json({ error: 'Invalid credentials' }, 401);

  const match = await bcrypt.compare(password, user.password);
  if (!match) return json({ error: 'Invalid credentials' }, 401);

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  return json({ token, user: { id: user.id, username: user.username, email: user.email, avatar: user.avatar } });
}

async function handleUsers(event) {
  const authUser = getAuthUser(event);
  if (!authUser) return json({ error: 'No token provided' }, 401);

  const store = getStore('chat-data');
  const users = (await getStoreData(store, 'users')) || [];
  const search = (event.queryStringParameters?.search || '').toLowerCase();

  let result = users.filter(u => u.id !== authUser.id);
  if (search) {
    result = result.filter(u => u.username.toLowerCase().includes(search) || u.email.toLowerCase().includes(search));
  }
  return json(result.map(u => ({ id: u.id, username: u.username, email: u.email, avatar: u.avatar })));
}

async function handleGetConversations(event) {
  const authUser = getAuthUser(event);
  if (!authUser) return json({ error: 'No token provided' }, 401);

  const store = getStore('chat-data');
  const users = (await getStoreData(store, 'users')) || [];
  const all = (await getStoreData(store, 'conversations')) || [];

  let convs = all.filter(c => c.participants.includes(authUser.id));
  const enriched = convs.map(c => {
    const messages = c.messages || [];
    const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
    const otherIds = c.participants.filter(p => p !== authUser.id);
    const otherUsers = otherIds.map(id => {
      const u = users.find(us => us.id === id);
      return u ? { id: u.id, username: u.username, avatar: u.avatar } : null;
    }).filter(Boolean);
    return {
      id: c.id, type: c.type, name: c.name || otherUsers.map(u => u.username).join(', '),
      participants: c.participants, otherUsers,
      lastMessage: lastMsg ? { content: lastMsg.content, senderId: lastMsg.senderId, createdAt: lastMsg.createdAt } : null,
      createdAt: c.createdAt,
    };
  });
  enriched.sort((a, b) => {
    const aTime = a.lastMessage?.createdAt || a.createdAt;
    const bTime = b.lastMessage?.createdAt || b.createdAt;
    return new Date(bTime) - new Date(aTime);
  });
  return json(enriched);
}

async function handleCreateConversation(event) {
  const authUser = getAuthUser(event);
  if (!authUser) return json({ error: 'No token provided' }, 401);

  const { type, participantIds, name } = JSON.parse(event.body);
  if (!type || !participantIds || participantIds.length === 0)
    return json({ error: 'Invalid conversation data' }, 400);

  const participants = [...new Set([authUser.id, ...participantIds])];
  const store = getStore('chat-data');
  const all = (await getStoreData(store, 'conversations')) || [];

  if (type === 'direct' && participants.length === 2) {
    const existing = all.find(c =>
      c.type === 'direct' && c.participants.length === 2 &&
      participants.every(p => c.participants.includes(p))
    );
    if (existing) return json(existing);
  }

  const conv = {
    id: uuid(), type, name: name || '', participants, messages: [], createdAt: new Date().toISOString(),
  };
  all.push(conv);
  await store.setJSON('conversations', all);
  return json(conv, 201);
}

async function handleGetMessages(event) {
  const authUser = getAuthUser(event);
  if (!authUser) return json({ error: 'No token provided' }, 401);

  const convId = event.path.split('/')[3];
  const store = getStore('chat-data');
  const all = (await getStoreData(store, 'conversations')) || [];
  const conv = all.find(c => c.id === convId);
  if (!conv) return json({ error: 'Not found' }, 404);
  if (!conv.participants.includes(authUser.id)) return json({ error: 'Forbidden' }, 403);

  const since = event.queryStringParameters?.since;
  let messages = conv.messages || [];
  if (since) messages = messages.filter(m => m.createdAt > since);
  return json(messages);
}

async function handlePostMessage(event) {
  const authUser = getAuthUser(event);
  if (!authUser) return json({ error: 'No token provided' }, 401);

  const convId = event.path.split('/')[3];
  const { content } = JSON.parse(event.body);
  if (!content) return json({ error: 'Content required' }, 400);

  const store = getStore('chat-data');
  const all = (await getStoreData(store, 'conversations')) || [];
  const idx = all.findIndex(c => c.id === convId);
  if (idx === -1) return json({ error: 'Not found' }, 404);
  if (!all[idx].participants.includes(authUser.id)) return json({ error: 'Forbidden' }, 403);

  const msg = { id: uuid(), senderId: authUser.id, content, createdAt: new Date().toISOString() };
  all[idx].messages.push(msg);
  await store.setJSON('conversations', all);
  return json(msg, 201);
}

async function handlePollMessages(event) {
  const authUser = getAuthUser(event);
  if (!authUser) return json({ error: 'No token provided' }, 401);

  const convId = event.path.split('/')[3];
  const store = getStore('chat-data');
  const all = (await getStoreData(store, 'conversations')) || [];
  const conv = all.find(c => c.id === convId);
  if (!conv) return json({ error: 'Not found' }, 404);
  if (!conv.participants.includes(authUser.id)) return json({ error: 'Forbidden' }, 403);

  const since = event.queryStringParameters?.since || new Date(0).toISOString();
  const newMessages = (conv.messages || []).filter(m => m.createdAt > since);
  return json({ messages: newMessages, serverTime: new Date().toISOString() });
}
