#!/usr/bin/env python3
"""
Janardan Textiles — Full-Stack Python + SQLite REST Backend Server (server.py)

Provides:
1. Static file hosting for the Janardan Textiles web application (index.html, showcase-3d.html, /src, /assets)
2. Persistent SQLite database (`janardan_textiles.db`)
3. RESTful JSON API endpoints:
   - GET    /api/health
   - GET    /api/bootstrap
   - POST   /api/seed
   - PUT    /api/products/<product_id>
   - POST   /api/products
   - PUT    /api/products/<product_id>/gallery/<view_idx>
   - POST   /api/orders
   - PATCH  /api/orders/<order_id>
   - DELETE /api/orders/<order_id>
   - POST   /api/wholesale
   - PATCH  /api/wholesale/<enquiry_id>
   - POST   /api/contact
   - PATCH  /api/contact/<message_id>
   - PUT    /api/settings/contacts
   - PUT    /api/settings/policies
   - POST   /api/reset-demo
"""

import base64
import datetime
import http.server
import json
import os
import re
import sqlite3
import threading
import urllib.parse
import uuid

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(ROOT_DIR, "janardan_textiles.db")
UPLOADS_DIR = os.path.join(ROOT_DIR, "public", "assets", "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

DB_LOCK = threading.Lock()


def now_iso():
    return datetime.datetime.now(datetime.timezone.utc).astimezone().isoformat(timespec="seconds")


def get_db_connection():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


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
        conn.commit()
        conn.close()


def save_data_uri_if_raster(data_uri, prefix="saree"):
    """
    If a client uploads a base64 raster image (PNG/JPEG/WebP), saves it to
    public/assets/uploads/ and returns the clean /assets/uploads/<filename> URL
    so SQLite stays fast and lightweight. SVG data URIs are kept inline or saved cleanly.
    """
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
        return f"/assets/uploads/{filename}"
    except Exception:
        return data_uri


def fetch_bootstrap_payload():
    with DB_LOCK:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("SELECT value_json FROM settings WHERE key = 'site_settings'")
        row_settings = cur.fetchone()
        settings = json.loads(row_settings["value_json"]) if row_settings else None

        cur.execute("SELECT data_json FROM products ORDER BY sort_order ASC, id ASC")
        products = [json.loads(r["data_json"]) for r in cur.fetchall()]

        cur.execute("SELECT data_json FROM orders ORDER BY created_at DESC")
        orders = [json.loads(r["data_json"]) for r in cur.fetchall()]

        cur.execute("SELECT data_json FROM wholesale_enquiries ORDER BY created_at DESC")
        wholesale = [json.loads(r["data_json"]) for r in cur.fetchall()]

        cur.execute("SELECT data_json FROM contact_messages ORDER BY created_at DESC")
        contacts = [json.loads(r["data_json"]) for r in cur.fetchall()]

        conn.close()

    return {
        "ok": True,
        "seeded": bool(settings and len(products) > 0),
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
        resolved = super().translate_path(path)
        if not os.path.exists(resolved):
            parsed_path = urllib.parse.urlparse(path).path.lstrip("/")
            public_candidate = os.path.join(ROOT_DIR, "public", parsed_path.replace("/", os.sep))
            if os.path.exists(public_candidate):
                return public_candidate
        return resolved

    def log_message(self, format, *args):
        pass

    def end_headers(self):
        # Enable CORS and disable browser caching so updated images/data load immediately
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
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
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw) if raw else {}

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

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

        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        try:
            body = self._read_json_body()
        except Exception as e:
            return self._send_json(400, {"ok": False, "error": f"Invalid JSON: {e}"})

        # 1. Seed initial database state if empty (or force reset)
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

                    for idx, prod in enumerate(body.get("products", [])):
                        cur.execute(
                            "INSERT INTO products (id, sort_order, data_json, updated_at) VALUES (?, ?, ?, ?)",
                            (prod["id"], idx, json.dumps(prod), ts)
                        )

                    for i, ord_item in enumerate(body.get("orders", [])):
                        created = ord_item.get("createdAt") or f"2026-10-{14 + i:02d}T10:00:00"
                        cur.execute(
                            "INSERT INTO orders (order_id, created_at, status, total_inr, data_json) VALUES (?, ?, ?, ?, ?)",
                            (
                                ord_item["orderId"],
                                created,
                                ord_item.get("status", "Processing (Demo)"),
                                int(ord_item.get("totalINR", 0)),
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

        # 2. Create a new Order & deduct stock in SQLite
        if path == "/api/orders":
            customer_name = (body.get("customerName") or "").strip()
            phone = (body.get("phone") or "").strip()
            city = (body.get("city") or "").strip()
            items = body.get("items") or []

            if not customer_name or not phone or not city or not items:
                return self._send_json(400, {"ok": False, "error": "Missing required order fields or cart items."})

            total_inr = sum(int(i.get("priceINR", 0)) * int(i.get("qty", 1)) for i in items)
            order_id = body.get("orderId") or f"DEMO-JT-{uuid.uuid4().int % 9000 + 1000}"
            created_at = now_iso()

            new_order = {
                "orderId": order_id,
                "isDemoOrder": True,
                "customerName": customer_name,
                "phone": phone,
                "city": city,
                "date": created_at[:10],
                "createdAt": created_at,
                "status": "Demo Order Received",
                "totalINR": total_inr,
                "items": items
            }

            with DB_LOCK:
                conn = get_db_connection()
                cur = conn.cursor()

                # Deduct stock quantity for each ordered item
                for cart_item in items:
                    pid = cart_item.get("productId")
                    qty = int(cart_item.get("qty", 1))
                    cur.execute("SELECT data_json FROM products WHERE id = ?", (pid,))
                    prow = cur.fetchone()
                    if prow:
                        pdata = json.loads(prow["data_json"])
                        new_qty = max(0, int(pdata.get("stockQty", 0)) - qty)
                        pdata["stockQty"] = new_qty
                        if new_qty == 0:
                            pdata["stockStatus"] = "Out of Stock"
                        elif new_qty <= 10:
                            pdata["stockStatus"] = "Low Stock"
                        else:
                            pdata["stockStatus"] = "In Stock"
                        cur.execute(
                            "UPDATE products SET data_json = ?, updated_at = ? WHERE id = ?",
                            (json.dumps(pdata), created_at, pid)
                        )

                cur.execute(
                    "INSERT INTO orders (order_id, created_at, status, total_inr, data_json) VALUES (?, ?, ?, ?, ?)",
                    (order_id, created_at, new_order["status"], total_inr, json.dumps(new_order))
                )
                conn.commit()
                conn.close()

            payload = fetch_bootstrap_payload()
            payload["createdOrder"] = new_order
            return self._send_json(201, payload)

        # 3. Create a new Wholesale Enquiry in SQLite
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

        # 4. Create a new Contact Message in SQLite
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

        # 5. Add a New Product Saree
        if path == "/api/products":
            prod_id = body.get("id") or f"jt-saree-{uuid.uuid4().hex[:4]}"
            body["id"] = prod_id
            ts = now_iso()
            with DB_LOCK:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_ord FROM products")
                next_ord = cur.fetchone()["next_ord"]
                cur.execute(
                    "INSERT INTO products (id, sort_order, data_json, updated_at) VALUES (?, ?, ?, ?)",
                    (prod_id, next_ord, json.dumps(body), ts)
                )
                conn.commit()
                conn.close()
            return self._send_json(201, {"ok": True, "product": body})

        return self._send_json(404, {"ok": False, "error": f"Unknown POST endpoint: {path}"})

    def do_PUT(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        try:
            body = self._read_json_body()
        except Exception as e:
            return self._send_json(400, {"ok": False, "error": f"Invalid JSON: {e}"})

        # 1. Update a Product's specifications: PUT /api/products/<id>
        m_prod = re.match(r"^/api/products/([^/]+)$", path)
        if m_prod:
            product_id = urllib.parse.unquote(m_prod.group(1))
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
                    cur.execute(
                        "INSERT INTO products (id, sort_order, data_json, updated_at) VALUES (?, ?, ?, ?)",
                        (product_id, -1, json.dumps(pdata), ts)
                    )
                    conn.commit()
                    conn.close()
                    return self._send_json(200, {"ok": True, "product": pdata, "inserted": True})
                pdata = json.loads(row["data_json"])
                for field in (
                    "sku", "name", "priceINR", "originalPriceINR", "discountPercent",
                    "isSamplePrice", "isSampleProduct", "wholesalePriceINR", "minWholesaleQty",
                    "description", "fabric", "color", "occasion",
                    "stockStatus", "stockQty", "borderAndZari", "motifs", "blousePiece", "gallery"
                ):
                    if field in body:
                        pdata[field] = body[field]
                if "priceINR" in body and body["priceINR"] is not None:
                    pdata["priceINR"] = int(round(float(body["priceINR"])))
                    pdata["originalPriceINR"] = pdata["priceINR"]
                    pdata["discountPercent"] = 0
                cur.execute(
                    "UPDATE products SET data_json = ?, updated_at = ? WHERE id = ?",
                    (json.dumps(pdata), ts, product_id)
                )
                conn.commit()
                conn.close()
            return self._send_json(200, {"ok": True, "product": pdata})

        # 2. Update a Product's specific Gallery View slot (0..4): PUT /api/products/<id>/gallery/<idx>
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
                pdata = json.loads(row["data_json"])
                if "gallery" in pdata and 0 <= view_idx < len(pdata["gallery"]):
                    pdata["gallery"][view_idx]["url"] = stored_url
                    if "alt" in body:
                        pdata["gallery"][view_idx]["alt"] = body["alt"]
                    if "isSampleImage" in body:
                        pdata["gallery"][view_idx]["isSampleImage"] = bool(body["isSampleImage"])
                cur.execute(
                    "UPDATE products SET data_json = ?, updated_at = ? WHERE id = ?",
                    (json.dumps(pdata), ts, product_id)
                )
                conn.commit()
                conn.close()
            return self._send_json(200, {"ok": True, "url": stored_url, "product": pdata})

        # 3. Update Centralized Contact Settings: PUT /api/settings/contacts
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

        # 4. Update Policy Drafts: PUT /api/settings/policies
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

    def do_PATCH(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        try:
            body = self._read_json_body()
        except Exception as e:
            return self._send_json(400, {"ok": False, "error": f"Invalid JSON: {e}"})

        # 1. Update Order status: PATCH /api/orders/<order_id>
        m_ord = re.match(r"^/api/orders/([^/]+)$", path)
        if m_ord:
            order_id = urllib.parse.unquote(m_ord.group(1))
            new_status = body.get("status")
            with DB_LOCK:
                conn = get_db_connection()
                cur = conn.cursor()
                cur.execute("SELECT data_json FROM orders WHERE order_id = ?", (order_id,))
                row = cur.fetchone()
                if not row:
                    conn.close()
                    return self._send_json(404, {"ok": False, "error": "Order not found"})
                odata = json.loads(row["data_json"])
                odata["status"] = new_status
                cur.execute(
                    "UPDATE orders SET status = ?, data_json = ? WHERE order_id = ?",
                    (new_status, json.dumps(odata), order_id)
                )
                conn.commit()
                conn.close()
            return self._send_json(200, {"ok": True, "order": odata})

        # 2. Update Wholesale Enquiry status: PATCH /api/wholesale/<enquiry_id>
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

        # 3. Update Contact Message status: PATCH /api/contact/<message_id>
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


def run_server(host="127.0.0.1", port=8080):
    init_db()
    server = http.server.ThreadingHTTPServer((host, port), JanardanBackendHandler)
    print(f"Janardan Textiles Full-Stack Server running at http://{host}:{port}")
    print(f"SQLite Database: {DB_PATH}")
    server.serve_forever()


if __name__ == "__main__":
    run_server()
