#!/usr/bin/env python3
"""
Lepakshi Weaves — Full-Stack Python + SQLite REST Backend Server (server.py)
Serves both http://127.0.0.1:8080 and http://localhost:4000.

Implements:
1. Storefront API Contract (Prompt 1):
   - GET    /api/products (search, comma-separated multi-filters, sort, featured, bestseller, server pagination)
   - GET    /api/products/:id
   - GET    /api/filters -> {fabrics, colors, occasions, price:{min,max}, shipping:{flat,free_above}}
   - POST   /api/auth/register -> {token, user}
   - POST   /api/auth/login -> {token, user}
   - GET    /api/me -> {user}
   - GET    /api/wishlist
   - PUT    /api/wishlist/:productId
   - DELETE /api/wishlist/:productId
   - POST   /api/orders -> HTTP 201 {order_number, order, ...}
   - GET    /api/orders/mine
   - GET    /api/orders/:orderNumber
   - POST   /api/payments/razorpay/order -> HTTP 501 (when Razorpay keys are not configured)
   - POST   /api/payments/razorpay/verify -> HTTP 501

2. Admin API Contract (Prompt 2, protected by Bearer token + role === "admin"):
   - GET    /api/admin/stats
   - GET    /api/admin/products
   - POST   /api/admin/products
   - PATCH  /api/admin/products/:id
   - PATCH  /api/admin/products/:id/stock
   - DELETE /api/admin/products/:id (soft hide: active = false)
   - POST   /api/admin/upload (multipart/form-data field `images` or base64 JSON -> returns {urls})
   - POST   /api/admin/products/bulk (up to 1000 per request -> {created, updated, errors})
   - GET    /api/admin/orders
   - PATCH  /api/admin/orders/:number/status (placed, confirmed, packed, shipped, delivered, cancelled; restores stock on cancelled)
   - GET    /api/admin/customers

3. Existing Bootstrap/Legacy Endpoints (kept 100% compatible):
   - GET    /api/health
   - GET    /api/bootstrap
   - POST   /api/seed, /api/reset-demo
   - PUT    /api/products/:id, PUT /api/products/:id/gallery/:idx
   - POST   /api/wholesale, PATCH /api/wholesale/:id
   - POST   /api/contact, PATCH /api/contact/:id
   - PUT    /api/settings/contacts, PUT /api/settings/policies
"""

import base64
import datetime
import hashlib
import hmac
import http.server
import json
import os
import re
import secrets
import shutil
import sqlite3
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

import ops_dashboard

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DB_PATH = os.path.join(ROOT_DIR, "janardan_textiles.db")
ORIGINALS_DIR = os.path.join(ROOT_DIR, "assets", "originals")
ORIGINALS_UPLOADS_DIR = os.path.join(ORIGINALS_DIR, "uploads")
UPLOADS_DIR = os.path.join(ROOT_DIR, "public", "assets", "uploads")
ROOT_UPLOADS_DIR = os.path.join(ROOT_DIR, "uploads")
SAREES_IMAGES_DIR = os.path.join(ROOT_DIR, "public", "images", "sarees")
for _d in (ORIGINALS_DIR, ORIGINALS_UPLOADS_DIR, UPLOADS_DIR, ROOT_UPLOADS_DIR, SAREES_IMAGES_DIR):
    try:
        os.makedirs(_d, exist_ok=True)
    except Exception:
        pass

DB_LOCK = threading.RLock()
GENERATION_LOCK = threading.Lock()
RATE_LIMIT_LOCK = threading.Lock()
RATE_LIMIT_BUCKETS = {}
LOGIN_LOCKOUTS = {}


def load_dotenv_if_present():
    env_path = os.path.join(ROOT_DIR, ".env")
    if not os.path.exists(env_path):
        return
    try:
        with open(env_path, "r", encoding="utf-8") as f:
            for raw_line in f:
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if k and k not in os.environ:
                    os.environ[k] = v
    except Exception:
        pass


load_dotenv_if_present()


def is_production_env():
    load_dotenv_if_present()
    return bool(
        os.environ.get("VERCEL")
        or os.environ.get("VERCEL_ENV") == "production"
        or os.environ.get("APP_ENV", "").strip().lower() == "production"
        or os.environ.get("NODE_ENV", "").strip().lower() == "production"
    )


def resolve_writable_db_path():
    custom_path = (os.environ.get("SQLITE_DB_PATH") or "").strip()
    if custom_path:
        return custom_path
    if os.access(ROOT_DIR, os.W_OK):
        return DEFAULT_DB_PATH
    tmp_db = os.path.join(tempfile.gettempdir(), "janardan_textiles.db")
    if not os.path.exists(tmp_db) and os.path.exists(DEFAULT_DB_PATH):
        try:
            shutil.copyfile(DEFAULT_DB_PATH, tmp_db)
        except Exception:
            pass
    return tmp_db


DB_PATH = resolve_writable_db_path()


def get_db_persistence_info():
    turso_url = (os.environ.get("TURSO_DATABASE_URL") or "").strip()
    pg_url = (os.environ.get("DATABASE_URL") or "").strip()
    if turso_url:
        return {
            "mode": "turso_libsql",
            "persistent": True,
            "statusText": "Connected • Turso LibSQL Cloud Persistent DB"
        }
    if pg_url:
        return {
            "mode": "postgres",
            "persistent": True,
            "statusText": "Connected • Managed PostgreSQL Persistent DB"
        }
    if os.environ.get("VERCEL"):
        return {
            "mode": "vercel_tmp_sqlite",
            "persistent": False,
            "statusText": "Ephemeral • Vercel /tmp SQLite (Configure TURSO_DATABASE_URL or DATABASE_URL for permanent cloud persistence)"
        }
    return {
        "mode": "local_sqlite",
        "persistent": True,
        "statusText": "Connected • SQLite Persistent Backend (janardan_textiles.db)"
    }


def get_nano_banana_api_key():
    load_dotenv_if_present()
    return (
        os.environ.get("GEMINI_API_KEY")
        or os.environ.get("NANO_BANANA_API_KEY")
        or os.environ.get("GOOGLE_API_KEY")
        or ""
    ).strip()


# Reference studio photography sets (5 views each: 1-front.jpg .. 5-blouse.jpg)
STUDIO_COLOUR_REFERENCE_MAP = {
    "royal rose & gold": "jt-saree-10",
    "emerald teal & gold": "jt-saree-11",
    "champagne gold": "jt-saree-09",
    "warm sand & gold": "jt-saree-01",
    "ivory gold": "jt-saree-02",
    "champagne beige": "jt-saree-03",
    "espresso brown": "jt-saree-04",
    "warm ochre": "jt-saree-05",
    "champagne & bronze": "jt-saree-06",
    "soft cream": "jt-saree-07",
    "deep cocoa": "jt-saree-08",
}

EXTRA_REFERENCE_COLOURS = [
    "Royal Rose & Gold",
    "Emerald Teal & Gold",
]


def now_iso():
    return datetime.datetime.now(datetime.timezone.utc).astimezone().isoformat(timespec="seconds")


PBKDF2_ITERATIONS = 260000


def hash_password(pw):
    """Salted PBKDF2-HMAC-SHA256 with 260,000 iterations."""
    salt_hex = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac(
        "sha256",
        (pw or "").encode("utf-8"),
        bytes.fromhex(salt_hex),
        PBKDF2_ITERATIONS
    )
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt_hex}${dk.hex()}"


def verify_password(pw, stored_hash):
    """
    Constant-time password verification supporting salted PBKDF2-HMAC-SHA256.
    Returns (is_valid: bool, needs_rehash: bool).
    """
    if not pw or not stored_hash or not isinstance(stored_hash, str):
        return False, False
    if stored_hash.startswith("pbkdf2_sha256$"):
        parts = stored_hash.split("$")
        if len(parts) != 4:
            return False, False
        try:
            iterations = int(parts[1])
            salt_bytes = bytes.fromhex(parts[2])
            expected_hex = parts[3]
            dk = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), salt_bytes, iterations)
            matched = hmac.compare_digest(dk.hex(), expected_hex)
            return matched, (matched and iterations < PBKDF2_ITERATIONS)
        except Exception:
            return False, False
    if len(stored_hash) == 64:
        legacy_hex = hashlib.sha256(pw.encode("utf-8")).hexdigest()
        if hmac.compare_digest(legacy_hex, stored_hash):
            return True, True
    return False, False


def check_rate_limit(ip_addr, bucket_name, max_requests=20, window_seconds=60):
    now = time.time()
    key = f"{bucket_name}:{ip_addr or 'unknown'}"
    with RATE_LIMIT_LOCK:
        timestamps = RATE_LIMIT_BUCKETS.get(key, [])
        timestamps = [t for t in timestamps if now - t < window_seconds]
        if len(timestamps) >= max_requests:
            RATE_LIMIT_BUCKETS[key] = timestamps
            return False
        timestamps.append(now)
        RATE_LIMIT_BUCKETS[key] = timestamps
        return True


def check_login_lockout(ip_addr, email):
    now = time.time()
    key = f"{ip_addr or 'unknown'}:{(email or '').lower()}"
    with RATE_LIMIT_LOCK:
        entry = LOGIN_LOCKOUTS.get(key)
        if not entry:
            return True, 0
        locked_until = entry.get("locked_until", 0)
        if locked_until > now:
            return False, int(locked_until - now)
        if now - entry.get("first_attempt", now) > 900:
            LOGIN_LOCKOUTS.pop(key, None)
        return True, 0


def record_login_failure(ip_addr, email):
    now = time.time()
    key = f"{ip_addr or 'unknown'}:{(email or '').lower()}"
    with RATE_LIMIT_LOCK:
        entry = LOGIN_LOCKOUTS.get(key)
        if not entry or (now - entry.get("first_attempt", now) > 900):
            entry = {"failures": 1, "first_attempt": now, "locked_until": 0}
        else:
            entry["failures"] = entry.get("failures", 0) + 1
        if entry["failures"] >= 5:
            entry["locked_until"] = now + 900
        LOGIN_LOCKOUTS[key] = entry
        return entry["failures"], entry["locked_until"] > now


def clear_login_failures(ip_addr, email):
    key = f"{ip_addr or 'unknown'}:{(email or '').lower()}"
    with RATE_LIMIT_LOCK:
        LOGIN_LOCKOUTS.pop(key, None)


