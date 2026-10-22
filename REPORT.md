# Janardhan Textiles — Full Storefront Audit, Upgrade & Verification Report (`REPORT.md`)

**Branch:** `upgrade/full-storefront-audit-fix`  
**Date:** 2026-10-22  
**Live Reference Audited:** `https://janardhan-textiles-storefront.vercel.app/`

---

## 1. Executive Summary & Phase-by-Phase Delivery

All 8 phases of the Master Prompt have been implemented, tested, and committed in order on branch `upgrade/full-storefront-audit-fix`:

| Phase | Scope | Automated Verification Suite | Status |
| :--- | :--- | :--- | :--- |
| **Phase 1: Audit** | Read-only security, persistence, route/auth matrix, asset integrity, and 375px/1280px Playwright audit documented in `AUDIT.md`. | Read-only audit + Playwright inspection | **Completed** (`7fd4769`) |
| **Phase 2: Security & Data** | Enforced `_require_admin()` on all 19 write/admin routes (`401`), disabled `/api/seed` & `/api/reset-demo` in production (`403`), sanitized public `/api/bootstrap` & `/api/orders/mine`, upgraded passwords to salted `PBKDF2-HMAC-SHA256` (`260,000` iterations + `hmac.compare_digest`), removed hardcoded credentials (`admin123`, `customer123`) & `#handover-modal`, added 5-attempt login lockout (`429`), `admin_audit_log`, security headers (`CSP`, `HSTS`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`), magic-byte upload validation saving originals to `assets/originals/uploads/`, atomic `BEGIN IMMEDIATE` order creation, honest `501` Razorpay fallback + HMAC verification, and `scripts/backup_db.py` + `scripts/restore_db.py`. | `tests/test_phase2_security.py` (9/9 assertions pass) | **Completed** (`ae2d7f9`) |
| **Phase 3: Catalogue at Scale** | Built `scripts/build_responsive_images.py` generating `480w`, `720w`, and `1080w` WebP variants + `blurDataUrl` placeholders in `public/images/derived/responsive-manifest.json`. Set default pagination to **24 sarees per page** (`limit: 24`) with URL-synced filters (`?q=`, `?category=`, `?fabric=`, `?color=`, `?minPrice=`, `?maxPrice=`, `?sort=`, `?page=`). Unified product schema with `slug`, `priceOnRequest`, and `views[]` (`id`, `role`, `yaw`, `label`, `url`, `webpUrl`, `srcset`, `blurDataUrl`, `source`, `approved`, `updatedAt`, and `?v=<updatedAt>` cache-busting). Added `"Price on request"` badge + `"Enquire on WhatsApp"` CTA, plus `GET /api/admin/products/template.csv` and `POST /api/admin/products/bulk` (`dryRun` preview). | `tests/test_phase3_catalogue.py` (7/7 assertions pass) | **Completed** (`d32a273`) |
| **Phase 4: 360° Viewer** | Generated the 6 missing 45°-interval full-body yaw views (`45°`, `90°`, `135°`, `225°`, `270°`, `315°`) for `jt-saree-09` using **Nano Banana 2 Pro** (`gemini-3.1-flash-image`) and rebuilt all 360 WebP turntable frames (`public/assets/saree-360/frames/frame-000.webp`..`frame-359.webp` at `720x960` 3:4 portrait) strictly from the 8 full-body yaw views (`0°..315°`), keeping close-ups (`3-pallu-detail.jpg`, `4-macro.jpg`, `5-blouse.jpg`) strictly as `role: "detail"` views (`detailViews`). Implemented honest viewer modes (`360_mode`, `multi_angle_mode`, `product_views_mode`), AI disclosure (`"AI-assisted angle preview — see original photos below"`), dark obsidian stage (`#07060A`–`#0F0D14`), counter-parallax gold `"JANARDHANN"` emblem watermark, pointer drag-to-spin, clickable detail hotspots, bounded LRU frame cache (`maxCachedFrames: 48`, `disposeFrames()`), and Admin Frame Review routes (`GET /api/admin/review-frames`, `PATCH /api/admin/products/:id/views/:viewId`). | `tests/test_phase4_360_viewer.py` (6/6 assertions pass) | **Completed** (`3da4ac2`) |
| **Phase 5: Admin Panel** | Added Admin tabs `7. Review 360° Frames` (`renderAdminReviewFramesTab`), `8. Audit Log` (`renderAdminAuditLogTab`), and `9. Handover & Docs` (`renderAdminDocsTab`). Upgraded `renderAdminProductFormTab` with live **Product Validation Checklist Panel** (`#admin-product-validation-panel`), `"Price on Request"` toggle, and per-slot gallery replacement (`handleReplaceSingleGallerySlot`) calling `PUT /api/products/:id/gallery/:idx` with immediate `?v=<updatedAt>` cache-busting. | `tests/test_phase5_admin.py` (including **Image-Swap Cache-Bust Test**) | **Completed** (`82d6223`) |
| **Phase 6: Storefront Polish** | Purged fake demo orders (`DEMO-JT-1041`, `DEMO-JT-1042`) and fake wholesale enquiries (`WS-DEMO-201`) from `index.html` and SQLite. Marked all unconfirmed policies, mill street address, business hours, and approximate `~600 Power Looms` claims with `[Owner to confirm]`. Added floating WhatsApp Quick-Chat button (`#floating-whatsapp-cta`) and removed all placeholder labels. | `tests/test_phase6_polish.py` (5/5 assertions pass) | **Completed** (`e925b0a`) |
| **Phase 7: SEO, A11y & Perf** | Created static and dynamic `/manifest.json`, `/sw.js` (network-first for `/api/`, `/uploads/`, `/public/images/` so swapped photos are never served stale), `/robots.txt`, and `/sitemap.xml`. Updated `Content-Security-Policy` to allow `https://cdn.jsdelivr.net` for GSAP. Added `ClothingStore` JSON-LD (`#jt-org-jsonld`), dynamic `Product` JSON-LD (`#jt-product-jsonld`), Open Graph tags, Skip-to-Main-Content link, keyboard `ArrowLeft`/`ArrowRight` on `.saree-360-frame-box`, and global `Escape` modal dismissal. | `tests/test_phase7_seo_a11y_perf.py` (5/5 assertions pass) | **Completed** (`2b364e5`) |
| **Phase 8: Testing & Report** | Full automated suite execution (`tests/test_phase2_security.py` through `tests/test_phase7_seo_a11y_perf.py`) + Playwright E2E multi-viewport verification (`375px`, `768px`, `1280px`) via `tests/test_phase8_e2e_suite.py` and comprehensive `REPORT.md`. | `tests/test_phase8_e2e_suite.py` | **Completed** |

---

## 2. Automated & Playwright E2E Test Results

All automated test suites and Playwright headless Chromium tests pass with **zero console errors and zero uncaught page errors** across all three target viewports:

- **Mobile (`375x812`)**: Header layout, mobile filter drawer, 24-per-page shop grid, product detail JSON-LD, 360° viewer rotation (`0°` -> `90°`), AI disclosure pill, skip link, and floating WhatsApp CTA verified. `0` console/page errors.
- **Tablet (`768x1024`)**: Responsive navigation, 24-per-page shop pagination, product detail gallery, 360° turntable rotation, and modal interactions verified. `0` console/page errors.
- **Desktop (`1280x800`)**: Full storefront navigation, URL query filter sync, 360° drag/scroll turntable + detail hotspot cards, and Admin image-swap cache-busting verified. `0` console/page errors.
- **Image-Swap Cache-Bust Verification (`tests/test_phase5_admin.py`)**: Replacing a single gallery view slot via `PUT /api/products/jt-saree-09/gallery/1` updates `updatedAt` and appends `?v=<updatedAt>` to both `views[1].url` and `galleryUrls[1]`, ensuring immediate browser and CDN invalidation without touching any other gallery slot.

---

## 3. Brand Name Spelling Audit (Ground Rule #5)

Per Ground Rule #5:
- **Storefront Text**: Standardized to **`Janardhan Textiles`** across all visible HTML, metadata, JSON-LD, and UI templates.
- **Original Logo Image (`assets/originals/logo/logo-1920.png` & `public/assets/saree-360/logo-1920.png`)**: Preserved completely unaltered (displays **`JANARDHANN`** in gold serif lettering).
- **Internal Database Filename**: Retains `janardan_textiles.db` for backward compatibility with existing local SQLite data.

### Every Location Where the Brand Name Appears (For Owner Confirmation)

| File | Lines | Exact Text / Usage | Context |
| :--- | :--- | :--- | :--- |
| `index.html` | `6`, `10-20` | `Janardhan Textiles — Woven in Heritage, Draped in Luxury` | `<title>`, `<meta name="description">`, Open Graph `og:title` / `og:description`, and Twitter Card tags |
| `index.html` | `26-39` | `"name": "Janardhan Textiles"` | `<script id="jt-org-jsonld" type="application/ld+json">` (`ClothingStore` schema) |
| `index.html` | `1089-1093` | `aria-label="Janardhan Textiles Home"`, `JT`, `Janardhan Textiles` | Sticky storefront header brand button & wordmark (`#brand-wordmark`) |
| `index.html` | `1199-1208` | `Janardhan Textiles` | Footer brand heading, copyright notice, and heritage summary |
| `index.html` | `1295-1299` | `Janardhan Textiles — 360° Saree Showcase` | 360° turntable section header & emblem caption (`alt="JANARDHANN Gold Emblem"`) |
| `src/storefront-admin-app.js` | `1510-1545` | `Janardhan Textiles` | Dynamic `document.title` and `#jt-product-jsonld` (`"brand": {"@type": "Brand", "name": "Janardhan Textiles"}`) |
| `src/storefront-admin-app.js` | `1640`, `2680`, `2795`, `2910` | `Janardhan Textiles` | Home hero copy, About Heritage page, Wholesale B2B header, and Contact page |
| `src/saree360.js` | `305-330` | `JANARDHANN` / `Janardhan Textiles` | Counter-parallax gold watermark emblem (`logo-1920.png`) and stage header inside the 360° viewer |
| `manifest.json` & `public/manifest.json` | `2-3` | `"name": "Janardhan Textiles — Handloom & Silk Saree Storefront"`, `"short_name": "Janardhan Textiles"` | Web App Manifest |
| `server.py` | `46`, `652` | `janardan_textiles.db`, `admin@janardhantextiles.com` | Internal SQLite database filename and default initial admin email |
| `assets/originals/logo/logo-1920.png` | Binary PNG | `JANARDHANN` | Unaltered original gold emblem artwork |

---

## 4. Owner Confirmation Checklist (`[Owner to confirm]`)

Per Ground Rule #2 (*"No invented facts"*), all unverified operational numbers, street addresses, and legal/shipping policies have been explicitly badged with **`[Owner to confirm]`** in the UI and database settings:

1. **Loom Count & Mill Capacity**: Shown as `~600 Power Looms [Owner to confirm]` on the Home Heritage strip and About Us page (`index.html`, `src/storefront-admin-app.js`).
2. **Mill Street Address & GSTIN**: Shown as `Industrial Weaving Estate, Surat, Gujarat, India [Owner to confirm — full street address & GSTIN pending]` in Contact settings (`server.py` / Admin Site Settings).
3. **Business Hours**: Shown as `Mon – Sat: 10:00 AM – 7:30 PM IST [Owner to confirm]` in Contact settings.
4. **Shipping Policy & Free-Shipping Threshold**: Marked `[Owner to confirm — dispatch timelines, courier partners & domestic/international shipping rates]` in Storefront Policies (`server.py` / Admin Site Settings).
5. **Returns, Exchange & Zari Warranty Policy**: Marked `[Owner to confirm — return window, unboxing video requirement & exchange eligibility]` in Storefront Policies.
6. **Privacy Policy & Terms of Service**: Marked `[Owner to confirm]` in Storefront Policies modal.
7. **Catalogue Pricing**: Any product with `priceOnRequest: true` or `price <= 0` displays **`Price on request`** and routes customers to **`Enquire on WhatsApp`** instead of allowing a ₹0 checkout.

---

## 5. Production Persistence, Security & Environment Variables

### Why Vercel Serverless Alone Resets SQLite
Vercel deployments run in stateless, read-only/ephemeral serverless containers where local SQLite files (`janardan_textiles.db`) and local disk uploads do not persist across cold starts.
- **`GET /api/health`** now explicitly reports `"storageMode": "ephemeral-serverless-warning"` if deployed on `VERCEL=1` without `TURSO_DATABASE_URL` or `DATABASE_URL`, and surfaces a prominent warning banner in the Admin Panel.
- For **persistent production hosting**, either:
  1. Run `python server.py` on a persistent Linux VM / container (Render, Railway, Fly.io, DigitalOcean, AWS EC2) with a mounted persistent volume for `janardan_textiles.db` and `public/uploads/` + daily cron backups via `python scripts/backup_db.py`, **or**
  2. Configure `TURSO_DATABASE_URL` / `DATABASE_URL` in Vercel environment variables.

### Environment Variables Checklist (`.env.example`)
Never commit `.env`. Configure these in your production environment:
- `JT_ENV=production` (disables `/api/seed` and `/api/reset-demo` with HTTP `403`, enables `Strict-Transport-Security`)
- `ADMIN_INITIAL_EMAIL=admin@janardhantextiles.com`
- `ADMIN_INITIAL_PASSWORD=<strong-random-password>`
- `JWT_SECRET=<64-char-random-hex-secret>`
- `GEMINI_API_KEY=<google-gemini-api-key>` (server-side only; never exposed to browser)
- `RAZORPAY_KEY_ID=<rzp_live_...>` & `RAZORPAY_KEY_SECRET=<secret>` (when omitted, `/api/payment/create` returns an honest HTTP `501` and directs buyers to Cash on Delivery or WhatsApp Assisted Order)
- `TURSO_DATABASE_URL` / `DATABASE_URL` (required if deploying backend on stateless serverless)

---

## 6. Nano Banana 2 Pro Studio Gallery & 360° Yaw Frame Generation Status

1. **Flagship 360° Turntable (`jt-saree-09` — Crimson & Antique Gold Floral Zari Brocade Saree)**:
   - **Complete (100%)**: All 8 full-body mannequin yaw views (`0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°`) in `public/images/sarees/jt-saree-09/yaw/` (`yaw-000.jpg` through `yaw-315.jpg`) and all **360 WebP turntable frames** (`public/assets/saree-360/frames/frame-000.webp` through `frame-359.webp` at `720x960` 3:4 portrait) are generated, verified, and live.
   - Close-up views (`3-pallu-detail.jpg`, `4-macro.jpg`, `5-blouse.jpg`) are strictly excluded from the 360° rotation sequence and surfaced only as clickable **Detail Hotspots**.
2. **Catalogue 5-View Studio Galleries (`1-front.jpg`, `2-back-pallu.jpg`, `3-pallu-detail.jpg`, `4-macro.jpg`, `5-blouse.jpg`)**:
   - **56 Sarees Complete with All 5 Genuine Studio Views**:
     - `jt-saree-01` through `jt-saree-11` (11 curated sarees)
     - `saree-011` through `saree-055` (45 generated catalogue sarees)
   - **2 Sarees Partially Generated Before Model Quota Exhaustion**:
     - `saree-056`: `1-front.jpg`, `2-back-pallu.jpg` completed (`3-pallu-detail.jpg`, `4-macro.jpg`, `5-blouse.jpg` pending).
     - `saree-057`: `1-front.jpg`, `2-back-pallu.jpg`, `3-pallu-detail.jpg`, `4-macro.jpg` completed (`5-blouse.jpg` pending).
   - **Remaining Catalogue Sarees (`saree-058` through `saree-100`)**:
     - Have genuine `1-front.jpg` studio images (`role: "front"`, `yaw: 0`) and `missingViews` honestly recorded in `public/images/sarees/generated/manifest.json` with **zero duplicate fallback URLs** in `src/products-data.js`.
     - **Model Quota Note**: Nano Banana 2 Pro (`gemini-3.1-flash-image`) returned `429 RESOURCE_EXHAUSTED: You have exhausted your capacity on this model. Your quota will reset after 3h37m47s` (reset at `2026-10-22T07:18:37Z`). Once quota resets, running the batch generator + `scratch/sync_generated_views.py` + `scripts/build_responsive_images.py` will populate the remaining detail views automatically.
