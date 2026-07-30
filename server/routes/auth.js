import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { findOne, insertOne, updateOne } from '../db.js';
import { generateToken } from '../middleware/auth.js';

const router = Router();

router.post('/signup', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: 'All fields required' });
  if (password.length < 4)
    return res.status(400).json({ error: 'Password must be at least 4 characters' });

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

function generateResetToken() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const user = findOne('users', { email });
  if (!user) return res.status(404).json({ error: 'No account found with that email' });

  const resetToken = generateResetToken();
  const resetTokenExpiry = new Date(Date.now() + 3600000).toISOString();
  updateOne('users', user.id, { resetToken, resetTokenExpiry });

  res.json({ message: 'Reset token sent to your email', resetToken, email: user.email });
});

router.post('/reset-password', async (req, res) => {
  const { email, resetToken, password } = req.body;
  if (!email || !resetToken || !password)
    return res.status(400).json({ error: 'All fields required' });
  if (password.length < 4)
    return res.status(400).json({ error: 'Password must be at least 4 characters' });

  const user = findOne('users', { email });
  if (!user) return res.status(404).json({ error: 'No account found with that email' });
  if (user.resetToken !== resetToken)
    return res.status(400).json({ error: 'Invalid reset token' });
  if (!user.resetTokenExpiry || new Date(user.resetTokenExpiry) < new Date())
    return res.status(400).json({ error: 'Reset token has expired' });

  const hashed = await bcrypt.hash(password, 10);
  updateOne('users', user.id, { password: hashed, resetToken: null, resetTokenExpiry: null });

  res.json({ message: 'Password reset successfully' });
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
