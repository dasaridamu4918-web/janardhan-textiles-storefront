# Janardhan Textiles Storefront — Phase 1 Technical, Security & UX Audit (`AUDIT.md`)

**Date:** 2026-10-22  
**Live Deployment:** `https://janardhan-textiles-storefront.vercel.app/`  
**Repository Branch:** `upgrade/full-storefront-audit-fix`

---

## 1. Executive Summary & Backend Persistence Architecture

### Where the Backend Actually Runs & Persistence Reality
| Environment | How Requests Are Handled | Does Data Persist? | File / Line Reference |
| :--- | :--- | :--- | :--- |
| **Local Development (`python server.py`)** | `JanardanBackendHandler` (`http.server.ThreadingHTTPServer` on ports `8080` and `4000`) reads/writes to local SQLite file `janardan_textiles.db`. | **Yes (Locally only)** — persists to local disk file `janardan_textiles.db`. | `server.py:62`, `server.py:2575-2590` |
| **Live Production (`vercel.app` & GitHub Pages)** | `vercel.json` sets `"framework": null, "buildCommand": null, "outputDirectory": "."` with **no serverless function routes**. `server.py` does **not** run on Vercel at all. Every `/api/*` request fails with `404` and silently falls back to `LOCAL_FALLBACK_API` (`window.localStorage`) in the visitor's browser. | **No (CRITICAL)** — orders, admin edits, stock deductions, and enquiries saved on the live Vercel site exist only in that single visitor's browser `localStorage` (`jt_local_products_v5`, `jt_local_orders_v1`). Even if `server.py` were wrapped as a Vercel Python serverless function, local SQLite on `/tmp` would be wiped on every serverless cold start unless backed by a managed database (`DATABASE_URL` Postgres / `TURSO_DATABASE_URL` LibSQL). | `vercel.json:1-16`, `src/storefront-admin-app.js:45-239`, `index.html:1584-1590` |

---

## 2. Complete Route & API Endpoint Inventory

### 2.1 Frontend SPA Routes (`index.html` & `src/storefront-admin-app.js`)
| Route / Hash | Purpose | Auth Required? | Current Status & Issues | File / Line Reference |
| :--- | :--- | :--- | :--- | :--- |
| `/` or `#home` | Hero, 360° Turntable / 5-View Showcase, Featured Sarees, Bestsellers | Public | Loads all 360 WebP frames eagerly; exposes `Admin` button in public top nav (`index.html:1027`). | `index.html:2296-2309`, `src/storefront-admin-app.js:1265` |
| `#shop` (`#catalogue`) | Filterable, sortable saree catalogue | Public | Filters not synced to URL query parameters; loads all products in memory rather than 24-per-page pagination + URL state. | `src/storefront-admin-app.js:1580-1750` |
| `#product/:id` | Saree detail page, 5-view gallery, lightbox, add to cart | Public | Mixes full-body (`1-front`, `2-back-pallu`) and close-up (`3-pallu-detail`, `4-macro`, `5-blouse`) views without `views[]` role/yaw model. | `src/storefront-admin-app.js:2110-2450` |
| `#cart` & `#checkout` | Cart drawer/page & 4-step checkout flow | Public / Customer | Online payment option shows honest 501 fallback when Razorpay keys are absent; needs server-side Razorpay order & signature verification when configured. | `src/storefront-admin-app.js:2500-2910` |
| `#orders` | Customer order history & tracking | Customer | **CRITICAL LEAK:** When unauthenticated or when a customer has 0 matching orders, `/api/orders/mine` returns **every customer's order in the database**. | `server.py:1184-1205`, `src/storefront-admin-app.js:525-544` |
| `#wishlist` | Saved sarees | Customer (or Local) | Requires auth on API; works locally. | `server.py:1169-1181` |
| `#wholesale` | Bulk / B2B enquiry form | Public | Missing honeypot / Turnstile anti-spam and rate limiting. | `server.py:1773-1797` |
| `#contact` | Customer contact form | Public | Missing honeypot / Turnstile anti-spam and rate limiting. | `server.py:1800-1821` |
| `#policies` | Shipping, Returns, Privacy, Terms | Public | Contains unconfirmed operational specifics (`₹99 flat`, `7 days`) that must be marked `[Owner to confirm]`. | `index.html:1446-1468` |
| `#admin` | Protected Admin Dashboard | **Admin Only** | Link is visible to all customers in top nav (`index.html:1027`); demo credentials (`admin@janardantextiles.com` / `admin123`) are hardcoded in client JS (`src/storefront-admin-app.js:183-190`). Missing `/admin/review-frames`, `/admin/docs`, and audit log. | `index.html:1027`, `src/storefront-admin-app.js:180-200`, `3560-4800` |

