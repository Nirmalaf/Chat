const { getStore } = require('@netlify/blobs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');

const JWT_SECRET = process.env.JWT_SECRET || 'chat-app-secret';

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

function getPath(event) {
  let p = event.path || '';
  if (p.startsWith('/.netlify/functions/api')) p = p.replace('/.netlify/functions/api', '');
  if (p.startsWith('/api')) p = p.slice(4);
  return p || '/';
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        },
        body: '',
      };
    }

    const path = getPath(event);
    const method = event.httpMethod;

    if (path === '/auth/signup' && method === 'POST') return handleSignup(event);
    if (path === '/auth/login' && method === 'POST') return handleLogin(event);
    if (path === '/users' && method === 'GET') return handleUsers(event);
    if (path === '/conversations' && method === 'GET') return handleGetConversations(event);
    if (path === '/conversations' && method === 'POST') return handleCreateConversation(event);
    if (/^\/conversations\/[\w-]+\/messages$/.test(path) && (method === 'GET' || method === 'POST')) return handleMessages(event);
    if (/^\/conversations\/[\w-]+\/poll$/.test(path) && method === 'GET') return handlePoll(event);

    return respond({ error: 'Not found' }, 404);
  } catch (err) {
    return respond({ error: err.message || 'Server error' }, 500);
  }
};

async function db(key, defaultValue = null) {
  try {
    const store = getStore('chat-data');
    const item = await store.get(key, { type: 'json' });
    return item ? item.body : defaultValue;
  } catch (e) {
    console.error('DB error:', e.message);
    throw e;
  }
}

async function dbSet(key, value) {
  const store = getStore('chat-data');
  await store.setJSON(key, value);
}

async function handleSignup(event) {
  const { username, email, password } = JSON.parse(event.body);
  if (!username || !email || !password) return respond({ error: 'Fill all fields' }, 400);

  const users = (await db('users')) || [];
  if (users.some(u => u.username === username)) return respond({ error: 'Username taken' }, 409);
  if (users.some(u => u.email === email)) return respond({ error: 'Email already registered' }, 409);

  const hashed = await bcrypt.hash(password, 10);
  const user = { id: uuid(), username, email, password: hashed, avatar: '', createdAt: new Date().toISOString() };
  users.push(user);
  await dbSet('users', users);

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  return respond({ token, user: { id: user.id, username: user.username, email: user.email } }, 201);
}

async function handleLogin(event) {
  const { username, password } = JSON.parse(event.body);
  const users = (await db('users')) || [];
  const user = users.find(u => u.username === username);
  if (!user || !(await bcrypt.compare(password, user.password))) return respond({ error: 'Invalid username or password' }, 401);

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  return respond({ token, user: { id: user.id, username: user.username, email: user.email } });
}

async function handleUsers(event) {
  const auth = getAuthUser(event);
  if (!auth) return respond({ error: 'Unauthorized' }, 401);

  const users = (await db('users')) || [];
  const search = (event.queryStringParameters?.search || '').toLowerCase();
  let result = users.filter(u => u.id !== auth.id);
  if (search) result = result.filter(u => u.username.toLowerCase().includes(search));
  return respond(result.map(u => ({ id: u.id, username: u.username })));
}

async function handleGetConversations(event) {
  const auth = getAuthUser(event);
  if (!auth) return respond({ error: 'Unauthorized' }, 401);

  const users = (await db('users')) || [];
  const all = (await db('conversations')) || [];
  const convs = all.filter(c => c.participants?.includes(auth.id));

  const enriched = convs.map(c => {
    const msgs = c.messages || [];
    const last = msgs[msgs.length - 1] || null;
    const otherIds = (c.participants || []).filter(p => p !== auth.id);
    const others = otherIds.map(id => { const u = users.find(us => us.id === id); return u ? { id: u.id, username: u.username } : null; }).filter(Boolean);
    return {
      id: c.id, type: c.type, name: c.name || others.map(u => u.username).join(', '),
      otherUsers: others,
      lastMessage: last ? { content: last.content, createdAt: last.createdAt } : null,
      createdAt: c.createdAt,
    };
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
  const all = (await db('conversations')) || [];

  if (type === 'direct' && participants.length === 2) {
    const existing = all.find(c => c.type === 'direct' && c.participants?.length === 2 && participants.every(p => c.participants.includes(p)));
    if (existing) return respond(existing);
  }

  const conv = { id: uuid(), type, name: '', participants, messages: [], createdAt: new Date().toISOString() };
  all.push(conv);
  await dbSet('conversations', all);
  return respond(conv, 201);
}

async function handleMessages(event) {
  const auth = getAuthUser(event);
  if (!auth) return respond({ error: 'Unauthorized' }, 401);

  const convId = event.path.split('/').filter(Boolean).slice(-2, -1)[0];
  const all = (await db('conversations')) || [];
  const conv = all.find(c => c.id === convId);
  if (!conv) return respond({ error: 'Not found' }, 404);
  if (!conv.participants?.includes(auth.id)) return respond({ error: 'Forbidden' }, 403);

  if (event.httpMethod === 'GET') {
    const since = event.queryStringParameters?.since;
    let msgs = conv.messages || [];
    if (since) msgs = msgs.filter(m => m.createdAt > since);
    return respond(msgs);
  }

  if (event.httpMethod === 'POST') {
    const { content } = JSON.parse(event.body);
    if (!content) return respond({ error: 'Content required' }, 400);
    const msg = { id: uuid(), senderId: auth.id, content, createdAt: new Date().toISOString() };
    conv.messages.push(msg);
    all[all.indexOf(conv)] = conv;
    await dbSet('conversations', all);
    return respond(msg, 201);
  }
}

async function handlePoll(event) {
  const auth = getAuthUser(event);
  if (!auth) return respond({ error: 'Unauthorized' }, 401);

  const convId = event.path.split('/').filter(Boolean).slice(-2, -1)[0];
  const all = (await db('conversations')) || [];
  const conv = all.find(c => c.id === convId);
  if (!conv) return respond({ error: 'Not found' }, 404);
  if (!conv.participants?.includes(auth.id)) return respond({ error: 'Forbidden' }, 403);

  const since = event.queryStringParameters?.since || new Date(0).toISOString();
  const newMsgs = (conv.messages || []).filter(m => m.createdAt > since);
  return respond({ messages: newMsgs, serverTime: new Date().toISOString() });
}
