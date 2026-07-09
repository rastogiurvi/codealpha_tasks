const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  res.json({ products: db.wishlist.getForUser(req.user.id) });
});

router.post('/:productId/toggle', (req, res) => {
  const product = db.products.findById(req.params.productId);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const added = db.wishlist.toggle(req.user.id, req.params.productId);
  res.json({ added, products: db.wishlist.getForUser(req.user.id) });
});

module.exports = router;
