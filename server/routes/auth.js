import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { findOne, insertOne } from '../db.js';
import { generateToken } from '../middleware/auth.js';

const router = Router();

router.post('/signup', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: 'All fields required' });

  if (findOne('users', { username }))
    return res.status(409).json({ error: 'Username taken' });
  if (findOne('users', { email }))
    return res.status(409).json({ error: 'Email already registered' });

  const hashed = await bcrypt.hash(password, 10);
  const user = {
    id: uuid(),
    username,
    email,
    password: hashed,
    avatar: '',
    createdAt: new Date().toISOString(),
  };
  insertOne('users', user);

  const token = generateToken(user);
  res.status(201).json({ token, user: { id: user.id, username: user.username, email: user.email, avatar: user.avatar } });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'All fields required' });

  const user = findOne('users', { username });
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: 'Invalid credentials' });

  const token = generateToken(user);
  res.json({ token, user: { id: user.id, username: user.username, email: user.email, avatar: user.avatar } });
});

export default router;
