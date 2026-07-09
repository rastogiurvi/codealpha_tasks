/* =========================================================
   ShopWave front-end (vanilla JS, no build step required)
   ========================================================= */

let token = localStorage.getItem('sw_token') || null;
let currentUser = JSON.parse(localStorage.getItem('sw_user') || 'null');

let allProducts = [];
let pagination = { page: 1, limit: 12, total: 0, totalPages: 1 };
let activeCategory = '';
let searchQuery = '';
let sortOrder = 'newest';
let currentCart = { items: [], subtotal: 0 };
let currentWishlist = [];
let appliedCoupon = null; // { coupon, discount, total }
let selectedProductId = null;
let adminProducts = [];
let adminOrders = [];

/* ---------------- API helper ---------------- */
async function api(path, options = {}) {
  const res = await fetch('/api' + path, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/* ---------------- Toasts ---------------- */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

/* ---------------- Theme (dark mode) ---------------- */
function initTheme() {
  const saved = localStorage.getItem('sw_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  document.getElementById('theme-toggle').textContent = saved === 'dark' ? '☀️' : '🌙';
}
document.getElementById('theme-toggle').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('sw_theme', next);
  document.getElementById('theme-toggle').textContent = next === 'dark' ? '☀️' : '🌙';
});

/* ---------------- View switching ---------------- */
function showView(viewId) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('hidden', v.id !== viewId));
  window.scrollTo(0, 0);
  closeUserMenu();
}
document.querySelectorAll('[data-back]').forEach((btn) => {
  btn.addEventListener('click', () => showView(btn.dataset.back));
});
document.getElementById('logo-home').addEventListener('click', () => showView('products-view'));

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
document.querySelectorAll('[data-close-modal]').forEach((btn) => {
  btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
});

/* ---------------- Auth ---------------- */
document.getElementById('login-btn').addEventListener('click', () => openModal('auth-modal'));

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const isLogin = btn.dataset.tab === 'login';
    document.getElementById('login-form').classList.toggle('hidden', !isLogin);
    document.getElementById('register-form').classList.toggle('hidden', isLogin);
  });
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  try {
    const data = await api('/auth/login', { method: 'POST', body: { email, password } });
    onAuthSuccess(data);
  } catch (err) {
    errEl.textContent = err.message;
  }
});

document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('register-error');
  errEl.textContent = '';
  const name = document.getElementById('register-name').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;
  try {
    const data = await api('/auth/register', { method: 'POST', body: { name, email, password } });
    onAuthSuccess(data);
  } catch (err) {
    errEl.textContent = err.message;
  }
});

function onAuthSuccess(data) {
  token = data.token;
  currentUser = data.user;
  localStorage.setItem('sw_token', token);
  localStorage.setItem('sw_user', JSON.stringify(currentUser));
  closeModal('auth-modal');
  updateAuthUI();
  showToast(`Welcome, ${currentUser.name}!`, 'success');
  loadCart();
  loadWishlist();
}

function updateAuthUI() {
  const loggedIn = !!token;
  document.getElementById('login-btn').classList.toggle('hidden', loggedIn);
  document.getElementById('user-menu-wrap').classList.toggle('hidden', !loggedIn);
  document.getElementById('nav-orders-btn').classList.toggle('hidden', !loggedIn);
  document.getElementById('nav-wishlist-btn').classList.toggle('hidden', !loggedIn);
  document.getElementById('nav-admin-btn').classList.toggle('hidden', !(loggedIn && currentUser.is_admin));
  if (loggedIn) {
    document.getElementById('user-initial').textContent = currentUser.name.charAt(0).toUpperCase();
    document.getElementById('dropdown-name').textContent = currentUser.name;
    document.getElementById('dropdown-email').textContent = currentUser.email;
  }
}

document.getElementById('user-menu-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('user-menu-dropdown').classList.toggle('hidden');
});
document.addEventListener('click', () => closeUserMenu());
function closeUserMenu() {
  document.getElementById('user-menu-dropdown').classList.add('hidden');
}

