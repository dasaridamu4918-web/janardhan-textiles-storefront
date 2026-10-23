"""
LEPAKSHI WEAVES - Operations (Orders & Allocation) Dashboard backend.

Mounted by server.py under /api/ops/*. Uses the same SQLite database and the same
session tokens as the storefront admin. Roles:
  * admin  - everything (uploads, allocation, staff management, activity log, placeholder data)
  * staff  - view dashboard, upload sheets, allocate orders, update order status, export

Uploaded spreadsheets are stored in PRIVATE_OPS_UPLOAD_DIR, which is outside every
publicly served folder and blocked by server.py's translate_path().

NOTE: Vercel hosts the storefront as static files only, so these endpoints run when
server.py is running (locally or on a Python host). See README "Operations dashboard".
"""
import base64
import datetime
import hashlib
import json
import os
import re
import secrets
import urllib.parse

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
PRIVATE_OPS_UPLOAD_DIR = os.path.join(ROOT_DIR, "private_uploads", "ops")

STATUSES = ["New", "Allocated", "In production", "Dispatched", "Delivered"]
STATUS_LOOKUP = {s.lower(): s for s in STATUSES}
STATUS_LOOKUP.update({"pending": "New", "in-production": "In production", "production": "In production",
                      "shipped": "Dispatched", "dispatch": "Dispatched"})
CHANNELS = {"retail": "Retail", "wholesale": "Wholesale"}

TEMPLATE_COLUMNS = [
    "order_id", "order_date", "retailer_name", "retailer_city", "channel",
    "product_code", "product_name", "fabric", "quantity", "status", "notes",
]
REQUIRED_COLUMNS = ["order_id", "order_date", "retailer_name", "product_code", "quantity"]

MAX_ROWS_PER_UPLOAD = 20000
MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_TEXT = {"order_id": 40, "retailer_name": 120, "retailer_city": 80, "product_code": 40,
            "product_name": 160, "fabric": 80, "notes": 500}
ORDER_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9\-_/\.]{0,39}$")
PRODUCT_CODE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9\-_/\.]{0,39}$")
PLACEHOLDER_TAG = "[PLACEHOLDER]"


def _now():
    return datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------
def init_ops_schema(conn):
    cur = conn.cursor()
    cur.executescript("""
        CREATE TABLE IF NOT EXISTS ops_products (
            code TEXT PRIMARY KEY,
            name TEXT NOT NULL DEFAULT '',
            fabric TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ops_retailers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE COLLATE NOCASE,
            city TEXT NOT NULL DEFAULT '',
            channel TEXT NOT NULL DEFAULT 'Retail',
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ops_staff (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT UNIQUE,
            name TEXT NOT NULL,
            phone TEXT NOT NULL DEFAULT '',
            team TEXT NOT NULL DEFAULT 'Production',
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ops_uploads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            original_filename TEXT NOT NULL,
            stored_filename TEXT NOT NULL DEFAULT '',
            sha256 TEXT NOT NULL DEFAULT '',
            uploaded_by TEXT NOT NULL,
            uploaded_at TEXT NOT NULL,
            total_rows INTEGER NOT NULL DEFAULT 0,
            imported_rows INTEGER NOT NULL DEFAULT 0,
            error_rows INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS ops_orders (
            order_id TEXT PRIMARY KEY,
            order_date TEXT NOT NULL,
            retailer_id INTEGER NOT NULL REFERENCES ops_retailers(id),
            channel TEXT NOT NULL DEFAULT 'Retail',
            product_code TEXT NOT NULL REFERENCES ops_products(code),
            fabric TEXT NOT NULL DEFAULT '',
            quantity INTEGER NOT NULL CHECK (quantity > 0),
            status TEXT NOT NULL DEFAULT 'New',
            notes TEXT NOT NULL DEFAULT '',
            upload_id INTEGER REFERENCES ops_uploads(id),
            is_placeholder INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ops_allocations (
            order_id TEXT PRIMARY KEY REFERENCES ops_orders(order_id) ON DELETE CASCADE,
            staff_id INTEGER REFERENCES ops_staff(id),
            batch TEXT NOT NULL DEFAULT '',
            dispatch_ref TEXT NOT NULL DEFAULT '',
            allocated_by TEXT NOT NULL,
            allocated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ops_orders_date ON ops_orders(order_date);
        CREATE INDEX IF NOT EXISTS idx_ops_orders_status ON ops_orders(status);
        CREATE INDEX IF NOT EXISTS idx_ops_orders_retailer ON ops_orders(retailer_id);
        CREATE INDEX IF NOT EXISTS idx_ops_orders_product ON ops_orders(product_code);
    """)
    conn.commit()


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------
def _clean_text(value, field):
    s = "" if value is None else str(value)
    s = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", s).strip()
    # Neutralise spreadsheet formula injection on later export
    if s[:1] in ("=", "+", "@") or (s[:1] == "-" and not re.match(r"^-?\d", s)):
        s = "'" + s
    limit = MAX_TEXT.get(field)
    return s[:limit] if limit else s


