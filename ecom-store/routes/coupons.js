const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ coupons: db.coupons.list() });
});

// Validate a coupon against the current cart subtotal
router.post('/apply', authMiddleware, (req, res) => {
  const { code } = req.body;
  const coupon = db.coupons.findByCode(code);
  if (!coupon) return res.status(404).json({ error: 'Invalid coupon code' });

  const cartItems = db.cart.getForUser(req.user.id);
  const subtotal = cartItems.reduce((sum, i) => sum + i.product.price * i.quantity, 0);

  if (subtotal < coupon.min_order) {
    return res.status(400).json({ error: `This coupon requires a minimum order of ₹${coupon.min_order}` });
  }

  const discount = coupon.type === 'percent' ? Math.round((subtotal * coupon.value) / 100) : coupon.value;
  res.json({ coupon, discount, subtotal, total: Math.max(0, subtotal - discount) });
});

module.exports = router;