document.getElementById('logout-btn').addEventListener('click', () => {
  token = null;
  currentUser = null;
  localStorage.removeItem('sw_token');
  localStorage.removeItem('sw_user');
  currentCart = { items: [], subtotal: 0 };
  currentWishlist = [];
  updateAuthUI();
  renderCartCount();
  renderWishlistCount();
  showView('products-view');
});

function requireAuth() {
  if (!token) {
    showToast('Please log in first', 'error');
    openModal('auth-modal');
    return false;
  }
  return true;
}

/* ---------------- Products ---------------- */
async function loadProducts(page = 1) {
  const grid = document.getElementById('products-grid');
  grid.innerHTML = Array.from({ length: 8 }).map(() => '<div class="skeleton skeleton-card"></div>').join('');
  try {
    const params = new URLSearchParams();
    if (activeCategory) params.set('category', activeCategory);
    if (searchQuery) params.set('search', searchQuery);
    params.set('sort', sortOrder);
    params.set('page', page);
    params.set('limit', pagination.limit);

    const res = await api(`/products?${params.toString()}`);
    allProducts = res.products;
    pagination = res.pagination;

    const { categories } = await api('/products/categories');
    renderCategoryBar(categories);
    renderProducts();
    renderPagination();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderCategoryBar(categories) {
  const bar = document.getElementById('category-bar');
  bar.innerHTML = '';
  const allChip = document.createElement('button');
  allChip.className = 'category-chip' + (activeCategory === '' ? ' active' : '');
  allChip.textContent = 'All';
  allChip.addEventListener('click', () => { activeCategory = ''; loadProducts(1); });
  bar.appendChild(allChip);
  categories.forEach((cat) => {
    const chip = document.createElement('button');
    chip.className = 'category-chip' + (activeCategory === cat ? ' active' : '');
    chip.textContent = cat;
    chip.addEventListener('click', () => { activeCategory = cat; loadProducts(1); });
    bar.appendChild(chip);
  });
}

document.getElementById('sort-select').addEventListener('change', (e) => {
  sortOrder = e.target.value;
  loadProducts(1);
});

function starString(rating) {
  if (!rating) return '';
  const full = Math.round(rating);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

function isNew(createdAt) {
  const days = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  return days < 14;
}

function renderProducts() {
  const grid = document.getElementById('products-grid');
  grid.innerHTML = '';
  document.getElementById('no-products').classList.toggle('hidden', allProducts.length > 0);
  allProducts.forEach((p) => {
    const wishlisted = currentWishlist.some((w) => w.id === p.id);
    const card = document.createElement('div');
    card.className = 'product-card';
    card.innerHTML = `
      <div class="product-card-img-wrap">
        <img src="${p.image}" alt="${escapeHtml(p.name)}" loading="lazy" />
        ${isNew(p.created_at) ? '<span class="new-badge">NEW</span>' : ''}
        <button class="wishlist-heart ${wishlisted ? 'active' : ''}" data-wish-id="${p.id}">${wishlisted ? '♥' : '♡'}</button>
      </div>
      <div class="product-card-body">
        <div class="category">${escapeHtml(p.category)}</div>
        <h3>${escapeHtml(p.name)}</h3>
        ${p.avg_rating ? `<div class="rating-row"><span class="stars">${starString(p.avg_rating)}</span><span>${p.avg_rating} (${p.review_count})</span></div>` : '<div class="rating-row">&nbsp;</div>'}
        <div class="price-row"><span class="price">₹${p.price.toLocaleString('en-IN')}</span></div>
        ${p.stock <= 5 && p.stock > 0 ? `<div class="stock-low">Only ${p.stock} left</div>` : ''}
        ${p.stock === 0 ? `<div class="stock-low">Out of stock</div>` : ''}
      </div>
    `;
    card.addEventListener('click', (e) => {
      if (e.target.closest('.wishlist-heart')) return;
      openProductDetail(p.id);
    });
    card.querySelector('.wishlist-heart').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleWishlist(p.id);
    });
    grid.appendChild(card);
  });
}

function renderPagination() {
  const bar = document.getElementById('pagination-bar');
  bar.innerHTML = '';
  if (pagination.totalPages <= 1) return;
  const prev = document.createElement('button');
  prev.className = 'page-btn';
  prev.textContent = '‹';
  prev.disabled = pagination.page === 1;
  prev.addEventListener('click', () => loadProducts(pagination.page - 1));
  bar.appendChild(prev);

  for (let i = 1; i <= pagination.totalPages; i++) {
    const btn = document.createElement('button');
    btn.className = 'page-btn' + (i === pagination.page ? ' active' : '');
    btn.textContent = i;
    btn.addEventListener('click', () => loadProducts(i));
    bar.appendChild(btn);
  }

  const next = document.createElement('button');
  next.className = 'page-btn';
  next.textContent = '›';
  next.disabled = pagination.page === pagination.totalPages;
  next.addEventListener('click', () => loadProducts(pagination.page + 1));
  bar.appendChild(next);
}

let searchDebounce;
document.getElementById('search-input').addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    searchQuery = e.target.value.trim();
    loadProducts(1);
  }, 300);
});

