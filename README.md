# Lepakshi Weaves — Storefront & Admin Operations Guide

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

## Operations dashboard (orders, allocation, Excel uploads)

Open **`/ops.html`** while `python server.py` is running (for example `http://localhost:8080/ops.html`).
The public Vercel site is static, so the dashboard shows "Operations server not reachable" there.
It needs `server.py` on a computer or a Python host (Render, Railway, a VPS…).

| Role  | Can do |
|-------|--------|
| admin | Everything: upload sheets, allocate, change status, export, add/deactivate staff, view the activity log, load/remove placeholder data |
| staff | View dashboard, upload sheets, allocate, change status, export |

* **Add staff:** sign in as admin → **Staff** tab → name, team and (optionally) a login email + password of at least 10 characters.
* **Upload:** `.xlsx` or `.csv`, max 5 MB / 20,000 rows. Preview → match columns → **Check rows** → **Import valid rows**. Bad rows (missing product code, wrong quantity, duplicate order ID, bad date, unknown status) are listed with their sheet row number and skipped.
* **Uploaded files** are saved in `private_uploads/ops/`. That folder is blocked by `server.py`, ignored by git and excluded from Vercel (`.vercelignore`).
* **Activity log:** every upload, allocation, status change, export and staff change is written to `admin_audit_log` (prefix `ops_`).

### Excel column template

| column | required | example |
|---|---|---|
| order_id | yes | `LW-2026-0001` (unique) |
| order_date | yes | `2026-10-01` or `01-10-2026` |
| retailer_name | yes | `Sri Lakshmi Silks` |
| retailer_city | no | `Hyderabad` |
| channel | no | `Retail` / `Wholesale` |
| product_code | yes | `LW-KAN-001` |
| product_name | no | `Kanchipuram Pure Silk - Ruby` |
| fabric | no | `Kanchipuram Pure Silk` |
| quantity | yes | `24` (whole number 1–100000) |
| status | no | `New`, `Allocated`, `In production`, `Dispatched`, `Delivered` |
| notes | no | free text, max 500 chars |

Download the template from the **Upload** tab (`.xlsx` with a "How to fill" sheet, or `.csv`). Sample rows are marked `PLACEHOLDER`; delete them before uploading real data.

### Database tables (SQLite, created automatically)

`ops_orders`, `ops_products`, `ops_retailers`, `ops_staff`, `ops_allocations`, `ops_uploads`, plus the existing `users` (role `admin` / `staff`) and `admin_audit_log`. See `ops_dashboard.py → init_ops_schema()`.

## Brand assets

Generated from `assets/originals/brand/lepakshi-weaves-logo-original.png` by `python scripts/build_brand_assets.py` into `public/brand/`:
full / horizontal / emblem / rose logos (PNG, WebP, SVG), one-colour gold and white versions, favicons, app icons and the 1200×630 share image `og-image.jpg`.