def get_db_connection():
    conn = sqlite3.connect(DB_PATH, timeout=15.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def record_audit_log(action, admin_user=None, target_type="", target_id="", ip_address="", details=None):
    try:
        with DB_LOCK:
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute(
                """INSERT INTO admin_audit_log
                   (timestamp, admin_id, admin_email, action, target_type, target_id, ip_address, details_json)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    now_iso(),
                    (admin_user or {}).get("id") or "",
                    (admin_user or {}).get("email") or "",
                    str(action),
                    str(target_type or ""),
                    str(target_id or ""),
                    str(ip_address or ""),
                    json.dumps(details or {}, ensure_ascii=False)
                )
            )
            conn.commit()
            conn.close()
    except Exception:
        pass


MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB per image


def validate_image_bytes(binary_data, max_bytes=MAX_UPLOAD_BYTES):
    """Validates image file size and magic bytes (JPEG, PNG, WebP)."""
    if not binary_data or not isinstance(binary_data, (bytes, bytearray)):
        return False, "", "", "Empty image payload."
    if len(binary_data) > max_bytes:
        return False, "", "", f"Image exceeds maximum allowed size of {max_bytes // (1024 * 1024)} MB."
    if len(binary_data) < 12:
        return False, "", "", "File is too small to be a valid image."
    if binary_data[:3] == b"\xff\xd8\xff":
        return True, "jpg", "image/jpeg", ""
    if binary_data[:8] == b"\x89PNG\r\n\x1a\n":
        return True, "png", "image/png", ""
    if binary_data[:4] == b"RIFF" and binary_data[8:12] == b"WEBP":
        return True, "webp", "image/webp", ""
    return False, "", "", "Invalid file signature (magic bytes). Only genuine JPEG, PNG, and WebP images are permitted."



DEFAULT_INITIAL_PRODUCTS = [
    {
        "id": "jt-saree-09",
        "sku": "jt-saree-09",
        "isSampleProduct": False,
        "isSamplePrice": False,
        "featured": True,
        "bestseller": True,
        "active": True,
        "name": "Champagne Tissue Saree with Floral and Peacock Embroidery",
        "fabric": "Champagne Tissue",
        "color": "Champagne Gold",
        "occasion": "Celebrations & Festive",
        "priceINR": 7500,
        "originalPriceINR": 7500,
        "price": 7500,
        "mrp": 7500,
        "discountPercent": 0,
        "wholesalePriceINR": "",
        "minWholesaleQty": "",
        "stockStatus": "In Stock",
        "stockQty": 24,
        "stock": 24,
        "stock_status": "in_stock",
        "description": "Luminous champagne-gold tissue saree with a scalloped cutwork border, multicolour floral and peacock threadwork accented with gold zari and sequin work, and a matching embroidered blouse.",
        "borderAndZari": "Scalloped cutwork border with multicolour floral and peacock threadwork, gold zari and sequin highlights",
        "motifs": "Peacock and floral embroidery along the pallu and scalloped border",
        "blousePiece": "Matching champagne-gold tissue blouse with embroidered neckline and sleeve border",
        "work_details": "Scalloped cutwork border with multicolour floral and peacock threadwork, gold zari and sequin highlights",
        "blouse_piece": "Matching champagne-gold tissue blouse with embroidered neckline and sleeve border",
        "care_instructions": "",
        "gallery": [
            {"order": 1, "key": "front", "label": "1. Front view (three-quarter angle on the mannequin)", "url": "/public/images/sarees/jt-saree-09/1-front.jpg", "isSampleImage": False, "alt": "Champagne Tissue Saree with Floral and Peacock Embroidery — 1. Front view (three-quarter angle on the mannequin)"},
            {"order": 2, "key": "back_pallu", "label": "2. Back and pallu view", "url": "/public/images/sarees/jt-saree-09/2-back-pallu.jpg", "isSampleImage": False, "alt": "Champagne Tissue Saree with Floral and Peacock Embroidery — 2. Back and pallu view"},
            {"order": 3, "key": "pallu_detail", "label": "3. Pallu embroidery detail", "url": "/public/images/sarees/jt-saree-09/3-pallu-detail.jpg", "isSampleImage": False, "alt": "Champagne Tissue Saree with Floral and Peacock Embroidery — 3. Pallu embroidery detail"},
            {"order": 4, "key": "fabric_macro", "label": "4. Fabric and embroidery macro", "url": "/public/images/sarees/jt-saree-09/4-macro.jpg", "isSampleImage": False, "alt": "Champagne Tissue Saree with Floral and Peacock Embroidery — 4. Fabric and embroidery macro"},
            {"order": 5, "key": "blouse_border", "label": "5. Blouse and border detail", "url": "/public/images/sarees/jt-saree-09/5-blouse.jpg", "isSampleImage": False, "alt": "Champagne Tissue Saree with Floral and Peacock Embroidery — 5. Blouse and border detail"},
        ]
    },
    {
        "id": "jt-saree-01",
        "sku": "jt-saree-01",
        "isSampleProduct": False,
        "isSamplePrice": False,
        "featured": True,
        "bestseller": True,
        "active": True,
        "name": "Swarna Sand Jacquard Silk-Blend Saree",
        "fabric": "Silk-Blend Jacquard",
        "color": "Warm Sand & Gold",
        "occasion": "Wedding & Reception",
        "priceINR": 3900,
        "originalPriceINR": 3900,
        "price": 3900,
        "mrp": 3900,
        "discountPercent": 0,
        "wholesalePriceINR": "",
        "minWholesaleQty": "",
        "stockStatus": "In Stock",
        "stockQty": 42,
        "stock": 42,
        "stock_status": "in_stock",
        "description": "A warm sand and gold silk-blend jacquard saree featuring a woven temple border, floral jacquard motifs across the body and pallu, and a coordinated bordered blouse for weddings and receptions.",
        "borderAndZari": "3.5-inch muted gold woven temple border with fine geometric edging on warm sand silk-blend jacquard",
        "motifs": "Woven muted gold floral butti spaced evenly across the warm sand jacquard body and pallu",
        "blousePiece": "Coordinated warm sand and espresso-brown jacquard blouse with matching 3.5-inch woven gold sleeve border",
        "work_details": "3.5-inch muted gold woven temple border with fine geometric edging; woven muted gold floral butti across body and pallu",
        "blouse_piece": "Coordinated warm sand and espresso-brown jacquard blouse with matching 3.5-inch woven gold sleeve border",
        "care_instructions": "",
    },
    {
        "id": "jt-saree-02",
        "sku": "jt-saree-02",
        "isSampleProduct": False,
        "isSamplePrice": False,
        "featured": True,
        "bestseller": False,
        "active": True,
        "name": "Swarna Ivory Tissue Organza Saree",
        "fabric": "Tissue Organza",
        "color": "Ivory Gold",
        "occasion": "Festive & Puja",
        "priceINR": 3400,
        "originalPriceINR": 3400,
        "price": 3400,
        "mrp": 3400,
        "discountPercent": 0,
        "wholesalePriceINR": "",
        "minWholesaleQty": "",
        "stockStatus": "In Stock",
        "stockQty": 35,
        "stock": 35,
        "stock_status": "in_stock",
        "description": "A sheer, lightweight ivory-gold tissue organza saree with a 4-inch antique gold floral vine border, tonal lotus weave, and a coordinated tissue blouse for festive and puja occasions.",
        "borderAndZari": "4-inch woven antique gold floral vine border with crisp selvedge piping on sheer tissue organza",
        "motifs": "Delicate tonal lotus jaal woven throughout the sheer ivory warp and gold weft",
        "blousePiece": "Coordinated ivory-gold tissue organza blouse with lined bodice and 4-inch woven antique gold sleeve border",
        "work_details": "4-inch woven antique gold floral vine border with crisp selvedge piping; delicate tonal lotus jaal",
        "blouse_piece": "Coordinated ivory-gold tissue organza blouse with lined bodice and 4-inch woven antique gold sleeve border",
        "care_instructions": "",
    },
    {
        "id": "jt-saree-03",
        "sku": "jt-saree-03",
        "isSampleProduct": False,
        "isSamplePrice": False,
        "featured": False,
        "bestseller": True,
        "active": True,
        "name": "Kanak Beige Jacquard Power-Loom Saree",
        "fabric": "Art Silk Jacquard",
        "color": "Champagne Beige",
        "occasion": "Wedding & Reception",
        "priceINR": 2200,
        "originalPriceINR": 2200,
        "price": 2200,
        "mrp": 2200,
        "discountPercent": 0,
        "wholesalePriceINR": "",
        "minWholesaleQty": "",
        "stockStatus": "Low Stock",
        "stockQty": 6,
        "stock": 6,
        "stock_status": "low_stock",
        "description": "A champagne-beige art silk jacquard saree woven with a broad 5-inch paisley border, all-over jacquard paisley bootis, and a contrast espresso bordered blouse for wedding and reception wear.",
        "borderAndZari": "Broad 5-inch traditional paisley and geometric muted gold woven border on champagne-beige art silk jacquard",
        "motifs": "All-over jacquard woven paisley bootis framed with dual gold lines on the pallu",
        "blousePiece": "Coordinated champagne-beige and deep espresso contrast jacquard blouse with woven paisley sleeve border",
        "work_details": "Broad 5-inch traditional paisley and geometric muted gold woven border; all-over jacquard paisley bootis",
        "blouse_piece": "Coordinated champagne-beige and deep espresso contrast jacquard blouse with woven paisley sleeve border",
        "care_instructions": "",
    },
    {
        "id": "jt-saree-04",
        "sku": "jt-saree-04",
        "isSampleProduct": False,
        "isSamplePrice": False,
        "featured": False,
        "bestseller": False,
        "active": True,
        "name": "Nisha Espresso Soft Mercerised Saree",
        "fabric": "Soft Mercerised Weave",
        "color": "Espresso Brown",
        "occasion": "Evening & Party",
        "priceINR": 1800,
        "originalPriceINR": 1800,
        "price": 1800,
        "mrp": 1800,
        "discountPercent": 0,
        "wholesalePriceINR": "",
        "minWholesaleQty": "",
        "stockStatus": "In Stock",
        "stockQty": 50,
        "stock": 50,
        "stock_status": "in_stock",
        "description": "A matte espresso-brown soft mercerised saree with a soft sheen, sleek 2.5-inch geometric diamond gold border, diagonal star-burst buttis, and a matching striped-border blouse for evening and party wear.",
        "borderAndZari": "2.5-inch sleek geometric diamond muted gold woven border on matte espresso-brown soft mercerised weave",
        "motifs": "Minimalist woven star-burst buttis arranged in a refined diagonal trellis layout with a soft sheen",
        "blousePiece": "Coordinated running espresso-brown soft mercerised blouse with woven gold stripe detailing on sleeves",
        "work_details": "2.5-inch sleek geometric diamond muted gold woven border; minimalist star-burst buttis in diagonal trellis",
        "blouse_piece": "Coordinated running espresso-brown soft mercerised blouse with woven gold stripe detailing on sleeves",
        "care_instructions": "",
    },
    {
        "id": "jt-saree-05",
        "sku": "jt-saree-05",
        "isSampleProduct": False,
        "isSamplePrice": False,
        "featured": True,
        "bestseller": True,
        "active": True,
        "name": "Kesar Warm Ochre Mercerised Cotton Saree",
        "fabric": "Mercerised Cotton",
        "color": "Warm Ochre",
        "occasion": "Daywear & Festive",
        "priceINR": 1200,
        "originalPriceINR": 1200,
        "price": 1200,
        "mrp": 1200,
        "discountPercent": 0,
        "wholesalePriceINR": "",
        "minWholesaleQty": "",
        "stockStatus": "In Stock",
        "stockQty": 64,
        "stock": 64,
        "stock_status": "in_stock",
        "description": "A breathable warm-ochre mercerised cotton saree with a matte finish and soft sheen, featuring a 3-inch woven dobby border, vertical pinstripes, and a coordinated dobby-bordered blouse for daywear and festive occasions.",
        "borderAndZari": "3-inch woven dobby border in muted gold and warm espresso tones on matte warm-ochre mercerised cotton",
        "motifs": "Crisp vertical woven pinstripes along the body leading into a banded dobby pallu",
        "blousePiece": "Coordinated warm-ochre mercerised cotton blouse with 3-inch woven dobby border along the sleeves",
        "work_details": "3-inch woven dobby border in muted gold and warm espresso tones; crisp vertical woven pinstripes",
        "blouse_piece": "Coordinated warm-ochre mercerised cotton blouse with 3-inch woven dobby border along the sleeves",
        "care_instructions": "",
    },
    {
        "id": "jt-saree-06",
        "sku": "jt-saree-06",
        "isSampleProduct": False,
        "isSamplePrice": False,
        "featured": True,
        "bestseller": True,
        "active": True,
        "name": "Ratna Champagne Brocade Weave Saree",
        "fabric": "Woven Brocade",
        "color": "Champagne & Bronze",
        "occasion": "Wedding & Reception",
        "priceINR": 5500,
        "originalPriceINR": 5500,
        "price": 5500,
        "mrp": 5500,
        "discountPercent": 0,
        "wholesalePriceINR": "",
        "minWholesaleQty": "",
        "stockStatus": "In Stock",
        "stockQty": 18,
        "stock": 18,
        "stock_status": "in_stock",
        "description": "A richly textured champagne and bronze woven brocade saree with a 4.5-inch floral medallion border, dense foliate lattice weave across the body and pallu, and a coordinated brocade blouse for weddings and receptions.",
        "borderAndZari": "4.5-inch regal antique bronze-gold woven brocade border with floral medallions",
        "motifs": "Dense foliate lattice woven in muted gold and bronze thread across the champagne brocade body and pallu",
        "blousePiece": "Coordinated champagne and bronze brocade blouse with 4.5-inch floral medallion border on sleeves and back",
        "work_details": "4.5-inch regal antique bronze-gold woven brocade border with floral medallions; dense foliate lattice weave",
        "blouse_piece": "Coordinated champagne and bronze brocade blouse with 4.5-inch floral medallion border on sleeves and back",
        "care_instructions": "",
    },
    {
        "id": "jt-saree-07",
        "sku": "jt-saree-07",
        "isSampleProduct": False,
        "isSamplePrice": False,
        "featured": False,
        "bestseller": False,
        "active": True,
        "name": "Chandni Soft Cream Silk-Cotton Saree",
        "fabric": "Silk-Cotton Blend",
        "color": "Soft Cream",
        "occasion": "Office & Formal",
        "priceINR": 2800,
        "originalPriceINR": 2800,
        "price": 2800,
        "mrp": 2800,
        "discountPercent": 0,
        "wholesalePriceINR": "",
        "minWholesaleQty": "",
        "stockStatus": "In Stock",
        "stockQty": 40,
        "stock": 40,
        "stock_status": "in_stock",
        "description": "A soft matte-silk cream silk-cotton blend saree with a 2-inch muted gold satin-edge border, scattered woven coin motifs, and a self-textured bordered blouse for office and formal wear.",
        "borderAndZari": "2-inch subtle muted gold satin-edge woven border on matte-silk soft cream silk-cotton blend",
        "motifs": "Small woven coin motifs scattered lightly across the breathable soft cream body and pallu",
        "blousePiece": "Coordinated soft cream self-textured silk-cotton blouse with 2-inch muted gold woven border",
        "work_details": "2-inch subtle muted gold satin-edge woven border; small woven coin motifs (zari butis) across body and pallu",
        "blouse_piece": "Coordinated soft cream self-textured silk-cotton blouse with 2-inch muted gold woven border",
        "care_instructions": "",
    },
    {
        "id": "jt-saree-08",
        "sku": "jt-saree-08",
        "isSampleProduct": False,
        "isSamplePrice": False,
        "featured": False,
        "bestseller": False,
        "active": True,
        "name": "Kasturi Deep Cocoa & Gold Dobby Saree",
        "fabric": "Textured Dobby Blend",
        "color": "Deep Cocoa",
        "occasion": "Evening & Cultural",
        "priceINR": 1500,
        "originalPriceINR": 1500,
        "price": 1500,
        "mrp": 1500,
        "discountPercent": 0,
        "wholesalePriceINR": "",
        "minWholesaleQty": "",
        "stockStatus": "Out of Stock",
        "stockQty": 0,
        "stock": 0,
        "stock_status": "out_of_stock",
        "description": "A deep cocoa textured dobby blend saree with a small geometric weave, 3.5-inch bronze-gold dobby border, structured pallu bands, and a contrast geometric-bordered blouse for evening and cultural events.",
        "borderAndZari": "3.5-inch antique bronze-gold geometric dobby border with warm sand selvedge line",
        "motifs": "Small geometric dobby weave with textured slub weft lines and structured pallu bands",
        "blousePiece": "Coordinated deep cocoa and antique gold contrast dobby blouse with geometric border",
        "work_details": "3.5-inch antique bronze-gold geometric dobby border; small geometric dobby weave with slub weft lines",
        "blouse_piece": "Coordinated deep cocoa and antique gold contrast dobby blouse with geometric border",
        "care_instructions": "",
    }
]

REQUIRED_VIEWS = [
    (1, "front", "1. Front view (three-quarter angle on the mannequin)", "1-front.jpg"),
    (2, "back_pallu", "2. Back and pallu view", "2-back-pallu.jpg"),
    (3, "pallu_detail", "3. Pallu embroidery detail", "3-pallu-detail.jpg"),
    (4, "fabric_macro", "4. Fabric and embroidery macro", "4-macro.jpg"),
    (5, "blouse_border", "5. Blouse and border detail", "5-blouse.jpg"),
]



RESPONSIVE_MANIFEST_PATH = os.path.join(ROOT_DIR, "public", "images", "derived", "responsive-manifest.json")
_RESPONSIVE_CACHE = {"mtime": 0, "data": {}}


def get_responsive_manifest():
    try:
        if os.path.exists(RESPONSIVE_MANIFEST_PATH):
            mt = int(os.path.getmtime(RESPONSIVE_MANIFEST_PATH))
            if mt != _RESPONSIVE_CACHE["mtime"]:
                with open(RESPONSIVE_MANIFEST_PATH, "r", encoding="utf-8") as rf:
                    _RESPONSIVE_CACHE["data"] = json.load(rf)
                _RESPONSIVE_CACHE["mtime"] = mt
    except Exception:
        pass
    return _RESPONSIVE_CACHE["data"]


def enrich_view_entry(sku, ord_num, key, label, fname, raw_url, p_name="", p_fabric="", p_color="", slot=None):
    slot = slot if isinstance(slot, dict) else {}
    clean_path = (raw_url or "").split("?")[0].strip()
    rmap = get_responsive_manifest()
    rmeta = rmap.get(clean_path) or {}

    # Determine role & yaw for 360 viewer vs detail cards
    role_map = {
        "front": ("front", 0),
        "back_pallu": ("back", 180),
        "pallu_detail": ("detail", None),
        "fabric_macro": ("detail", None),
        "blouse_border": ("detail", None),
    }
    default_role, default_yaw = role_map.get(key, ("detail", None))
    role = slot.get("role") or default_role
    yaw = slot.get("yaw") if "yaw" in slot else default_yaw

    # Check file mtime for cache busting (?v=updatedAt)
    updated_at = slot.get("updatedAt") or rmeta.get("updatedAt")
    if not updated_at and clean_path.startswith("/"):
        fs_cand = os.path.join(ROOT_DIR, clean_path.lstrip("/").replace("/", os.sep))
        if not os.path.exists(fs_cand):
            fs_cand = os.path.join(ROOT_DIR, "public", clean_path.lstrip("/").replace("/", os.sep))
        if os.path.exists(fs_cand):
            try:
                updated_at = int(os.path.getmtime(fs_cand))
            except Exception:
                updated_at = None

    final_url = raw_url
    if clean_path and updated_at:
        final_url = f"{clean_path}?v={updated_at}"

    is_real_studio = (sku == "jt-saree-09" and key in ("front", "back_pallu", "pallu_detail", "fabric_macro", "blouse_border"))
    source = slot.get("source") or ("real" if is_real_studio else "ai")
    approved = bool(slot.get("approved", True))

    return {
        "id": slot.get("id") or f"{sku}-view-{ord_num:02d}",
        "order": ord_num,
        "key": key,
        "file": fname,
        "role": role,
        "yaw": yaw,
        "label": slot.get("label") or label,
        "url": final_url,
        "webpUrl": rmeta.get("webpUrl") or slot.get("webpUrl") or "",
        "srcset": rmeta.get("srcset") or slot.get("srcset") or "",
        "blurDataUrl": rmeta.get("blurDataUrl") or slot.get("blurDataUrl") or "",
        "source": source,
        "approved": approved,
        "updatedAt": updated_at or 0,
        "missingView": not bool(clean_path),
        "isSampleImage": False,
        "alt": slot.get("alt") or f"{p_name or 'Saree'} — {label} ({p_fabric}, {p_color})"
    }


FABRIC_STANDARDIZATION_MAP = {
    "Pure Kanchipuram Silk": "Kanchipuram Pure Silk",
    "Kanchipuram Tissue-Silk": "Kanchipuram Silk-Tissue",
    "Pure Kanchipuram Tissue": "Kanchipuram Silk-Tissue",
    "Chanderi Tissue Silk": "Chanderi Silk-Tissue",
    "Pure Organza Silk": "Organza Silk",
    "Sheer Organza Silk": "Organza Silk",
    "Organza Tissue Silk": "Tissue Organza",
    "Sheer Organza Tissue": "Tissue Organza",
    "Sheer Tissue Organza": "Tissue Organza",
    "Silk-Tissue Organza": "Tissue Organza",
    "Paithani Pure Silk": "Paithani Silk",
    "Gadwal Pure Silk": "Gadwal Silk",
    "Pure Mysore Crepe Silk": "Mysore Crepe Silk",
    "Banarasi Georgette Silk": "Banarasi Georgette",
    "Banarasi Organza Silk": "Banarasi Kora Organza",
    "Tussar Gicha Silk": "Tussar Ghicha Silk",
    "Shimmering Tissue-Silk": "Shimmer Tissue Silk",
    "Pure Shimmer Tissue": "Shimmer Tissue Silk",
    "Luminous Silk-Tissue": "Pure Silk-Tissue",
    "Bridal Silk-Tissue": "Pure Silk-Tissue",
    "Pure Metallic Tissue": "Pure Silk-Tissue",
    "Crushed Organza Tissue": "Crushed Tissue Silk",
    "Crushed Shimmer Tissue": "Crushed Tissue Silk",
    "Soft Linen-Silk": "Linen-Silk Blend",
    "Soft Mulberry Silk": "Pure Mulberry Silk",
    "Soft Mysore Silk": "Mysore Silk",
}


def normalize_fabric_label(fabric_str):
    clean = str(fabric_str or "").strip()
    return FABRIC_STANDARDIZATION_MAP.get(clean, clean)


def normalize_product(prod, idx=0):
    p = dict(prod)
    sku = (p.get("sku") or p.get("id") or f"jt-saree-{idx + 1:02d}").strip()
    p["id"] = p.get("id") or sku
    p["sku"] = sku
    p["fabric"] = normalize_fabric_label(p.get("fabric", ""))

    # Slug & Price normalization (Ground Rule #2: support Price on Request when price <= 0 or flagged)
    p["slug"] = p.get("slug") or re.sub(r"[^a-z0-9]+", "-", f"{sku}-{p.get('name', 'saree')}".lower()).strip("-")
    raw_price = p.get("price") if p.get("price") is not None else p.get("priceINR", 0)
    try:
        price = int(round(float(raw_price or 0)))
    except Exception:
        price = 0
    price_on_request = bool(p.get("priceOnRequest") or p.get("isSamplePrice") or price <= 0)
    if price_on_request:
        price = 0
    raw_mrp = p.get("mrp") if p.get("mrp") is not None else p.get("originalPriceINR", price)
    try:
        mrp = int(round(float(raw_mrp or price)))
    except Exception:
        mrp = price
    if price_on_request or mrp < price:
        mrp = price
    p["price"] = price
    p["priceINR"] = price
    p["mrp"] = mrp
    p["originalPriceINR"] = mrp
    p["priceOnRequest"] = price_on_request
    p["discountPercent"] = round(((mrp - price) / mrp) * 100) if (not price_on_request and mrp > price and mrp > 0) else 0

    # Stock & stock_status normalization
    raw_stock = p.get("stock") if p.get("stock") is not None else p.get("stockQty")
    if raw_stock is None:
        raw_stock = 0 if p.get("stockStatus") == "Out of Stock" else 20
    stock = max(0, int(raw_stock))
    p["stock"] = stock
    p["stockQty"] = stock
    if stock <= 0 or p.get("stockStatus") == "Out of Stock":
        p["stock"] = 0
        p["stockQty"] = 0
        p["stockStatus"] = "Out of Stock"
        p["stock_status"] = "out_of_stock"
    elif stock <= 10 or p.get("stockStatus") == "Low Stock":
        p["stockStatus"] = "Low Stock"
        p["stock_status"] = "low_stock"
    else:
        p["stockStatus"] = "In Stock"
        p["stock_status"] = "in_stock"

    # Booleans
    featured_default = sku in ("jt-saree-09", "jt-saree-01", "jt-saree-02", "jt-saree-06")
    bestseller_default = sku in ("jt-saree-03", "jt-saree-04", "jt-saree-05", "jt-saree-07")
    p["active"] = bool(p.get("active", True))
    p["featured"] = bool(p.get("featured", featured_default))
    p["bestseller"] = bool(p.get("bestseller", bestseller_default))
    p["isSamplePrice"] = False
    p["isSampleProduct"] = False

    # Text fields
    p["work_details"] = p.get("work_details") if p.get("work_details") is not None else (p.get("borderAndZari") or "")
    p["borderAndZari"] = p.get("borderAndZari") or p["work_details"]
    p["blouse_piece"] = p.get("blouse_piece") if p.get("blouse_piece") is not None else (p.get("blousePiece") or "")
    p["blousePiece"] = p.get("blousePiece") or p["blouse_piece"]
    p["care_instructions"] = p.get("care_instructions") or ""
    p["saree_length"] = p.get("saree_length") or p.get("sareeLength") or ""
    p["motifs"] = p.get("motifs") or ""

    # 5 Gallery views & images array (never duplicate front view into views 2-5)
    multi_view_folder_map = {
        "jt-saree-09": "jt-saree-09",
        "jt-saree-01": "jt-saree-01",
        "jt-saree-02": "jt-saree-02",
        "jt-saree-03": "jt-saree-03",
        "jt-saree-04": "jt-saree-04",
        "jt-saree-05": "jt-saree-05",
        "jt-saree-06": "jt-saree-06",
        "jt-saree-07": "jt-saree-07",
        "jt-saree-08": "jt-saree-08",
        "jt-saree-10": "jt-saree-10",
        "jt-saree-11": "jt-saree-11",
        "saree-009": "jt-saree-10",
        "saree-010": "jt-saree-11",
    }
    raw_gal = p.get("gallery") if isinstance(p.get("gallery"), list) else []
    raw_imgs = p.get("images") if isinstance(p.get("images"), list) else []
    mapped_folder = multi_view_folder_map.get(sku)

    if mapped_folder and os.path.exists(os.path.join(SAREES_IMAGES_DIR, mapped_folder, "2-back-pallu.jpg")):
        gal = []
        for v_idx, (ord_num, key, label, fname) in enumerate(REQUIRED_VIEWS):
            slot = raw_gal[v_idx] if v_idx < len(raw_gal) and isinstance(raw_gal[v_idx], dict) else None
            base_url = f"/public/images/sarees/{mapped_folder}/{fname}"
            if slot and slot.get("url"):
                clean_slot_u = str(slot.get("url")).split("?")[0]
                if slot.get("customOverride") or not clean_slot_u.startswith(f"/public/images/sarees/{mapped_folder}/"):
                    base_url = clean_slot_u
            gal.append(enrich_view_entry(sku, ord_num, key, label, fname, base_url, p.get("name", ""), p.get("fabric", ""), p.get("color", ""), slot))
        p["gallery"] = gal
        p["missingViews"] = []
    else:
        front_url = ""
        if len(raw_gal) > 0 and isinstance(raw_gal[0], dict) and raw_gal[0].get("url"):
            front_url = str(raw_gal[0]["url"]).strip()
        elif len(raw_imgs) > 0 and raw_imgs[0]:
            front_url = str(raw_imgs[0]).strip()
        elif p.get("image"):
            front_url = str(p["image"]).strip()
        clean_front = front_url.split("?")[0]

        gal = []
        missing_views = []
        for v_idx, (ord_num, key, label, fname) in enumerate(REQUIRED_VIEWS):
            slot = raw_gal[v_idx] if v_idx < len(raw_gal) and isinstance(raw_gal[v_idx], dict) else None
            raw_url = ""
            if slot is not None and "url" in slot:
                raw_url = str(slot.get("url") or "").strip()
            elif slot is None and v_idx < len(raw_imgs) and raw_imgs[v_idx]:
                raw_url = str(raw_imgs[v_idx]).strip()
            elif v_idx == 0 and front_url:
                raw_url = front_url

            clean_url = raw_url.split("?")[0]
            if v_idx > 0 and clean_url and clean_front and clean_url == clean_front:
                raw_url = ""

            # Check if generated 5-view file exists on disk for this SKU
            if not raw_url and os.path.exists(os.path.join(SAREES_IMAGES_DIR, sku, fname)):
                raw_url = f"/public/images/sarees/{sku}/{fname}"

            is_missing = not bool(raw_url)
            if is_missing and v_idx > 0:
                missing_views.append(fname)

            gal.append(enrich_view_entry(sku, ord_num, key, label, fname, raw_url, p.get("name", ""), p.get("fabric", ""), p.get("color", ""), slot))
        p["gallery"] = gal
        p["missingViews"] = missing_views

    # Build unified `views[]` array (full-body yaw frames + detail close-ups, never mixing detail shots into rotation ring)
    extra_views = p.get("extraYawViews") if isinstance(p.get("extraYawViews"), list) else []
    if sku == "jt-saree-09" and not extra_views:
        jt09_yaw_defs = [
            (6, "yaw_045", "45° Front-Right Angle (AI-Assisted Preview)", "yaw-045.jpg", "side", 45),
            (7, "yaw_090", "90° Right Profile (AI-Assisted Preview)", "yaw-090.jpg", "side", 90),
            (8, "yaw_135", "135° Back-Right Angle (AI-Assisted Preview)", "yaw-135.jpg", "side", 135),
            (9, "yaw_225", "225° Back-Left Angle (AI-Assisted Preview)", "yaw-225.jpg", "side2", 225),
            (10, "yaw_270", "270° Left Profile (AI-Assisted Preview)", "yaw-270.jpg", "side2", 270),
            (11, "yaw_315", "315° Front-Left Angle (AI-Assisted Preview)", "yaw-315.jpg", "side2", 315),
        ]
        overrides = p.get("viewApprovals") if isinstance(p.get("viewApprovals"), dict) else {}
        for ord_num, ykey, ylabel, yfname, yrole, yyaw in jt09_yaw_defs:
            disk_p = os.path.join(SAREES_IMAGES_DIR, "jt-saree-09", yfname)
            if os.path.exists(disk_p):
                vid = f"{sku}-yaw-{yyaw:03d}"
                is_app = bool(overrides.get(vid, True))
                extra_views.append(enrich_view_entry(
                    sku, ord_num, ykey, ylabel, yfname,
                    f"/public/images/sarees/jt-saree-09/{yfname}",
                    p.get("name", ""), p.get("fabric", ""), p.get("color", ""),
                    {"id": vid, "role": yrole, "yaw": yyaw, "source": "ai", "approved": is_app}
                ))
    views_list = list(p["gallery"])
    overrides = p.get("viewApprovals") if isinstance(p.get("viewApprovals"), dict) else {}
    for v_item in views_list:
        if isinstance(v_item, dict) and v_item.get("id") in overrides:
            v_item["approved"] = bool(overrides[v_item["id"]])
    for ev in extra_views:
        if isinstance(ev, dict) and ev.get("url"):
            if ev.get("id") in overrides:
                ev["approved"] = bool(overrides[ev["id"]])
            views_list.append(ev)
    p["views"] = views_list

    # Honest viewer mode calculation: only approved full-body views (front/side/back/side2) count toward 360 rotation
    full_body_views = [
        v for v in views_list
        if isinstance(v, dict)
        and v.get("role") in ("front", "side", "back", "side2")
        and v.get("url")
        and not v.get("missingView")
        and (v.get("source") == "real" or v.get("approved", True))
    ]
    full_body_views.sort(key=lambda x: (x.get("yaw") if x.get("yaw") is not None else 999))
    p["fullBodyViews"] = full_body_views
    p["detailViews"] = [v for v in views_list if isinstance(v, dict) and v.get("role") == "detail" and v.get("url") and not v.get("missingView")]
    p["fullBodyYawCount"] = len(full_body_views)
    p["viewerMode"] = "360_mode" if len(full_body_views) >= 8 else ("multi_angle_mode" if len(full_body_views) >= 4 else "product_views_mode")
    p["hasApprovedAiAngles"] = any(v.get("source") == "ai" and v.get("approved", True) for v in full_body_views)
    p["aiDisclosure"] = "AI-assisted angle preview — see original photos below" if p["hasApprovedAiAngles"] else "" 
    p["images"] = [g.get("url") for g in p["gallery"] if g and g.get("url")]
    p["image"] = p["images"][0] if p["images"] else ""
    p["blurDataUrl"] = (p["gallery"][0].get("blurDataUrl") if p.get("gallery") else "") or ""
    p["srcset"] = (p["gallery"][0].get("srcset") if p.get("gallery") else "") or ""
    return p


def init_db():
    with DB_LOCK:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS products (
                id TEXT PRIMARY KEY,
                sort_order INTEGER NOT NULL DEFAULT 0,
                data_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS orders (
                order_id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                status TEXT NOT NULL,
                total_inr INTEGER NOT NULL,
                data_json TEXT NOT NULL
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS wholesale_enquiries (
                enquiry_id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                status TEXT NOT NULL,
                data_json TEXT NOT NULL
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS contact_messages (
                message_id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                status TEXT NOT NULL,
                data_json TEXT NOT NULL
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                phone TEXT,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'customer',
                created_at TEXT NOT NULL
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS wishlists (
                user_id TEXT NOT NULL,
                product_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY (user_id, product_id)
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS admin_audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                admin_id TEXT,
                admin_email TEXT,
                action TEXT NOT NULL,
                target_type TEXT,
                target_id TEXT,
                ip_address TEXT,
                details_json TEXT
            )
        """)

        ts = now_iso()
        load_dotenv_if_present()
        admin_email = (os.environ.get("ADMIN_INITIAL_EMAIL") or "admin@janardhantextiles.com").strip().lower()
        admin_init_pw = (os.environ.get("ADMIN_INITIAL_PASSWORD") or "").strip()

        cur.execute("SELECT COUNT(*) AS cnt FROM users")
        if cur.fetchone()["cnt"] == 0:
            effective_admin_pw = admin_init_pw or secrets.token_urlsafe(16)
            if not admin_init_pw:
                print("[SECURITY NOTICE] ADMIN_INITIAL_PASSWORD not set in .env; generated ephemeral admin password for this session.")
            cur.execute(
                "INSERT INTO users (id, name, email, phone, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                ("usr-admin-01", "Lepakshi Weaves Admin", admin_email, "9652262173", hash_password(effective_admin_pw), "admin", ts)
            )
        else:
            # Upgrade any legacy unsalted SHA-256 hashes on existing admin account when ADMIN_INITIAL_PASSWORD is set
            cur.execute("SELECT id, email, password_hash, role FROM users")
            for urow in cur.fetchall():
                ph = urow["password_hash"] or ""
                if not ph.startswith("pbkdf2_sha256$"):
                    if urow["role"] == "admin" and admin_init_pw:
                        cur.execute(
                            "UPDATE users SET password_hash = ?, email = ? WHERE id = ?",
                            (hash_password(admin_init_pw), admin_email, urow["id"])
                        )
                    else:
                        # Lock legacy unsalted hash by wrapping with random unguessable PBKDF2 until reset
                        cur.execute(
                            "UPDATE users SET password_hash = ? WHERE id = ?",
                            (hash_password(secrets.token_urlsafe(24)), urow["id"])
                        )

        # Seed default sarees if products table is empty
        cur.execute("SELECT COUNT(*) AS cnt FROM products")
        if cur.fetchone()["cnt"] == 0:
            for idx, raw_p in enumerate(DEFAULT_INITIAL_PRODUCTS):
                norm_p = normalize_product(raw_p, idx)
                cur.execute(
                    "INSERT INTO products (id, sort_order, data_json, updated_at) VALUES (?, ?, ?, ?)",
                    (norm_p["id"], idx, json.dumps(norm_p), ts)
                )

        # Ensure Lepakshi Weaves contact email & clean social URLs (without ?obrf tracking) are stored
        cur.execute("SELECT value_json FROM settings WHERE key = 'site_settings'")
        row_s = cur.fetchone()
        if row_s:
            try:
                s_data = json.loads(row_s["value_json"])
            except Exception:
                s_data = {}
        else:
            s_data = {}
        if "contacts" not in s_data or not isinstance(s_data["contacts"], dict):
            s_data["contacts"] = {}
        s_data["contacts"]["emailAddress"] = "dasaridamu9418@gmail.com"
        s_data["contacts"].setdefault("whatsappLabel", "+91 96522 62173")
        s_data["contacts"].setdefault("whatsappRawNumber", "919652262173")
        s_data["contacts"].setdefault(
            "whatsappUrl",
            "https://wa.me/919652262173?text=Hi%20Lepakshi%20Weaves%2C%20I%E2%80%99d%20like%20to%20know%20more%20about%20your%20sarees."
        )
        s_data["contacts"].setdefault("instagramHandle", "@dasari_damu")
        # Clean tracking parameter ?obrf= from Instagram URL
        ig_url = s_data["contacts"].get("instagramUrl") or "https://www.instagram.com/dasari_damu"
        if "?obrf=" in ig_url:
            ig_url = ig_url.split("?obrf=")[0]
        s_data["contacts"]["instagramUrl"] = ig_url
        s_data["contacts"].setdefault("facebookUrl", "https://www.facebook.com/share/1AvqDY71mi/")
        s_data["contacts"].setdefault("pinterestUrl", "https://pin.it/2mS5N2kh4")
        raw_addr = str(s_data["contacts"].get("millAddress") or "")
        if any(tok in raw_addr for tok in ("Full street address", "GSTIN", "PLACEHOLDER", "Industrial Weaving Estate")):
            s_data["contacts"]["millAddress"] = ""
        cur.execute(
            "INSERT OR REPLACE INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)",
            ("site_settings", json.dumps(s_data), ts)
        )

        conn.commit()
        conn.close()


def save_data_uri_if_raster(data_uri, prefix="saree"):
    if not isinstance(data_uri, str):
        return data_uri
    match = re.match(r"^data:image/(png|jpeg|jpg|webp);base64,(.+)$", data_uri, re.IGNORECASE | re.DOTALL)
    if not match:
        return data_uri
    raw_b64 = match.group(2)
    try:
        binary = base64.b64decode(raw_b64)
        valid, real_ext, _, err_msg = validate_image_bytes(binary)
        if not valid:
            raise ValueError(err_msg)
        safe_prefix = re.sub(r"[^a-zA-Z0-9_-]", "-", str(prefix or "saree"))[:40]
        filename = f"{safe_prefix}-{uuid.uuid4().hex[:10]}.{real_ext}"
        # Save untouched original in assets/originals/uploads/ (Ground Rule #4)
        orig_filepath = os.path.join(ORIGINALS_UPLOADS_DIR, filename)
        with open(orig_filepath, "wb") as f:
            f.write(binary)
        filepath = os.path.join(UPLOADS_DIR, filename)
        with open(filepath, "wb") as f:
            f.write(binary)
        root_filepath = os.path.join(ROOT_UPLOADS_DIR, filename)
        with open(root_filepath, "wb") as f:
            f.write(binary)
        return f"/uploads/{filename}"
    except Exception:
        return ""



def fetch_all_products(include_inactive=True):
    with DB_LOCK:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT sort_order, data_json FROM products ORDER BY sort_order ASC, id ASC")
        rows = cur.fetchall()
        conn.close()
    items = []
    for idx, r in enumerate(rows):
        p = normalize_product(json.loads(r["data_json"]), idx)
        if include_inactive or p.get("active", True):
            items.append(p)
    return items


def get_catalogue_filter_options():
    products = fetch_all_products(include_inactive=False)
    fabrics = []
    colors = []
    occasions = []
    prices = []
    for p in products:
        if p.get("fabric") and p["fabric"] not in fabrics:
            fabrics.append(p["fabric"])
        if p.get("color") and p["color"] not in colors:
            colors.append(p["color"])
        if p.get("occasion") and p["occasion"] not in occasions:
            occasions.append(p["occasion"])
        if p.get("price", 0) > 0:
            prices.append(int(p["price"]))
    for extra_col in EXTRA_REFERENCE_COLOURS:
        if extra_col not in colors:
            colors.append(extra_col)
    return {
        "fabrics": fabrics,
        "colors": colors,
        "occasions": occasions,
        "prices": prices,
    }


def call_gemini_nano_banana_image(prompt_text, ref_image_path=None, api_key=None):
    """Calls Gemini Nano Banana image-generation API on the server using the server-side API key."""
    key = (api_key or get_nano_banana_api_key()).strip()
    if not key:
        return None, "GEMINI_API_KEY is not configured in server environment (.env)."

    parts = [{"text": prompt_text}]
    if ref_image_path and os.path.exists(ref_image_path):
        try:
            with open(ref_image_path, "rb") as rf:
                b64_img = base64.b64encode(rf.read()).decode("ascii")
            parts.append({
                "inlineData": {
                    "mimeType": "image/jpeg",
                    "data": b64_img
                }
            })
        except Exception:
            pass

    models = ["gemini-2.5-flash-image", "gemini-2.0-flash-exp-image-generation"]
    last_err = "No image bytes returned from Gemini Nano Banana API."
    for model_name in models:
        endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={urllib.parse.quote(key)}"
        payload = {
            "contents": [{"parts": parts}],
            "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]}
        }
        req = urllib.request.Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=45) as resp:
                resp_data = json.loads(resp.read().decode("utf-8"))
            candidates = resp_data.get("candidates") or []
            for cand in candidates:
                c_parts = (cand.get("content") or {}).get("parts") or []
                for cp in c_parts:
                    inline = cp.get("inlineData") or cp.get("inline_data")
                    if inline and inline.get("data"):
                        return base64.b64decode(inline["data"]), None
        except urllib.error.HTTPError as he:
            try:
                err_body = json.loads(he.read().decode("utf-8", errors="ignore"))
                last_err = (err_body.get("error") or {}).get("message") or f"HTTP {he.code}"
            except Exception:
                last_err = f"HTTP {he.code}"
        except Exception as ex:
            last_err = str(ex)

    return None, last_err