/* ---------------- Product Detail ---------------- */
async function openProductDetail(id) {
  try {
    const { product, reviews } = await api(`/products/${id}`);
    selectedProductId = product.id;
    const wishlisted = currentWishlist.some((w) => w.id === product.id);

    const content = document.getElementById('product-detail-content');
    content.innerHTML = `
      <img src="${product.image}" alt="${escapeHtml(product.name)}" />
      <div class="product-detail-info">
        <div class="category">${escapeHtml(product.category)}</div>
        <h2>${escapeHtml(product.name)}</h2>
        ${product.avg_rating ? `<div class="rating-row"><span class="stars">${starString(product.avg_rating)}</span><span>${product.avg_rating} out of 5 (${product.review_count} review${product.review_count === 1 ? '' : 's'})</span></div>` : '<div class="rating-row">No reviews yet</div>'}
        <div class="price">₹${product.price.toLocaleString('en-IN')}</div>
        <p class="description">${escapeHtml(product.description)}</p>
        <div class="stock-info">${product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}</div>
        <div class="qty-row">
          <label for="detail-qty" style="margin:0;">Qty</label>
          <input type="number" id="detail-qty" value="1" min="1" max="${product.stock}" />
        </div>
        <div class="detail-actions">
          <button id="add-to-cart-btn" class="btn btn-primary" ${product.stock === 0 ? 'disabled' : ''}>Add to Cart</button>
          <button id="detail-wishlist-btn" class="wishlist-btn-detail ${wishlisted ? 'active' : ''}">${wishlisted ? '♥' : '♡'}</button>
        </div>
      </div>
    `;
    document.getElementById('add-to-cart-btn').addEventListener('click', () => {
      const qty = Number(document.getElementById('detail-qty').value) || 1;
      addToCart(product.id, qty);
    });
    document.getElementById('detail-wishlist-btn').addEventListener('click', () => toggleWishlist(product.id, true));

    renderReviewsSection(product, reviews);
    showView('product-detail-view');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ---------------- Reviews ---------------- */
let selectedStarRating = 0;

async function renderReviewsSection(product, reviews) {
  const section = document.getElementById('reviews-section');
  let canReviewHtml = '';

  if (token) {
    try {
      const { canReview, purchased, alreadyReviewed } = await api(`/products/${product.id}/can-review`);
      if (canReview) {
        canReviewHtml = `
          <div class="review-form">
            <div style="font-weight:700;font-size:13.5px;margin-bottom:8px;">Write a review</div>
            <div class="star-picker" id="star-picker">
              ${[1,2,3,4,5].map((n) => `<span data-star="${n}">★</span>`).join('')}
            </div>
            <textarea id="review-comment" placeholder="Share your experience with this product..."></textarea>
            <p class="form-error" id="review-error"></p>
            <button id="submit-review-btn" class="btn btn-primary" style="margin-top:10px;">Submit Review</button>
          </div>
        `;
      } else if (alreadyReviewed) {
        canReviewHtml = `<p style="color:var(--text-muted);font-size:13px;">✓ You've already reviewed this product. Thanks for the feedback!</p>`;
      } else if (!purchased) {
        canReviewHtml = `<p style="color:var(--text-muted);font-size:13px;">Purchase this product to leave a review.</p>`;
      }
    } catch (e) { /* ignore */ }
  }

  const reviewsHtml = reviews.length
    ? reviews.map((r) => `
        <div class="review-item">
          <div class="review-item-header">
            <span class="review-item-name">${escapeHtml(r.user_name)}</span>
            <span class="review-item-date">${new Date(r.created_at).toLocaleDateString()}</span>
          </div>
          <span class="stars">${starString(r.rating)}</span>
          ${r.comment ? `<div class="review-item-comment">${escapeHtml(r.comment)}</div>` : ''}
        </div>
      `).join('')
    : '<p style="color:var(--text-muted);font-size:13.5px;">No reviews yet. Be the first to share your thoughts!</p>';

  section.innerHTML = `
    <h3>Customer Reviews</h3>
    ${product.avg_rating ? `
      <div class="review-summary">
        <div class="big-rating">${product.avg_rating}</div>
        <div>
          <div class="stars" style="font-size:16px;">${starString(product.avg_rating)}</div>
          <div style="font-size:12.5px;color:var(--text-muted);">${product.review_count} review${product.review_count === 1 ? '' : 's'}</div>
        </div>
      </div>
    ` : ''}
    ${canReviewHtml}
    <div class="reviews-list">${reviewsHtml}</div>
  `;

  const picker = document.getElementById('star-picker');
  if (picker) {
    selectedStarRating = 0;
    picker.querySelectorAll('span').forEach((star) => {
      star.addEventListener('click', () => {
        selectedStarRating = Number(star.dataset.star);
        picker.querySelectorAll('span').forEach((s) => {
          s.classList.toggle('selected', Number(s.dataset.star) <= selectedStarRating);
        });
      });
    });
    document.getElementById('submit-review-btn').addEventListener('click', async () => {
      const errEl = document.getElementById('review-error');
      errEl.textContent = '';
      if (!selectedStarRating) { errEl.textContent = 'Please select a star rating'; return; }
      const comment = document.getElementById('review-comment').value.trim();
      try {
        await api(`/products/${product.id}/reviews`, { method: 'POST', body: { rating: selectedStarRating, comment } });
        showToast('Review submitted, thank you!', 'success');
        openProductDetail(product.id);
      } catch (err) {
        errEl.textContent = err.message;
      }
    });
  }
}

/* ---------------- Wishlist ---------------- */
async function loadWishlist() {
  if (!token) return;
  try {
    const { products } = await api('/wishlist');
    currentWishlist = products;
    renderWishlistCount();
  } catch (e) {}
}

function renderWishlistCount() {
  const el = document.getElementById('wishlist-count');
  el.textContent = currentWishlist.length;
  el.classList.toggle('hidden', currentWishlist.length === 0);
}

async function toggleWishlist(productId, fromDetail) {
  if (!requireAuth()) return;
  try {
    const { added, products } = await api(`/wishlist/${productId}/toggle`, { method: 'POST' });
    currentWishlist = products;
    renderWishlistCount();
    showToast(added ? 'Added to wishlist' : 'Removed from wishlist', 'success');
    renderProducts();
    if (fromDetail && selectedProductId === productId) {
      const btn = document.getElementById('detail-wishlist-btn');
      if (btn) {
        btn.classList.toggle('active', added);
        btn.textContent = added ? '♥' : '♡';
      }
    }
    if (!document.getElementById('wishlist-view').classList.contains('hidden')) renderWishlistView();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

document.getElementById('nav-wishlist-btn').addEventListener('click', async () => {
  if (!requireAuth()) return;
  await loadWishlist();
  renderWishlistView();
  showView('wishlist-view');
});

function renderWishlistView() {
  const grid = document.getElementById('wishlist-grid');
  grid.innerHTML = '';
  document.getElementById('no-wishlist').classList.toggle('hidden', currentWishlist.length > 0);
  currentWishlist.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.innerHTML = `
      <div class="product-card-img-wrap">
        <img src="${p.image}" alt="${escapeHtml(p.name)}" />
        <button class="wishlist-heart active" data-wish-id="${p.id}">♥</button>
      </div>
      <div class="product-card-body">
        <div class="category">${escapeHtml(p.category)}</div>
        <h3>${escapeHtml(p.name)}</h3>
        <div class="price-row"><span class="price">₹${p.price.toLocaleString('en-IN')}</span></div>
      </div>
    `;
    card.addEventListener('click', (e) => {
      if (e.target.closest('.wishlist-heart')) return;
      openProductDetail(p.id);
    });
    card.querySelector('.wishlist-heart').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleWishlist(p.id);
    });
    grid.appendChild(card);
  });
}