def parse_date(value):
    """Accepts YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY, ISO datetimes, or Excel serial numbers."""
    if value is None or str(value).strip() == "":
        return None
    s = str(value).strip()
    if re.match(r"^\d{4,5}(\.\d+)?$", s):
        serial = float(s)
        if 20000 < serial < 80000:
            return (datetime.date(1899, 12, 30) + datetime.timedelta(days=int(serial))).isoformat()
    s = s.split("T")[0].split(" ")[0]
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y", "%Y/%m/%d", "%d-%b-%Y", "%d %b %Y"):
        try:
            d = datetime.datetime.strptime(s, fmt).date()
            if 2000 <= d.year <= 2100:
                return d.isoformat()
        except ValueError:
            continue
    return None


def validate_rows(rows, existing_ids):
    """Returns (valid_rows, errors). errors = [{row, field, message}] with 1-based sheet row numbers (header = row 1)."""
    valid, errors, seen = [], [], {}
    if not isinstance(rows, list):
        return [], [{"row": 0, "field": "", "message": "Rows must be a list."}]
    for idx, raw in enumerate(rows):
        sheet_row = idx + 2
        if not isinstance(raw, dict):
            errors.append({"row": sheet_row, "field": "", "message": "Row is not an object."})
            continue
        r = {k: _clean_text(raw.get(k), k) for k in TEMPLATE_COLUMNS}
        if not any(r.values()):
            continue  # skip fully blank rows silently
        row_errors = []
        if not r["order_id"]:
            row_errors.append(("order_id", "Missing order ID."))
        elif not ORDER_ID_RE.match(r["order_id"]):
            row_errors.append(("order_id", "Order ID may only contain letters, numbers, - _ / . (max 40)."))
        if not r["product_code"]:
            row_errors.append(("product_code", "Missing product code."))
        elif not PRODUCT_CODE_RE.match(r["product_code"]):
            row_errors.append(("product_code", "Product code may only contain letters, numbers, - _ / . (max 40)."))
        if not r["retailer_name"]:
            row_errors.append(("retailer_name", "Missing retailer name."))
        d = parse_date(r["order_date"])
        if not d:
            row_errors.append(("order_date", f"Invalid date '{r['order_date']}'. Use YYYY-MM-DD or DD-MM-YYYY."))
        qty_raw = r["quantity"].replace(",", "")
        qty = None
        try:
            qf = float(qty_raw)
            if qf != int(qf):
                raise ValueError
            qty = int(qf)
            if qty < 1 or qty > 100000:
                row_errors.append(("quantity", f"Quantity must be between 1 and 100000 (got {qty_raw})."))
        except (ValueError, OverflowError):
            row_errors.append(("quantity", f"Wrong quantity '{r['quantity']}'. Use a whole number like 12."))
        status = "New"
        if r["status"]:
            status = STATUS_LOOKUP.get(r["status"].strip().lower())
            if not status:
                row_errors.append(("status", f"Unknown status '{r['status']}'. Use: {', '.join(STATUSES)}."))
        channel = CHANNELS.get((r["channel"] or "retail").strip().lower())
        if not channel:
            row_errors.append(("channel", f"Channel must be Retail or Wholesale (got '{r['channel']}')."))
        oid_key = r["order_id"].upper()
        if r["order_id"]:
            if oid_key in seen:
                row_errors.append(("order_id", f"Duplicate order ID '{r['order_id']}' (also on row {seen[oid_key]})."))
            elif oid_key in existing_ids:
                row_errors.append(("order_id", f"Order ID '{r['order_id']}' already exists in the dashboard."))
            else:
                seen[oid_key] = sheet_row
        if row_errors:
            for field, msg in row_errors:
                errors.append({"row": sheet_row, "field": field, "message": msg, "order_id": r["order_id"]})
            continue
        valid.append({
            "order_id": r["order_id"], "order_date": d, "retailer_name": r["retailer_name"],
            "retailer_city": r["retailer_city"], "channel": channel, "product_code": r["product_code"].upper(),
            "product_name": r["product_name"], "fabric": r["fabric"], "quantity": qty,
            "status": status, "notes": r["notes"],
        })
    return valid, errors


