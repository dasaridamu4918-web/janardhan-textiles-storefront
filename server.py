#!/usr/bin/env python3
"""
Janardan Textiles — Full-Stack Python + SQLite REST Backend Server (server.py)
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
import http.server
import json
import os
import re
import shutil
import sqlite3
import threading
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(ROOT_DIR, "janardan_textiles.db")
UPLOADS_DIR = os.path.join(ROOT_DIR, "public", "assets", "uploads")
ROOT_UPLOADS_DIR = os.path.join(ROOT_DIR, "uploads")
SAREES_IMAGES_DIR = os.path.join(ROOT_DIR, "public", "images", "sarees")
os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(ROOT_UPLOADS_DIR, exist_ok=True)
os.makedirs(SAREES_IMAGES_DIR, exist_ok=True)

DB_LOCK = threading.Lock()
GENERATION_LOCK = threading.Lock()


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


def hash_password(pw):
    return hashlib.sha256((pw or "").encode("utf-8")).hexdigest()


def get_db_connection():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


DEFAULT_INITIAL_PRODUCTS = [
    {
        "id": "jt-saree-09",
        "sku": "jt-saree-09",
        "isSampleProduct": False,
        "isSamplePrice": True,
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
        "isSampleProduct": True,
        "isSamplePrice": True,
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
        "description": "Sample design description (editable): A warm sand and gold silk-blend jacquard saree featuring a woven temple border, floral jacquard motifs across the body and pallu, and a coordinated bordered blouse for weddings and receptions.",
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
        "isSampleProduct": True,
        "isSamplePrice": True,
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
        "description": "Sample design description (editable): A sheer, lightweight ivory-gold tissue organza saree with a 4-inch antique gold floral vine border, tonal lotus weave, and a coordinated tissue blouse for festive and puja occasions.",
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
        "isSampleProduct": True,
        "isSamplePrice": True,
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
        "description": "Sample design description (editable): A champagne-beige art silk jacquard saree woven with a broad 5-inch paisley border, all-over jacquard paisley bootis, and a contrast espresso bordered blouse for wedding and reception wear.",
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
        "isSampleProduct": True,
        "isSamplePrice": True,
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
        "description": "Sample design description (editable): A matte espresso-brown soft mercerised saree with a soft sheen, sleek 2.5-inch geometric diamond gold border, diagonal star-burst buttis, and a matching striped-border blouse for evening and party wear.",
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
        "isSampleProduct": True,
        "isSamplePrice": True,
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
        "description": "Sample design description (editable): A breathable warm-ochre mercerised cotton saree with a matte finish and soft sheen, featuring a 3-inch woven dobby border, vertical pinstripes, and a coordinated dobby-bordered blouse for daywear and festive occasions.",
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
        "isSampleProduct": True,
        "isSamplePrice": True,
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
        "description": "Sample design description (editable): A richly textured champagne and bronze woven brocade saree with a 4.5-inch floral medallion border, dense foliate lattice weave across the body and pallu, and a coordinated brocade blouse for weddings and receptions.",
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
        "isSampleProduct": True,
        "isSamplePrice": True,
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
        "description": "Sample design description (editable): A soft matte-silk cream silk-cotton blend saree with a 2-inch muted gold satin-edge border, scattered woven coin motifs, and a self-textured bordered blouse for office and formal wear.",
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
        "isSampleProduct": True,
        "isSamplePrice": True,
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
        "description": "Sample design description (editable): A deep cocoa textured dobby blend saree with a small geometric weave, 3.5-inch bronze-gold dobby border, structured pallu bands, and a contrast geometric-bordered blouse for evening and cultural events.",
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


def normalize_product(prod, idx=0):
    p = dict(prod)
    sku = (p.get("sku") or p.get("id") or f"jt-saree-{idx + 1:02d}").strip()
    p["id"] = p.get("id") or sku
    p["sku"] = sku

    # Price & MRP normalization
    raw_price = p.get("price") if p.get("price") is not None else p.get("priceINR", 0)
    price = int(round(float(raw_price or 0)))
    raw_mrp = p.get("mrp") if p.get("mrp") is not None else p.get("originalPriceINR", price)
    mrp = int(round(float(raw_mrp or price)))
    p["price"] = price
    p["priceINR"] = price
    p["mrp"] = mrp
    p["originalPriceINR"] = mrp
    p["discountPercent"] = round(((mrp - price) / mrp) * 100) if mrp > price and mrp > 0 else 0

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
    p["active"] = bool(p.get("active", True))
    p["featured"] = bool(p.get("featured", idx < 5))
    p["bestseller"] = bool(p.get("bestseller", idx in (0, 1, 3, 5, 6)))
    p["isSamplePrice"] = bool(p.get("isSamplePrice", True))
    p["isSampleProduct"] = bool(p.get("isSampleProduct", sku != "jt-saree-09"))

    # Text fields
    p["work_details"] = p.get("work_details") if p.get("work_details") is not None else (p.get("borderAndZari") or "")
    p["borderAndZari"] = p.get("borderAndZari") or p["work_details"]
    p["blouse_piece"] = p.get("blouse_piece") if p.get("blouse_piece") is not None else (p.get("blousePiece") or "")
    p["blousePiece"] = p.get("blousePiece") or p["blouse_piece"]
    p["care_instructions"] = p.get("care_instructions") or ""
    p["motifs"] = p.get("motifs") or ""

    # 5 Gallery views & images array
    if not isinstance(p.get("gallery"), list) or len(p["gallery"]) == 0:
        if isinstance(p.get("images"), list) and len(p["images"]) > 0:
            gal = []
            for v_idx, url in enumerate(p["images"][:5]):
                ord_num, key, label, _ = REQUIRED_VIEWS[v_idx] if v_idx < len(REQUIRED_VIEWS) else (v_idx + 1, f"view_{v_idx+1}", f"View {v_idx+1}", "")
                gal.append({
                    "order": ord_num,
                    "key": key,
                    "label": label,
                    "url": url,
                    "isSampleImage": sku != "jt-saree-09",
                    "alt": f"{p.get('name', 'Saree')} — {label}"
                })
            p["gallery"] = gal
        else:
            p["gallery"] = [
                {
                    "order": ord_num,
                    "key": key,
                    "label": label,
                    "url": f"/public/images/sarees/{sku}/{fname}?v=nb2",
                    "isSampleImage": sku != "jt-saree-09",
                    "alt": f"{'Sample image — ' if sku != 'jt-saree-09' else ''}{p.get('name', 'Saree')} — {label} ({p.get('fabric', '')}, {p.get('color', '')})"
                }
                for ord_num, key, label, fname in REQUIRED_VIEWS
            ]
    p["images"] = [g.get("url") for g in p["gallery"] if g and g.get("url")]
    p["image"] = p["images"][0] if p["images"] else ""
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

        ts = now_iso()
        # Seed default users (Admin + Customer) if not present
        cur.execute("SELECT COUNT(*) AS cnt FROM users")
        if cur.fetchone()["cnt"] == 0:
            cur.execute(
                "INSERT INTO users (id, name, email, phone, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                ("usr-admin-01", "Janardan Mill Admin", "admin@janardantextiles.com", "9876543210", hash_password("admin123"), "admin", ts)
            )
            cur.execute(
                "INSERT INTO users (id, name, email, phone, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                ("usr-cust-01", "Ananya Sharma", "customer@janardantextiles.com", "9876501234", hash_password("customer123"), "customer", ts)
            )

        # Seed default 9 sarees if products table is empty
        cur.execute("SELECT COUNT(*) AS cnt FROM products")
        if cur.fetchone()["cnt"] == 0:
            for idx, raw_p in enumerate(DEFAULT_INITIAL_PRODUCTS):
                norm_p = normalize_product(raw_p, idx)
                cur.execute(
                    "INSERT INTO products (id, sort_order, data_json, updated_at) VALUES (?, ?, ?, ?)",
                    (norm_p["id"], idx, json.dumps(norm_p), ts)
                )

        # Ensure Janardan Textiles contact email is set to dasaridamu9418@gmail.com in settings
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
            "https://wa.me/919652262173?text=Hi%20Janardan%20Textiles%2C%20I%E2%80%99d%20like%20to%20know%20more%20about%20your%20sarees."
        )
        s_data["contacts"].setdefault("instagramHandle", "@dasari_damu")
        s_data["contacts"].setdefault("instagramUrl", "https://www.instagram.com/dasari_damu?obrf=MXJnZTZvdjRvNm10MA==")
        s_data["contacts"].setdefault("facebookUrl", "https://www.facebook.com/share/1AvqDY71mi/")
        s_data["contacts"].setdefault("pinterestUrl", "https://pin.it/2mS5N2kh4")
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
    ext = match.group(1).lower()
    if ext == "jpeg":
        ext = "jpg"
    raw_b64 = match.group(2)
    try:
        binary = base64.b64decode(raw_b64)
        filename = f"{prefix}-{uuid.uuid4().hex[:10]}.{ext}"
        filepath = os.path.join(UPLOADS_DIR, filename)
        with open(filepath, "wb") as f:
            f.write(binary)
        root_filepath = os.path.join(ROOT_UPLOADS_DIR, filename)
        with open(root_filepath, "wb") as f:
            f.write(binary)
        return f"/uploads/{filename}"
    except Exception:
        return data_uri


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


def fetch_bootstrap_payload():
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

        cur.execute("SELECT sort_order, data_json FROM products ORDER BY sort_order ASC, id ASC")
        products = [normalize_product(json.loads(r["data_json"]), idx) for idx, r in enumerate(cur.fetchall())]

        cur.execute("SELECT data_json FROM orders ORDER BY created_at DESC")
        orders = [json.loads(r["data_json"]) for r in cur.fetchall()]

        cur.execute("SELECT data_json FROM wholesale_enquiries ORDER BY created_at DESC")
        wholesale = [json.loads(r["data_json"]) for r in cur.fetchall()]

        cur.execute("SELECT data_json FROM contact_messages ORDER BY created_at DESC")
        contacts = [json.loads(r["data_json"]) for r in cur.fetchall()]

        conn.close()

    return {
        "ok": True,
        "seeded": bool(len(products) > 0),
        "dbStatus": "Connected • SQLite Persistent Backend (janardan_textiles.db)",
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
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

    def translate_path(self, path):
        parsed_path = urllib.parse.urlparse(path).path
        if parsed_path.startswith("/uploads/"):
            fname = parsed_path[len("/uploads/"):].lstrip("/")
            cand1 = os.path.join(ROOT_UPLOADS_DIR, fname.replace("/", os.sep))
            if os.path.exists(cand1):
                return cand1
            cand2 = os.path.join(UPLOADS_DIR, fname.replace("/", os.sep))
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
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
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

    # =========================================================================
    # GET ENDPOINTS
    # =========================================================================
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        qs = urllib.parse.parse_qs(parsed.query)

        if path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return

        if path == "/api/health":
            data = fetch_bootstrap_payload()
            return self._send_json(200, {
                "ok": True,
                "database": "sqlite3",
                "dbFile": "janardan_textiles.db",
                "seeded": data["seeded"],
                "counts": {
                    "products": len(data["products"]),
                    "orders": len(data["orders"]),
                    "wholesaleEnquiries": len(data["wholesaleEnquiries"]),
                    "contactMessages": len(data["contactMessages"])
                }
            })

        if path == "/api/bootstrap":
            return self._send_json(200, fetch_bootstrap_payload())

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
                filtered = list(reversed(filtered))

            page = max(1, int(qs.get("page", ["1"])[0] or 1))
            limit = max(1, min(100, int(qs.get("limit", ["12"])[0] or 12)))
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

        # GET /api/orders/mine
        if path == "/api/orders/mine":
            user = self._get_current_user()
            with DB_LOCK:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute("SELECT data_json FROM orders ORDER BY created_at DESC")
                all_orders = [json.loads(r["data_json"]) for r in cur.fetchall()]
                conn.close()
            if not user or user.get("role") == "admin":
                mine = all_orders
            else:
                mine = [
                    o for o in all_orders
                    if not o.get("user_id")
                    or o.get("user_id") == "guest"
                    or o.get("user_id") == user["id"]
                    or (user.get("email") and o.get("user_email") == user["email"])
                    or (user.get("phone") and o.get("phone") == user["phone"])
                ]
                if not mine:
                    mine = all_orders
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
            return self._send_json(200, json.loads(row["data_json"]))

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

        return super().do_GET()

    # =========================================================================
    # POST ENDPOINTS
    # =========================================================================
    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # Check if multipart/form-data upload to /api/admin/upload
        content_type = self.headers.get("Content-Type", "")
        if path == "/api/admin/upload" and "multipart/form-data" in content_type:
            admin = self._require_admin()
            if not admin:
                return
            length = int(self.headers.get("Content-Length", "0"))
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
                        orig_name = fn_match.group(1)
                        ext = os.path.splitext(orig_name)[1].lower()
                        if ext not in (".jpg", ".jpeg", ".png", ".webp"):
                            ext = ".jpg"
                        fname = f"upload-{uuid.uuid4().hex[:10]}{ext}"
                        with open(os.path.join(UPLOADS_DIR, fname), "wb") as f:
                            f.write(file_bytes)
                        with open(os.path.join(ROOT_UPLOADS_DIR, fname), "wb") as f:
                            f.write(file_bytes)
                        urls.append(f"/uploads/{fname}")
            return self._send_json(200, {"ok": True, "urls": urls})

        try:
            body = self._read_json_body()
        except Exception as e:
            return self._send_json(400, {"ok": False, "error": f"Invalid JSON: {e}"})

        # Auth: POST /api/auth/register
        if path == "/api/auth/register":
            name = (body.get("name") or "").strip()
            email = (body.get("email") or "").strip().lower()
            phone = (body.get("phone") or "").strip()
            password = body.get("password") or ""
            if not name or not email or not password:
                return self._send_json(400, {"ok": False, "error": "Name, email, and password are required."})
            if len(password) < 6:
                return self._send_json(400, {"ok": False, "error": "Password must be at least 6 characters."})
            ts = now_iso()
            user_id = f"usr-{uuid.uuid4().hex[:8]}"
            token = f"tok-{uuid.uuid4().hex}{uuid.uuid4().hex[:8]}"
            with DB_LOCK:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute("SELECT id FROM users WHERE email = ?", (email,))
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
            email = (body.get("email") or "").strip().lower()
            password = body.get("password") or ""
            if not email or not password:
                return self._send_json(400, {"ok": False, "error": "Email and password are required."})
            with DB_LOCK:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute(
                    "SELECT id, name, email, phone, role, password_hash FROM users WHERE LOWER(email) = ?",
                    (email,)
                )
                row = cur.fetchone()
                if not row or row["password_hash"] != hash_password(password):
                    conn.close()
                    return self._send_json(401, {"ok": False, "error": "Invalid email or password."})
                token = f"tok-{uuid.uuid4().hex}{uuid.uuid4().hex[:8]}"
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
            return self._send_json(200, {"ok": True, "token": token, "user": user_obj})

        # Razorpay Online Payment endpoints -> Honest 501 when Razorpay keys are not set
        if path in ("/api/payments/razorpay/order", "/api/payments/razorpay/verify"):
            if not os.environ.get("RAZORPAY_KEY_ID") or not os.environ.get("RAZORPAY_KEY_SECRET"):
                return self._send_json(501, {
                    "ok": False,
                    "error": "Online payment is not set up yet. Please select Cash on Delivery (COD) or configure Razorpay API keys."
                })

        # Seed / Reset Demo
        if path in ("/api/seed", "/api/reset-demo"):
            force = (path == "/api/reset-demo") or bool(body.get("force"))
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

                    for i, ord_item in enumerate(body.get("orders", [])):
                        created = ord_item.get("createdAt") or f"2026-10-{14 + i:02d}T10:00:00"
                        oid = ord_item.get("order_number") or ord_item.get("orderId") or f"JT-ORD-{1001 + i}"
                        ord_item["order_number"] = oid
                        ord_item["orderId"] = oid
                        cur.execute(
                            "INSERT INTO orders (order_id, created_at, status, total_inr, data_json) VALUES (?, ?, ?, ?, ?)",
                            (
                                oid,
                                created,
                                ord_item.get("status", "placed"),
                                int(ord_item.get("total", ord_item.get("totalINR", 0))),
                                json.dumps(ord_item)
                            )
                        )

                    for enq in body.get("wholesaleEnquiries", []):
                        cur.execute(
                            "INSERT INTO wholesale_enquiries (enquiry_id, created_at, status, data_json) VALUES (?, ?, ?, ?)",
                            (
                                enq["enquiryId"],
                                enq.get("createdAt") or ts,
                                enq.get("status", "New Enquiry"),
                                json.dumps(enq)
                            )
                        )

                    conn.commit()
                conn.close()

            return self._send_json(200, fetch_bootstrap_payload())

        # Create Order: POST /api/orders
        # Supports both Prompt 1 contract ({items:[{product_id,quantity}], address:{name,phone,line1,line2,city,state,pincode}, payment_method:"cod"|"online"})
        # and existing demo format.
        if path == "/api/orders":
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

            if payment_method == "online" and not os.environ.get("RAZORPAY_KEY_ID"):
                return self._send_json(501, {"ok": False, "error": "Online payment is not set up yet. Please use Cash on Delivery (COD)."})

            created_at = now_iso()
            order_number = body.get("order_number") or body.get("orderId") or f"JT-{datetime.datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().int % 9000 + 1000}"

            with DB_LOCK:
                conn = get_db_connection()
                cur = conn.cursor()

                enriched_items = []
                subtotal = 0
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
                    avail_stock = int(pdata.get("stock", 0))
                    if avail_stock < qty or pdata.get("stock_status") == "out_of_stock":
                        conn.close()
                        return self._send_json(400, {
                            "ok": False,
                            "error": f"Insufficient stock for '{pdata['name']}' (requested {qty}, available {avail_stock})."
                        })

                    # Deduct stock
                    new_stock = max(0, avail_stock - qty)
                    pdata["stock"] = new_stock
                    pdata["stockQty"] = new_stock
                    pdata = normalize_product(pdata)
                    cur.execute(
                        "UPDATE products SET data_json = ?, updated_at = ? WHERE id = ?",
                        (json.dumps(pdata), created_at, pid)
                    )

                    unit_price = int(pdata["price"])
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
                        "isSamplePrice": pdata.get("isSamplePrice", True)
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
                    "payment_status": "Pending (COD)" if payment_method == "cod" else "Pending",
                    "status": "placed",
                    "subtotal": subtotal,
                    "shipping": shipping_fee,
                    "total": total_inr,
                    "totalINR": total_inr,
                    "items": enriched_items,
                    "date": created_at[:10],
                    "created_at": created_at,
                    "createdAt": created_at,
                    "isDemoOrder": True
                }

                cur.execute(
                    "INSERT INTO orders (order_id, created_at, status, total_inr, data_json) VALUES (?, ?, ?, ?, ?)",
                    (order_number, created_at, "placed", total_inr, json.dumps(new_order))
                )
                conn.commit()
                conn.close()

            payload = fetch_bootstrap_payload()
            payload["order_number"] = order_number
            payload["order"] = new_order
            payload["createdOrder"] = new_order
            return self._send_json(201, payload)

        # Wholesale Enquiry: POST /api/wholesale
        if path == "/api/wholesale":
            enquiry_id = body.get("enquiryId") or f"WS-DEMO-{uuid.uuid4().int % 900 + 100}"
            created_at = now_iso()
            enquiry = {
                "enquiryId": enquiry_id,
                "businessName": (body.get("businessName") or "").strip(),
                "contactPerson": (body.get("contactPerson") or "").strip(),
                "phone": (body.get("phone") or "").strip(),
                "city": (body.get("city") or "").strip(),
                "sareeInterest": body.get("sareeInterest") or "Assorted Catalogue",
                "estimatedQuantity": (body.get("estimatedQuantity") or "").strip(),
                "status": "New Enquiry",
                "notes": (body.get("notes") or "Standard catalogue enquiry").strip(),
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

        # Contact Message: POST /api/contact
        if path == "/api/contact":
            msg_id = f"MSG-{uuid.uuid4().hex[:6].upper()}"
            created_at = now_iso()
            msg_obj = {
                "messageId": msg_id,
                "name": (body.get("name") or "").strip(),
                "contact": (body.get("contact") or "").strip(),
                "message": (body.get("message") or "").strip(),
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
                urls.append(saved)
            return self._send_json(200, {"ok": True, "urls": urls})

        # Create Product: POST /api/admin/products or POST /api/products
        if path in ("/api/admin/products", "/api/products"):
            if path == "/api/admin/products":
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

        # Bulk Import Products: POST /api/admin/products/bulk
        if path == "/api/admin/products/bulk":
            admin = self._require_admin()
            if not admin:
                return
            rows = body.get("products")
            if not isinstance(rows, list):
                return self._send_json(400, {"ok": False, "error": "Expected { products: [...] } array."})
            if len(rows) > 1000:
                return self._send_json(400, {"ok": False, "error": "Maximum 1000 products per bulk request."})

            created = 0
            updated = 0
            errors = []
            ts = now_iso()
            with DB_LOCK:
                conn = get_db_connection()
                cur = conn.cursor()
                for idx, row_data in enumerate(rows):
                    sku = str(row_data.get("sku") or row_data.get("id") or "").strip()
                    name = str(row_data.get("name") or "").strip()
                    fabric = str(row_data.get("fabric") or "").strip()
                    color = str(row_data.get("color") or row_data.get("colour") or "").strip()
                    if not sku or not name or not fabric or not color:
                        errors.append({"row": idx + 1, "sku": sku, "error": "Missing required sku, name, fabric, or color"})
                        continue
                    try:
                        price_val = float(row_data.get("price") or row_data.get("priceINR") or 0)
                        if price_val <= 0:
                            errors.append({"row": idx + 1, "sku": sku, "error": "Price must be greater than 0"})
                            continue
                    except Exception:
                        errors.append({"row": idx + 1, "sku": sku, "error": "Invalid numeric price"})
                        continue

                    row_data["id"] = sku
                    row_data["sku"] = sku
                    row_data["color"] = color
                    cur.execute("SELECT data_json FROM products WHERE id = ?", (sku,))
                    existing = cur.fetchone()
                    if existing:
                        merged = json.loads(existing["data_json"])
                        merged.update(row_data)
                        norm_p = normalize_product(merged)
                        cur.execute(
                            "UPDATE products SET data_json = ?, updated_at = ? WHERE id = ?",
                            (json.dumps(norm_p), ts, sku)
                        )
                        updated += 1
                    else:
                        cur.execute("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_ord FROM products")
                        next_ord = cur.fetchone()["next_ord"]
                        norm_p = normalize_product(row_data, next_ord)
                        cur.execute(
                            "INSERT INTO products (id, sort_order, data_json, updated_at) VALUES (?, ?, ?, ?)",
                            (sku, next_ord, json.dumps(norm_p), ts)
                        )
                        created += 1
                conn.commit()
                conn.close()

            return self._send_json(200, {
                "ok": True,
                "created": created,
                "updated": updated,
                "errors": errors
            })

        # Generate Single Saree View (Server-Side Nano Banana API — never exposes key to browser)
        if path == "/api/sarees/generate-view":
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

        # Generate Saree (5-View Gallery + New Catalogue Product Card): POST /api/sarees/generate
        if path == "/api/sarees/generate":
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
                            "Saved 5-view Nano Banana studio photography set from project reference library to "
                            f"/public/images/sarees/{new_sku}/ and janardan_textiles.db. "
                            "Tip: Set GEMINI_API_KEY in .env on the server to enable live on-demand Gemini API calls."
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

        # PUT /api/products/<id>
        m_prod = re.match(r"^/api/products/([^/]+)$", path)
        if m_prod:
            product_id = urllib.parse.unquote(m_prod.group(1))
            return self._update_product_record(product_id, body)

        # PUT /api/products/<id>/gallery/<idx>
        m_gal = re.match(r"^/api/products/([^/]+)/gallery/(\d+)$", path)
        if m_gal:
            product_id = urllib.parse.unquote(m_gal.group(1))
            view_idx = int(m_gal.group(2))
            new_url = body.get("url") or ""
            stored_url = save_data_uri_if_raster(new_url, prefix=f"{product_id}-v{view_idx + 1}")
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
                if "gallery" in pdata and 0 <= view_idx < len(pdata["gallery"]):
                    pdata["gallery"][view_idx]["url"] = stored_url
                    if "alt" in body:
                        pdata["gallery"][view_idx]["alt"] = body["alt"]
                    if "isSampleImage" in body:
                        pdata["gallery"][view_idx]["isSampleImage"] = bool(body["isSampleImage"])
                pdata = normalize_product(pdata)
                cur.execute(
                    "UPDATE products SET data_json = ?, updated_at = ? WHERE id = ?",
                    (json.dumps(pdata), ts, product_id)
                )
                conn.commit()
                conn.close()
            return self._send_json(200, {"ok": True, "url": stored_url, "product": pdata})

        if path == "/api/settings/contacts":
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
            return self._send_json(200, {"ok": True, "settings": settings})

        if path == "/api/settings/policies":
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
                "price", "mrp", "stock", "stockQty", "stockStatus", "stock_status",
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
                for idx, url in enumerate(body["images"][:5]):
                    ord_num, key, label, _ = REQUIRED_VIEWS[idx] if idx < len(REQUIRED_VIEWS) else (idx + 1, f"view_{idx+1}", f"View {idx+1}", "")
                    existing_slot = pdata.get("gallery", [])[idx] if isinstance(pdata.get("gallery"), list) and idx < len(pdata["gallery"]) else {}
                    new_gal.append({
                        "order": ord_num,
                        "key": key,
                        "label": existing_slot.get("label") or label,
                        "url": save_data_uri_if_raster(url, prefix=f"{product_id}-v{idx+1}"),
                        "isSampleImage": existing_slot.get("isSampleImage", False),
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
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        try:
            body = self._read_json_body()
        except Exception as e:
            return self._send_json(400, {"ok": False, "error": f"Invalid JSON: {e}"})

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

        # Admin Order Status Update: PATCH /api/admin/orders/:number/status or PATCH /api/orders/:id
        m_admin_ord = re.match(r"^/api/admin/orders/([^/]+)/status$", path)
        m_ord = re.match(r"^/api/orders/([^/]+)$", path)
        if m_admin_ord or m_ord:
            if m_admin_ord:
                admin = self._require_admin()
                if not admin:
                    return
                order_id = urllib.parse.unquote(m_admin_ord.group(1))
            else:
                order_id = urllib.parse.unquote(m_ord.group(1))

            new_status = (body.get("status") or "").strip()
            if not new_status:
                return self._send_json(400, {"ok": False, "error": "Missing status"})

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
                odata["status"] = new_status

                # Restore stock if transitioning to cancelled
                if new_status.lower() == "cancelled" and prev_status != "cancelled":
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
            return self._send_json(200, {"ok": True, "order": odata})

        # Wholesale status
        m_ws = re.match(r"^/api/wholesale/([^/]+)$", path)
        if m_ws:
            enquiry_id = urllib.parse.unquote(m_ws.group(1))
            new_status = body.get("status")
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
            return self._send_json(200, {"ok": True, "enquiry": wdata})

        # Contact message status
        m_msg = re.match(r"^/api/contact/([^/]+)$", path)
        if m_msg:
            message_id = urllib.parse.unquote(m_msg.group(1))
            new_status = body.get("status")
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
            return self._send_json(200, {"ok": True, "contactMessage": mdata})

        return self._send_json(404, {"ok": False, "error": f"Unknown PATCH endpoint: {path}"})

    # =========================================================================
    # DELETE ENDPOINTS
    # =========================================================================
    def do_DELETE(self):
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
            print(f"Janardan Textiles API Server also listening at http://localhost:{extra_port}")
        except Exception as e:
            print(f"Note: Could not bind extra port {extra_port}: {e}")

    server = http.server.ThreadingHTTPServer((host, port), JanardanBackendHandler)
    print(f"Janardan Textiles Full-Stack Server running at http://127.0.0.1:{port}")
    print(f"SQLite Database: {DB_PATH}")
    server.serve_forever()


if __name__ == "__main__":
    run_server()
