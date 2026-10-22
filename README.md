# Janardhan Textiles — Storefront & Admin Operations Guide

## 1. Architecture Overview
- **Frontend**: Responsive storefront (`index.html`, `src/storefront-admin-app.js`, `src/products-data.js`) with scroll-driven 360° / 5-view saree stage, URL-synced catalogue filters, cart, checkout, order history, wishlist, B2B wholesale enquiry, and protected Admin dashboard (`#admin`).
- **Backend (`server.py` & `api/index.py`)**: Python REST API with SQLite (`janardan_textiles.db`) persistence locally and managed database support (`TURSO_DATABASE_URL` / `DATABASE_URL`) for cloud deployments.
- **Original Assets (`assets/originals/`)**: All original studio photos (`assets/originals/jt-saree-09/`) and raw admin image uploads (`assets/originals/uploads/`) are preserved untouched.

## 2. Environment Variables (`.env`)
Copy `.env.example` to `.env` (never commit `.env` to git) and configure:
- `APP_ENV`: `development` or `production`
- `ADMIN_INITIAL_EMAIL`: Admin login email (default `admin@janardhantextiles.com`)
- `ADMIN_INITIAL_PASSWORD`: Strong initial password for the admin account (hashed with salted `PBKDF2-HMAC-SHA256`, 260,000 iterations)
- `JWT_SECRET`: Random 32-byte hex secret
- `ALLOWED_ORIGINS`: Comma-separated list of allowed CORS origins
- `TURSO_DATABASE_URL` & `TURSO_AUTH_TOKEN` (or `DATABASE_URL`): Managed cloud database credentials for Vercel production persistence
- `RAZORPAY_KEY_ID` & `RAZORPAY_KEY_SECRET`: Razorpay API credentials for online payments (leave empty to keep Online Payment disabled with an honest 501 notice while Cash on Delivery and WhatsApp orders remain active)
- `GEMINI_API_KEY`: Server-side Gemini Nano Banana 2 Pro API key

## 3. Running Locally
```bash
python server.py
```
The server starts on `http://127.0.0.1:8080` (and `http://localhost:4000`).

## 4. Database Backup & Restore
- **Create a backup** (creates both a binary `.db` snapshot and a portable `.json` export inside `./backups/`):
  ```bash
  python scripts/backup_db.py
  ```
- **Restore from a backup**:
  ```bash
  python scripts/restore_db.py backups/janardan_textiles-YYYYMMDD-HHMMSS.db
  ```
