const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

function cartWithTotals(user_id) {
  const items = db.cart.getForUser(user_id);
  const subtotal = items.reduce((sum, i) => sum + i.product.price * i.quantity, 0);
  return { items, subtotal };
}

router.get('/', (req, res) => {
  res.json(cartWithTotals(req.user.id));
});

router.post('/', (req, res) => {
  const { product_id, quantity } = req.body;
  const qty = Number(quantity);
  if (!product_id || !qty || qty < 1) {
    return res.status(400).json({ error: 'product_id and a quantity of at least 1 are required' });
  }
  const product = db.products.findById(product_id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (qty > product.stock) {
    return res.status(400).json({ error: `Only ${product.stock} left in stock` });
  }
  db.cart.addOrUpdate(req.user.id, product_id, qty);
  res.json(cartWithTotals(req.user.id));
});

router.delete('/:productId', (req, res) => {
  db.cart.remove(req.user.id, req.params.productId);
  res.json(cartWithTotals(req.user.id));
});

module.exports = router;
