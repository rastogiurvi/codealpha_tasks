const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

router.post('/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const emailNorm = email.toLowerCase();
  if (db.users.findByEmail(emailNorm)) {
    return res.status(409).json({ error: 'Email already registered' });
  }
  const password_hash = bcrypt.hashSync(password, 10);
  const row = db.users.create({ name, email: emailNorm, password_hash });
  const user = { id: row.id, name: row.name, email: row.email };
  const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  const row = db.users.findByEmail(email.toLowerCase());
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const user = { id: row.id, name: row.name, email: row.email };
  const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user });
});

router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
