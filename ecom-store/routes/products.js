const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { adminMiddleware } = require('../middleware/auth');

const router = express.Router();

// List products with optional category/search/sort + pagination
router.get('/', (req, res) => {
  const { category, search, sort } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 12));

  const all = db.products.list({ category, search, sort });
  const total = all.length;
  const start = (page - 1) * limit;
  const pageItems = all.slice(start, start + limit);

  res.json({
    products: pageItems,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
});

router.get('/categories', (req, res) => {
  res.json({ categories: db.products.categories() });
});

// Product detail, includes reviews + whether the current user can review it
router.get('/:id', (req, res) => {
  const product = db.products.findById(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const reviewList = db.reviews.listForProduct(product.id);
  res.json({ product, reviews: reviewList });
});

// ---- Admin-only product management ----
router.post('/', authMiddleware, adminMiddleware, (req, res) => {
  const { name, price } = req.body;
  if (!name || price === undefined) {
    return res.status(400).json({ error: 'Name and price are required' });
  }
  const product = db.products.create(req.body);
  res.json({ product });
});

router.put('/:id', authMiddleware, adminMiddleware, (req, res) => {
  const product = db.products.update(req.params.id, req.body);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json({ product });
});

router.delete('/:id', authMiddleware, adminMiddleware, (req, res) => {
  const product = db.products.findById(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  db.products.delete(req.params.id);
  res.json({ success: true });
});

module.exports = router;