# ---------------------------------------------------------------------------
# Query helpers
# ---------------------------------------------------------------------------
def _filters_sql(qs):
    g = lambda k: (qs.get(k, [""])[0] or "").strip()
    where, params = [], []
    if g("from"):
        where.append("o.order_date >= ?"); params.append(g("from"))
    if g("to"):
        where.append("o.order_date <= ?"); params.append(g("to"))
    if g("status") and g("status") in STATUSES:
        where.append("o.status = ?"); params.append(g("status"))
    elif g("status") == "Pending":
        where.append("o.status = 'New'")
    if g("retailer"):
        where.append("r.name = ?"); params.append(g("retailer"))
    if g("product"):
        where.append("o.product_code = ?"); params.append(g("product").upper())
    if g("fabric"):
        where.append("o.fabric = ?"); params.append(g("fabric"))
    if g("staff"):
        where.append("a.staff_id = ?"); params.append(g("staff"))
    if g("q"):
        like = f"%{g('q')}%"
        where.append("(o.order_id LIKE ? OR r.name LIKE ? OR o.product_code LIKE ? OR p.name LIKE ? OR o.notes LIKE ? OR a.batch LIKE ?)")
        params += [like] * 6
    return (" WHERE " + " AND ".join(where)) if where else "", params


BASE_FROM = """
    FROM ops_orders o
    JOIN ops_retailers r ON r.id = o.retailer_id
    LEFT JOIN ops_products p ON p.code = o.product_code
    LEFT JOIN ops_allocations a ON a.order_id = o.order_id
    LEFT JOIN ops_staff s ON s.id = a.staff_id
"""
ORDER_COLUMNS = """
    o.order_id, o.order_date, r.name AS retailer, r.city AS retailer_city, o.channel,
    o.product_code, COALESCE(p.name, '') AS product_name, o.fabric, o.quantity, o.status, o.notes,
    o.is_placeholder, COALESCE(s.name, '') AS staff_name, a.staff_id, COALESCE(a.batch, '') AS batch,
    COALESCE(a.dispatch_ref, '') AS dispatch_ref, COALESCE(a.allocated_at, '') AS allocated_at, o.updated_at
"""


def _rows(cur):
    return [dict(r) for r in cur.fetchall()]