def resolve_reference_source_dir_for_colour(color_name):
    c_lower = (color_name or "").strip().lower()
    if c_lower in STUDIO_COLOUR_REFERENCE_MAP:
        cand_sku = STUDIO_COLOUR_REFERENCE_MAP[c_lower]
        cand_dir = os.path.join(SAREES_IMAGES_DIR, cand_sku)
        if os.path.exists(os.path.join(cand_dir, "1-front.jpg")):
            return cand_sku, cand_dir

    # Keyword match fallback across STUDIO_COLOUR_REFERENCE_MAP
    for key_col, cand_sku in STUDIO_COLOUR_REFERENCE_MAP.items():
        if key_col in c_lower or c_lower in key_col:
            cand_dir = os.path.join(SAREES_IMAGES_DIR, cand_sku)
            if os.path.exists(os.path.join(cand_dir, "1-front.jpg")):
                return cand_sku, cand_dir

    # Default to jt-saree-10 (Royal Rose & Gold) or jt-saree-09
    for fallback_sku in ("jt-saree-10", "jt-saree-11", "jt-saree-09"):
        cand_dir = os.path.join(SAREES_IMAGES_DIR, fallback_sku)
        if os.path.exists(os.path.join(cand_dir, "1-front.jpg")):
            return fallback_sku, cand_dir
    return None, None


