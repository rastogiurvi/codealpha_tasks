/*
 * Lightweight JSON-file datastore. No native dependencies (unlike SQL
 * drivers), so `npm install` always works, on any OS, with no build tools
 * required. Data is persisted to data.json on every write.
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_FILE = path.join(__dirname, 'data.json');

const SEED_PRODUCTS = [
  { name: 'Wireless Headphones', description: 'Over-ear Bluetooth headphones with active noise cancellation and 30-hour battery life. Perfect for travel, work calls, and workouts.', price: 2499, category: 'Electronics', image: 'https://picsum.photos/seed/headphones/500/400', stock: 25 },
  { name: 'Running Shoes', description: 'Lightweight running shoes with breathable mesh upper, cushioned midsole, and durable rubber outsole for daily training.', price: 3299, category: 'Footwear', image: 'https://picsum.photos/seed/shoes/500/400', stock: 40 },
  { name: 'Smart Watch', description: 'Fitness tracker with heart rate monitor, built-in GPS, sleep tracking, and a 7-day battery on a single charge.', price: 5999, category: 'Electronics', image: 'https://picsum.photos/seed/watch/500/400', stock: 15 },
  { name: 'Travel Backpack', description: 'Durable 30L backpack with a padded 15-inch laptop compartment, water-resistant fabric, and anti-theft zippers.', price: 1799, category: 'Accessories', image: 'https://picsum.photos/seed/backpack/500/400', stock: 30 },
  { name: 'Drip Coffee Maker', description: 'Programmable drip coffee maker with a 12-cup glass carafe, auto shut-off, and a reusable filter.', price: 2999, category: 'Home', image: 'https://picsum.photos/seed/coffee/500/400', stock: 18 },
  { name: 'LED Desk Lamp', description: 'Adjustable LED desk lamp with 5 brightness levels, 3 color modes, and a built-in USB charging port.', price: 899, category: 'Home', image: 'https://picsum.photos/seed/lamp/500/400', stock: 50 },
  { name: 'Cotton T-Shirt', description: 'Soft, breathable 100% cotton crew-neck t-shirt. Pre-shrunk fabric, available in multiple colors.', price: 499, category: 'Clothing', image: 'https://picsum.photos/seed/tshirt/500/400', stock: 100 },
  { name: 'Yoga Mat', description: 'Non-slip 6mm-thick yoga mat with a carrying strap. Lightweight, easy to clean, ideal for home workouts.', price: 999, category: 'Fitness', image: 'https://picsum.photos/seed/yoga/500/400', stock: 35 },
  { name: 'Mechanical Keyboard', description: 'Compact 87-key mechanical keyboard with tactile blue switches and per-key RGB backlighting.', price: 3799, category: 'Electronics', image: 'https://picsum.photos/seed/keyboard/500/400', stock: 22 },
  { name: 'Ceramic Mug Set', description: 'Set of 4 hand-glazed ceramic mugs, microwave and dishwasher safe, 350ml capacity each.', price: 799, category: 'Home', image: 'https://picsum.photos/seed/mugs/500/400', stock: 45 },
  { name: 'Denim Jacket', description: 'Classic fit denim jacket with button closure and chest pockets. A wardrobe staple for every season.', price: 2199, category: 'Clothing', image: 'https://picsum.photos/seed/jacket/500/400', stock: 20 },
  { name: 'Resistance Band Set', description: 'Set of 5 resistance bands with varying tension levels for strength training and physical therapy.', price: 699, category: 'Fitness', image: 'https://picsum.photos/seed/bands/500/400', stock: 60 },
];

const SEED_COUPONS = [
  { code: 'WELCOME10', type: 'percent', value: 10, description: '10% off your order', min_order: 0 },
  { code: 'FLAT500', type: 'flat', value: 500, description: '₹500 off orders above ₹3000', min_order: 3000 },
  { code: 'SAVE20', type: 'percent', value: 20, description: '20% off orders above ₹5000', min_order: 5000 },
];

const ORDER_STATUSES = ['placed', 'processing', 'shipped', 'delivered', 'cancelled'];

function loadData() {
  if (fs.existsSync(DB_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    } catch (e) {
      console.error('Could not parse data.json, starting with a fresh database:', e.message);
    }
  }
  return {
    users: [],
    products: [],
    cart_items: [],
    orders: [],
    order_items: [],
    reviews: [],
    wishlist: [],
    counters: { users: 0, products: 0, cart_items: 0, orders: 0, order_items: 0, reviews: 0 },
  };
}

const data = loadData();

function persist() {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function nextId(key) {
  data.counters[key] = (data.counters[key] || 0) + 1;
  return data.counters[key];
}

function nowISO() {
  return new Date().toISOString();
}

// Seed products on first run only
if (data.products.length === 0) {
  SEED_PRODUCTS.forEach((p) => {
    data.products.push({ id: nextId('products'), ...p, created_at: nowISO() });
  });
  persist();
}

// Seed a demo admin account on first run only
if (!data.users.find((u) => u.email === 'admin@shopwave.com')) {
  data.users.push({
    id: nextId('users'),
    name: 'Store Admin',
    email: 'admin@shopwave.com',
    password_hash: bcrypt.hashSync('admin123', 10),
    is_admin: true,
    created_at: nowISO(),
  });
  persist();
}

/* ---------------- Users ---------------- */
const users = {
  create({ name, email, password_hash }) {
    const user = {
      id: nextId('users'),
      name,
      email,
      password_hash,
      is_admin: false,
      created_at: nowISO(),
    };
    data.users.push(user);
    persist();
    return user;
  },
  findByEmail(email) {
    return data.users.find((u) => u.email === email) || null;
  },
  findById(id) {
    return data.users.find((u) => u.id === Number(id)) || null;
  },
  updatePassword(id, password_hash) {
    const u = users.findById(id);
    if (!u) return null;
    u.password_hash = password_hash;
    persist();
    return u;
  },
};

