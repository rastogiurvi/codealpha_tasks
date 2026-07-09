# ShopWave — Full-Stack E-Commerce Platform

A production-style e-commerce web application built with a Node.js/Express backend and a vanilla JavaScript frontend. Beyond the basics of browsing, cart, and checkout, ShopWave includes ratings & reviews, wishlists, coupon codes, order tracking with cancellation, and a full admin dashboard for managing inventory and fulfillment.

![Node](https://img.shields.io/badge/Node.js-18%2B-green)
![Express](https://img.shields.io/badge/Express-4.x-black)
![JWT](https://img.shields.io/badge/Auth-JWT-orange)
![License](https://img.shields.io/badge/License-MIT-blue)

---

## Table of Contents
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Demo Accounts](#demo-accounts)
- [API Reference](#api-reference)
- [Architecture Notes](#architecture-notes)
- [Roadmap](#roadmap)

---

## Features

### Shopping Experience
- 🛍️ **Product Catalog** — Category filters, live search, sort by price/rating/newest, and pagination
- 📄 **Product Detail Page** — Full description, stock availability, quantity selector
- ⭐ **Ratings & Reviews** — Verified-purchase reviews only (a user must have bought the item before reviewing it); average rating shown on every product card
- 🤍 **Wishlist** — Save products for later with a single click, from the grid or the detail page
- 🛒 **Shopping Cart** — Add, update quantity, and remove items with live subtotal and stock validation
- 🏷️ **Coupon Codes** — Percentage or flat discounts, validated against minimum order value at checkout
- 📦 **Order Tracking** — Orders move through `placed → processing → shipped → delivered`; users can cancel while an order is still in `placed` status (stock is automatically restored)
- 🧾 **Order History** — Full itemized history with live status for every past order
- 👤 **User Profile** — View account details and change password
- 🌗 **Dark Mode** — Persisted theme toggle across sessions

### Admin Dashboard
- 📊 **Product Management** — Create, edit, and delete products directly from the UI
- 📋 **Order Management** — View every order across all customers and advance its fulfillment status
- 🔒 **Role-Based Access** — Admin routes are protected server-side by an `is_admin` check baked into the JWT, not just hidden UI

### Engineering
- 🔐 **Authentication** — bcrypt password hashing, JWT sessions, protected routes
- 📱 **Fully Responsive** — No external CSS framework; hand-built with CSS variables for theming
- ⚡ **Zero Build Step** — Plain HTML/CSS/JS frontend; no bundler, no framework, runs instantly

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express.js |
| Auth | JSON Web Tokens (JWT), bcrypt.js |
| Database | Dependency-free JSON file datastore (see [Architecture Notes](#architecture-notes)) |
| Frontend | HTML5, CSS3 (custom properties for theming), Vanilla JavaScript |

## Project Structure

```
ecom-store/
├── server.js                 # Express app entry point
├── db.js                     # Datastore: users, products, cart, orders, reviews, wishlist, coupons
├── data.json                  # Auto-generated on first run (your data)
├── middleware/
│   └── auth.js                  # JWT verification + admin-only guard
├── routes/
│   ├── auth.js                    # Register, login, profile, change password
│   ├── products.js                # Catalog (list/sort/paginate) + admin CRUD
│   ├── cart.js                     # Cart management
│   ├── orders.js                    # Checkout, history, cancellation, admin fulfillment
│   ├── reviews.js                    # Verified-purchase reviews
│   ├── wishlist.js                    # Wishlist toggle/list
│   └── coupons.js                      # Coupon validation
└── public/                              # Frontend (served as static files)
    ├── index.html
    ├── style.css
    └── app.js
```

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org) v18 or later (includes npm)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/<your-username>/shopwave-ecommerce.git
cd shopwave-ecommerce

# 2. Install dependencies
npm install

# 3. (Optional) configure environment variables
cp .env.example .env
# then edit .env and set a strong JWT_SECRET

# 4. Start the server
npm start
```

The app will be running at **http://localhost:4001**.

### Quick Walkthrough
1. Register an account (or use the demo accounts below).
2. Browse the catalog — filter by category, sort by price/rating, or search.
3. Open a product, add it to your cart or wishlist.
4. Go to your cart, apply a coupon code (try `WELCOME10`), and check out.
5. Track your order under **Orders**; cancel it if it's still in `placed` status.
6. Once you've purchased a product, go back to its detail page and leave a review.
7. Log in as the admin account to manage products and update order statuses.

## Demo Accounts

| Role | Email | Password |
|---|---|---|
| Admin | `admin@shopwave.com` | `admin123` |
| Regular user | *(register your own)* | — |

**Sample coupon codes** (seeded, no admin needed to test): `WELCOME10` (10% off), `FLAT500` (₹500 off orders above ₹3000), `SAVE20` (20% off orders above ₹5000).

## API Reference

All endpoints are prefixed with `/api`. 🔒 = requires `Authorization: Bearer <token>`. 🛡️ = requires an admin token.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | Create a new account |
| POST | `/auth/login` | Log in and receive a JWT |
| GET | `/auth/me` 🔒 | Get the current authenticated user |
| POST | `/auth/change-password` 🔒 | Change account password |
| GET | `/products` | List products (`?category=`, `?search=`, `?sort=`, `?page=`, `?limit=`) |
| GET | `/products/categories` | List distinct product categories |
| GET | `/products/:id` | Product detail, including its reviews |
| POST | `/products` 🛡️ | Create a product |
| PUT | `/products/:id` 🛡️ | Update a product |
| DELETE | `/products/:id` 🛡️ | Delete a product |
| GET | `/products/:id/reviews` | List reviews for a product |
| POST | `/products/:id/reviews` 🔒 | Submit a review (must have purchased the product) |
| GET | `/products/:id/can-review` 🔒 | Whether the current user is eligible to review |
| GET | `/wishlist` 🔒 | Get the current user's wishlist |
| POST | `/wishlist/:productId/toggle` 🔒 | Add/remove a product from the wishlist |
| GET | `/cart` 🔒 | View the current user's cart |
| POST | `/cart` 🔒 | Add a product to the cart / update its quantity |
| DELETE | `/cart/:productId` 🔒 | Remove a product from the cart |
| GET | `/coupons` | List available coupon codes |
| POST | `/coupons/apply` 🔒 | Validate a coupon against the current cart |
| POST | `/orders/checkout` 🔒 | Convert the current cart into an order (optional coupon) |
| GET | `/orders` 🔒 | List the current user's order history |
| GET | `/orders/:id` 🔒 | Get a single order's details |
| POST | `/orders/:id/cancel` 🔒 | Cancel an order (only while status is `placed`) |
| GET | `/orders/admin/all` 🛡️ | List every order across all users |
| PUT | `/orders/admin/:id/status` 🛡️ | Advance an order's fulfillment status |

## Architecture Notes

**Why a JSON-file datastore instead of SQL?** Native database drivers (e.g. `better-sqlite3`, `pg`) require compiling C++ bindings during install, which frequently fails on Windows machines without build tools configured. The included `db.js` module implements the same repository-style interface (`db.products.list()`, `db.orders.updateStatus()`, etc.) over a single `data.json` file, so the route handlers never touch raw file I/O directly. This keeps `npm install` fast and 100% reliable across platforms while remaining a drop-in target for a real database later.

**Role-based access control:** A user's `is_admin` flag is embedded directly in their signed JWT at login. The `adminMiddleware` in `middleware/auth.js` rejects any request to an admin route unless that flag is present and true — so admin-only behavior is enforced by the server, not just hidden in the UI.

**Verified-purchase reviews:** Before accepting a review, the server cross-references the reviewer's order history (`db.reviews.userHasPurchased`) to confirm they actually bought that product in a non-cancelled order, and blocks duplicate reviews from the same user on the same product.

**Order lifecycle:** Every order carries a `status_history` array recording every transition with a timestamp, giving a full audit trail. Cancelling an order automatically restocks each item.

**Migrating to a production database:** Replace the internals of `db.js` with SQL-backed equivalents (Postgres via `pg`, or SQLite via `better-sqlite3`) while keeping the exact same exported function signatures. Because every route calls `db.<entity>.<method>()` rather than writing raw queries, the route files require no changes.

## Roadmap

- [ ] Payment gateway integration (Razorpay/Stripe sandbox)
- [ ] Product image galleries (multiple images per product)
- [ ] Email order confirmations and shipping updates
- [ ] Address book (save multiple shipping addresses)
- [ ] Product recommendations ("customers also bought")

---

## License

This project is available under the MIT License.