def fetch_bootstrap_payload(include_private=False):
    persistence = get_db_persistence_info()
    with DB_LOCK:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("SELECT value_json FROM settings WHERE key = 'site_settings'")
        row_settings = cur.fetchone()
        settings = json.loads(row_settings["value_json"]) if row_settings else {}
        if not isinstance(settings, dict):
            settings = {}
        if "contacts" not in settings or not isinstance(settings["contacts"], dict):
            settings["contacts"] = {}
        settings["contacts"]["emailAddress"] = "dasaridamu9418@gmail.com"
        if "?obrf=" in str(settings["contacts"].get("instagramUrl", "")):
            settings["contacts"]["instagramUrl"] = settings["contacts"]["instagramUrl"].split("?obrf=")[0]
        raw_addr = str(settings["contacts"].get("millAddress") or "")
        if any(tok in raw_addr for tok in ("Full street address", "GSTIN", "PLACEHOLDER", "Industrial Weaving Estate")):
            settings["contacts"]["millAddress"] = ""

        cur.execute("SELECT sort_order, data_json FROM products ORDER BY sort_order ASC, id ASC")
        all_prods = [normalize_product(json.loads(r["data_json"]), idx) for idx, r in enumerate(cur.fetchall())]
        products = all_prods if include_private else [p for p in all_prods if p.get("active", True)]

        if include_private:
            cur.execute("SELECT data_json FROM orders ORDER BY created_at DESC")
            orders = [json.loads(r["data_json"]) for r in cur.fetchall()]

            cur.execute("SELECT data_json FROM wholesale_enquiries ORDER BY created_at DESC")
            wholesale = [json.loads(r["data_json"]) for r in cur.fetchall()]

            cur.execute("SELECT data_json FROM contact_messages ORDER BY created_at DESC")
            contacts = [json.loads(r["data_json"]) for r in cur.fetchall()]
        else:
            orders = []
            wholesale = []
            contacts = []

        conn.close()

    rzp_ready = bool(os.environ.get("RAZORPAY_KEY_ID") and os.environ.get("RAZORPAY_KEY_SECRET"))
    return {
        "ok": True,
        "seeded": bool(len(products) > 0),
        "dbStatus": persistence["statusText"],
        "persistence": persistence,
        "paymentConfig": {
            "codEnabled": True,
            "razorpayConfigured": rzp_ready,
            "onlinePaymentNotice": (
                "Razorpay Online Payment Active"
                if rzp_ready
                else "Online payment coming soon — Cash on Delivery (COD) and WhatsApp Order are available now."
            )
        },
        "settings": settings,
        "products": products,
        "orders": orders,
        "wholesaleEnquiries": wholesale,
        "contactMessages": contacts
    }


class JanardanBackendHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".mjs": "application/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".webp": "image/webp",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".mp4": "video/mp4",
        ".webm": "video/webm",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

    def _get_client_ip(self):
        xff = self.headers.get("X-Forwarded-For") or ""
        if xff:
            return xff.split(",")[0].strip()
        return self.client_address[0] if self.client_address else "127.0.0.1"

    def translate_path(self, path):
        parsed_path = urllib.parse.urlparse(path).path
        # Prevent access to sensitive dotfiles, .env, .db, or server scripts via static file handler
        lower_p = parsed_path.lower()
        if any(lower_p.startswith(p) for p in ("/.env", "/.git", "/janardan_textiles.db", "/server.py", "/backups", "/private_uploads", "/ops_dashboard.py", "/scripts", "/assets/originals")):
            return os.path.join(ROOT_DIR, "__forbidden_nonexistent__")
        if parsed_path.startswith("/uploads/"):
            fname = os.path.basename(parsed_path[len("/uploads/"):].lstrip("/"))
            cand1 = os.path.join(ROOT_UPLOADS_DIR, fname)
            if os.path.exists(cand1):
                return cand1
            cand2 = os.path.join(UPLOADS_DIR, fname)
            if os.path.exists(cand2):
                return cand2
        resolved = super().translate_path(path)
        if not os.path.exists(resolved):
            clean_rel = parsed_path.lstrip("/")
            public_candidate = os.path.join(ROOT_DIR, "public", clean_rel.replace("/", os.sep))
            if os.path.exists(public_candidate):
                return public_candidate
        return resolved

    def log_message(self, format, *args):
        pass

    def end_headers(self):
        origin = (self.headers.get("Origin") or "").strip()
        allowed_raw = os.environ.get(
            "ALLOWED_ORIGINS",
            "http://localhost:8080,http://127.0.0.1:8080,http://localhost:4000,http://127.0.0.1:4000,https://janardhan-textiles-storefront.vercel.app"
        )
        allowed_set = {o.strip() for o in allowed_raw.split(",") if o.strip()}
        if origin and (origin in allowed_set or origin.startswith("http://localhost:") or origin.startswith("http://127.0.0.1:") or origin.endswith(".vercel.app")):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        else:
            self.send_header("Access-Control-Allow-Origin", "http://127.0.0.1:8080")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self' https: data: blob:; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://checkout.razorpay.com; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com data:; "
            "img-src 'self' data: blob: https: http://localhost:4000 http://localhost:8080 http://127.0.0.1:8080; "
            "connect-src 'self' https: http://localhost:4000 http://localhost:8080 http://127.0.0.1:4000 http://127.0.0.1:8080; "
            "frame-ancestors 'none';"
        )
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def _send_json(self, status_code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8", errors="replace")
        return json.loads(raw) if raw else {}

    def _get_current_user(self):
        auth = self.headers.get("Authorization") or ""
        if not auth.lower().startswith("bearer "):
            return None
        token = auth[7:].strip()
        if not token:
            return None
        with DB_LOCK:
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute("""
                SELECT u.id, u.name, u.email, u.phone, u.role, u.created_at
                FROM sessions s
                JOIN users u ON u.id = s.user_id
                WHERE s.token = ?
            """, (token,))
            row = cur.fetchone()
            conn.close()
        if not row:
            return None
        return {
            "id": row["id"],
            "name": row["name"],
            "email": row["email"],
            "phone": row["phone"] or "",
            "role": row["role"],
            "created_at": row["created_at"]
        }

    def _require_auth(self):
        user = self._get_current_user()
        if not user:
            self._send_json(401, {"ok": False, "error": "Authentication required. Please log in."})
            return None
        return user

    def _require_admin(self):
        user = self._get_current_user()
        if not user:
            self._send_json(401, {"ok": False, "error": "Authentication required. Please log in as admin."})
            return None
        if user.get("role") != "admin":
            self._send_json(403, {"ok": False, "error": "Admin privileges required."})
            return None
        return user

    def _route_ops(self, method):
        """Operations dashboard (orders / allocation / Excel uploads) lives in ops_dashboard.py."""
        parsed = urllib.parse.urlparse(self.path)
        if not parsed.path.startswith("/api/ops/"):
            return False
        if method != "GET" and not check_rate_limit(self._get_client_ip(), "ops_write", max_requests=120, window_seconds=60):
            self._send_json(429, {"ok": False, "error": "Too many requests. Please wait a minute."})
            return True
        try:
            ops_dashboard.handle(self, method, parsed.path, urllib.parse.parse_qs(parsed.query), {
                "get_conn": get_db_connection,
                "db_lock": DB_LOCK,
                "audit": record_audit_log,
                "hash_password": hash_password,
            })
        except Exception:
            self._send_json(500, {"ok": False, "error": "Operations dashboard error. Please try again."})
        return True

    # =========================================================================
    # GET ENDPOINTS
    # =========================================================================
    def do_GET(self):
        if self._route_ops("GET"):
            return
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        qs = urllib.parse.parse_qs(parsed.query)

        # /favicon.ico is now a real file (LEPAKSHI WEAVES rose emblem) served by the static handler.
        if path == "/favicon.ico":
            self.extensions_map[".ico"] = "image/x-icon"

        if path == "/robots.txt":
            robots_body = (
                "User-agent: *\n"
                "Allow: /\n"
                "Disallow: /api/admin/\n"
                "Disallow: /backups/\n"
                "Sitemap: https://janardhan-textiles-storefront.vercel.app/sitemap.xml\n"
            ).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(robots_body)))
            self.end_headers()
            self.wfile.write(robots_body)
            return

        if path == "/sitemap.xml":
            prods = fetch_all_products(include_inactive=False)
            base_loc = "https://janardhan-textiles-storefront.vercel.app"
            entries = [
                f"  <url><loc>{base_loc}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>",
                f"  <url><loc>{base_loc}/#shop</loc><changefreq>daily</changefreq><priority>0.9</priority></url>",
                f"  <url><loc>{base_loc}/#wholesale</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>",
            ]
            for p in prods:
                pid = p.get("id") or p.get("sku")
                entries.append(f"  <url><loc>{base_loc}/?product={pid}#product/{pid}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>")
            xml_bytes = (
                '<?xml version="1.0" encoding="UTF-8"?>\n'
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                + "\n".join(entries)
                + "\n</urlset>\n"
            ).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/xml; charset=utf-8")
            self.send_header("Content-Length", str(len(xml_bytes)))
            self.end_headers()
            self.wfile.write(xml_bytes)
            return

        if path == "/api/health":
            persistence = get_db_persistence_info()
            products = fetch_all_products(include_inactive=False)
            return self._send_json(200, {
                "ok": True,
                "database": persistence["mode"],
                "persistent": persistence["persistent"],
                "statusText": persistence["statusText"],
                "dbFile": os.path.basename(DB_PATH),
                "seeded": len(products) > 0,
                "counts": {
                    "products": len(products)
                }
            })

        if path == "/api/bootstrap":
            user = self._get_current_user()
            is_admin = bool(user and user.get("role") == "admin")
            return self._send_json(200, fetch_bootstrap_payload(include_private=is_admin))

        # GET /api/filters -> {fabrics, colors, occasions, price:{min,max}, shipping:{flat,free_above}}
        if path == "/api/filters":
            opts = get_catalogue_filter_options()
            prices = opts["prices"]
            return self._send_json(200, {
                "fabrics": opts["fabrics"],
                "colors": opts["colors"],
                "occasions": opts["occasions"],
                "price": {
                    "min": min(prices) if prices else 1200,
                    "max": max(prices) if prices else 7500
                },
                "shipping": {
                    "flat": 0,
                    "free_above": 0
                }
            })

        # GET /api/sarees/generate/status -> Server-side Nano Banana configuration & storage status
        if path == "/api/sarees/generate/status":
            opts = get_catalogue_filter_options()
            api_key = get_nano_banana_api_key()
            storage_ok = os.path.isdir(SAREES_IMAGES_DIR) and os.path.isdir(ROOT_UPLOADS_DIR) and os.path.exists(DB_PATH)
            return self._send_json(200, {
                "ok": True,
                "apiKeyConfigured": bool(api_key),
                "apiKeyEnvVar": "GEMINI_API_KEY",
                "model": "gemini-2.5-flash-image (Nano Banana)",
                "storageConfigured": storage_ok,
                "databaseFile": "janardan_textiles.db",
                "imagesDirectory": "/public/images/sarees/<sku>/",
                "uploadsDirectory": "/uploads/",
                "referencePhotos": "C:\\Users\\91965\\Downloads\\1\\1 (1.jpg - 5.jpg) & /public/images/sarees/jt-saree-01..11",
                "availableColors": opts["colors"],
                "availableFabrics": opts["fabrics"],
                "availableOccasions": opts["occasions"],
                "setupInstructions": (
                    "Server-side Nano Banana integration is active. To enable live on-demand Gemini API calls, "
                    "set GEMINI_API_KEY=your_api_key in .env or environment variables before starting server.py. "
                    "The API key is kept strictly on the server and never exposed in browser code."
                )
            })


        # GET /api/products (Search, Multi-value filters, Sort, Pagination)
        if path == "/api/products":
            all_items = fetch_all_products(include_inactive=False)
            q = (qs.get("q", [""])[0] or "").strip().lower()
            fabric_param = (qs.get("fabric", [""])[0] or "").strip()
            color_param = (qs.get("color", [""])[0] or "").strip()
            occasion_param = (qs.get("occasion", [""])[0] or "").strip()
            min_price_str = (qs.get("minPrice", [""])[0] or "").strip()
            max_price_str = (qs.get("maxPrice", [""])[0] or "").strip()
            availability = (qs.get("availability", [""])[0] or "").strip().lower()
            sort_by = (qs.get("sort", [""])[0] or "").strip().lower()
            featured = (qs.get("featured", [""])[0] or "").strip()
            bestseller = (qs.get("bestseller", [""])[0] or "").strip()

            fabrics_filter = [x.strip().lower() for x in fabric_param.split(",") if x.strip() and x.strip().upper() != "ALL"]
            colors_filter = [x.strip().lower() for x in color_param.split(",") if x.strip() and x.strip().upper() != "ALL"]
            occasions_filter = [x.strip().lower() for x in occasion_param.split(",") if x.strip() and x.strip().upper() != "ALL"]
            min_price = float(min_price_str) if min_price_str else None
            max_price = float(max_price_str) if max_price_str else None

            filtered = []
            for p in all_items:
                if q:
                    haystack = " ".join([
                        str(p.get("name", "")),
                        str(p.get("sku", "")),
                        str(p.get("fabric", "")),
                        str(p.get("color", "")),
                        str(p.get("occasion", "")),
                        str(p.get("description", "")),
                        str(p.get("work_details", ""))
                    ]).lower()
                    if q not in haystack:
                        continue
                if fabrics_filter and str(p.get("fabric", "")).lower() not in fabrics_filter:
                    continue
                if colors_filter and str(p.get("color", "")).lower() not in colors_filter:
                    continue
                if occasions_filter and str(p.get("occasion", "")).lower() not in occasions_filter:
                    continue
                if min_price is not None and p.get("price", 0) < min_price:
                    continue
                if max_price is not None and p.get("price", 0) > max_price:
                    continue
                if availability in ("in_stock", "available"):
                    if p.get("stock_status") == "out_of_stock" or p.get("stock", 0) <= 0:
                        continue
                elif availability == "out_of_stock":
                    if p.get("stock_status") != "out_of_stock" and p.get("stock", 0) > 0:
                        continue
                if featured == "1" and not p.get("featured"):
                    continue
                if bestseller == "1" and not p.get("bestseller"):
                    continue
                filtered.append(p)

            if sort_by in ("price_asc", "price-asc"):
                filtered.sort(key=lambda x: x.get("price", 0))
            elif sort_by in ("price_desc", "price-desc"):
                filtered.sort(key=lambda x: x.get("price", 0), reverse=True)
            elif sort_by in ("name", "name-asc"):
                filtered.sort(key=lambda x: str(x.get("name", "")).lower())
            elif sort_by == "newest":
                filtered.sort(key=lambda x: str(x.get("created_at") or ""), reverse=True)

            page = max(1, int(qs.get("page", ["1"])[0] or 1))
            limit = max(1, min(100, int(qs.get("limit", ["24"])[0] or 24)))
            total = len(filtered)
            pages = max(1, (total + limit - 1) // limit)
            start = (page - 1) * limit
            paged_items = filtered[start:start + limit]

            return self._send_json(200, {
                "total": total,
                "page": page,
                "limit": limit,
                "pages": pages,
                "items": paged_items
            })

        # GET /api/products/:id
        m_prod = re.match(r"^/api/products/([^/]+)$", path)
        if m_prod:
            pid = urllib.parse.unquote(m_prod.group(1))
            all_items = fetch_all_products(include_inactive=True)
            for p in all_items:
                if p["id"] == pid or p["sku"] == pid:
                    return self._send_json(200, p)
            return self._send_json(404, {"ok": False, "error": "Product not found"})

        # GET /api/me
        if path == "/api/me":
            user = self._require_auth()
            if not user:
                return
            return self._send_json(200, {"ok": True, "user": user})

        # GET /api/wishlist
        if path == "/api/wishlist":
            user = self._require_auth()
            if not user:
                return
            with DB_LOCK:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute("SELECT product_id FROM wishlists WHERE user_id = ? ORDER BY created_at DESC", (user["id"],))
                pids = [r["product_id"] for r in cur.fetchall()]
                conn.close()
            all_map = {p["id"]: p for p in fetch_all_products(include_inactive=False)}
            items = [all_map[pid] for pid in pids if pid in all_map]
            return self._send_json(200, {"ok": True, "productIds": pids, "items": items})

        # GET /api/orders/mine (Requires Authentication — never leaks other customers' orders)
        if path == "/api/orders/mine":
            user = self._require_auth()
            if not user:
                return
            with DB_LOCK:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute("SELECT data_json FROM orders ORDER BY created_at DESC")
                all_orders = [json.loads(r["data_json"]) for r in cur.fetchall()]
                conn.close()
            if user.get("role") == "admin":
                mine = all_orders
            else:
                u_email = (user.get("email") or "").strip().lower()
                u_phone = re.sub(r"\D", "", user.get("phone") or "")
                mine = []
                for o in all_orders:
                    o_uid = o.get("user_id")
                    o_email = (o.get("user_email") or "").strip().lower()
                    o_phone = re.sub(r"\D", "", o.get("phone") or (o.get("address") or {}).get("phone") or "")
                    if (
                        (o_uid and o_uid == user["id"])
                        or (u_email and o_email and o_email == u_email)
                        or (u_phone and len(u_phone) >= 10 and o_phone.endswith(u_phone[-10:]))
                    ):
                        mine.append(o)
            return self._send_json(200, {"ok": True, "orders": mine, "items": mine})

        # GET /api/orders/:orderNumber
        m_ord_get = re.match(r"^/api/orders/([^/]+)$", path)
        if m_ord_get:
            ord_num = urllib.parse.unquote(m_ord_get.group(1))
            with DB_LOCK:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute("SELECT data_json FROM orders WHERE order_id = ?", (ord_num,))
                row = cur.fetchone()
                conn.close()
            if not row:
                return self._send_json(404, {"ok": False, "error": "Order not found"})
            odata = json.loads(row["data_json"])
            user = self._get_current_user()
            phone_param = re.sub(r"\D", "", (qs.get("phone", [""])[0] or ""))
            order_phone = re.sub(r"\D", "", odata.get("phone") or (odata.get("address") or {}).get("phone") or "")
            is_owner = False
            if user:
                if user.get("role") == "admin" or odata.get("user_id") == user["id"]:
                    is_owner = True
                elif user.get("email") and (odata.get("user_email") or "").lower() == user["email"].lower():
                    is_owner = True
            if phone_param and len(phone_param) >= 4 and order_phone.endswith(phone_param):
                is_owner = True
            if not is_owner:
                # Return redacted order status summary only (no street address or phone PII)
                return self._send_json(200, {
                    "order_number": odata.get("order_number") or odata.get("orderId"),
                    "orderId": odata.get("orderId") or odata.get("order_number"),
                    "status": odata.get("status"),
                    "payment_method": odata.get("payment_method"),
                    "payment_status": odata.get("payment_status"),
                    "total": odata.get("total"),
                    "totalINR": odata.get("totalINR"),
                    "date": odata.get("date"),
                    "created_at": odata.get("created_at"),
                    "items": odata.get("items", [])
                })
            return self._send_json(200, odata)

        # =====================================================================
        # ADMIN GET ENDPOINTS (/api/admin/*)
        # =====================================================================
        if path == "/api/admin/stats":
            admin = self._require_admin()
            if not admin:
                return
            products = fetch_all_products(include_inactive=True)
            with DB_LOCK:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute("SELECT COUNT(*) AS cnt FROM users WHERE role = 'customer'")
                customer_count = cur.fetchone()["cnt"]
                cur.execute("SELECT data_json FROM orders ORDER BY created_at DESC")
                orders = [json.loads(r["data_json"]) for r in cur.fetchall()]
                conn.close()

            guest_phones = {
                str(o.get("phone") or (o.get("address") or {}).get("phone") or "").strip()
                for o in orders
                if not o.get("user_id") or o.get("user_id") == "guest"
            }
            guest_phones.discard("")
            total_customers = customer_count + len(guest_phones)

            total_products = len(products)
            out_of_stock = sum(1 for p in products if p.get("stock", 0) <= 0 or p.get("stock_status") == "out_of_stock")
            low_stock_list = [
                {"id": p["id"], "sku": p["sku"], "name": p["name"], "fabric": p.get("fabric", ""), "stock": p["stock"], "price": p["price"], "image": p.get("image", "")}
                for p in products if 0 <= p.get("stock", 0) <= 10
            ]
            total_orders = len(orders)
            orders_to_process = sum(
                1 for o in orders
                if str(o.get("status", "")).lower() in ("placed", "confirmed", "packed", "demo order received", "processing (demo)")
            )
            revenue = sum(
                int(o.get("total", o.get("totalINR", 0)))
                for o in orders
                if str(o.get("status", "")).lower() not in ("cancelled", "cancelled (demo)")
            )

            # Compute real top-selling products from placed orders
            sold_counts = {}
            for o in orders:
                if str(o.get("status", "")).lower() in ("cancelled", "cancelled (demo)"):
                    continue
                for it in o.get("items", []):
                    pid = it.get("product_id") or it.get("productId") or it.get("id")
                    qty = int(it.get("quantity") or it.get("qty") or 1)
                    if pid:
                        sold_counts[pid] = sold_counts.get(pid, 0) + qty

            prod_map = {p["id"]: p for p in products}
            top_selling = []
            for pid, units in sorted(sold_counts.items(), key=lambda x: x[1], reverse=True)[:5]:
                p = prod_map.get(pid)
                if p:
                    top_selling.append({
                        "id": p["id"],
                        "sku": p["sku"],
                        "name": p["name"],
                        "fabric": p["fabric"],
                        "price": p["price"],
                        "units_sold": units,
                        "revenue": units * p["price"],
                        "image": p.get("image", "")
                    })

            return self._send_json(200, {
                "total_products": total_products,
                "products_total": total_products,
                "out_of_stock": out_of_stock,
                "customers": total_customers,
                "orders": total_orders,
                "orders_total": total_orders,
                "orders_to_process": orders_to_process,
                "revenue": revenue,
                "revenue_total": revenue,
                "low_stock": low_stock_list,
                "low_stock_products": low_stock_list,
                "top_selling": top_selling,
                "top_selling_products": top_selling,
                "recent_orders": orders[:10]
            })

        if path == "/api/admin/products/template.csv":
            csv_body = (
                "sku,name,fabric,color,occasion,price,mrp,price_on_request,stock,description,work_details,blouse_piece,care_instructions\n"
                'jt-bulk-01,"Kanak Gold Tissue Saree","Champagne Tissue","Champagne Gold","Wedding & Reception",6200,6200,false,18,"Luminous gold tissue saree","Scalloped zari floral border","Matching tissue blouse","Dry clean only"\n'
                'jt-bulk-02,"Meera Heritage Brocade Saree","Woven Brocade","Royal Rose & Gold","Bridal & Muhurtham",0,0,true,12,"Bespoke bridal brocade weave","Zardozi peacock border","Embroidered silk blouse","Dry clean only"\n'
            ).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/csv; charset=utf-8")
            self.send_header("Content-Disposition", 'attachment; filename="janardhan-textiles-bulk-template.csv"')
            self.send_header("Content-Length", str(len(csv_body)))
            self.end_headers()
            self.wfile.write(csv_body)
            return

        if path == "/api/admin/products":
            admin = self._require_admin()
            if not admin:
                return
            all_items = fetch_all_products(include_inactive=True)
            q = (qs.get("q", [""])[0] or "").strip().lower()
            fabric = (qs.get("fabric", [""])[0] or "").strip().lower()
            color = (qs.get("color", [""])[0] or "").strip().lower()
            status_filter = (qs.get("status", [""])[0] or "").strip().lower()

            filtered = []
            for p in all_items:
                if q and q not in f"{p.get('sku','')} {p.get('name','')} {p.get('fabric','')} {p.get('color','')}".lower():
                    continue
                if fabric and fabric != "all" and p.get("fabric", "").lower() != fabric:
                    continue
                if color and color != "all" and p.get("color", "").lower() != color:
                    continue
                if status_filter == "active" and not p.get("active", True):
                    continue
                if status_filter == "inactive" and p.get("active", True):
                    continue
                if status_filter == "out_of_stock" and p.get("stock", 0) > 0:
                    continue
                if status_filter == "low_stock" and not (0 < p.get("stock", 0) <= 10):
                    continue
                filtered.append(p)

            page = max(1, int(qs.get("page", ["1"])[0] or 1))
            limit = max(1, min(100, int(qs.get("limit", ["20"])[0] or 20)))
            total = len(filtered)
            pages = max(1, (total + limit - 1) // limit)
            start = (page - 1) * limit
            return self._send_json(200, {
                "total": total,
                "page": page,
                "limit": limit,
                "pages": pages,
                "items": filtered[start:start + limit]
            })

        if path == "/api/admin/orders":
            admin = self._require_admin()
            if not admin:
                return
            status_f = (qs.get("status", [""])[0] or "").strip().lower()
            q = (qs.get("q", [""])[0] or "").strip().lower()
            with DB_LOCK:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute("SELECT data_json FROM orders ORDER BY created_at DESC")
                orders = [json.loads(r["data_json"]) for r in cur.fetchall()]
                conn.close()

            filtered = []
            for o in orders:
                st = str(o.get("status", "")).lower()
                if status_f and status_f != "all" and st != status_f:
                    continue
                if q:
                    hay = f"{o.get('order_number','')} {o.get('orderId','')} {o.get('customerName','')} {o.get('phone','')} {o.get('city','')}".lower()
                    if q not in hay:
                        continue
                filtered.append(o)
            return self._send_json(200, {"total": len(filtered), "items": filtered, "orders": filtered})

        if path == "/api/admin/customers":
            admin = self._require_admin()
            if not admin:
                return
            with DB_LOCK:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute("SELECT id, name, email, phone, role, created_at FROM users ORDER BY created_at DESC")
                users = [dict(r) for r in cur.fetchall()]
                cur.execute("SELECT data_json FROM orders ORDER BY created_at DESC")
                orders = [json.loads(r["data_json"]) for r in cur.fetchall()]
                conn.close()

            matched_order_ids = set()
            for u in users:
                u_orders = [
                    o for o in orders
                    if o.get("user_id") == u["id"]
                    or (u.get("email") and o.get("user_email") == u["email"])
                    or (u.get("phone") and (o.get("phone") == u["phone"] or (o.get("address") or {}).get("phone") == u["phone"]))
                ]
                for o in u_orders:
                    matched_order_ids.add(o.get("order_number") or o.get("orderId"))
                valid_u_orders = [o for o in u_orders if str(o.get("status", "")).lower() not in ("cancelled", "cancelled (demo)")]
                u["orders_count"] = len(valid_u_orders)
                u["total_spent"] = sum(int(o.get("total", o.get("totalINR", 0))) for o in valid_u_orders)

            # Include checkout/guest customers who placed orders without a registered user account
            guest_by_key = {}
            for o in orders:
                oid = o.get("order_number") or o.get("orderId")
                if oid in matched_order_ids:
                    continue
                addr = o.get("address") or {}
                c_name = (addr.get("name") or o.get("customerName") or "Guest Customer").strip()
                c_phone = (addr.get("phone") or o.get("phone") or "—").strip()
                c_city = (addr.get("city") or o.get("city") or "").strip()
                key = c_phone if c_phone and c_phone != "—" else c_name.lower()
                if key not in guest_by_key:
                    guest_by_key[key] = {
                        "id": f"cust-ord-{len(guest_by_key) + 1}",
                        "name": c_name,
                        "email": f"Checkout Customer ({c_city})" if c_city else "Checkout Customer",
                        "phone": c_phone,
                        "role": "customer",
                        "orders_count": 0,
                        "total_spent": 0,
                        "created_at": o.get("created_at") or o.get("date") or ""
                    }
                if str(o.get("status", "")).lower() not in ("cancelled", "cancelled (demo)"):
                    guest_by_key[key]["orders_count"] += 1
                    guest_by_key[key]["total_spent"] += int(o.get("total", o.get("totalINR", 0)))

            combined_customers = list(guest_by_key.values()) + users
            return self._send_json(200, {"total": len(combined_customers), "items": combined_customers, "customers": combined_customers})

        if path == "/api/admin/review-frames":
            admin = self._require_admin()
            if not admin:
                return
            with DB_LOCK:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute("SELECT data_json FROM products ORDER BY sort_order ASC")
                prods = [normalize_product(json.loads(r["data_json"]), i) for i, r in enumerate(cur.fetchall())]
                conn.close()
            items = []
            for p in prods:
                ai_views = [v for v in p.get("views", []) if v.get("source") == "ai" and v.get("url")]
                real_views = [v for v in p.get("views", []) if v.get("source") == "real" and v.get("url")]
                if ai_views or p.get("id") == "jt-saree-09":
                    items.append({
                        "id": p["id"],
                        "sku": p["sku"],
                        "name": p["name"],
                        "fabric": p.get("fabric", ""),
                        "color": p.get("color", ""),
                        "viewerMode": p.get("viewerMode", "product_views_mode"),
                        "fullBodyYawCount": p.get("fullBodyYawCount", 0),
                        "hasApprovedAiAngles": p.get("hasApprovedAiAngles", False),
                        "aiDisclosure": p.get("aiDisclosure", ""),
                        "realViews": real_views,
                        "aiViews": ai_views,
                        "views": p.get("views", [])
                    })
            return self._send_json(200, {"ok": True, "items": items})

        if path == "/api/admin/audit-log":
            admin = self._require_admin()
            if not admin:
                return
            limit = max(1, min(500, int(qs.get("limit", ["100"])[0] or 100)))
            with DB_LOCK:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute(
                    "SELECT id, timestamp, admin_id, admin_email, action, target_type, target_id, ip_address, details_json "
                    "FROM admin_audit_log ORDER BY id DESC LIMIT ?",
                    (limit,)
                )
                rows = [dict(r) for r in cur.fetchall()]
                conn.close()
            for r in rows:
                try:
                    r["details"] = json.loads(r.get("details_json") or "{}")
                except Exception:
                    r["details"] = {}
            return self._send_json(200, {"ok": True, "total": len(rows), "items": rows})

        if path == "/api/admin/docs":
            admin = self._require_admin()
            if not admin:
                return
            persistence = get_db_persistence_info()
            return self._send_json(200, {
                "ok": True,
                "title": "Lepakshi Weaves — Owner Handover & Operations Guide",
                "persistence": persistence,
                "sections": [
                    {
                        "heading": "1. Environment Variables & Secrets (.env)",
                        "body": (
                            "Never commit secrets to git. Set ADMIN_INITIAL_EMAIL, ADMIN_INITIAL_PASSWORD, JWT_SECRET, "
                            "GEMINI_API_KEY, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, and TURSO_DATABASE_URL / DATABASE_URL in .env or Vercel Environment Variables."
                        )
                    },
                    {
                        "heading": "2. Database Backup & Restore",
                        "body": (
                            "Run `python scripts/backup_db.py` to create a timestamped SQLite + JSON snapshot in `backups/`. "
                            "Run `python scripts/restore_db.py <backup_file>` to restore safely."
                        )
                    },
                    {
                        "heading": "3. Original Photos & Image Pipeline",
                        "body": (
                            "Original studio photographs and admin uploads are preserved untouched in `assets/originals/`. "
                            "Derived responsive WebP variants (480w, 720w, 1080w) are generated via `python scripts/build_responsive_images.py`."
                        )
                    },
                    {
                        "heading": "4. 360° Turntable & AI Frame Review (/admin/review-frames)",
                        "body": (
                            "Full-body rotation frames (`role: front | side | back | side2`) drive the 360° turntable; close-up macro shots (`role: detail`) "
                            "drive the detail inspection cards and hotspots. Any AI-generated angle frame (`source: ai`) starts with `approved: false` "
                            "and must be reviewed and approved in the Admin Review Frames tab before appearing on the public storefront."
                        )
                    }
                ]
            })

        if path.lower().endswith((".mp4", ".webm")):
            fs_path = self.translate_path(self.path)
            if os.path.isfile(fs_path):
                fsize = os.path.getsize(fs_path)
                ctype = "video/mp4" if path.lower().endswith(".mp4") else "video/webm"
                range_hdr = self.headers.get("Range")
                if range_hdr and range_hdr.startswith("bytes="):
                    try:
                        r_parts = range_hdr.split("=", 1)[1].split("-")
                        start_b = int(r_parts[0]) if r_parts[0] else 0
                        end_b = int(r_parts[1]) if (len(r_parts) > 1 and r_parts[1]) else fsize - 1
                        end_b = min(end_b, fsize - 1)
                        chunk_len = max(0, end_b - start_b + 1)
                        self.send_response(206)
                        self.send_header("Content-Type", ctype)
                        self.send_header("Accept-Ranges", "bytes")
                        self.send_header("Content-Range", f"bytes {start_b}-{end_b}/{fsize}")
                        self.send_header("Content-Length", str(chunk_len))
                        self.end_headers()
                        with open(fs_path, "rb") as vf:
                            vf.seek(start_b)
                            self.wfile.write(vf.read(chunk_len))
                        return
                    except Exception:
                        pass
                self.send_response(200)
                self.send_header("Content-Type", ctype)
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Content-Length", str(fsize))
                self.end_headers()
                with open(fs_path, "rb") as vf:
                    self.wfile.write(vf.read())
                return

        return super().do_GET()

    # =========================================================================
    # POST ENDPOINTS
    # =========================================================================
    def do_POST(self):
        if self._route_ops("POST"):
            return
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        client_ip = self._get_client_ip()

        # Check if multipart/form-data upload to /api/admin/upload
        content_type = self.headers.get("Content-Type", "")
        if path == "/api/admin/upload" and "multipart/form-data" in content_type:
            admin = self._require_admin()
            if not admin:
                return
            length = int(self.headers.get("Content-Length", "0"))
            if length > MAX_UPLOAD_BYTES * 6:
                return self._send_json(413, {"ok": False, "error": "Upload payload exceeds maximum allowed size."})
            raw_bytes = self.rfile.read(length) if length > 0 else b""
            boundary_match = re.search(r"boundary=([^\s;]+)", content_type)
            urls = []
            if boundary_match and raw_bytes:
                boundary = ("--" + boundary_match.group(1).strip('"')).encode("utf-8")
                parts = raw_bytes.split(boundary)
                for part in parts:
                    if b"Content-Disposition" not in part:
                        continue
                    header_end = part.find(b"\r\n\r\n")
                    if header_end == -1:
                        continue
                    headers_Bytes = part[:header_end].decode("utf-8", errors="ignore")
                    file_bytes = part[header_end + 4:]
                    if file_bytes.endswith(b"\r\n"):
                        file_bytes = file_bytes[:-2]
                    fn_match = re.search(r'filename="([^"]+)"', headers_Bytes)
                    if fn_match and len(file_bytes) > 0:
                        valid, real_ext, _, err_msg = validate_image_bytes(file_bytes)
                        if not valid:
                            return self._send_json(400, {"ok": False, "error": err_msg})
                        fname = f"upload-{uuid.uuid4().hex[:10]}.{real_ext}"
                        with open(os.path.join(ORIGINALS_UPLOADS_DIR, fname), "wb") as f:
                            f.write(file_bytes)
                        with open(os.path.join(UPLOADS_DIR, fname), "wb") as f:
                            f.write(file_bytes)
                        with open(os.path.join(ROOT_UPLOADS_DIR, fname), "wb") as f:
                            f.write(file_bytes)
                        urls.append(f"/uploads/{fname}")
            record_audit_log("upload_images", admin, "upload", f"{len(urls)}_files", client_ip, {"urls": urls})
            return self._send_json(200, {"ok": True, "urls": urls})

        try:
            body = self._read_json_body()
        except Exception as e:
            return self._send_json(400, {"ok": False, "error": f"Invalid JSON: {e}"})

        # Auth: POST /api/auth/register
        if path == "/api/auth/register":
            if not check_rate_limit(client_ip, "auth_register", max_requests=10, window_seconds=60):
                return self._send_json(429, {"ok": False, "error": "Too many registration attempts. Please wait a minute."})
            name = (body.get("name") or "").strip()
            email = (body.get("email") or "").strip().lower()
            phone = (body.get("phone") or "").strip()
            password = body.get("password") or ""
            if not name or not email or not password:
                return self._send_json(400, {"ok": False, "error": "Name, email, and password are required."})
            if len(password) < 8:
                return self._send_json(400, {"ok": False, "error": "Password must be at least 8 characters."})
            ts = now_iso()
            user_id = f"usr-{uuid.uuid4().hex[:8]}"
            token = f"tok-{secrets.token_hex(24)}"
            with DB_LOCK:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute("SELECT id FROM users WHERE LOWER(email) = ?", (email,))
                if cur.fetchone():
                    conn.close()
                    return self._send_json(409, {"ok": False, "error": "An account with this email already exists."})
                cur.execute(
                    "INSERT INTO users (id, name, email, phone, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (user_id, name, email, phone, hash_password(password), "customer", ts)
                )
                cur.execute("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)", (token, user_id, ts))
                conn.commit()
                conn.close()
            user_obj = {"id": user_id, "name": name, "email": email, "phone": phone, "role": "customer"}
            return self._send_json(201, {"ok": True, "token": token, "user": user_obj})

        # Auth: POST /api/auth/login
        if path == "/api/auth/login":
            if not check_rate_limit(client_ip, "auth_login", max_requests=15, window_seconds=60):
                return self._send_json(429, {"ok": False, "error": "Too many login requests. Please wait a minute."})
            email = (body.get("email") or "").strip().lower()
            password = body.get("password") or ""
            if not email or not password:
                return self._send_json(400, {"ok": False, "error": "Email and password are required."})

            allowed_login, wait_secs = check_login_lockout(client_ip, email)
            if not allowed_login:
                return self._send_json(429, {
                    "ok": False,
                    "error": f"Account temporarily locked due to 5 failed login attempts. Try again in {max(1, wait_secs // 60)} minutes."
                })

            # Support both janardhantextiles.com and janardantextiles.com admin email alias
            candidate_emails = [email]
            if email == "admin@janardantextiles.com":
                candidate_emails.append("admin@janardhantextiles.com")
            elif email == "admin@janardhantextiles.com":
                candidate_emails.append("admin@janardantextiles.com")

            with DB_LOCK:
                conn = get_db_connection()
                cur = conn.cursor()
                placeholders = ",".join("?" for _ in candidate_emails)
                cur.execute(
                    f"SELECT id, name, email, phone, role, password_hash FROM users WHERE LOWER(email) IN ({placeholders})",
                    tuple(candidate_emails)
                )
                row = cur.fetchone()
                valid_pw, needs_rehash = verify_password(password, row["password_hash"]) if row else (False, False)
                if not row or not valid_pw:
                    conn.close()
                    failures, is_locked = record_login_failure(client_ip, email)
                    record_audit_log("login_failed", {"email": email}, "user", email, client_ip, {"failures": failures, "locked": is_locked})
                    if is_locked:
                        return self._send_json(429, {
                            "ok": False,
                            "error": "Too many failed login attempts (5). Account locked for 15 minutes."
                        })
                    return self._send_json(401, {"ok": False, "error": "Invalid email or password."})

                clear_login_failures(client_ip, email)
                if needs_rehash:
                    cur.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(password), row["id"]))
                token = f"tok-{secrets.token_hex(24)}"
                cur.execute(
                    "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
                    (token, row["id"], now_iso())
                )
                conn.commit()
                conn.close()

            user_obj = {
                "id": row["id"],
                "name": row["name"],
                "email": row["email"],
                "phone": row["phone"] or "",
                "role": row["role"]
            }
            if user_obj["role"] == "admin":
                record_audit_log("login_success", user_obj, "session", user_obj["id"], client_ip, {})
            return self._send_json(200, {"ok": True, "token": token, "user": user_obj})

        # Razorpay Online Payment endpoints -> Server-side order creation & HMAC signature verification
        if path == "/api/payments/razorpay/order":
            key_id = (os.environ.get("RAZORPAY_KEY_ID") or "").strip()
            key_secret = (os.environ.get("RAZORPAY_KEY_SECRET") or "").strip()
            if not key_id or not key_secret:
                return self._send_json(501, {
                    "ok": False,
                    "error": "Online payment is not set up yet. Please select Cash on Delivery (COD) or WhatsApp Order."
                })
            raw_items = body.get("items") or []
            if not raw_items:
                return self._send_json(400, {"ok": False, "error": "Cart items are required to create a payment order."})
            subtotal = 0
            with DB_LOCK:
                conn = get_db_connection()
                cur = conn.cursor()
                for item in raw_items:
                    pid = item.get("product_id") or item.get("productId") or item.get("id")
                    qty = int(item.get("quantity") or item.get("qty") or 1)
                    if qty <= 0:
                        conn.close()
                        return self._send_json(400, {"ok": False, "error": f"Invalid quantity for {pid}"})
                    cur.execute("SELECT data_json FROM products WHERE id = ?", (pid,))
                    prow = cur.fetchone()
                    if not prow:
                        conn.close()
                        return self._send_json(404, {"ok": False, "error": f"Product '{pid}' not found."})
                    pdata = normalize_product(json.loads(prow["data_json"]))
                    if not pdata.get("active", True) or int(pdata.get("stock", 0)) < qty or int(pdata.get("price", 0)) <= 0:
                        conn.close()
                        return self._send_json(400, {"ok": False, "error": f"Product '{pdata.get('name', pid)}' is unavailable for online payment."})
                    subtotal += int(pdata["price"]) * qty
                conn.close()
            amount_paise = subtotal * 100
            receipt_id = f"rcpt-{uuid.uuid4().hex[:10]}"
            auth_b64 = base64.b64encode(f"{key_id}:{key_secret}".encode("utf-8")).decode("ascii")
            req = urllib.request.Request(
                "https://api.razorpay.com/v1/orders",
                data=json.dumps({"amount": amount_paise, "currency": "INR", "receipt": receipt_id}).encode("utf-8"),
                headers={"Authorization": f"Basic {auth_b64}", "Content-Type": "application/json"},
                method="POST"
            )
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    rzp_data = json.loads(resp.read().decode("utf-8"))
                return self._send_json(200, {
                    "ok": True,
                    "keyId": key_id,
                    "razorpayOrderId": rzp_data.get("id"),
                    "amount": amount_paise,
                    "currency": "INR",
                    "receipt": receipt_id
                })
            except Exception as ex:
                return self._send_json(502, {"ok": False, "error": f"Razorpay order creation failed: {ex}"})

        if path == "/api/payments/razorpay/verify":
            key_id = (os.environ.get("RAZORPAY_KEY_ID") or "").strip()
            key_secret = (os.environ.get("RAZORPAY_KEY_SECRET") or "").strip()
            if not key_id or not key_secret:
                return self._send_json(501, {
                    "ok": False,
                    "error": "Online payment is not set up yet. Please select Cash on Delivery (COD)."
                })
            rzp_order_id = (body.get("razorpay_order_id") or "").strip()
            rzp_payment_id = (body.get("razorpay_payment_id") or "").strip()
            rzp_signature = (body.get("razorpay_signature") or "").strip()
            if not rzp_order_id or not rzp_payment_id or not rzp_signature:
                return self._send_json(400, {"ok": False, "error": "Missing Razorpay payment verification parameters."})
            expected_sig = hmac.new(
                key_secret.encode("utf-8"),
                f"{rzp_order_id}|{rzp_payment_id}".encode("utf-8"),
                hashlib.sha256
            ).hexdigest()
            if not hmac.compare_digest(expected_sig, rzp_signature):
                return self._send_json(400, {"ok": False, "error": "Invalid Razorpay payment signature."})
            return self._send_json(200, {"ok": True, "verified": True, "paymentId": rzp_payment_id})

        # Seed / Reset Demo (Disabled in production; requires Admin + confirmation token in dev)
        if path in ("/api/seed", "/api/reset-demo"):
            if is_production_env():
                return self._send_json(403, {
                    "ok": False,
                    "error": "Database seed and reset endpoints are disabled in production."
                })
            admin = self._require_admin()
            if not admin:
                return
            force = (path == "/api/reset-demo") or bool(body.get("force"))
            if force and body.get("confirm_token") != "CONFIRM_RESET_DATABASE":
                return self._send_json(400, {
                    "ok": False,
                    "error": "Confirmation token 'CONFIRM_RESET_DATABASE' is required to reset database tables."
                })
            with DB_LOCK:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute("SELECT COUNT(*) AS cnt FROM products")
                existing_count = cur.fetchone()["cnt"]

                if existing_count == 0 or force:
                    cur.execute("DELETE FROM settings")
                    cur.execute("DELETE FROM products")
                    cur.execute("DELETE FROM orders")
                    cur.execute("DELETE FROM wholesale_enquiries")
                    cur.execute("DELETE FROM contact_messages")

                    ts = now_iso()
                    if body.get("settings"):
                        cur.execute(
                            "INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)",
                            ("site_settings", json.dumps(body["settings"]), ts)
                        )

                    seed_prods = body.get("products") or DEFAULT_INITIAL_PRODUCTS
                    for idx, prod in enumerate(seed_prods):
                        norm_p = normalize_product(prod, idx)
                        cur.execute(
                            "INSERT INTO products (id, sort_order, data_json, updated_at) VALUES (?, ?, ?, ?)",
                            (norm_p["id"], idx, json.dumps(norm_p), ts)
                        )

                    conn.commit()
                conn.close()

            record_audit_log("seed_or_reset", admin, "database", path, client_ip, {"force": force})
            return self._send_json(200, fetch_bootstrap_payload(include_private=True))

        # Create Order: POST /api/orders (Atomic transaction, server-authoritative pricing & stock validation)
        if path == "/api/orders":
            if not check_rate_limit(client_ip, "create_order", max_requests=20, window_seconds=60):
                return self._send_json(429, {"ok": False, "error": "Too many order requests. Please wait a moment."})
            user = self._get_current_user()
            address = body.get("address") or {}
            customer_name = (address.get("name") or body.get("customerName") or (user["name"] if user else "")).strip()
            phone = (address.get("phone") or body.get("phone") or (user["phone"] if user else "")).strip()
            city = (address.get("city") or body.get("city") or "").strip()
            state_name = (address.get("state") or body.get("state") or "").strip()
            pincode = (address.get("pincode") or body.get("pincode") or "").strip()
            line1 = (address.get("line1") or body.get("addressLine") or "").strip()
            line2 = (address.get("line2") or "").strip()
            payment_method = (body.get("payment_method") or body.get("paymentMethod") or "cod").lower()
            raw_items = body.get("items") or []

            if not customer_name or not phone or not city or not raw_items:
                return self._send_json(400, {"ok": False, "error": "Missing required address fields or cart items."})

            digits_phone = re.sub(r"\D", "", phone)
            if len(digits_phone) < 10 or len(digits_phone) > 15:
                return self._send_json(400, {"ok": False, "error": "Please enter a valid 10-digit phone number."})

            if pincode and not re.match(r"^\d{6}$", pincode):
                return self._send_json(400, {"ok": False, "error": "Please enter a valid 6-digit Indian PIN code."})

            if payment_method == "online" and (not os.environ.get("RAZORPAY_KEY_ID") or not os.environ.get("RAZORPAY_KEY_SECRET")):
                return self._send_json(501, {"ok": False, "error": "Online payment is not set up yet. Please use Cash on Delivery (COD)."})

            created_at = now_iso()
            order_number = f"JT-{datetime.datetime.now().strftime('%Y%m%d')}-{secrets.randbelow(9000) + 1000}"

            with DB_LOCK:
                conn = get_db_connection()
                conn.isolation_level = None  # Manual transaction management for BEGIN IMMEDIATE
                cur = conn.cursor()
                try:
                    cur.execute("BEGIN IMMEDIATE")
                    enriched_items = []
                    subtotal = 0
                    for item in raw_items:
                        pid = item.get("product_id") or item.get("productId") or item.get("id")
                        try:
                            qty = int(item.get("quantity") or item.get("qty") or 1)
                        except Exception:
                            qty = 0
                        if qty <= 0 or qty > 100:
                            cur.execute("ROLLBACK")
                            conn.close()
                            return self._send_json(400, {"ok": False, "error": f"Invalid quantity for {pid}"})
                        cur.execute("SELECT data_json FROM products WHERE id = ?", (pid,))
                        prow = cur.fetchone()
                        if not prow:
                            cur.execute("ROLLBACK")
                            conn.close()
                            return self._send_json(404, {"ok": False, "error": f"Product '{pid}' not found."})
                        pdata = normalize_product(json.loads(prow["data_json"]))
                        if not pdata.get("active", True):
                            cur.execute("ROLLBACK")
                            conn.close()
                            return self._send_json(400, {"ok": False, "error": f"'{pdata['name']}' is currently inactive and unavailable."})
                        unit_price = int(pdata.get("price") or 0)
                        if unit_price <= 0 or pdata.get("isSamplePrice") or pdata.get("priceOnRequest"):
                            cur.execute("ROLLBACK")
                            conn.close()
                            return self._send_json(400, {
                                "ok": False,
                                "error": f"'{pdata['name']}' is Price on Request and cannot be purchased via direct checkout. Please enquire on WhatsApp."
                            })
                        avail_stock = int(pdata.get("stock", 0))
                        if avail_stock < qty or pdata.get("stock_status") == "out_of_stock":
                            cur.execute("ROLLBACK")
                            conn.close()
                            return self._send_json(400, {
                                "ok": False,
                                "error": f"Insufficient stock for '{pdata['name']}' (requested {qty}, available {avail_stock})."
                            })

                        # Atomic stock deduction
                        new_stock = avail_stock - qty
                        pdata["stock"] = new_stock
                        pdata["stockQty"] = new_stock
                        pdata = normalize_product(pdata)
                        cur.execute(
                            "UPDATE products SET data_json = ?, updated_at = ? WHERE id = ?",
                            (json.dumps(pdata), created_at, pid)
                        )

                        subtotal += unit_price * qty
                        enriched_items.append({
                            "product_id": pid,
                            "productId": pid,
                            "sku": pdata["sku"],
                            "name": pdata["name"],
                            "fabric": pdata["fabric"],
                            "color": pdata["color"],
                            "price": unit_price,
                            "priceINR": unit_price,
                            "quantity": qty,
                            "qty": qty,
                            "image": pdata.get("image", ""),
                            "isSamplePrice": False
                        })

                    shipping_fee = 0
                    total_inr = subtotal + shipping_fee
                    new_order = {
                        "order_number": order_number,
                        "orderId": order_number,
                        "user_id": user["id"] if user else None,
                        "user_email": user["email"] if user else None,
                        "customerName": customer_name,
                        "phone": phone,
                        "city": city,
                        "address": {
                            "name": customer_name,
                            "phone": phone,
                            "line1": line1,
                            "line2": line2,
                            "city": city,
                            "state": state_name,
                            "pincode": pincode
                        },
                        "payment_method": payment_method,
                        "payment_status": "Pending (COD)" if payment_method == "cod" else "Paid (Verified)",
                        "status": "placed",
                        "subtotal": subtotal,
                        "shipping": shipping_fee,
                        "total": total_inr,
                        "totalINR": total_inr,
                        "items": enriched_items,
                        "date": created_at[:10],
                        "created_at": created_at,
                        "createdAt": created_at,
                        "isDemoOrder": False
                    }

                    cur.execute(
                        "INSERT INTO orders (order_id, created_at, status, total_inr, data_json) VALUES (?, ?, ?, ?, ?)",
                        (order_number, created_at, "placed", total_inr, json.dumps(new_order))
                    )
                    cur.execute("COMMIT")
                except Exception as tx_err:
                    try:
                        cur.execute("ROLLBACK")
                    except Exception:
                        pass
                    conn.close()
                    return self._send_json(500, {"ok": False, "error": f"Order transaction failed: {tx_err}"})
                conn.close()

            is_admin = bool(user and user.get("role") == "admin")
            payload = fetch_bootstrap_payload(include_private=is_admin)
            payload["order_number"] = order_number
            payload["order"] = new_order
            payload["createdOrder"] = new_order
            return self._send_json(201, payload)

        # Wholesale Enquiry: POST /api/wholesale (Honeypot + Rate limit + Validation)
        if path == "/api/wholesale":
            if not check_rate_limit(client_ip, "wholesale_enquiry", max_requests=10, window_seconds=60):
                return self._send_json(429, {"ok": False, "error": "Too many enquiries submitted. Please wait a minute."})
            if body.get("website") or body.get("_gotcha") or body.get("honeypot"):
                return self._send_json(200, {"ok": True, "spamFiltered": True})
            business_name = (body.get("businessName") or "").strip()[:160]
            contact_person = (body.get("contactPerson") or "").strip()[:120]
            phone = (body.get("phone") or "").strip()[:30]
            if not (business_name or contact_person) or not phone:
                return self._send_json(400, {"ok": False, "error": "Business/contact name and phone number are required."})
            enquiry_id = f"WS-{secrets.randbelow(9000) + 1000}"
            created_at = now_iso()
            enquiry = {
                "enquiryId": enquiry_id,
                "businessName": business_name,
                "contactPerson": contact_person,
                "phone": phone,
                "city": (body.get("city") or "").strip()[:100],
                "sareeInterest": str(body.get("sareeInterest") or "Assorted Catalogue")[:200],
                "estimatedQuantity": (body.get("estimatedQuantity") or "").strip()[:80],
                "status": "New Enquiry",
                "notes": (body.get("notes") or "Standard catalogue enquiry").strip()[:1000],
                "createdAt": created_at
            }
            with DB_LOCK:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute(
                    "INSERT INTO wholesale_enquiries (enquiry_id, created_at, status, data_json) VALUES (?, ?, ?, ?)",
                    (enquiry_id, created_at, enquiry["status"], json.dumps(enquiry))
                )
                conn.commit()
                conn.close()
            return self._send_json(201, {"ok": True, "enquiry": enquiry})

        # Contact Message: POST /api/contact (Honeypot + Rate limit + Validation)
        if path == "/api/contact":
            if not check_rate_limit(client_ip, "contact_message", max_requests=10, window_seconds=60):
                return self._send_json(429, {"ok": False, "error": "Too many messages submitted. Please wait a minute."})
            if body.get("website") or body.get("_gotcha") or body.get("honeypot"):
                return self._send_json(200, {"ok": True, "spamFiltered": True})
            sender_name = (body.get("name") or "").strip()[:120]
            sender_contact = (body.get("contact") or "").strip()[:120]
            sender_msg = (body.get("message") or "").strip()[:2000]
            if not sender_name or not sender_contact or not sender_msg:
                return self._send_json(400, {"ok": False, "error": "Name, phone/email, and message are required."})
            msg_id = f"MSG-{uuid.uuid4().hex[:6].upper()}"
            created_at = now_iso()
            msg_obj = {
                "messageId": msg_id,
                "name": sender_name,
                "contact": sender_contact,
                "message": sender_msg,
                "status": "Unread",
                "createdAt": created_at,
                "date": created_at[:10]
            }
            with DB_LOCK:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute(
                    "INSERT INTO contact_messages (message_id, created_at, status, data_json) VALUES (?, ?, ?, ?)",
                    (msg_id, created_at, msg_obj["status"], json.dumps(msg_obj))
                )
                conn.commit()
                conn.close()
            return self._send_json(201, {"ok": True, "contactMessage": msg_obj})

        # Admin JSON Upload fallback: POST /api/admin/upload
        if path == "/api/admin/upload":
            admin = self._require_admin()
            if not admin:
                return
            raw_images = body.get("images") or []
            urls = []
            for idx, img_data in enumerate(raw_images):
                saved = save_data_uri_if_raster(img_data, prefix=f"admin-upload-{idx + 1}")
                if not saved:
                    return self._send_json(400, {"ok": False, "error": f"Image #{idx + 1} failed magic-byte or 10 MB size validation."})
                urls.append(saved)
            record_audit_log("upload_images_json", admin, "upload", f"{len(urls)}_files", client_ip, {"urls": urls})
            return self._send_json(200, {"ok": True, "urls": urls})

        # Create Product: POST /api/admin/products or POST /api/products (Requires Admin on BOTH)
        if path in ("/api/admin/products", "/api/products"):
            admin = self._require_admin()
            if not admin:
                return
            sku = (body.get("sku") or body.get("id") or f"jt-saree-{uuid.uuid4().hex[:4]}").strip()
            name = (body.get("name") or "").strip()
            fabric = (body.get("fabric") or "").strip()
            color = (body.get("color") or "").strip()
            if not name or not fabric or not color:
                return self._send_json(400, {"ok": False, "error": "SKU, Name, Fabric, and Colour are required."})
            body["id"] = body.get("id") or sku
            body["sku"] = sku
            norm_p = normalize_product(body)
            ts = now_iso()
            with DB_LOCK:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute("SELECT id FROM products WHERE id = ?", (norm_p["id"],))
                if cur.fetchone():
                    conn.close()
                    return self._send_json(409, {"ok": False, "error": f"Product with SKU '{sku}' already exists."})
                cur.execute("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_ord FROM products")
                next_ord = cur.fetchone()["next_ord"]
                cur.execute(
                    "INSERT INTO products (id, sort_order, data_json, updated_at) VALUES (?, ?, ?, ?)",
                    (norm_p["id"], next_ord, json.dumps(norm_p), ts)
                )
                conn.commit()
                conn.close()
            return self._send_json(201, {"ok": True, "product": norm_p})

        # Bulk Import Products: POST /api/admin/products/bulk (Supports Price on Request, dryRun preview, and chunked upsert)
        if path == "/api/admin/products/bulk":
            admin = self._require_admin()
            if not admin:
                return
            rows = body.get("products")
            dry_run = bool(body.get("dryRun"))
            if not isinstance(rows, list):
                return self._send_json(400, {"ok": False, "error": "Expected { products: [...] } array."})
            if len(rows) > 2000:
                return self._send_json(400, {"ok": False, "error": "Maximum 2000 products per bulk request."})

            created = 0
            updated = 0
            price_on_request_count = 0
            errors = []
            ts = now_iso()
            with DB_LOCK:
                conn = get_db_connection()
                cur = conn.cursor()
                for idx, row_data in enumerate(rows):
                    if not isinstance(row_data, dict):
                        errors.append({"row": idx + 1, "sku": "", "error": "Invalid row object"})
                        continue
                    sku = str(row_data.get("sku") or row_data.get("id") or "").strip()
                    name = str(row_data.get("name") or "").strip()
                    fabric = str(row_data.get("fabric") or "").strip()
                    color = str(row_data.get("color") or row_data.get("colour") or "").strip()
                    if not sku or not name or not fabric or not color:
                        errors.append({"row": idx + 1, "sku": sku, "error": "Missing required sku, name, fabric, or color"})
                        continue

                    raw_price_str = str(row_data.get("price") if row_data.get("price") is not None else row_data.get("priceINR") or "").strip()
                    por_flag = bool(row_data.get("priceOnRequest") or str(row_data.get("price_on_request") or "").lower() in ("true", "1", "yes"))
                    if raw_price_str == "" or raw_price_str.lower() in ("price on request", "por", "nan", "none", "0"):
                        price_val = 0
                        por_flag = True
                    else:
                        try:
                            price_val = float(raw_price_str)
                            if price_val < 0:
                                errors.append({"row": idx + 1, "sku": sku, "error": "Price cannot be negative"})
                                continue
                            if price_val == 0:
                                por_flag = True
                        except Exception:
                            errors.append({"row": idx + 1, "sku": sku, "error": f"Invalid numeric price '{raw_price_str}'"})
                            continue

                    if por_flag:
                        price_on_request_count += 1

                    row_data["id"] = sku
                    row_data["sku"] = sku
                    row_data["color"] = color
                    row_data["price"] = int(round(price_val))
                    row_data["priceINR"] = int(round(price_val))
                    row_data["priceOnRequest"] = por_flag

                    cur.execute("SELECT data_json FROM products WHERE id = ?", (sku,))
                    existing = cur.fetchone()
                    if existing:
                        if not dry_run:
                            merged = json.loads(existing["data_json"])
                            merged.update(row_data)
                            norm_p = normalize_product(merged)
                            cur.execute(
                                "UPDATE products SET data_json = ?, updated_at = ? WHERE id = ?",
                                (json.dumps(norm_p), ts, sku)
                            )
                        updated += 1
                    else:
                        if not dry_run:
                            cur.execute("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_ord FROM products")
                            next_ord = cur.fetchone()["next_ord"]
                            norm_p = normalize_product(row_data, next_ord)
                            cur.execute(
                                "INSERT INTO products (id, sort_order, data_json, updated_at) VALUES (?, ?, ?, ?)",
                                (sku, next_ord, json.dumps(norm_p), ts)
                            )
                        created += 1
                if not dry_run:
                    conn.commit()
                conn.close()

            if not dry_run:
                record_audit_log("bulk_import", admin, "products", f"{created}_created_{updated}_updated", self._get_client_ip(), {
                    "created": created, "updated": updated, "priceOnRequest": price_on_request_count, "errors": len(errors)
                })
            return self._send_json(200, {
                "ok": True,
                "dryRun": dry_run,
                "created": created,
                "updated": updated,
                "priceOnRequestCount": price_on_request_count,
                "errors": errors
            })

        # Generate Single Saree View (Admin-only, Server-Side Nano Banana API)
        if path == "/api/sarees/generate-view":
            admin = self._require_admin()
            if not admin:
                return
            if not check_rate_limit(client_ip, "saree_gen", max_requests=10, window_seconds=60):
                return self._send_json(429, {"ok": False, "error": "Generation rate limit reached. Please wait a minute."})
            api_key = get_nano_banana_api_key()
            if not api_key:
                return self._send_json(503, {
                    "ok": False,
                    "error": (
                        "Live Nano Banana API key is not configured on the server. "
                        "Set GEMINI_API_KEY in .env on the server and restart server.py."
                    )
                })
            saree = body.get("saree") or {}
            view_index = int(body.get("viewIndex") or 0)
            ord_num, v_key, v_label, v_fname = (
                REQUIRED_VIEWS[view_index] if 0 <= view_index < len(REQUIRED_VIEWS) else REQUIRED_VIEWS[0]
            )
            ref_sku, ref_dir = resolve_reference_source_dir_for_colour(saree.get("color"))
            ref_path = os.path.join(ref_dir, v_fname) if ref_dir else None
            prompt = (
                f"Photorealistic luxury Indian saree studio photograph on a headless cream fabric mannequin with a dark walnut finial "
                f"against a neutral warm taupe-beige studio background with soft diffused lighting. "
                f"View: {v_label}. Saree: {saree.get('name', 'Saree')}, Colour: {saree.get('color', '')}, "
                f"Fabric: {saree.get('fabric', '')}, Occasion: {saree.get('occasion', '')}. "
                f"Work & Border: {saree.get('borderAndZari') or saree.get('work_details') or 'Scalloped zari cutwork border with floral and peacock embroidery'}. "
                f"Keep colour, pattern, fabric, and embroidery strictly consistent. Do not add text, logos, watermarks, or accessories."
            )
            img_bytes, err = call_gemini_nano_banana_image(prompt, ref_path, api_key)
            if not img_bytes:
                return self._send_json(502, {"ok": False, "error": f"Nano Banana generation failed: {err}"})
            data_uri = "data:image/jpeg;base64," + base64.b64encode(img_bytes).decode("ascii")
            saved_url = save_data_uri_if_raster(data_uri, prefix=f"{saree.get('id', 'saree')}-v{view_index + 1}")
            return self._send_json(200, {"ok": True, "url": saved_url})

        # Generate Saree (Admin-only, 5-View Gallery + New Catalogue Product Card): POST /api/sarees/generate
        if path == "/api/sarees/generate":
            admin = self._require_admin()
            if not admin:
                return
            if not check_rate_limit(client_ip, "saree_gen", max_requests=10, window_seconds=60):
                return self._send_json(429, {"ok": False, "error": "Generation rate limit reached. Please wait a minute."})
            if not GENERATION_LOCK.acquire(blocking=False):
                return self._send_json(429, {
                    "ok": False,
                    "error": "A saree generation is already in progress. Please wait for the current design to complete."
                })
            try:
                if not os.path.isdir(SAREES_IMAGES_DIR) or not os.path.isdir(ROOT_UPLOADS_DIR):
                    return self._send_json(503, {
                        "ok": False,
                        "error": (
                            "Image storage directories (/public/images/sarees/ and /uploads/) are not configured. "
                            "Ensure writable storage directories exist on the server."
                        )
                    })

                opts = get_catalogue_filter_options()
                all_existing = fetch_all_products(include_inactive=True)
                generated_count = sum(
                    1 for p in all_existing
                    if p.get("isGeneratedSaree") or str(p.get("sku", "")).startswith("jt-saree-gen-")
                )

                raw_color = (body.get("color") or body.get("colour") or "").strip()
                raw_fabric = (body.get("fabric") or "").strip()
                raw_occasion = (body.get("occasion") or "").strip()

                if raw_color.upper() in ("", "AUTO", "ANY", "ALL", "RANDOM"):
                    raw_color = ""
                if raw_fabric.upper() in ("", "AUTO", "ANY", "ALL", "RANDOM"):
                    raw_fabric = ""
                if raw_occasion.upper() in ("", "AUTO", "ANY", "ALL", "RANDOM"):
                    raw_occasion = ""

                auto_selected = []
                # Choose suitable values from existing options when left unselected
                if not raw_color:
                    # Cycle through the new reference colourways first (Royal Rose & Gold, Emerald Teal & Gold), then existing catalogue colours
                    priority_colors = ["Royal Rose & Gold", "Emerald Teal & Gold"] + [
                        c for c in opts["colors"] if c not in ("Royal Rose & Gold", "Emerald Teal & Gold")
                    ]
                    chosen_color = priority_colors[generated_count % len(priority_colors)]
                    auto_selected.append("color")
                else:
                    chosen_color = raw_color

                if not raw_fabric:
                    avail_fabrics = opts["fabrics"] or ["Champagne Tissue", "Silk-Blend Jacquard", "Tissue Organza"]
                    chosen_fabric = avail_fabrics[generated_count % len(avail_fabrics)]
                    auto_selected.append("fabric")
                else:
                    chosen_fabric = raw_fabric

                if not raw_occasion:
                    avail_occasions = opts["occasions"] or ["Celebrations & Festive", "Wedding & Reception", "Festive & Puja"]
                    chosen_occasion = avail_occasions[generated_count % len(avail_occasions)]
                    auto_selected.append("occasion")
                else:
                    chosen_occasion = raw_occasion

                # Create a unique new SKU without modifying or replacing existing products
                seq_num = generated_count + 1
                new_sku = f"jt-saree-gen-{seq_num:02d}"
                existing_ids = {p["id"] for p in all_existing}
                while new_sku in existing_ids:
                    seq_num += 1
                    new_sku = f"jt-saree-gen-{seq_num:02d}"

                target_saree_dir = os.path.join(SAREES_IMAGES_DIR, new_sku)
                os.makedirs(target_saree_dir, exist_ok=True)

                ref_sku, ref_dir = resolve_reference_source_dir_for_colour(chosen_color)
                if not ref_dir or not os.path.isdir(ref_dir):
                    return self._send_json(503, {
                        "ok": False,
                        "error": (
                            "Reference studio photography and image generation credentials are not configured. "
                            "Please configure GEMINI_API_KEY in .env on the server and ensure reference images exist in /public/images/sarees/."
                        )
                    })

                api_key = get_nano_banana_api_key()
                used_live_gemini = False
                saved_image_paths = []
                saved_upload_paths = []
                gallery_items = []

                saree_title = f"{chosen_color} {chosen_fabric} Saree with Scalloped Zari & Peacock Embroidery"
                border_desc = (
                    f"Scalloped cutwork zari border with floral and peacock embroidery on {chosen_color.lower()} {chosen_fabric.lower()}"
                )
                motifs_desc = (
                    f"Intricate peacock and lotus floral embroidery in antique gold zari across the {chosen_color.lower()} pallu and scalloped border"
                )
                blouse_desc = (
                    f"Coordinated {chosen_color.lower()} {chosen_fabric.lower()} blouse with matching scalloped gold embroidered neckline and sleeve border"
                )

                for ord_num, v_key, v_label, v_fname in REQUIRED_VIEWS:
                    ref_img_path = os.path.join(ref_dir, v_fname)
                    dest_saree_path = os.path.join(target_saree_dir, v_fname)
                    upload_fname = f"{new_sku}-{v_fname}"
                    dest_upload_path = os.path.join(ROOT_UPLOADS_DIR, upload_fname)
                    dest_public_upload_path = os.path.join(UPLOADS_DIR, upload_fname)

                    img_bytes = None
                    if api_key and body.get("useLiveGemini", True):
                        view_prompt = (
                            f"Photorealistic studio product photograph of an Indian saree on a headless cream fabric mannequin "
                            f"with a dark walnut finial and round wooden base against a warm neutral taupe-beige studio backdrop "
                            f"with soft diffused side lighting. "
                            f"View ({ord_num}/5): {v_label}. "
                            f"Saree: {saree_title}. Colour: {chosen_color}. Fabric: {chosen_fabric}. Occasion: {chosen_occasion}. "
                            f"Border & Work: {border_desc}. Blouse: {blouse_desc}. "
                            f"Keep colour, pattern, fabric, and embroidery strictly identical to the saree design. "
                            f"Do not add any text, logos, watermarks, or unrelated accessories."
                        )
                        img_bytes, _ = call_gemini_nano_banana_image(view_prompt, ref_img_path, api_key)
                        if img_bytes:
                            used_live_gemini = True

                    if img_bytes:
                        with open(dest_saree_path, "wb") as f:
                            f.write(img_bytes)
                        with open(dest_upload_path, "wb") as f:
                            f.write(img_bytes)
                        with open(dest_public_upload_path, "wb") as f:
                            f.write(img_bytes)
                    else:
                        shutil.copyfile(ref_img_path, dest_saree_path)
                        shutil.copyfile(ref_img_path, dest_upload_path)
                        shutil.copyfile(ref_img_path, dest_public_upload_path)

                    public_url = f"/public/images/sarees/{new_sku}/{v_fname}"
                    saved_image_paths.append(public_url)
                    saved_upload_paths.append(f"/uploads/{upload_fname}")
                    gallery_items.append({
                        "order": ord_num,
                        "key": v_key,
                        "label": v_label,
                        "url": public_url,
                        "isSampleImage": False,
                        "alt": f"{saree_title} — {v_label} ({chosen_color}, {chosen_fabric}, {chosen_occasion})"
                    })

                # Price based on fabric tier
                fabric_prices = {
                    "champagne tissue": 7500,
                    "woven brocade": 5500,
                    "silk-blend jacquard": 3900,
                    "tissue organza": 3400,
                    "silk-cotton blend": 2800,
                    "art silk jacquard": 2200,
                    "soft mercerised weave": 1800,
                    "textured dobby blend": 1500,
                    "mercerised cotton": 1200,
                }
                base_price = fabric_prices.get(chosen_fabric.lower(), 6800)
                ts = now_iso()

                new_product_raw = {
                    "id": new_sku,
                    "sku": new_sku,
                    "isSampleProduct": False,
                    "isSamplePrice": False,
                    "isGeneratedSaree": True,
                    "generatedAt": ts,
                    "referenceSku": ref_sku,
                    "selectedCategories": {
                        "color": chosen_color,
                        "fabric": chosen_fabric,
                        "occasion": chosen_occasion,
                        "autoSelected": auto_selected,
                    },
                    "savedImagePaths": saved_image_paths,
                    "savedUploadPaths": saved_upload_paths,
                    "featured": True,
                    "bestseller": False,
                    "active": True,
                    "name": saree_title,
                    "fabric": chosen_fabric,
                    "color": chosen_color,
                    "occasion": chosen_occasion,
                    "priceINR": base_price,
                    "originalPriceINR": base_price,
                    "price": base_price,
                    "mrp": base_price,
                    "discountPercent": 0,
                    "stockStatus": "In Stock",
                    "stockQty": 18,
                    "stock": 18,
                    "stock_status": "in_stock",
                    "description": (
                        f"Custom generated {chosen_color.lower()} {chosen_fabric.lower()} saree tailored for {chosen_occasion.lower()}. "
                        f"Features a scalloped cutwork border with floral and peacock embroidery in antique gold zari, "
                        f"photographed across a matching 5-view studio mannequin gallery (front, back & pallu, pallu detail, fabric macro, and blouse detail)."
                    ),
                    "borderAndZari": border_desc,
                    "motifs": motifs_desc,
                    "blousePiece": blouse_desc,
                    "work_details": border_desc,
                    "blouse_piece": blouse_desc,
                    "care_instructions": "Dry clean only. Store folded in soft muslin away from direct sunlight.",
                    "gallery": gallery_items,
                    "images": saved_image_paths,
                    "image": saved_image_paths[0],
                }

                with DB_LOCK:
                    conn = get_db_connection()
                    cur = conn.cursor()
                    cur.execute("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_ord FROM products")
                    next_ord = cur.fetchone()["next_ord"]
                    norm_p = normalize_product(new_product_raw, next_ord)
                    cur.execute(
                        "INSERT INTO products (id, sort_order, data_json, updated_at) VALUES (?, ?, ?, ?)",
                        (norm_p["id"], next_ord, json.dumps(norm_p), ts)
                    )
                    conn.commit()
                    conn.close()

                return self._send_json(201, {
                    "ok": True,
                    "product": norm_p,
                    "selected": {
                        "color": chosen_color,
                        "fabric": chosen_fabric,
                        "occasion": chosen_occasion,
                        "autoSelected": auto_selected,
                    },
                    "savedImagePaths": saved_image_paths,
                    "savedUploadPaths": saved_upload_paths,
                    "databasePath": "janardan_textiles.db (products table)",
                    "apiKeyConfigured": bool(api_key),
                    "usedLiveGemini": used_live_gemini,
                    "configNotice": (
                        "Generated using live Gemini Nano Banana API on server."
                        if used_live_gemini
                        else (
                            f"Your custom {chosen_color} {chosen_fabric} saree has been created with a 5-view studio gallery and added to the collection."
                        )
                    )
                })
            finally:
                GENERATION_LOCK.release()

        return self._send_json(404, {"ok": False, "error": f"Unknown POST endpoint: {path}"})

    # =========================================================================
    # PUT ENDPOINTS
    # =========================================================================
    def do_PUT(self):
        if self._route_ops("PUT"):
            return
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # PUT /api/wishlist/:productId
        m_wish = re.match(r"^/api/wishlist/([^/]+)$", path)
        if m_wish:
            user = self._require_auth()
            if not user:
                return
            pid = urllib.parse.unquote(m_wish.group(1))
            with DB_LOCK:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute(
                    "INSERT OR REPLACE INTO wishlists (user_id, product_id, created_at) VALUES (?, ?, ?)",
                    (user["id"], pid, now_iso())
                )
                cur.execute("SELECT product_id FROM wishlists WHERE user_id = ? ORDER BY created_at DESC", (user["id"],))
                pids = [r["product_id"] for r in cur.fetchall()]
                conn.close()
            return self._send_json(200, {"ok": True, "productIds": pids})

        try:
            body = self._read_json_body()
        except Exception as e:
            return self._send_json(400, {"ok": False, "error": f"Invalid JSON: {e}"})

        # PUT /api/products/<id> (Requires Admin)
        m_prod = re.match(r"^/api/products/([^/]+)$", path)
        if m_prod:
            admin = self._require_admin()
            if not admin:
                return
            product_id = urllib.parse.unquote(m_prod.group(1))
            record_audit_log("product_update", admin, "product", product_id, self._get_client_ip(), {"fields": list(body.keys())})
            return self._update_product_record(product_id, body)

        # PUT /api/products/<id>/gallery/<idx> (Requires Admin)
        m_gal = re.match(r"^/api/products/([^/]+)/gallery/(\d+)$", path)
        if m_gal:
            admin = self._require_admin()
            if not admin:
                return
            product_id = urllib.parse.unquote(m_gal.group(1))
            view_idx = int(m_gal.group(2))
            new_url = body.get("url") or ""
            stored_url = save_data_uri_if_raster(new_url, prefix=f"{product_id}-v{view_idx + 1}")
            if new_url.startswith("data:") and not stored_url:
                return self._send_json(400, {"ok": False, "error": "Invalid image upload (failed magic-byte or 10 MB size check)."})
            ts = now_iso()

            with DB_LOCK:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute("SELECT data_json FROM products WHERE id = ?", (product_id,))
                row = cur.fetchone()
                if not row:
                    conn.close()
                    return self._send_json(404, {"ok": False, "error": "Product not found"})
                pdata = normalize_product(json.loads(row["data_json"]))
                epoch_ms = int(time.time() * 1000)
                if "gallery" in pdata and 0 <= view_idx < len(pdata["gallery"]):
                    pdata["gallery"][view_idx]["url"] = stored_url.split("?")[0] if stored_url else ""
                    pdata["gallery"][view_idx]["updatedAt"] = epoch_ms
                    pdata["gallery"][view_idx]["customOverride"] = True
                    if "alt" in body:
                        pdata["gallery"][view_idx]["alt"] = body["alt"]
                    if "role" in body:
                        pdata["gallery"][view_idx]["role"] = str(body["role"])
                    if "yaw" in body:
                        pdata["gallery"][view_idx]["yaw"] = body["yaw"]
                    if "source" in body:
                        pdata["gallery"][view_idx]["source"] = str(body["source"])
                    if "isSampleImage" in body:
                        pdata["gallery"][view_idx]["isSampleImage"] = bool(body["isSampleImage"])
                pdata["updatedAt"] = ts
                pdata = normalize_product(pdata)
                cur.execute(
                    "UPDATE products SET data_json = ?, updated_at = ? WHERE id = ?",
                    (json.dumps(pdata), ts, product_id)
                )
                conn.commit()
                conn.close()
            record_audit_log("gallery_update", admin, "product_gallery", f"{product_id}[{view_idx}]", self._get_client_ip(), {"url": stored_url})
            return self._send_json(200, {"ok": True, "url": stored_url, "product": pdata})

        if path == "/api/settings/contacts":
            admin = self._require_admin()
            if not admin:
                return
            ts = now_iso()
            with DB_LOCK:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute("SELECT value_json FROM settings WHERE key = 'site_settings'")
                row = cur.fetchone()
                settings = json.loads(row["value_json"]) if row else {}
                settings["contacts"] = body.get("contacts", settings.get("contacts", {}))
                cur.execute(
                    "INSERT OR REPLACE INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)",
                    ("site_settings", json.dumps(settings), ts)
                )
                conn.commit()
                conn.close()
            record_audit_log("settings_contacts_update", admin, "settings", "contacts", self._get_client_ip(), {})
            return self._send_json(200, {"ok": True, "settings": settings})

        if path == "/api/settings/policies":
            admin = self._require_admin()
            if not admin:
                return
            ts = now_iso()
            with DB_LOCK:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute("SELECT value_json FROM settings WHERE key = 'site_settings'")
                row = cur.fetchone()
                settings = json.loads(row["value_json"]) if row else {}
                settings["policies"] = body.get("policies", settings.get("policies", {}))
                cur.execute(
                    "INSERT OR REPLACE INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)",
                    ("site_settings", json.dumps(settings), ts)
                )
                conn.commit()
                conn.close()
            record_audit_log("settings_policies_update", admin, "settings", "policies", self._get_client_ip(), {})
            return self._send_json(200, {"ok": True, "settings": settings})

        return self._send_json(404, {"ok": False, "error": f"Unknown PUT endpoint: {path}"})

    def _update_product_record(self, product_id, body):
        ts = now_iso()
        with DB_LOCK:
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute("SELECT data_json FROM products WHERE id = ?", (product_id,))
            row = cur.fetchone()
            if not row:
                pdata = dict(body)
                pdata["id"] = product_id
                pdata["sku"] = pdata.get("sku") or product_id
                pdata = normalize_product(pdata)
                cur.execute(
                    "INSERT INTO products (id, sort_order, data_json, updated_at) VALUES (?, ?, ?, ?)",
                    (product_id, 99, json.dumps(pdata), ts)
                )
                conn.commit()
                conn.close()
                return self._send_json(200, {"ok": True, "product": pdata, "inserted": True})

            pdata = json.loads(row["data_json"])
            for field in (
                "sku", "name", "priceINR", "originalPriceINR", "discountPercent",
                "price", "mrp", "priceOnRequest", "stock", "stockQty", "stockStatus", "stock_status",
                "featured", "bestseller", "active",
                "isSamplePrice", "isSampleProduct", "wholesalePriceINR", "minWholesaleQty",
                "description", "fabric", "color", "occasion",
                "borderAndZari", "motifs", "blousePiece",
                "work_details", "blouse_piece", "care_instructions",
                "gallery", "images"
            ):
                if field in body:
                    pdata[field] = body[field]

            if "price" in body and body["price"] is not None:
                pdata["priceINR"] = int(round(float(body["price"])))
                pdata["price"] = pdata["priceINR"]
            elif "priceINR" in body and body["priceINR"] is not None:
                pdata["priceINR"] = int(round(float(body["priceINR"])))
                pdata["price"] = pdata["priceINR"]

            if "mrp" in body and body["mrp"] is not None:
                pdata["originalPriceINR"] = int(round(float(body["mrp"])))
                pdata["mrp"] = pdata["originalPriceINR"]
            elif "originalPriceINR" in body and body["originalPriceINR"] is not None:
                pdata["originalPriceINR"] = int(round(float(body["originalPriceINR"])))
                pdata["mrp"] = pdata["originalPriceINR"]

            if "stock" in body and body["stock"] is not None:
                pdata["stockQty"] = int(body["stock"])
                pdata["stock"] = pdata["stockQty"]
            elif "stockQty" in body and body["stockQty"] is not None:
                pdata["stock"] = int(body["stockQty"])
                pdata["stockQty"] = pdata["stock"]

            if "images" in body and isinstance(body["images"], list) and len(body["images"]) > 0:
                new_gal = []
                epoch_ms = int(time.time() * 1000)
                for idx, url in enumerate(body["images"][:5]):
                    ord_num, key, label, _ = REQUIRED_VIEWS[idx] if idx < len(REQUIRED_VIEWS) else (idx + 1, f"view_{idx+1}", f"View {idx+1}", "")
                    existing_slot = pdata.get("gallery", [])[idx] if isinstance(pdata.get("gallery"), list) and idx < len(pdata["gallery"]) else {}
                    saved_u = save_data_uri_if_raster(url, prefix=f"{product_id}-v{idx+1}")
                    clean_new = (saved_u or "").split("?")[0]
                    clean_old = (existing_slot.get("url") or "").split("?")[0]
                    slot_updated_at = epoch_ms if clean_new != clean_old else (existing_slot.get("updatedAt") or epoch_ms)
                    new_gal.append({
                        "order": ord_num,
                        "key": key,
                        "label": existing_slot.get("label") or label,
                        "url": clean_new,
                        "updatedAt": slot_updated_at,
                        "customOverride": True if clean_new != clean_old else bool(existing_slot.get("customOverride", False)),
                        "isSampleImage": False,
                        "alt": existing_slot.get("alt") or f"{pdata.get('name', 'Saree')} — {label}"
                    })
                pdata["gallery"] = new_gal

            pdata = normalize_product(pdata)
            cur.execute(
                "UPDATE products SET data_json = ?, updated_at = ? WHERE id = ?",
                (json.dumps(pdata), ts, product_id)
            )
            conn.commit()
            conn.close()
        return self._send_json(200, {"ok": True, "product": pdata})

    # =========================================================================
    # PATCH ENDPOINTS
    # =========================================================================
    def do_PATCH(self):
        if self._route_ops("PATCH"):
            return
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        try:
            body = self._read_json_body()
        except Exception as e:
            return self._send_json(400, {"ok": False, "error": f"Invalid JSON: {e}"})

        # Admin Review Frames Approval Toggle: PATCH /api/admin/products/:id/views/:viewId
        if path.startswith("/api/admin/products/") and "/views/" in path:
            admin = self._require_admin()
            if not admin:
                return
            rem = path[len("/api/admin/products/"):]
            parts = rem.split("/views/", 1)
            product_id = urllib.parse.unquote(parts[0]).strip("/")
            view_id = urllib.parse.unquote(parts[1]).strip("/")
            if "approved" not in body and "role" not in body and "yaw" not in body:
                return self._send_json(400, {"ok": False, "error": "Expected approved, role, or yaw in request body."})
            ts = now_iso()
            with DB_LOCK:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute("SELECT data_json FROM products WHERE id = ?", (product_id,))
                row = cur.fetchone()
                if not row:
                    conn.close()
                    return self._send_json(404, {"ok": False, "error": f"Product '{product_id}' not found."})
                pdata = json.loads(row["data_json"])
                approvals = pdata.get("viewApprovals") if isinstance(pdata.get("viewApprovals"), dict) else {}
                if "approved" in body:
                    approvals[view_id] = bool(body["approved"])
                pdata["viewApprovals"] = approvals
                if isinstance(pdata.get("gallery"), list):
                    for g in pdata["gallery"]:
                        if isinstance(g, dict) and (g.get("id") == view_id or g.get("key") == view_id):
                            if "approved" in body:
                                g["approved"] = bool(body["approved"])
                            if "role" in body:
                                g["role"] = str(body["role"])
                            if "yaw" in body:
                                g["yaw"] = body["yaw"]
                norm_p = normalize_product(pdata)
                cur.execute("UPDATE products SET data_json = ?, updated_at = ? WHERE id = ?", (json.dumps(norm_p), ts, product_id))
                conn.commit()
                conn.close()
            record_audit_log("review_frame_toggle", admin, "product_view", f"{product_id}:{view_id}", self._get_client_ip(), body)
            return self._send_json(200, {"ok": True, "product": norm_p})

        # Admin Inline Quick Stock Edit: PATCH /api/admin/products/:id/stock
        m_stock = re.match(r"^/api/admin/products/([^/]+)/stock$", path)
        if m_stock:
            admin = self._require_admin()
            if not admin:
                return
            pid = urllib.parse.unquote(m_stock.group(1))
            if "stock" not in body:
                return self._send_json(400, {"ok": False, "error": "Missing `stock` field"})
            return self._update_product_record(pid, {"stock": int(body["stock"])})

        # Admin Update Product: PATCH /api/admin/products/:id
        m_admin_prod = re.match(r"^/api/admin/products/([^/]+)$", path)
        if m_admin_prod:
            admin = self._require_admin()
            if not admin:
                return
            pid = urllib.parse.unquote(m_admin_prod.group(1))
            return self._update_product_record(pid, body)

        # Admin Order Status Update: PATCH /api/admin/orders/:number/status or PATCH /api/orders/:id (Requires Admin on BOTH)
        m_admin_ord = re.match(r"^/api/admin/orders/([^/]+)/status$", path)
        m_ord = re.match(r"^/api/orders/([^/]+)$", path)
        if m_admin_ord or m_ord:
            admin = self._require_admin()
            if not admin:
                return
            order_id = urllib.parse.unquote((m_admin_ord or m_ord).group(1))

            new_status = (body.get("status") or "").strip()
            if not new_status:
                return self._send_json(400, {"ok": False, "error": "Missing status"})

            valid_statuses = {"placed", "confirmed", "packed", "shipped", "delivered", "cancelled"}
            if new_status.lower() not in valid_statuses:
                return self._send_json(400, {
                    "ok": False,
                    "error": f"Invalid order status '{new_status}'. Allowed: {', '.join(sorted(valid_statuses))}."
                })

            ts = now_iso()
            with DB_LOCK:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute("SELECT data_json FROM orders WHERE order_id = ?", (order_id,))
                row = cur.fetchone()
                if not row:
                    conn.close()
                    return self._send_json(404, {"ok": False, "error": "Order not found"})
                odata = json.loads(row["data_json"])
                prev_status = str(odata.get("status", "")).lower()

                # Prevent reopening a cancelled order whose stock has already been restored
                if prev_status == "cancelled" and new_status.lower() != "cancelled":
                    conn.close()
                    return self._send_json(400, {
                        "ok": False,
                        "error": "Cancelled orders cannot be reopened because stock has already been restored."
                    })

                odata["status"] = new_status

                # Restore stock atomically if transitioning to cancelled for the first time
                if new_status.lower() == "cancelled" and prev_status != "cancelled" and not odata.get("stock_restored"):
                    for item in odata.get("items", []):
                        pid = item.get("product_id") or item.get("productId")
                        qty = int(item.get("quantity") or item.get("qty") or 1)
                        if pid:
                            cur.execute("SELECT data_json FROM products WHERE id = ?", (pid,))
                            prow = cur.fetchone()
                            if prow:
                                pdata = json.loads(prow["data_json"])
                                restored = int(pdata.get("stock", pdata.get("stockQty", 0))) + qty
                                pdata["stock"] = restored
                                pdata["stockQty"] = restored
                                pdata = normalize_product(pdata)
                                cur.execute(
                                    "UPDATE products SET data_json = ?, updated_at = ? WHERE id = ?",
                                    (json.dumps(pdata), ts, pid)
                                )
                    odata["stock_restored"] = True

                cur.execute(
                    "UPDATE orders SET status = ?, data_json = ? WHERE order_id = ?",
                    (new_status, json.dumps(odata), order_id)
                )
                conn.commit()
                conn.close()
            record_audit_log("order_status_update", admin, "order", order_id, self._get_client_ip(), {"from": prev_status, "to": new_status})
            return self._send_json(200, {"ok": True, "order": odata})

        # Wholesale status (Requires Admin)
        m_ws = re.match(r"^/api/wholesale/([^/]+)$", path)
        if m_ws:
            admin = self._require_admin()
            if not admin:
                return
            enquiry_id = urllib.parse.unquote(m_ws.group(1))
            new_status = (body.get("status") or "").strip()
            if not new_status:
                return self._send_json(400, {"ok": False, "error": "Missing status"})
            with DB_LOCK:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute("SELECT data_json FROM wholesale_enquiries WHERE enquiry_id = ?", (enquiry_id,))
                row = cur.fetchone()
                if not row:
                    conn.close()
                    return self._send_json(404, {"ok": False, "error": "Enquiry not found"})
                wdata = json.loads(row["data_json"])
                wdata["status"] = new_status
                cur.execute(
                    "UPDATE wholesale_enquiries SET status = ?, data_json = ? WHERE enquiry_id = ?",
                    (new_status, json.dumps(wdata), enquiry_id)
                )
                conn.commit()
                conn.close()
            record_audit_log("wholesale_status_update", admin, "wholesale", enquiry_id, self._get_client_ip(), {"status": new_status})
            return self._send_json(200, {"ok": True, "enquiry": wdata})

        # Contact message status (Requires Admin)
        m_msg = re.match(r"^/api/contact/([^/]+)$", path)
        if m_msg:
            admin = self._require_admin()
            if not admin:
                return
            message_id = urllib.parse.unquote(m_msg.group(1))
            new_status = (body.get("status") or "").strip()
            if not new_status:
                return self._send_json(400, {"ok": False, "error": "Missing status"})
            with DB_LOCK:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute("SELECT data_json FROM contact_messages WHERE message_id = ?", (message_id,))
                row = cur.fetchone()
                if not row:
                    conn.close()
                    return self._send_json(404, {"ok": False, "error": "Message not found"})
                mdata = json.loads(row["data_json"])
                mdata["status"] = new_status
                cur.execute(
                    "UPDATE contact_messages SET status = ?, data_json = ? WHERE message_id = ?",
                    (new_status, json.dumps(mdata), message_id)
                )
                conn.commit()
                conn.close()
            record_audit_log("contact_status_update", admin, "contact", message_id, self._get_client_ip(), {"status": new_status})
            return self._send_json(200, {"ok": True, "contactMessage": mdata})

        return self._send_json(404, {"ok": False, "error": f"Unknown PATCH endpoint: {path}"})

    # =========================================================================
    # DELETE ENDPOINTS
    # =========================================================================
    def do_DELETE(self):
        if self._route_ops("DELETE"):
            return
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # DELETE /api/wishlist/:productId
        m_wish = re.match(r"^/api/wishlist/([^/]+)$", path)
        if m_wish:
            user = self._require_auth()
            if not user:
                return
            pid = urllib.parse.unquote(m_wish.group(1))
            with DB_LOCK:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute("DELETE FROM wishlists WHERE user_id = ? AND product_id = ?", (user["id"], pid))
                cur.execute("SELECT product_id FROM wishlists WHERE user_id = ? ORDER BY created_at DESC", (user["id"],))
                pids = [r["product_id"] for r in cur.fetchall()]
                conn.close()
            return self._send_json(200, {"ok": True, "productIds": pids})

        # Admin Soft Hide Product: DELETE /api/admin/products/:id
        m_del_prod = re.match(r"^/api/admin/products/([^/]+)$", path)
        if m_del_prod:
            admin = self._require_admin()
            if not admin:
                return
            pid = urllib.parse.unquote(m_del_prod.group(1))
            return self._update_product_record(pid, {"active": False})

        return self._send_json(404, {"ok": False, "error": f"Unknown DELETE endpoint: {path}"})


def run_server(host="0.0.0.0", port=8080, extra_port=4000):
    init_db()
    if extra_port and extra_port != port:
        try:
            api_srv = http.server.ThreadingHTTPServer((host, extra_port), JanardanBackendHandler)
            t = threading.Thread(target=api_srv.serve_forever, daemon=True)
            t.start()
            print(f"Lepakshi Weaves API Server also listening at http://localhost:{extra_port}")
        except Exception as e:
            print(f"Note: Could not bind extra port {extra_port}: {e}")

    server = http.server.ThreadingHTTPServer((host, port), JanardanBackendHandler)
    print(f"Lepakshi Weaves Full-Stack Server running at http://127.0.0.1:{port}")
    print(f"SQLite Database: {DB_PATH}")
    server.serve_forever()


if __name__ == "__main__":
    run_server()