/* ---------------- Reviews (helper, used to hydrate products) ---------------- */
function reviewStatsFor(product_id) {
  const list = data.reviews.filter((r) => r.product_id === Number(product_id));
  if (list.length === 0) return { avg_rating: null, review_count: 0 };
  const avg = list.reduce((s, r) => s + r.rating, 0) / list.length;
  return { avg_rating: Math.round(avg * 10) / 10, review_count: list.length };
}

function hydrateProduct(p) {
  return { ...p, ...reviewStatsFor(p.id) };
}

/* ---------------- Products ---------------- */
const products = {
  list({ category, search, sort } = {}) {
    let results = data.products.map(hydrateProduct);
    if (category) results = results.filter((p) => p.category === category);
    if (search) {
      const q = search.toLowerCase();
      results = results.filter(
        (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
      );
    }
    switch (sort) {
      case 'price_asc':
        results.sort((a, b) => a.price - b.price);
        break;
      case 'price_desc':
        results.sort((a, b) => b.price - a.price);
        break;
      case 'rating':
        results.sort((a, b) => (b.avg_rating || 0) - (a.avg_rating || 0));
        break;
      case 'newest':
      default:
        results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    return results;
  },
  findById(id) {
    const p = data.products.find((p) => p.id === Number(id));
    return p ? hydrateProduct(p) : null;
  },
  categories() {
    return [...new Set(data.products.map((p) => p.category))];
  },
  decrementStock(id, qty) {
    const p = data.products.find((p) => p.id === Number(id));
    if (p) {
      p.stock = Math.max(0, p.stock - qty);
      persist();
    }
  },
  restock(id, qty) {
    const p = data.products.find((p) => p.id === Number(id));
    if (p) {
      p.stock += qty;
      persist();
    }
  },
  create({ name, description, price, category, image, stock }) {
    const product = {
      id: nextId('products'),
      name,
      description: description || '',
      price: Number(price),
      category: category || 'General',
      image: image || `https://picsum.photos/seed/product${Date.now()}/500/400`,
      stock: Number(stock) || 0,
      created_at: nowISO(),
    };
    data.products.push(product);
    persist();
    return hydrateProduct(product);
  },
  update(id, fields) {
    const p = data.products.find((p) => p.id === Number(id));
    if (!p) return null;
    ['name', 'description', 'price', 'category', 'image', 'stock'].forEach((f) => {
      if (fields[f] !== undefined) {
        p[f] = f === 'price' || f === 'stock' ? Number(fields[f]) : fields[f];
      }
    });
    persist();
    return hydrateProduct(p);
  },
  delete(id) {
    const pid = Number(id);
    data.products = data.products.filter((p) => p.id !== pid);
    data.reviews = data.reviews.filter((r) => r.product_id !== pid);
    data.wishlist = data.wishlist.filter((w) => w.product_id !== pid);
    data.cart_items = data.cart_items.filter((c) => c.product_id !== pid);
    persist();
  },
};

/* ---------------- Cart ---------------- */
const cart = {
  getForUser(user_id) {
    return data.cart_items
      .filter((c) => c.user_id === Number(user_id))
      .map((c) => ({ ...c, product: products.findById(c.product_id) }))
      .filter((c) => c.product);
  },
  addOrUpdate(user_id, product_id, quantity) {
    const existing = data.cart_items.find(
      (c) => c.user_id === Number(user_id) && c.product_id === Number(product_id)
    );
    if (existing) {
      existing.quantity = quantity;
      persist();
      return existing;
    }
    const item = { id: nextId('cart_items'), user_id: Number(user_id), product_id: Number(product_id), quantity };
    data.cart_items.push(item);
    persist();
    return item;
  },
  remove(user_id, product_id) {
    data.cart_items = data.cart_items.filter(
      (c) => !(c.user_id === Number(user_id) && c.product_id === Number(product_id))
    );
    persist();
  },
  clear(user_id) {
    data.cart_items = data.cart_items.filter((c) => c.user_id !== Number(user_id));
    persist();
  },
};

/* ---------------- Wishlist ---------------- */
const wishlist = {
  getForUser(user_id) {
    return data.wishlist
      .filter((w) => w.user_id === Number(user_id))
      .map((w) => products.findById(w.product_id))
      .filter(Boolean);
  },
  isWishlisted(user_id, product_id) {
    return !!data.wishlist.find(
      (w) => w.user_id === Number(user_id) && w.product_id === Number(product_id)
    );
  },
  toggle(user_id, product_id) {
    const existing = data.wishlist.find(
      (w) => w.user_id === Number(user_id) && w.product_id === Number(product_id)
    );
    if (existing) {
      data.wishlist = data.wishlist.filter((w) => w !== existing);
      persist();
      return false; // now removed
    }
    data.wishlist.push({ user_id: Number(user_id), product_id: Number(product_id), created_at: nowISO() });
    persist();
    return true; // now added
  },
};

/* ---------------- Coupons ---------------- */
const coupons = {
  findByCode(code) {
    return SEED_COUPONS.find((c) => c.code.toUpperCase() === (code || '').toUpperCase()) || null;
  },
  list() {
    return SEED_COUPONS;
  },
};

/* ---------------- Orders ---------------- */
const orders = {
  create({ user_id, items, subtotal, discount, coupon_code, total, shipping_address }) {
    const order = {
      id: nextId('orders'),
      user_id: Number(user_id),
      subtotal,
      discount: discount || 0,
      coupon_code: coupon_code || null,
      total,
      shipping_address: shipping_address || '',
      status: 'placed',
      created_at: nowISO(),
      status_history: [{ status: 'placed', at: nowISO() }],
    };
    data.orders.push(order);
    items.forEach((item) => {
      data.order_items.push({
        id: nextId('order_items'),
        order_id: order.id,
        product_id: item.product_id,
        product_name: item.product_name,
        price: item.price,
        quantity: item.quantity,
      });
    });
    persist();
    return orders.findById(order.id);
  },
  findById(id) {
    const order = data.orders.find((o) => o.id === Number(id));
    if (!order) return null;
    const items = data.order_items.filter((i) => i.order_id === order.id);
    return { ...order, items };
  },
  listForUser(user_id) {
    return data.orders
      .filter((o) => o.user_id === Number(user_id))
      .map((o) => ({ ...o, items: data.order_items.filter((i) => i.order_id === o.id) }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },
  listAll() {
    return data.orders
      .map((o) => ({ ...o, items: data.order_items.filter((i) => i.order_id === o.id) }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },
  updateStatus(id, status) {
    const order = data.orders.find((o) => o.id === Number(id));
    if (!order) return null;
    order.status = status;
    order.status_history.push({ status, at: nowISO() });
    persist();
    return orders.findById(id);
  },
};

/* ---------------- Reviews ---------------- */
const reviews = {
  listForProduct(product_id) {
    return data.reviews
      .filter((r) => r.product_id === Number(product_id))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },
  userHasPurchased(user_id, product_id) {
    const userOrderIds = data.orders
      .filter((o) => o.user_id === Number(user_id) && o.status !== 'cancelled')
      .map((o) => o.id);
    return data.order_items.some(
      (i) => userOrderIds.includes(i.order_id) && i.product_id === Number(product_id)
    );
  },
  userHasReviewed(user_id, product_id) {
    return !!data.reviews.find(
      (r) => r.user_id === Number(user_id) && r.product_id === Number(product_id)
    );
  },
  create({ product_id, user_id, user_name, rating, comment }) {
    const review = {
      id: nextId('reviews'),
      product_id: Number(product_id),
      user_id: Number(user_id),
      user_name,
      rating: Number(rating),
      comment: comment || '',
      created_at: nowISO(),
    };
    data.reviews.push(review);
    persist();
    return review;
  },
};

module.exports = { users, products, cart, wishlist, coupons, orders, reviews, ORDER_STATUSES };
