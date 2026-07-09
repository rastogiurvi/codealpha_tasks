const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Public: list reviews for a product
router.get('/:productId/reviews', (req, res) => {
  const product = db.products.findById(req.params.productId);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json({ reviews: db.reviews.listForProduct(req.params.productId) });
});

// Authenticated: submit a review (only if the user purchased the product)
router.post('/:productId/reviews', authMiddleware, (req, res) => {
  const { rating, comment } = req.body;
  const productId = req.params.productId;
  const product = db.products.findById(productId);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const ratingNum = Number(rating);
  if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
    return res.status(400).json({ error: 'Rating must be between 1 and 5' });
  }
  if (!db.reviews.userHasPurchased(req.user.id, productId)) {
    return res.status(403).json({ error: 'You can only review products you have purchased' });
  }
  if (db.reviews.userHasReviewed(req.user.id, productId)) {
    return res.status(409).json({ error: 'You have already reviewed this product' });
  }

  const review = db.reviews.create({
    product_id: productId,
    user_id: req.user.id,
    user_name: req.user.name,
    rating: ratingNum,
    comment: (comment || '').trim(),
  });
  res.json({ review });
});

// Authenticated: can the current user review this product?
router.get('/:productId/can-review', authMiddleware, (req, res) => {
  const purchased = db.reviews.userHasPurchased(req.user.id, req.params.productId);
  const alreadyReviewed = db.reviews.userHasReviewed(req.user.id, req.params.productId);
  res.json({ canReview: purchased && !alreadyReviewed, purchased, alreadyReviewed });
});

module.exports = router;