### 2.2 Backend REST API Endpoints (`server.py`)
| Method & Endpoint | Purpose | Auth Currently Enforced? | Auth Required? | Severity & Vulnerability Finding | File / Line Reference |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET /api/health` | Server & DB health check | None | Public | Exposes internal filename `janardan_textiles.db`. | `server.py:1009-1022` |
| `GET /api/bootstrap` | Initial state hydration | **None** | Public (Sanitized) | **CRITICAL:** Leaks all `orders` (customer names, phones, addresses), `wholesaleEnquiries`, and `contactMessages` to any unauthenticated caller! | `server.py:843-880`, `1024-1025` |
| `GET /api/filters` | Catalogue filter options | None | Public | `server.py` returns `shipping: {flat: 0, free_above: 0}` while client fallback returns `{flat: 99, free_above: 2999}`. | `server.py:1028-1043` |
| `GET /api/sarees/generate/status` | AI studio status | **None** | **Admin Only** | **HIGH:** Leaks local Windows filesystem path `C:\Users\91965\Downloads\1\1` to public callers. | `server.py:1046-1068` |
| `GET /api/products` | Paginated product list | None | Public | Default limit is `12` instead of `24`. | `server.py:1072-1149` |
| `GET /api/products/:id` | Single product detail | None | Public | Returns inactive products (`include_inactive=True`) to public callers. | `server.py:1152-1159` |
| `POST /api/auth/register` | Customer registration | None | Public | Uses unsalted `SHA-256` (`hash_password`), no rate limiting, no email format validation. | `server.py:132-133`, `1515-1542` |
| `POST /api/auth/login` | User / Admin login | None | Public | **CRITICAL:** Unsalted `SHA-256`, no rate limiting, no login lockout after repeated failures, default `admin123` password seeded in code. | `server.py:648-655`, `1545-1575` |
| `GET /api/me` | Current user session | Bearer Token (`_require_auth`) | Authenticated | Properly checks `_require_auth()`. | `server.py:1162-1166` |
| `GET/PUT/DELETE /api/wishlist[/:id]` | Customer wishlist | Bearer Token (`_require_auth`) | Authenticated | Properly checks `_require_auth()`. | `server.py:1169-1181`, `2226-2242`, `2548-2561` |
| `POST /api/orders` | Place order & deduct stock | Optional Bearer | Public / Customer | **HIGH:** Allows client to pass `order_number`, does not reject inactive products (`pdata.get("active") is False`), and does not use `BEGIN IMMEDIATE` transaction in SQLite to prevent race conditions. | `server.py:1651-1770` |
| `GET /api/orders/mine` | Customer order history | Optional Bearer | **Authenticated** | **CRITICAL:** Returns **all orders in the database** if unauthenticated (`if not user`) or if the user has no matching orders (`if not mine: mine = all_orders`)! | `server.py:1184-1205` |
| `GET /api/orders/:orderNumber` | Order lookup | **None** | Authenticated / Token | **HIGH:** Any caller who guesses sequential `JT-ORD-1001` can view full PII (name, phone, address). | `server.py:1208-1219` |
| `POST /api/seed` | Wipe & re-seed DB | **None** | **Disable in Prod / Admin** | **CRITICAL:** Unauthenticated caller can pass `{"force": true}` and wipe all products, settings, orders, wholesale enquiries, and messages! | `server.py:1586-1646` |
| `POST /api/reset-demo` | Wipe & reset DB | **None** | **Disable in Prod / Admin** | **CRITICAL:** Completely unauthenticated full database wipe (`DELETE FROM orders`, `DELETE FROM products`, etc.)! | `server.py:1586-1646` |
| `POST /api/products` | Create product (legacy) | **None** | **Admin Only** | **CRITICAL:** Line `1837` only checks `_require_admin()` when `path == "/api/admin/products"`, leaving `POST /api/products` wide open without authentication! | `server.py:1836-1866` |
| `PUT /api/products/:id` | Update product / price | **None** | **Admin Only** | **CRITICAL:** Zero authentication! Any anonymous user can change any saree's price to `₹1` or overwrite descriptions. | `server.py:2250-2253` |
| `PUT /api/products/:id/gallery/:idx` | Replace product image | **None** | **Admin Only** | **CRITICAL:** Zero authentication! Any anonymous user can deface product gallery images. | `server.py:2256-2286` |
| `PUT /api/settings/contacts` | Update store contacts | **None** | **Admin Only** | **CRITICAL:** Zero authentication! Anonymous attacker can hijack WhatsApp/email contact details. | `server.py:2288-2303` |
| `PUT /api/settings/policies` | Update store policies | **None** | **Admin Only** | **CRITICAL:** Zero authentication! | `server.py:2305-2320` |
| `PATCH /api/orders/:id` | Update order status | **None** | **Admin Only** | **CRITICAL:** Line `2439` only checks `_require_admin()` for `/api/admin/orders/:id/status`, leaving `PATCH /api/orders/:id` unauthenticated! Also allows reopening cancelled orders. | `server.py:2436-2490` |
| `PATCH /api/wholesale/:id` | Update wholesale status | **None** | **Admin Only** | **CRITICAL:** Zero authentication! | `server.py:2493-2513` |
| `PATCH /api/contact/:id` | Update message status | **None** | **Admin Only** | **CRITICAL:** Zero authentication! | `server.py:2516-2536` |
| `POST /api/sarees/generate[-view]` | Trigger AI generation | **None** | **Admin Only** | **HIGH:** Unauthenticated callers can trigger expensive Gemini API calls or create new products in DB. | `server.py:1937-2214` |
| `GET/POST/PATCH/DELETE /api/admin/*` | Admin dashboard APIs | Bearer Admin (`_require_admin`) | Admin Only | Protected by `_require_admin()`, but `/api/admin/upload` lacks file-size and magic-byte validation andadmin mutations are not written to an audit log. | `server.py:1224-1507`, `1869-1934`, `2416-2489`, `2564-2570` |

---

## 3. Categorized Audit Findings by Severity

### CRITICAL Severity
1. **[CRITICAL-01] Unauthenticated Database Wipe & Write Endpoints (`server.py:1586-1646`, `1836`, `2250-2320`, `2437-2536`)**
   - `POST /api/seed`, `POST /api/reset-demo`, `POST /api/products`, `PUT /api/products/:id`, `PUT /api/products/:id/gallery/:idx`, `PUT /api/settings/contacts`, `PUT /api/settings/policies`, `PATCH /api/orders/:id`, `PATCH /api/wholesale/:id`, `PATCH /api/contact/:id`, `POST /api/sarees/generate`, and `POST /api/sarees/generate-view` can all be called without an admin token.
2. **[CRITICAL-02] Unauthenticated PII & Order Leak (`server.py:860-880`, `1024-1025`, `1184-1205`)**
   - `GET /api/bootstrap` returns all `orders`, `wholesaleEnquiries`, and `contactMessages` to the public browser.
   - `GET /api/orders/mine` returns `all_orders` when no user is logged in or when the logged-in user has 0 orders.
3. **[CRITICAL-03] Hardcoded Plaintext Credentials in Public Bundle & Unsalted SHA-256 (`src/storefront-admin-app.js:181-200`, `server.py:132-133`, `648-655`)**
   - `admin@janardantextiles.com` / `admin123` is visible in plaintext in `src/storefront-admin-app.js` and seeded in `server.py`. Passwords use unsalted `hashlib.sha256`.
4. **[CRITICAL-04] Internal Backend & Handover Documentation Exposed on Public Page (`index.html:1327-1386`, `src/storefront-admin-app.js:4690-4760`)**
   - `#handover-modal` ("Owner Handover & Backend Documentation — `server.py`, `/src/products-data.js`, SQLite endpoints") is shipped directly inside `index.html`.
5. **[CRITICAL-05] Backend Does Not Run or Persist on Vercel (`vercel.json:1-16`)**
   - `vercel.json` serves only static files. No serverless `/api` handler is wired, and there is no persistent cloud database adapter (`DATABASE_URL` Postgres / `TURSO_DATABASE_URL` LibSQL) for serverless execution.

### HIGH Severity
6. **[HIGH-01] Console Network Errors at 375px & 1280px (`index.html:12`, `index.html:5185-5189`)**
   - `GET /manifest.json` fails (`net::ERR_FAILED` / 404) because `/manifest.json` does not exist at the root.
   - `navigator.serviceWorker.register("/sw.js")` fails (`An unknown error occurred when fetching the script`) because `/sw.js` does not exist.
   - Rapid page switching in headless desktop triggers `ERR_CONNECTION_REFUSED` when image preloads race against server shutdown.
7. **[HIGH-02] Stock Race Condition & Cancelled Order Reopening (`server.py:1673-1765`, `2460-2489`)**
   - `POST /api/orders` does not check `pdata.get("active", True)` or reject products with missing/unconfirmed ("Price on request") prices, and does not use `BEGIN IMMEDIATE` database transactions.
   - `PATCH /api/admin/orders/:number/status` allows a `cancelled` order (whose stock was already restored) to be changed back to `shipped` or `delivered` without re-deducting stock.
8. **[HIGH-03] 360° Viewer Data Model & Angular Order Mismatch (`src/products-data.js`, `index.html:1601-2257`)**
   - Product views are stored as a flat 5-slot array (`front`, `back_pallu`, `pallu_detail`, `fabric_macro`, `blouse_border`) instead of `views[]: { file, role: "front"|"side"|"back"|"side2"|"detail", yaw, label, source: "real"|"ai", approved, updatedAt }`.
   - Detail shots (`pallu_detail`, `fabric_macro`, `blouse_border`) must be zoom hotspots/moments, never rotation angles.
   - Products with `< 4` full-body views must show an honest "Product views" guided scroll gallery, while `8+` full-body views enable "360° Mode", and AI-generated frames (`source: "ai"`) must require owner approval in `/admin/review-frames` and display a customer disclosure note.
9. **[HIGH-04] Unvalidated File Uploads & Missing Security Headers (`server.py:924-929`, `1474-1507`)**
   - `/api/admin/upload` does not check magic bytes or enforce a maximum file size, and saves directly without preserving originals in `assets/originals/`.
   - Responses set `Access-Control-Allow-Origin: *` and lack `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, and `Strict-Transport-Security`.
10. **[HIGH-05] Fake Demo Orders, Sample Enquiries & Unconfirmed Prices (`index.html:1495-1537`, `src/products-data.js`)**
    - `INITIAL_DEMO_ORDERS` and `INITIAL_WHOLESALE_ENQUIRIES` contain invented people and businesses (`Arundhati Deshmukh`, `Kaveri Emporium`, `Shree Laxmi Saree Mandir`).
    - Products with unconfirmed/missing prices must display `"Price on request"` rather than sample prices.

### MEDIUM Severity
11. **[MED-01] Visible Placeholder Text in Built HTML (`index.html:1111-1112`)**
    - `#sticky-bar-title` contains literal `"Saree Name"` and `#sticky-bar-price` contains literal `"₹0"` in the static HTML source.
12. **[MED-02] Tracking Parameter on Social Links & Unconfirmed Loom Claims (`index.html:1180`, `1421`, `2519`, `server.py:687`)**
    - Instagram link includes `?obrf=MXJnZTZvdjRvNm10MA==` tracking parameter.
    - Footer and story claims (`~600 power looms`) and policy terms (`₹99 flat`, `7 days`) need `[Owner to confirm]` markers where unconfirmed, and every brand-name spelling location (`Janardhan` vs `JANARDHANN` vs `Janardan`) must be catalogued for owner confirmation.
13. **[MED-03] Catalogue URL State & Pagination (`src/storefront-admin-app.js:1580-1750`)**
    - Catalogue filters (`fabric`, `colour`, `price`, `occasion`, `availability`, `sort`, `page`, `q`) should sync with the URL and paginate at 24 sarees per page with responsive `srcset`/`sizes`.

### LOW Severity
14. **[LOW-01] Missing `sitemap.xml`, `robots.txt`, Per-Route Meta/Canonical & JSON-LD `Product` Structured Data**
    - No `robots.txt` or `sitemap.xml` exists at root; `document.title`, canonical link, Open Graph tags, and `application/ld+json` `Product` schema do not dynamically update on product navigation.
15. **[LOW-02] Tailwind Play CDN Warning in Console (`index.html:30`)**
    - Loading `https://cdn.tailwindcss.com` logs a console warning on every page load.

---

## 4. Brand Spelling Locations Found (Ground Rule #5)
- `"Janardhan Textiles"` (primary text across `index.html`, `src/storefront-admin-app.js`, `src/products-data.js`, `server.py`)
- `"JANARDHANN"` (rendered inside the circular gold seal logo image `public/assets/logo/janardhan-seal.png` — **never altered** per Ground Rule #5)
- `"Janardan"` (legacy identifier in `janardan_textiles.db`, `JanardanBackendHandler` in `server.py:62, 883`, and `admin@janardantextiles.com` in `server.py:650`)
