const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');

const JWT_SECRET = process.env.JWT_SECRET || 'chat-app-secret';

const memoryDB = { users: [], conversations: [] };
let blobStorePromise = null;

function initBlobStore() {
  if (blobStorePromise) return blobStorePromise;
  try {
    const { getStore } = require('@netlify/blobs');
    blobStorePromise = Promise.resolve().then(() => {
      try { return getStore('chat-data'); }
      catch (e) { console.log('Blob store init error:', e.message); return null; }
    });
  } catch (e) {
    console.log('@netlify/blobs not available:', e.message);
    blobStorePromise = Promise.resolve(null);
  }
  return blobStorePromise;
}

async function db(key) {
  const blobStore = await initBlobStore();
  if (blobStore) {
    try {
      const item = await blobStore.get(key, { type: 'json' });
      if (item !== null && item !== undefined) return item;
    } catch (e) { console.log('Blob read error:', e.message); }
  }
  return memoryDB[key] || [];
}

async function dbSet(key, value) {
  memoryDB[key] = value;
  const blobStore = await initBlobStore();
  if (blobStore) {
    try { await blobStore.setJSON(key, value); }
    catch (e) { console.log('Blob write error:', e.message); }
  }
}

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
          'Access-Control-Allow-Headers': 'Content-Type,Authorization,Accept',
        },
        body: '',
      };
    }

    const path = getPath(event);
    const method = event.httpMethod;

    if (path === '/auth/signup' && method === 'POST') return handleSignup(event);
    if (path === '/auth/login' && method === 'POST') return handleLogin(event);
    if (path === '/auth/forgot-password' && method === 'POST') return handleForgotPassword(event);
    if (path === '/auth/reset-password' && method === 'POST') return handleResetPassword(event);
    if (path === '/users' && method === 'GET') return handleUsers(event);
    if (path === '/conversations' && method === 'GET') return handleGetConversations(event);
    if (path === '/conversations' && method === 'POST') return handleCreateConversation(event);
    if (/^\/conversations\/[\w-]+\/messages$/.test(path) && (method === 'GET' || method === 'POST')) return handleMessages(event);

    return respond({ error: 'Not found', path }, 404);
  } catch (err) {
    return respond({ error: 'Error: ' + (err.message || err) }, 500);
  }
};

async function handleSignup(event) {
  const body = JSON.parse(event.body);
  const { username, email, password } = body;
  if (!username || !email || !password) return respond({ error: 'Fill all fields' }, 400);
  if (password.length < 4) return respond({ error: 'Password must be at least 4 characters' }, 400);

  const users = await db('users');
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
  const users = await db('users');
  const user = users.find(u => u.username === username);
  if (!user || !(await bcrypt.compare(password, user.password))) return respond({ error: 'Invalid username or password' }, 401);

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  return respond({ token, user: { id: user.id, username: user.username, email: user.email } });
}

async function handleForgotPassword(event) {
  const { email } = JSON.parse(event.body);
  if (!email) return respond({ error: 'Email is required' }, 400);

  const users = await db('users');
  const user = users.find(u => u.email === email);
  if (!user) return respond({ error: 'No account found with that email' }, 404);

  const resetToken = Math.random().toString(36).substring(2, 8).toUpperCase();
  user.resetToken = resetToken;
  user.resetTokenExpiry = new Date(Date.now() + 3600000).toISOString();
  await dbSet('users', users);

  return respond({ message: 'Reset token sent to your email', resetToken, email: user.email });
}

async function handleResetPassword(event) {
  const { email, resetToken, password } = JSON.parse(event.body);
  if (!email || !resetToken || !password) return respond({ error: 'All fields required' }, 400);
  if (password.length < 4) return respond({ error: 'Password must be at least 4 characters' }, 400);

  const users = await db('users');
  const user = users.find(u => u.email === email);
  if (!user) return respond({ error: 'No account found with that email' }, 404);
  if (user.resetToken !== resetToken) return respond({ error: 'Invalid reset token' }, 400);
  if (!user.resetTokenExpiry || new Date(user.resetTokenExpiry) < new Date()) return respond({ error: 'Reset token has expired' }, 400);

  const hashed = await bcrypt.hash(password, 10);
  user.password = hashed;
  user.resetToken = null;
  user.resetTokenExpiry = null;
  await dbSet('users', users);

  return respond({ message: 'Password reset successfully' });
}

