const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { adminMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// Checkout: turn the current cart into an order, with an optional coupon
router.post('/checkout', (req, res) => {
  const { shipping_address, coupon_code } = req.body;
  const cartItems = db.cart.getForUser(req.user.id);
  if (cartItems.length === 0) {
    return res.status(400).json({ error: 'Your cart is empty' });
  }
  if (!shipping_address || !shipping_address.trim()) {
    return res.status(400).json({ error: 'Shipping address is required' });
  }

  for (const item of cartItems) {
    if (item.quantity > item.product.stock) {
      return res.status(400).json({ error: `${item.product.name} only has ${item.product.stock} left in stock` });
    }
  }

  const orderItems = cartItems.map((item) => ({
    product_id: item.product.id,
    product_name: item.product.name,
    price: item.product.price,
    quantity: item.quantity,
  }));
  const subtotal = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

  let discount = 0;
  let appliedCode = null;
  if (coupon_code) {
    const coupon = db.coupons.findByCode(coupon_code);
    if (!coupon) return res.status(400).json({ error: 'Invalid coupon code' });
    if (subtotal < coupon.min_order) {
      return res.status(400).json({ error: `This coupon requires a minimum order of ₹${coupon.min_order}` });
    }
    discount = coupon.type === 'percent' ? Math.round((subtotal * coupon.value) / 100) : coupon.value;
    appliedCode = coupon.code;
  }

  const total = Math.max(0, subtotal - discount);

  const order = db.orders.create({
    user_id: req.user.id,
    items: orderItems,
    subtotal,
    discount,
    coupon_code: appliedCode,
    total,
    shipping_address: shipping_address.trim(),
  });

  cartItems.forEach((item) => db.products.decrementStock(item.product.id, item.quantity));
  db.cart.clear(req.user.id);

  res.json({ order });
});

// ---- Admin-only (must be declared before the generic /:id routes below) ----
router.get('/admin/all', adminMiddleware, (req, res) => {
  res.json({ orders: db.orders.listAll() });
});

router.put('/admin/:id/status', adminMiddleware, (req, res) => {
  const { status } = req.body;
  if (!db.ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${db.ORDER_STATUSES.join(', ')}` });
  }
  const order = db.orders.findById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const updated = db.orders.updateStatus(req.params.id, status);
  res.json({ order: updated });
});

// Order history for the current user
router.get('/', (req, res) => {
  res.json({ orders: db.orders.listForUser(req.user.id) });
});

// Single order detail
router.get('/:id', (req, res) => {
  const order = db.orders.findById(req.params.id);
  if (!order || (order.user_id !== req.user.id && !req.user.is_admin)) {
    return res.status(404).json({ error: 'Order not found' });
  }
  res.json({ order });
});

// Cancel an order (only while it's still in 'placed' status)
router.post('/:id/cancel', (req, res) => {
  const order = db.orders.findById(req.params.id);
  if (!order || order.user_id !== req.user.id) {
    return res.status(404).json({ error: 'Order not found' });
  }
  if (order.status !== 'placed') {
    return res.status(400).json({ error: `Order can no longer be cancelled (status: ${order.status})` });
  }
  order.items.forEach((item) => db.products.restock(item.product_id, item.quantity));
  const updated = db.orders.updateStatus(order.id, 'cancelled');
  res.json({ order: updated });
});

module.exports = router;
