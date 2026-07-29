import { getStore } from '@netlify/blobs';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';

const JWT_SECRET = process.env.JWT_SECRET || 'chat-app-secret-key-2024';

function getAuthUser(event) {
  const header = event.headers.authorization || event.headers.Authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  try { return jwt.verify(header.slice(7), JWT_SECRET); }
  catch { return null; }
}

function respond(data, status = 200) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(data),
  };
}

export async function handler(event) {
  try {
    if (event.httpMethod === 'OPTIONS') {
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

    let path = event.path || '';
    if (path.startsWith('/.netlify/functions/api')) path = path.replace('/.netlify/functions/api', '');
    if (path.startsWith('/api')) path = path.slice(4);
    if (!path.startsWith('/')) path = '/' + path;
    if (path === '/') path = '';

    const method = event.httpMethod;

    if (path === '/auth/login' && method === 'POST') return handleLogin(event);
    if (path === '/auth/signup' && method === 'POST') return handleSignup(event);
    if (path === '/users' && method === 'GET') return handleUsers(event);
    if (path === '/conversations' && method === 'GET') return handleGetConversations(event);
    if (path === '/conversations' && method === 'POST') return handleCreateConversation(event);
    if (path.match(/^\/conversations\/[\w-]+\/messages$/) && method === 'GET') return handleGetMessages(event);
    if (path.match(/^\/conversations\/[\w-]+\/messages$/) && method === 'POST') return handlePostMessage(event);
    if (path.match(/^\/conversations\/[\w-]+\/poll$/) && method === 'GET') return handlePollMessages(event);

    return respond({ error: 'Not found', path, method }, 404);
  } catch (err) {
    return respond({ error: err.message || 'Internal error' }, 500);
  }
}

async function store(storeName) {
  try {
    return getStore(storeName);
  } catch (err) {
    console.error('Blob store error:', err);
    throw err;
  }
}

async function getData(storeName, key) {
  const s = await store(storeName);
  const item = await s.get(key, { type: 'json' });
  return item ? item.body : null;
}

async function setData(storeName, key, value) {
  const s = await store(storeName);
  await s.setJSON(key, value);
}

async function handleSignup(event) {
  const { username, email, password } = JSON.parse(event.body);
  if (!username || !email || !password) return respond({ error: 'All fields required' }, 400);

  const users = (await getData('chat-data', 'users')) || [];
  if (users.some(u => u.username === username)) return respond({ error: 'Username taken' }, 409);
  if (users.some(u => u.email === email)) return respond({ error: 'Email already registered' }, 409);

  const hashed = await bcrypt.hash(password, 10);
  const user = { id: uuid(), username, email, password: hashed, avatar: '', createdAt: new Date().toISOString() };
  users.push(user);
  await setData('chat-data', 'users', users);

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  return respond({ token, user: { id: user.id, username: user.username, email: user.email, avatar: user.avatar } }, 201);
}

async function handleLogin(event) {
  const { username, password } = JSON.parse(event.body);
  const users = (await getData('chat-data', 'users')) || [];
  const user = users.find(u => u.username === username);
  if (!user || !(await bcrypt.compare(password, user.password))) return respond({ error: 'Invalid credentials' }, 401);

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  return respond({ token, user: { id: user.id, username: user.username, email: user.email, avatar: user.avatar } });
}

async function handleUsers(event) {
  const auth = getAuthUser(event);
  if (!auth) return respond({ error: 'Unauthorized' }, 401);

  const users = (await getData('chat-data', 'users')) || [];
  const search = (event.queryStringParameters?.search || '').toLowerCase();
  let result = users.filter(u => u.id !== auth.id);
  if (search) result = result.filter(u => u.username.toLowerCase().includes(search) || u.email.toLowerCase().includes(search));
  return respond(result.map(u => ({ id: u.id, username: u.username })));
}

async function handleGetConversations(event) {
  const auth = getAuthUser(event);
  if (!auth) return respond({ error: 'Unauthorized' }, 401);

  const users = (await getData('chat-data', 'users')) || [];
  const all = (await getData('chat-data', 'conversations')) || [];
  let convs = all.filter(c => c.participants?.includes(auth.id));

  const enriched = convs.map(c => {
    const msgs = c.messages || [];
    const last = msgs.length > 0 ? msgs[msgs.length - 1] : null;
    const otherIds = (c.participants || []).filter(p => p !== auth.id);
    const others = otherIds.map(id => { const u = users.find(us => us.id === id); return u ? { id: u.id, username: u.username } : null; }).filter(Boolean);
    return { id: c.id, type: c.type, name: c.name || others.map(u => u.username).join(', '), otherUsers: others, lastMessage: last ? { content: last.content, createdAt: last.createdAt } : null, createdAt: c.createdAt };
  });
  enriched.sort((a, b) => new Date(b.lastMessage?.createdAt || b.createdAt) - new Date(a.lastMessage?.createdAt || a.createdAt));
  return respond(enriched);
}

async function handleCreateConversation(event) {
  const auth = getAuthUser(event);
  if (!auth) return respond({ error: 'Unauthorized' }, 401);

  const { type, participantIds } = JSON.parse(event.body);
  if (!type || !participantIds?.length) return respond({ error: 'Invalid data' }, 400);

  const participants = [...new Set([auth.id, ...participantIds])];
  const all = (await getData('chat-data', 'conversations')) || [];

  if (type === 'direct' && participants.length === 2) {
    const existing = all.find(c => c.type === 'direct' && c.participants?.length === 2 && participants.every(p => c.participants.includes(p)));
    if (existing) return respond(existing);
  }

  const conv = { id: uuid(), type, name: '', participants, messages: [], createdAt: new Date().toISOString() };
  all.push(conv);
  await setData('chat-data', 'conversations', all);
  return respond(conv, 201);
}

async function handleGetMessages(event) {
  const auth = getAuthUser(event);
  if (!auth) return respond({ error: 'Unauthorized' }, 401);

  const convId = event.path.split('/').filter(Boolean).slice(-2, -1)[0];
  const all = (await getData('chat-data', 'conversations')) || [];
  const conv = all.find(c => c.id === convId);
  if (!conv) return respond({ error: 'Not found' }, 404);
  if (!conv.participants?.includes(auth.id)) return respond({ error: 'Forbidden' }, 403);

  const since = event.queryStringParameters?.since;
  let msgs = conv.messages || [];
  if (since) msgs = msgs.filter(m => m.createdAt > since);
  return respond(msgs);
}

async function handlePostMessage(event) {
  const auth = getAuthUser(event);
  if (!auth) return respond({ error: 'Unauthorized' }, 401);

  const convId = event.path.split('/').filter(Boolean).slice(-2, -1)[0];
  const { content } = JSON.parse(event.body);
  if (!content) return respond({ error: 'Content required' }, 400);

  const all = (await getData('chat-data', 'conversations')) || [];
  const idx = all.findIndex(c => c.id === convId);
  if (idx === -1) return respond({ error: 'Not found' }, 404);
  if (!all[idx].participants?.includes(auth.id)) return respond({ error: 'Forbidden' }, 403);

  const msg = { id: uuid(), senderId: auth.id, content, createdAt: new Date().toISOString() };
  all[idx].messages.push(msg);
  await setData('chat-data', 'conversations', all);
  return respond(msg, 201);
}

async function handlePollMessages(event) {
  const auth = getAuthUser(event);
  if (!auth) return respond({ error: 'Unauthorized' }, 401);

  const convId = event.path.split('/').filter(Boolean).slice(-2, -1)[0];
  const all = (await getData('chat-data', 'conversations')) || [];
  const conv = all.find(c => c.id === convId);
  if (!conv) return respond({ error: 'Not found' }, 404);
  if (!conv.participants?.includes(auth.id)) return respond({ error: 'Forbidden' }, 403);

  const since = event.queryStringParameters?.since || new Date(0).toISOString();
  const newMsgs = (conv.messages || []).filter(m => m.createdAt > since);
  return respond({ messages: newMsgs, serverTime: new Date().toISOString() });
}

export { handler };