async function handleUsers(event) {
  const auth = getAuthUser(event);
  if (!auth) return respond({ error: 'Unauthorized' }, 401);

  const users = await db('users');
  const search = (event.queryStringParameters?.search || '').toLowerCase();
  let result = users.filter(u => u.id !== auth.id);
  if (search) {
    result = result.filter(u => u.username.toLowerCase().includes(search) || u.email.toLowerCase().includes(search));
  }
  return respond(result.map(u => ({ id: u.id, username: u.username, email: u.email, avatar: u.avatar || '' })));
}

async function handleGetConversations(event) {
  const auth = getAuthUser(event);
  if (!auth) return respond({ error: 'Unauthorized' }, 401);

  const users = await db('users');
  const all = await db('conversations');
  const convs = all.filter(c => c.participants?.includes(auth.id));

  const enriched = convs.map(c => {
    const msgs = c.messages || [];
    const last = msgs[msgs.length - 1] || null;
    const otherIds = (c.participants || []).filter(p => p !== auth.id);
    const others = otherIds.map(id => { const u = users.find(us => us.id === id); return u ? { id: u.id, username: u.username } : null; }).filter(Boolean);
    return {
      id: c.id, type: c.type, name: c.name || others.map(u => u.username).join(', '),
      participants: c.participants, otherUsers: others,
      lastMessage: last ? { content: last.content, senderId: last.senderId, createdAt: last.createdAt } : null,
      createdAt: c.createdAt,
    };
  });
  enriched.sort((a, b) => new Date(b.lastMessage?.createdAt || b.createdAt) - new Date(a.lastMessage?.createdAt || a.createdAt));
  return respond(enriched);
}

async function handleCreateConversation(event) {
  const auth = getAuthUser(event);
  if (!auth) return respond({ error: 'Unauthorized' }, 401);

  const { type, participantIds, name } = JSON.parse(event.body);
  if (!type || !participantIds?.length) return respond({ error: 'Invalid data' }, 400);

  const participants = [...new Set([auth.id, ...participantIds])];
  const all = await db('conversations');

  if (type === 'direct' && participants.length === 2) {
    const existing = all.find(c => c.type === 'direct' && c.participants?.length === 2 && participants.every(p => c.participants.includes(p)));
    if (existing) return respond(existing);
  }

  const conv = { id: uuid(), type, name: name || '', participants, messages: [], createdAt: new Date().toISOString() };
  all.push(conv);
  await dbSet('conversations', all);
  return respond(conv, 201);
}

async function handleMessages(event) {
  const auth = getAuthUser(event);
  if (!auth) return respond({ error: 'Unauthorized' }, 401);

  const convId = event.path.split('/').filter(Boolean).slice(-2, -1)[0];
  const all = await db('conversations');
  const conv = all.find(c => c.id === convId);
  if (!conv) return respond({ error: 'Not found' }, 404);
  if (!conv.participants?.includes(auth.id)) return respond({ error: 'Forbidden' }, 403);

  if (event.httpMethod === 'GET') {
    const since = event.queryStringParameters?.since;
    let msgs = conv.messages || [];
    if (since) msgs = msgs.filter(m => m.createdAt > since);
    return respond({ messages: msgs, serverTime: new Date().toISOString() });
  }

  if (event.httpMethod === 'POST') {
    const { content } = JSON.parse(event.body);
    if (!content || !content.trim()) return respond({ error: 'Content required' }, 400);
    const users = await db('users');
    const sender = users.find(u => u.id === auth.id);
    const msg = { id: uuid(), senderId: auth.id, content: content.trim(), createdAt: new Date().toISOString() };
    conv.messages.push(msg);
    await dbSet('conversations', all);
    return respond({ ...msg, sender: sender ? { id: sender.id, username: sender.username } : undefined }, 201);
  }
}