/* ---------------- Cart ---------------- */
async function loadCart() {
  if (!token) return;
  try {
    currentCart = await api('/cart');
    renderCartCount();
  } catch (err) {}
}

function renderCartCount() {
  const count = currentCart.items.reduce((sum, i) => sum + i.quantity, 0);
  const el = document.getElementById('cart-count');
  el.textContent = count;
  el.classList.toggle('hidden', count === 0);
}

async function addToCart(productId, quantity) {
  if (!requireAuth()) return;
  try {
    currentCart = await api('/cart', { method: 'POST', body: { product_id: productId, quantity } });
    renderCartCount();
    showToast('Added to cart!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

document.getElementById('nav-cart-btn').addEventListener('click', async () => {
  if (!requireAuth()) return;
  await loadCart();
  renderCartView();
  showView('cart-view');
});

function renderCartView() {
  const content = document.getElementById('cart-content');
  if (currentCart.items.length === 0) {
    content.innerHTML = '<p class="empty-state">🛒 Your cart is empty. Go add something nice!</p>';
    return;
  }
  content.innerHTML = '';
  currentCart.items.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'cart-item';
    row.innerHTML = `
      <img src="${item.product.image}" alt="${escapeHtml(item.product.name)}" />
      <div class="cart-item-info">
        <h4>${escapeHtml(item.product.name)}</h4>
        <div class="unit-price">₹${item.product.price.toLocaleString('en-IN')} each</div>
      </div>
      <div class="cart-item-controls">
        <input type="number" min="1" max="${item.product.stock}" value="${item.quantity}" data-product-id="${item.product.id}" class="qty-input" />
        <button class="remove-btn" data-remove-id="${item.product.id}">Remove</button>
      </div>
      <div class="cart-item-total">₹${(item.product.price * item.quantity).toLocaleString('en-IN')}</div>
    `;
    content.appendChild(row);
  });

  const summary = document.createElement('div');
  summary.className = 'cart-summary';
  summary.innerHTML = `
    <div class="row total-row"><span>Subtotal</span><span>₹${currentCart.subtotal.toLocaleString('en-IN')}</span></div>
    <button id="checkout-btn" class="btn btn-primary btn-block" style="margin-top:12px;">Proceed to Checkout</button>
  `;
  content.appendChild(summary);

  document.getElementById('checkout-btn').addEventListener('click', () => {
    appliedCoupon = null;
    renderCheckoutSummary();
    showView('checkout-view');
  });

  content.querySelectorAll('.qty-input').forEach((input) => {
    input.addEventListener('change', async (e) => {
      const productId = e.target.dataset.productId;
      const qty = Number(e.target.value);
      if (qty < 1) { e.target.value = 1; return; }
      try {
        currentCart = await api('/cart', { method: 'POST', body: { product_id: productId, quantity: qty } });
        renderCartCount();
        renderCartView();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  content.querySelectorAll('[data-remove-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        currentCart = await api(`/cart/${btn.dataset.removeId}`, { method: 'DELETE' });
        renderCartCount();
        renderCartView();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

/* ---------------- Checkout ---------------- */
function renderCheckoutSummary() {
  const summary = document.getElementById('checkout-summary');
  let itemsHtml = currentCart.items
    .map((i) => `<div class="line"><span>${escapeHtml(i.product.name)} × ${i.quantity}</span><span>₹${(i.product.price * i.quantity).toLocaleString('en-IN')}</span></div>`)
    .join('');
  const discount = appliedCoupon ? appliedCoupon.discount : 0;
  const total = currentCart.subtotal - discount;
  summary.innerHTML = `
    <h4>Order Summary</h4>
    ${itemsHtml}
    <div class="line" style="margin-top:8px;border-top:1px solid var(--border);padding-top:8px;"><span>Subtotal</span><span>₹${currentCart.subtotal.toLocaleString('en-IN')}</span></div>
    ${appliedCoupon ? `<div class="line discount-line"><span>Coupon (${appliedCoupon.coupon.code})</span><span>-₹${discount.toLocaleString('en-IN')}</span></div>` : ''}
    <div class="total-row"><span>Total</span><span>₹${total.toLocaleString('en-IN')}</span></div>
  `;
  document.getElementById('shipping-address').value = '';
  document.getElementById('checkout-error').textContent = '';
  document.getElementById('coupon-input').value = '';
  document.getElementById('coupon-msg').textContent = '';
  document.getElementById('coupon-msg').className = 'coupon-msg';
}

document.getElementById('apply-coupon-btn').addEventListener('click', async () => {
  const code = document.getElementById('coupon-input').value.trim();
  const msgEl = document.getElementById('coupon-msg');
  if (!code) { msgEl.textContent = 'Enter a coupon code'; msgEl.className = 'coupon-msg error'; return; }
  try {
    const result = await api('/coupons/apply', { method: 'POST', body: { code } });
    appliedCoupon = result;
    msgEl.textContent = `✓ ${result.coupon.description} applied!`;
    msgEl.className = 'coupon-msg success';
    renderCheckoutSummary();
    document.getElementById('coupon-input').value = code;
  } catch (err) {
    appliedCoupon = null;
    msgEl.textContent = err.message;
    msgEl.className = 'coupon-msg error';
    renderCheckoutSummary();
  }
});

document.getElementById('place-order-btn').addEventListener('click', async () => {
  const errEl = document.getElementById('checkout-error');
  errEl.textContent = '';
  const shipping_address = document.getElementById('shipping-address').value.trim();
  if (!shipping_address) { errEl.textContent = 'Shipping address is required'; return; }
  try {
    const body = { shipping_address };
    if (appliedCoupon) body.coupon_code = appliedCoupon.coupon.code;
    const { order } = await api('/orders/checkout', { method: 'POST', body });
    currentCart = { items: [], subtotal: 0 };
    appliedCoupon = null;
    renderCartCount();
    document.getElementById('confirmation-text').textContent =
      `Order #${order.id} placed successfully. Total: ₹${order.total.toLocaleString('en-IN')}. It will be shipped to: ${order.shipping_address}`;
    showView('order-confirmation-view');
    loadProducts(pagination.page);
  } catch (err) {
    errEl.textContent = err.message;
  }
});

/* ---------------- Orders history ---------------- */
document.getElementById('nav-orders-btn').addEventListener('click', async () => {
  if (!requireAuth()) return;
  try {
    const { orders } = await api('/orders');
    renderOrders(orders);
    showView('orders-view');
  } catch (err) {
    showToast(err.message, 'error');
  }
});

const STATUS_STEPS = ['placed', 'processing', 'shipped', 'delivered'];

function renderOrders(orders) {
  const list = document.getElementById('orders-list');
  list.innerHTML = '';
  document.getElementById('no-orders').classList.toggle('hidden', orders.length > 0);
  orders.forEach((order) => {
    const card = document.createElement('div');
    card.className = 'order-card';
    const itemsHtml = order.items
      .map((i) => `<div class="order-item-row"><span>${escapeHtml(i.product_name)} × ${i.quantity}</span><span>₹${(i.price * i.quantity).toLocaleString('en-IN')}</span></div>`)
      .join('');

    let progressHtml = '';
    if (order.status !== 'cancelled') {
      const currentIdx = STATUS_STEPS.indexOf(order.status);
      progressHtml = `
        <div class="order-progress-wrap">
          <div class="order-progress">
            ${STATUS_STEPS.map((s, i) => `<div class="order-progress-step ${i <= currentIdx ? 'done' : ''}">${s}</div>`).join('')}
          </div>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="order-header">
        <span>Order #${order.id} · ${new Date(order.created_at).toLocaleDateString()}</span>
        <span class="order-status-badge status-${order.status}">${escapeHtml(order.status)}</span>
      </div>
      ${progressHtml}
      ${itemsHtml}
      ${order.discount ? `<div class="order-item-row"><span>Coupon (${escapeHtml(order.coupon_code)})</span><span>-₹${order.discount.toLocaleString('en-IN')}</span></div>` : ''}
      <div class="order-total">Total: ₹${order.total.toLocaleString('en-IN')}</div>
      <div class="order-footer">
        ${order.status === 'placed' ? `<button class="btn btn-ghost" data-cancel-order="${order.id}">Cancel Order</button>` : ''}
      </div>
    `;
    list.appendChild(card);
  });

  list.querySelectorAll('[data-cancel-order]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Cancel this order?')) return;
      try {
        await api(`/orders/${btn.dataset.cancelOrder}/cancel`, { method: 'POST' });
        showToast('Order cancelled', 'success');
        const { orders } = await api('/orders');
        renderOrders(orders);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

/* ---------------- Profile ---------------- */
document.getElementById('nav-profile-btn').addEventListener('click', () => {
  document.getElementById('profile-avatar').textContent = currentUser.name.charAt(0).toUpperCase();
  document.getElementById('profile-name').textContent = currentUser.name;
  document.getElementById('profile-email').textContent = currentUser.email;
  document.getElementById('current-password').value = '';
  document.getElementById('new-password').value = '';
  document.getElementById('password-error').textContent = '';
  document.getElementById('password-success').textContent = '';
  showView('profile-view');
});

document.getElementById('change-password-btn').addEventListener('click', async () => {
  const errEl = document.getElementById('password-error');
  const successEl = document.getElementById('password-success');
  errEl.textContent = '';
  successEl.textContent = '';
  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;
  if (!currentPassword || !newPassword) { errEl.textContent = 'Both fields are required'; return; }
  try {
    await api('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
    successEl.textContent = 'Password updated successfully!';
    document.getElementById('current-password').value = '';
    document.getElementById('new-password').value = '';
  } catch (err) {
    errEl.textContent = err.message;
  }
});

/* ---------------- Admin ---------------- */
document.getElementById('nav-admin-btn').addEventListener('click', () => {
  showView('admin-view');
  loadAdminProducts();
});

document.querySelectorAll('.admin-tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.admin-tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.admin-tab-content').forEach((c) => c.classList.add('hidden'));
    document.getElementById(btn.dataset.adminTab).classList.remove('hidden');
    if (btn.dataset.adminTab === 'admin-orders-tab') loadAdminOrders();
  });
});

async function loadAdminProducts() {
  try {
    const res = await api('/products?limit=100');
    adminProducts = res.products;
    renderAdminProducts();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderAdminProducts() {
  const list = document.getElementById('admin-products-list');
  list.innerHTML = '';
  adminProducts.forEach((p) => {
    const row = document.createElement('div');
    row.className = 'admin-row';
    row.innerHTML = `
      <img src="${p.image}" alt="${escapeHtml(p.name)}" />
      <div class="admin-row-info">
        <div class="name">${escapeHtml(p.name)}</div>
        <div class="meta">₹${p.price.toLocaleString('en-IN')} · ${p.stock} in stock · ${escapeHtml(p.category)}</div>
      </div>
      <div class="admin-row-actions">
        <button class="btn btn-ghost" data-edit-product="${p.id}">Edit</button>
        <button class="btn btn-danger" data-delete-product="${p.id}">Delete</button>
      </div>
    `;
    list.appendChild(row);
  });
  list.querySelectorAll('[data-edit-product]').forEach((btn) => {
    btn.addEventListener('click', () => openProductModal(Number(btn.dataset.editProduct)));
  });
  list.querySelectorAll('[data-delete-product]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this product permanently?')) return;
      try {
        await api(`/products/${btn.dataset.deleteProduct}`, { method: 'DELETE' });
        showToast('Product deleted', 'success');
        loadAdminProducts();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

let editingProductId = null;
document.getElementById('new-product-btn').addEventListener('click', () => openProductModal(null));

function openProductModal(productId) {
  editingProductId = productId;
  document.getElementById('product-modal-title').textContent = productId ? 'Edit Product' : 'Add Product';
  document.getElementById('product-modal-error').textContent = '';
  if (productId) {
    const p = adminProducts.find((x) => x.id === productId);
    document.getElementById('pm-name').value = p.name;
    document.getElementById('pm-description').value = p.description;
    document.getElementById('pm-price').value = p.price;
    document.getElementById('pm-stock').value = p.stock;
    document.getElementById('pm-category').value = p.category;
    document.getElementById('pm-image').value = p.image;
  } else {
    document.getElementById('pm-name').value = '';
    document.getElementById('pm-description').value = '';
    document.getElementById('pm-price').value = '';
    document.getElementById('pm-stock').value = '';
    document.getElementById('pm-category').value = '';
    document.getElementById('pm-image').value = '';
  }
  openModal('product-modal');
}

document.getElementById('product-modal-save').addEventListener('click', async () => {
  const errEl = document.getElementById('product-modal-error');
  errEl.textContent = '';
  const body = {
    name: document.getElementById('pm-name').value.trim(),
    description: document.getElementById('pm-description').value.trim(),
    price: Number(document.getElementById('pm-price').value),
    stock: Number(document.getElementById('pm-stock').value),
    category: document.getElementById('pm-category').value.trim() || 'General',
    image: document.getElementById('pm-image').value.trim(),
  };
  if (!body.name || !body.price) { errEl.textContent = 'Name and price are required'; return; }
  try {
    if (editingProductId) {
      await api(`/products/${editingProductId}`, { method: 'PUT', body });
    } else {
      await api('/products', { method: 'POST', body });
    }
    closeModal('product-modal');
    showToast('Product saved!', 'success');
    loadAdminProducts();
  } catch (err) {
    errEl.textContent = err.message;
  }
});

async function loadAdminOrders() {
  try {
    const { orders } = await api('/orders/admin/all');
    adminOrders = orders;
    renderAdminOrders();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderAdminOrders() {
  const list = document.getElementById('admin-orders-list');
  list.innerHTML = '';
  if (adminOrders.length === 0) {
    list.innerHTML = '<p class="empty-state">No orders yet.</p>';
    return;
  }
  adminOrders.forEach((order) => {
    const row = document.createElement('div');
    row.className = 'admin-row';
    row.innerHTML = `
      <div class="admin-row-info">
        <div class="name">Order #${order.id} · ₹${order.total.toLocaleString('en-IN')}</div>
        <div class="meta">${order.items.length} item(s) · ${new Date(order.created_at).toLocaleDateString()} · ${escapeHtml(order.shipping_address)}</div>
      </div>
      <div class="admin-row-actions">
        <select class="admin-status-select" data-order-id="${order.id}" ${order.status === 'cancelled' ? 'disabled' : ''}>
          ${['placed', 'processing', 'shipped', 'delivered', 'cancelled'].map((s) => `<option value="${s}" ${s === order.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
    `;
    list.appendChild(row);
  });
  list.querySelectorAll('.admin-status-select').forEach((sel) => {
    sel.addEventListener('change', async () => {
      try {
        await api(`/orders/admin/${sel.dataset.orderId}/status`, { method: 'PUT', body: { status: sel.value } });
        showToast('Order status updated', 'success');
        loadAdminOrders();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

/* ---------------- Utils ---------------- */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ---------------- Boot ---------------- */
(function boot() {
  initTheme();
  updateAuthUI();
  loadProducts();
  if (token) {
    loadCart();
    loadWishlist();
  }
})();
