import { Router } from 'express';
import { findAll } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, (req, res) => {
  const { search } = req.query;
  let users = findAll('users').filter(u => u.id !== req.user.id);
  if (search) {
    const q = search.toLowerCase();
    users = users.filter(u => u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }
  res.json(users.map(u => ({ id: u.id, username: u.username, email: u.email, avatar: u.avatar })));
});

export default router;
