import { Router } from 'express';
import { findAll } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, (req, res) => {
  try {
    const { search } = req.query;
    let users = findAll('users').filter(u => u.id !== req.user.id);
    if (search) {
      const q = search.toLowerCase();
      users = users.filter(u => u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    }
    res.json(users.map(u => ({ id: u.id, username: u.username, email: u.email, avatar: u.avatar })));
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

export default router;