# ---------------------------------------------------------------------------
# Request router
# ---------------------------------------------------------------------------
def handle(handler, method, path, qs, ctx):
    """ctx provides: get_conn(), db_lock, audit(action, user, target_type, target_id, details)"""
    user = handler._get_current_user()
    if not user:
        return handler._send_json(401, {"ok": False, "error": "Please sign in to the operations dashboard."})
    role = user.get("role")
    if role not in ("admin", "staff"):
        return handler._send_json(403, {"ok": False, "error": "Admin or staff access required."})
    is_admin = role == "admin"
    ip = handler._get_client_ip()

    def audit(action, target_type="", target_id="", details=None):
        ctx["audit"](f"ops_{action}", user, target_type, target_id, ip, details or {})

    def body():
        try:
            return handler._read_json_body() or {}
        except Exception:
            return None

    def deny():
        return handler._send_json(403, {"ok": False, "error": "Only the admin can do this."})

    with ctx["db_lock"]:
        conn = ctx["get_conn"]()
        try:
            init_ops_schema(conn)
            cur = conn.cursor()

            # ---------------- GET ----------------
            if method == "GET" and path == "/api/ops/me":
                return handler._send_json(200, {"ok": True, "user": user, "statuses": STATUSES,
                                                "columns": TEMPLATE_COLUMNS, "required": REQUIRED_COLUMNS})

            if method == "GET" and path == "/api/ops/summary":
                where, params = _filters_sql(qs)
                cur.execute(f"SELECT o.status, COUNT(*) AS n, COALESCE(SUM(o.quantity),0) AS qty {BASE_FROM} {where} GROUP BY o.status", params)
                by_status = {s: {"orders": 0, "sarees": 0} for s in STATUSES}
                for r in cur.fetchall():
                    by_status.setdefault(r["status"], {"orders": 0, "sarees": 0})
                    by_status[r["status"]] = {"orders": r["n"], "sarees": r["qty"]}
                total = sum(v["orders"] for v in by_status.values())
                cards = {
                    "total_orders": total,
                    "pending": by_status["New"]["orders"],
                    "allocated": by_status["Allocated"]["orders"] + by_status["In production"]["orders"],
                    "in_production": by_status["In production"]["orders"],
                    "dispatched": by_status["Dispatched"]["orders"] + by_status["Delivered"]["orders"],
                    "delivered": by_status["Delivered"]["orders"],
                    "total_sarees": sum(v["sarees"] for v in by_status.values()),
                }
                cur.execute(f"SELECT o.order_date AS day, COUNT(*) AS n, SUM(o.quantity) AS qty {BASE_FROM} {where} GROUP BY o.order_date ORDER BY o.order_date DESC LIMIT 31", params)
                per_day = list(reversed(_rows(cur)))
                cur.execute(f"SELECT r.name AS label, COUNT(*) AS n, SUM(o.quantity) AS qty {BASE_FROM} {where} GROUP BY r.name ORDER BY qty DESC LIMIT 8", params)
                top_retailers = _rows(cur)
                cur.execute(f"SELECT o.product_code AS label, COUNT(*) AS n, SUM(o.quantity) AS qty {BASE_FROM} {where} GROUP BY o.product_code ORDER BY qty DESC LIMIT 8", params)
                top_products = _rows(cur)
                cur.execute("SELECT COUNT(*) AS n FROM ops_orders WHERE is_placeholder = 1")
                placeholder_count = cur.fetchone()["n"]
                return handler._send_json(200, {"ok": True, "cards": cards, "by_status": by_status, "per_day": per_day,
                                                "top_retailers": top_retailers, "top_products": top_products,
                                                "placeholder_orders": placeholder_count})

            if method == "GET" and path == "/api/ops/orders":
                where, params = _filters_sql(qs)
                page = max(1, int((qs.get("page", ["1"])[0] or "1") if (qs.get("page", ["1"])[0] or "1").isdigit() else 1))
                limit_raw = qs.get("limit", ["25"])[0] or "25"
                limit = min(100, max(5, int(limit_raw) if limit_raw.isdigit() else 25))
                export = qs.get("export", [""])[0] == "1"
                cur.execute(f"SELECT COUNT(*) AS n {BASE_FROM} {where}", params)
                total = cur.fetchone()["n"]
                if export:
                    cur.execute(f"SELECT {ORDER_COLUMNS} {BASE_FROM} {where} ORDER BY o.order_date DESC, o.order_id LIMIT ?", params + [MAX_ROWS_PER_UPLOAD])
                    items = _rows(cur)
                    audit("export", "orders", f"{len(items)}_rows", {"filters": {k: v[0] for k, v in qs.items() if k != "export"}})
                    return handler._send_json(200, {"ok": True, "total": total, "items": items})
                cur.execute(f"SELECT {ORDER_COLUMNS} {BASE_FROM} {where} ORDER BY o.order_date DESC, o.order_id LIMIT ? OFFSET ?",
                            params + [limit, (page - 1) * limit])
                return handler._send_json(200, {"ok": True, "total": total, "page": page, "limit": limit,
                                                "pages": max(1, (total + limit - 1) // limit), "items": _rows(cur)})

            if method == "GET" and path == "/api/ops/filters":
                cur.execute("SELECT name FROM ops_retailers ORDER BY name"); retailers = [r["name"] for r in cur.fetchall()]
                cur.execute("SELECT DISTINCT product_code FROM ops_orders ORDER BY product_code"); products = [r["product_code"] for r in cur.fetchall()]
                cur.execute("SELECT DISTINCT fabric FROM ops_orders WHERE fabric != '' ORDER BY fabric"); fabrics = [r["fabric"] for r in cur.fetchall()]
                cur.execute("SELECT id, name, team, active FROM ops_staff ORDER BY active DESC, name"); staff = _rows(cur)
                return handler._send_json(200, {"ok": True, "retailers": retailers, "products": products,
                                                "fabrics": fabrics, "staff": staff, "statuses": STATUSES})

            if method == "GET" and path == "/api/ops/staff":
                cur.execute("""SELECT s.id, s.name, s.phone, s.team, s.active, s.user_id, COALESCE(u.email,'') AS email,
                               (SELECT COUNT(*) FROM ops_allocations a JOIN ops_orders o ON o.order_id = a.order_id
                                 WHERE a.staff_id = s.id AND o.status IN ('Allocated','In production')) AS open_orders
                               FROM ops_staff s LEFT JOIN users u ON u.id = s.user_id ORDER BY s.active DESC, s.name""")
                return handler._send_json(200, {"ok": True, "items": _rows(cur)})

            if method == "GET" and path == "/api/ops/uploads":
                cur.execute("SELECT id, original_filename, uploaded_by, uploaded_at, total_rows, imported_rows, error_rows FROM ops_uploads ORDER BY id DESC LIMIT 50")
                return handler._send_json(200, {"ok": True, "items": _rows(cur)})

            if method == "GET" and path == "/api/ops/activity":
                if not is_admin:
                    return deny()
                cur.execute("""SELECT timestamp, admin_email AS user_email, action, target_type, target_id, details_json
                               FROM admin_audit_log WHERE action LIKE 'ops_%' ORDER BY id DESC LIMIT 200""")
                items = _rows(cur)
                for it in items:
                    it["action"] = it["action"][4:]
                return handler._send_json(200, {"ok": True, "items": items})

            if method == "GET" and path == "/api/ops/template.csv":
                csv = ",".join(TEMPLATE_COLUMNS) + "\r\n" + "\r\n".join(",".join(r) for r in SAMPLE_TEMPLATE_ROWS) + "\r\n"
                data = csv.encode("utf-8-sig")
                handler.send_response(200)
                handler.send_header("Content-Type", "text/csv; charset=utf-8")
                handler.send_header("Content-Disposition", 'attachment; filename="lepakshi-weaves-orders-template.csv"')
                handler.send_header("Content-Length", str(len(data)))
                handler.end_headers()
                handler.wfile.write(data)
                return

            # ---------------- POST ----------------
            if method == "POST" and path in ("/api/ops/uploads/validate", "/api/ops/uploads/commit"):
                b = body()
                if b is None:
                    return handler._send_json(400, {"ok": False, "error": "Invalid JSON body."})
                rows = b.get("rows")
                if not isinstance(rows, list) or not rows:
                    return handler._send_json(400, {"ok": False, "error": "No rows found in the file."})
                if len(rows) > MAX_ROWS_PER_UPLOAD:
                    return handler._send_json(413, {"ok": False, "error": f"Too many rows ({len(rows)}). Max {MAX_ROWS_PER_UPLOAD} per upload."})
                filename = _clean_text(b.get("filename") or "upload.xlsx", "notes")[:120]
                if not re.search(r"\.(xlsx|csv)$", filename, re.I):
                    return handler._send_json(400, {"ok": False, "error": "Only .xlsx and .csv files are accepted."})
                cur.execute("SELECT UPPER(order_id) AS id FROM ops_orders")
                existing = {r["id"] for r in cur.fetchall()}
                valid, errors = validate_rows(rows, existing)
                if path.endswith("/validate"):
                    return handler._send_json(200, {"ok": True, "total_rows": len(rows), "valid_rows": len(valid),
                                                    "error_rows": len({e["row"] for e in errors}), "errors": errors[:500]})
                if not valid:
                    return handler._send_json(422, {"ok": False, "error": "No valid rows to import.", "errors": errors[:500]})
                # Store original file privately (never under a public folder)
                stored, sha = "", ""
                file_b64 = b.get("file_b64") or ""
                if file_b64:
                    try:
                        raw = base64.b64decode(file_b64, validate=True)
                    except Exception:
                        return handler._send_json(400, {"ok": False, "error": "File data is corrupted."})
                    if len(raw) > MAX_FILE_BYTES:
                        return handler._send_json(413, {"ok": False, "error": "File is larger than 5 MB."})
                    is_xlsx = raw[:4] == b"PK\x03\x04"
                    if filename.lower().endswith(".xlsx") and not is_xlsx:
                        return handler._send_json(400, {"ok": False, "error": "This file is not a real .xlsx workbook."})
                    if filename.lower().endswith(".csv") and (is_xlsx or b"\x00" in raw[:4096]):
                        return handler._send_json(400, {"ok": False, "error": "This file is not a plain-text CSV."})
                    os.makedirs(PRIVATE_OPS_UPLOAD_DIR, exist_ok=True)
                    sha = hashlib.sha256(raw).hexdigest()
                    stored = f"{datetime.datetime.utcnow():%Y%m%d-%H%M%S}-{secrets.token_hex(6)}{os.path.splitext(filename)[1].lower()}"
                    with open(os.path.join(PRIVATE_OPS_UPLOAD_DIR, stored), "wb") as fh:
                        fh.write(raw)
                ts = _now()
                cur.execute("""INSERT INTO ops_uploads (original_filename, stored_filename, sha256, uploaded_by, uploaded_at,
                               total_rows, imported_rows, error_rows) VALUES (?,?,?,?,?,?,?,?)""",
                            (filename, stored, sha, user["email"], ts, len(rows), len(valid), len({e["row"] for e in errors})))
                upload_id = cur.lastrowid
                for v in valid:
                    _insert_order(cur, v, upload_id, ts, placeholder=False)
                conn.commit()
                audit("upload", "upload", upload_id, {"file": filename, "imported": len(valid), "errors": len(errors)})
                return handler._send_json(201, {"ok": True, "upload_id": upload_id, "imported_rows": len(valid),
                                                "error_rows": len({e["row"] for e in errors}), "errors": errors[:500]})

            if method == "POST" and path == "/api/ops/allocate":
                b = body() or {}
                ids = [str(x) for x in (b.get("order_ids") or []) if str(x).strip()][:500]
                if not ids:
                    return handler._send_json(400, {"ok": False, "error": "Select at least one order."})
                staff_id = b.get("staff_id")
                batch = _clean_text(b.get("batch"), "order_id")
                dispatch_ref = _clean_text(b.get("dispatch_ref"), "order_id")
                if not staff_id and not batch and not dispatch_ref:
                    return handler._send_json(400, {"ok": False, "error": "Choose a staff member, production batch or dispatch reference."})
                if staff_id:
                    cur.execute("SELECT id, name FROM ops_staff WHERE id = ? AND active = 1", (staff_id,))
                    if not cur.fetchone():
                        return handler._send_json(400, {"ok": False, "error": "That staff member was not found or is inactive."})
                ts = _now()
                updated = 0
                for oid in ids:
                    cur.execute("SELECT status FROM ops_orders WHERE order_id = ?", (oid,))
                    row = cur.fetchone()
                    if not row:
                        continue
                    cur.execute("""INSERT INTO ops_allocations (order_id, staff_id, batch, dispatch_ref, allocated_by, allocated_at)
                                   VALUES (?,?,?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET
                                   staff_id = COALESCE(excluded.staff_id, ops_allocations.staff_id),
                                   batch = CASE WHEN excluded.batch != '' THEN excluded.batch ELSE ops_allocations.batch END,
                                   dispatch_ref = CASE WHEN excluded.dispatch_ref != '' THEN excluded.dispatch_ref ELSE ops_allocations.dispatch_ref END,
                                   allocated_by = excluded.allocated_by, allocated_at = excluded.allocated_at""",
                                (oid, staff_id or None, batch, dispatch_ref, user["email"], ts))
                    if row["status"] == "New":
                        cur.execute("UPDATE ops_orders SET status = 'Allocated', updated_at = ? WHERE order_id = ?", (ts, oid))
                    updated += 1
                conn.commit()
                audit("allocate", "orders", ",".join(ids[:20]) + ("…" if len(ids) > 20 else ""),
                      {"count": updated, "staff_id": staff_id, "batch": batch, "dispatch_ref": dispatch_ref})
                return handler._send_json(200, {"ok": True, "updated": updated})

            if method == "POST" and path == "/api/ops/staff":
                if not is_admin:
                    return deny()
                b = body() or {}
                name = _clean_text(b.get("name"), "retailer_name")
                phone = re.sub(r"[^\d+]", "", str(b.get("phone") or ""))[:15]
                team = _clean_text(b.get("team") or "Production", "fabric")
                email = str(b.get("email") or "").strip().lower()[:120]
                password = str(b.get("password") or "")
                if not name:
                    return handler._send_json(400, {"ok": False, "error": "Staff name is required."})
                user_id = None
                if email:
                    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
                        return handler._send_json(400, {"ok": False, "error": "Enter a valid email for the staff login."})
                    if len(password) < 10:
                        return handler._send_json(400, {"ok": False, "error": "Staff password must be at least 10 characters."})
                    cur.execute("SELECT id FROM users WHERE email = ?", (email,))
                    if cur.fetchone():
                        return handler._send_json(409, {"ok": False, "error": "A login with this email already exists."})
                    user_id = f"usr-staff-{secrets.token_hex(5)}"
                    cur.execute("INSERT INTO users (id, name, email, phone, password_hash, role, created_at) VALUES (?,?,?,?,?,?,?)",
                                (user_id, name, email, phone, ctx["hash_password"](password), "staff", _now()))
                cur.execute("INSERT INTO ops_staff (user_id, name, phone, team, active, created_at) VALUES (?,?,?,?,1,?)",
                            (user_id, name, phone, team, _now()))
                conn.commit()
                audit("staff_create", "staff", cur.lastrowid, {"name": name, "team": team, "login": bool(user_id)})
                return handler._send_json(201, {"ok": True, "id": cur.lastrowid})

            if method == "POST" and path == "/api/ops/placeholder-data":
                if not is_admin:
                    return deny()
                action = (body() or {}).get("action")
                if action == "clear":
                    cur.execute("DELETE FROM ops_allocations WHERE order_id IN (SELECT order_id FROM ops_orders WHERE is_placeholder = 1)")
                    cur.execute("DELETE FROM ops_orders WHERE is_placeholder = 1")
                    n = cur.rowcount
                    cur.execute(f"DELETE FROM ops_staff WHERE name LIKE '{PLACEHOLDER_TAG}%' AND user_id IS NULL")
                    cur.execute(f"DELETE FROM ops_retailers WHERE name LIKE '{PLACEHOLDER_TAG}%' AND id NOT IN (SELECT retailer_id FROM ops_orders)")
                    conn.commit()
                    audit("placeholder_clear", "orders", n, {})
                    return handler._send_json(200, {"ok": True, "removed": n})
                n = _seed_placeholder(cur)
                conn.commit()
                audit("placeholder_seed", "orders", n, {})
                return handler._send_json(201, {"ok": True, "inserted": n})

            # ---------------- PATCH ----------------
            m = re.match(r"^/api/ops/orders/([^/]+)$", path)
            if method == "PATCH" and m:
                oid = urllib.parse.unquote(m.group(1))
                b = body() or {}
                new_status = STATUS_LOOKUP.get(str(b.get("status") or "").lower())
                if not new_status:
                    return handler._send_json(400, {"ok": False, "error": f"Status must be one of: {', '.join(STATUSES)}."})
                cur.execute("SELECT status FROM ops_orders WHERE order_id = ?", (oid,))
                row = cur.fetchone()
                if not row:
                    return handler._send_json(404, {"ok": False, "error": "Order not found."})
                cur.execute("UPDATE ops_orders SET status = ?, updated_at = ? WHERE order_id = ?", (new_status, _now(), oid))
                conn.commit()
                audit("status_change", "order", oid, {"from": row["status"], "to": new_status})
                return handler._send_json(200, {"ok": True, "order_id": oid, "status": new_status})

            m = re.match(r"^/api/ops/staff/(\d+)$", path)
            if method == "PATCH" and m:
                if not is_admin:
                    return deny()
                active = 1 if (body() or {}).get("active") else 0
                cur.execute("UPDATE ops_staff SET active = ? WHERE id = ?", (active, int(m.group(1))))
                cur.execute("SELECT user_id FROM ops_staff WHERE id = ?", (int(m.group(1)),))
                r = cur.fetchone()
                if r and r["user_id"] and not active:
                    cur.execute("DELETE FROM sessions WHERE user_id = ?", (r["user_id"],))
                conn.commit()
                audit("staff_" + ("activate" if active else "deactivate"), "staff", m.group(1), {})
                return handler._send_json(200, {"ok": True})

            return handler._send_json(404, {"ok": False, "error": f"Unknown operations endpoint: {method} {path}"})
        finally:
            conn.close()


def _insert_order(cur, v, upload_id, ts, placeholder=False):
    cur.execute("INSERT INTO ops_retailers (name, city, channel, created_at) VALUES (?,?,?,?) ON CONFLICT(name) DO NOTHING",
                (v["retailer_name"], v["retailer_city"], v["channel"], ts))
    cur.execute("SELECT id FROM ops_retailers WHERE name = ?", (v["retailer_name"],))
    retailer_id = cur.fetchone()["id"]
    cur.execute("""INSERT INTO ops_products (code, name, fabric, created_at) VALUES (?,?,?,?)
                   ON CONFLICT(code) DO UPDATE SET name = CASE WHEN excluded.name != '' THEN excluded.name ELSE ops_products.name END,
                   fabric = CASE WHEN excluded.fabric != '' THEN excluded.fabric ELSE ops_products.fabric END""",
                (v["product_code"], v["product_name"], v["fabric"], ts))
    cur.execute("""INSERT INTO ops_orders (order_id, order_date, retailer_id, channel, product_code, fabric, quantity, status,
                   notes, upload_id, is_placeholder, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (v["order_id"], v["order_date"], retailer_id, v["channel"], v["product_code"], v["fabric"], v["quantity"],
                 v["status"], v["notes"], upload_id, 1 if placeholder else 0, ts, ts))


# ---------------------------------------------------------------------------
# Template rows and placeholder demo data (clearly marked)
# ---------------------------------------------------------------------------
SAMPLE_TEMPLATE_ROWS = [
    ["PLACEHOLDER-1001", "2026-10-01", "[PLACEHOLDER] Sri Lakshmi Silks", "[PLACEHOLDER] Hyderabad", "Wholesale", "LW-KAN-001", "Kanchipuram Pure Silk - Ruby", "Kanchipuram Pure Silk", "24", "New", "Sample row - replace with real data"],
    ["PLACEHOLDER-1002", "2026-10-01", "[PLACEHOLDER] Retail walk-in", "[PLACEHOLDER] Dharmavaram", "Retail", "LW-TIS-014", "Champagne Tissue - Peacock", "Champagne Tissue", "1", "Allocated", "Sample row - replace with real data"],
    ["PLACEHOLDER-1003", "02-10-2026", "[PLACEHOLDER] Vasundhara Sarees", "[PLACEHOLDER] Bengaluru", "Wholesale", "LW-ORG-007", "Tissue Organza - Rose", "Tissue Organza", "60", "In production", "Dates may also be DD-MM-YYYY"],
]


def _seed_placeholder(cur):
    import random
    rnd = random.Random(42)
    ts = _now()
    staff_names = ["[PLACEHOLDER] Ramesh (Loom shed A)", "[PLACEHOLDER] Lakshmi (Loom shed B)", "[PLACEHOLDER] Suresh (Dispatch)"]
    staff_ids = []
    for nm in staff_names:
        cur.execute("SELECT id FROM ops_staff WHERE name = ?", (nm,))
        r = cur.fetchone()
        if r:
            staff_ids.append(r["id"])
        else:
            cur.execute("INSERT INTO ops_staff (user_id, name, phone, team, active, created_at) VALUES (NULL,?,?,?,1,?)",
                        (nm, "", "Dispatch" if "Dispatch" in nm else "Production", ts))
            staff_ids.append(cur.lastrowid)
    retailers = [("[PLACEHOLDER] Sri Lakshmi Silks", "Hyderabad", "Wholesale"), ("[PLACEHOLDER] Vasundhara Sarees", "Bengaluru", "Wholesale"),
                 ("[PLACEHOLDER] Kalanjali Textiles", "Chennai", "Wholesale"), ("[PLACEHOLDER] Online retail", "Pan-India", "Retail"),
                 ("[PLACEHOLDER] Shop walk-in", "Dharmavaram", "Retail")]
    products = [("LW-KAN-001", "Kanchipuram Pure Silk", "Kanchipuram Pure Silk"), ("LW-TIS-014", "Champagne Tissue", "Champagne Tissue"),
                ("LW-ORG-007", "Tissue Organza", "Tissue Organza"), ("LW-BAN-021", "Banarasi Katan Silk", "Banarasi Katan Silk"),
                ("LW-MYS-003", "Mysore Silk", "Mysore Silk"), ("LW-COT-010", "Mercerised Cotton", "Mercerised Cotton")]
    statuses = ["New"] * 5 + ["Allocated"] * 3 + ["In production"] * 3 + ["Dispatched"] * 2 + ["Delivered"] * 2
    today = datetime.date.today()
    inserted = 0
    for i in range(60):
        oid = f"PLACEHOLDER-{2001 + i}"
        cur.execute("SELECT 1 FROM ops_orders WHERE order_id = ?", (oid,))
        if cur.fetchone():
            continue
        rname, city, channel = rnd.choice(retailers)
        code, pname, fabric = rnd.choice(products)
        qty = rnd.choice([1, 2, 3]) if channel == "Retail" else rnd.choice([12, 24, 36, 48, 60, 120])
        status = rnd.choice(statuses)
        v = {"order_id": oid, "order_date": (today - datetime.timedelta(days=rnd.randint(0, 20))).isoformat(),
             "retailer_name": rname, "retailer_city": city, "channel": channel, "product_code": code,
             "product_name": pname, "fabric": fabric, "quantity": qty, "status": status,
             "notes": "Placeholder demo order - not real data"}
        _insert_order(cur, v, None, ts, placeholder=True)
        if status != "New":
            cur.execute("INSERT OR REPLACE INTO ops_allocations (order_id, staff_id, batch, dispatch_ref, allocated_by, allocated_at) VALUES (?,?,?,?,?,?)",
                        (oid, rnd.choice(staff_ids), f"BATCH-{rnd.randint(1, 6):02d}",
                         f"DSP-{rnd.randint(100, 999)}" if status in ("Dispatched", "Delivered") else "", "placeholder-seed", ts))
        inserted += 1
    return inserted
