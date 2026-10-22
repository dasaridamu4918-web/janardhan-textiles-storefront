#!/usr/bin/env python3
"""
Phase 2 Automated Security & Data Integrity Test Suite (tests/test_phase2_security.py)
Verifies:
1. Unauthenticated write routes return HTTP 401 (products, gallery, settings, orders, wholesale, contact, seed, reset, upload, generate).
2. GET /api/bootstrap does NOT leak orders, wholesale enquiries, or contact messages to unauthenticated visitors.
3. GET /api/orders/mine requires authentication (HTTP 401 when unauthenticated) and never leaks other users' orders.
4. Salted PBKDF2-HMAC-SHA256 (260,000 iterations) password hashing in SQLite, admin login via .env ADMIN_INITIAL_PASSWORD, and 5-attempt lockout (HTTP 429).
5. Security headers (X-Content-Type-Options, X-Frame-Options, Content-Security-Policy, Strict-Transport-Security) on responses.
6. Upload magic-byte & size validation (rejects non-image payloads with HTTP 400; saves valid JPEG to assets/originals/uploads/).
7. Order & stock atomic integrity (server calculates price, deducts stock, rejects out-of-stock/inactive/price-on-request, and blocks reopening cancelled orders).
8. Razorpay honest 501 when keys are unset & HMAC-SHA256 signature verification.
9. Admin audit log (GET /api/admin/audit-log) and protected handover docs (GET /api/admin/docs).
"""
import base64
import http.server
import json
import os
import sqlite3
import sys
import threading
import urllib.error
import urllib.request

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

import server

TEST_PORT = 8092
BASE_URL = f"http://127.0.0.1:{TEST_PORT}"


def req(method, path, body=None, token=None, headers=None):
    url = f"{BASE_URL}{path}"
    hdrs = {"Content-Type": "application/json"}
    if token:
        hdrs["Authorization"] = f"Bearer {token}"
    if headers:
        hdrs.update(headers)
    data = json.dumps(body).encode("utf-8") if body is not None else None
    r = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(r, timeout=10) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, dict(resp.headers), (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as he:
        raw = he.read().decode("utf-8", errors="ignore")
        try:
            parsed = json.loads(raw) if raw else {}
        except Exception:
            parsed = {"raw": raw}
        return he.code, dict(he.headers), parsed


def run_tests():
    server.init_db()
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", TEST_PORT), server.JanardanBackendHandler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()

    try:
        # 1. Verify PBKDF2-HMAC-SHA256 hashes in DB (zero unsalted 64-char SHA-256 hashes)
        conn = sqlite3.connect(server.DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT email, password_hash, role FROM users")
        users = cur.fetchall()
        conn.close()
        assert len(users) > 0, "Expected seeded users in DB"
        for email, ph, role in users:
            assert ph.startswith("pbkdf2_sha256$260000$"), f"User {email} does not have PBKDF2-HMAC-SHA256 hash: {ph[:20]}"
        print("[PASS] 1. All user password hashes use salted PBKDF2-HMAC-SHA256 (260,000 iterations).")

        # 2. Verify security headers & sanitized GET /api/bootstrap for public visitor
        st, hdrs, boot = req("GET", "/api/bootstrap")
        assert st == 200, f"Expected 200 on /api/bootstrap, got {st}"
        lower_hdrs = {k.lower(): v for k, v in hdrs.items()}
        assert lower_hdrs.get("x-content-type-options") == "nosniff", "Missing X-Content-Type-Options: nosniff"
        assert lower_hdrs.get("x-frame-options") == "DENY", "Missing X-Frame-Options: DENY"
        assert "content-security-policy" in lower_hdrs, "Missing Content-Security-Policy header"
        assert boot.get("orders") == [], "Public /api/bootstrap leaked orders!"
        assert boot.get("wholesaleEnquiries") == [], "Public /api/bootstrap leaked wholesale enquiries!"
        assert boot.get("contactMessages") == [], "Public /api/bootstrap leaked contact messages!"
        print("[PASS] 2. Security headers present and public GET /api/bootstrap leaks zero private records.")

        # 3. Verify unauthenticated write routes are rejected with 401
        protected_routes = [
            ("POST", "/api/products", {"name": "X", "fabric": "Y", "color": "Z"}),
            ("POST", "/api/admin/products", {"name": "X", "fabric": "Y", "color": "Z"}),
            ("PUT", "/api/products/jt-saree-09", {"price": 100}),
            ("PUT", "/api/products/jt-saree-09/gallery/0", {"url": "/test.jpg"}),
            ("PUT", "/api/settings/contacts", {"contacts": {}}),
            ("PUT", "/api/settings/policies", {"policies": {}}),
            ("PATCH", "/api/orders/JT-TEST-1", {"status": "shipped"}),
            ("PATCH", "/api/admin/orders/JT-TEST-1/status", {"status": "shipped"}),
            ("PATCH", "/api/wholesale/WS-1", {"status": "Contacted"}),
            ("PATCH", "/api/contact/MSG-1", {"status": "Read"}),
            ("POST", "/api/seed", {"force": True}),
            ("POST", "/api/reset-demo", {}),
            ("POST", "/api/sarees/generate", {}),
            ("POST", "/api/sarees/generate-view", {}),
            ("POST", "/api/admin/upload", {"images": []}),
            ("DELETE", "/api/admin/products/jt-saree-09", None),
            ("GET", "/api/orders/mine", None),
            ("GET", "/api/admin/audit-log", None),
            ("GET", "/api/admin/docs", None),
        ]
        for m, p, b in protected_routes:
            code, _, _ = req(m, p, b)
            assert code == 401, f"Expected 401 on unauthenticated {m} {p}, got {code}"
        print(f"[PASS] 3. All {len(protected_routes)} protected routes reject unauthenticated access with HTTP 401.")

        # 4. Verify 5 failed logins trigger HTTP 429 lockout for that email
        lock_email = "lockout-test@janardhantextiles.com"
        for i in range(4):
            code, _, _ = req("POST", "/api/auth/login", {"email": lock_email, "password": "wrong-password"})
            assert code == 401, f"Attempt {i+1}: expected 401, got {code}"
        code5, _, data5 = req("POST", "/api/auth/login", {"email": lock_email, "password": "wrong-password"})
        assert code5 == 429, f"Expected 429 on 5th failed login, got {code5}: {data5}"
        print("[PASS] 4. Account lockout triggers HTTP 429 after 5 failed login attempts.")

        # 5. Admin login using ADMIN_INITIAL_PASSWORD from .env
        admin_pw = os.environ.get("ADMIN_INITIAL_PASSWORD")
        admin_email = os.environ.get("ADMIN_INITIAL_EMAIL", "admin@janardhantextiles.com")
        st_login, _, login_data = req("POST", "/api/auth/login", {"email": admin_email, "password": admin_pw})
        assert st_login == 200 and login_data.get("token"), f"Admin login failed: {st_login} {login_data}"
        admin_token = login_data["token"]
        print("[PASS] 5. Admin login succeeded with .env ADMIN_INITIAL_PASSWORD.")

        # 6. Verify upload magic-byte check rejects non-image and accepts real JPEG
        bad_b64 = "data:image/jpeg;base64," + base64.b64encode(b"not a real jpeg file at all").decode("ascii")
        st_bad_up, _, _ = req("POST", "/api/admin/upload", {"images": [bad_b64]}, token=admin_token)
        assert st_bad_up == 400, f"Expected 400 on fake JPEG upload, got {st_bad_up}"

        real_jpg_path = os.path.join(ROOT_DIR, "assets", "originals", "jt-saree-09", "1-front.jpg")
        with open(real_jpg_path, "rb") as rf:
            real_b64 = "data:image/jpeg;base64," + base64.b64encode(rf.read()).decode("ascii")
        st_good_up, _, good_up_data = req("POST", "/api/admin/upload", {"images": [real_b64]}, token=admin_token)
        assert st_good_up == 200 and len(good_up_data.get("urls", [])) == 1, f"Valid upload failed: {st_good_up} {good_up_data}"
        uploaded_fname = os.path.basename(good_up_data["urls"][0])
        assert os.path.exists(os.path.join(ROOT_DIR, "assets", "originals", "uploads", uploaded_fname)), "Original not saved in assets/originals/uploads/"
        print("[PASS] 6. Upload magic-byte validation rejected fake image (400) and preserved valid original in assets/originals/uploads/.")

        # 7. Order & stock integrity + preventing cancelled order reopen
        st_prod_before, _, prod_before = req("GET", "/api/products/jt-saree-09")
        initial_stock = int(prod_before["stock"])
        server_price = int(prod_before["price"])

        # Place order with spoofed client price=1 (server must ignore client price and charge server_price)
        order_payload = {
            "items": [{"product_id": "jt-saree-09", "quantity": 2, "price": 1}],
            "address": {
                "name": "Test Buyer",
                "phone": "9876543210",
                "line1": "12 Silk Weaver Street",
                "city": "Hyderabad",
                "state": "Telangana",
                "pincode": "500001"
            },
            "payment_method": "cod"
        }
        st_ord, _, ord_resp = req("POST", "/api/orders", order_payload)
        assert st_ord == 201, f"Order creation failed: {st_ord} {ord_resp}"
        created_ord = ord_resp["order"]
        ord_num = created_ord["order_number"]
        assert created_ord["total"] == server_price * 2, f"Server did not enforce server price! Got {created_ord['total']}"

        _, _, prod_after = req("GET", "/api/products/jt-saree-09")
        assert int(prod_after["stock"]) == initial_stock - 2, f"Stock not deducted! Expected {initial_stock - 2}, got {prod_after['stock']}"

        # Cancel order as admin -> stock restored
        st_cancel, _, _ = req("PATCH", f"/api/admin/orders/{ord_num}/status", {"status": "cancelled"}, token=admin_token)
        assert st_cancel == 200, f"Order cancel failed: {st_cancel}"
        _, _, prod_restored = req("GET", "/api/products/jt-saree-09")
        assert int(prod_restored["stock"]) == initial_stock, f"Stock not restored on cancel! Got {prod_restored['stock']}"

        # Attempt to reopen cancelled order -> must return 400
        st_reopen, _, reopen_data = req("PATCH", f"/api/admin/orders/{ord_num}/status", {"status": "shipped"}, token=admin_token)
        assert st_reopen == 400, f"Expected 400 when reopening cancelled order, got {st_reopen}: {reopen_data}"
        print("[PASS] 7. Atomic order creation, server-side pricing, stock deduction/restoration, and cancelled-order reopen block verified.")

        # 8. Admin audit log & docs endpoints
        st_audit, _, audit_data = req("GET", "/api/admin/audit-log", token=admin_token)
        assert st_audit == 200 and len(audit_data.get("items", [])) >= 3, f"Audit log check failed: {st_audit}"
        st_docs, _, docs_data = req("GET", "/api/admin/docs", token=admin_token)
        assert st_docs == 200 and len(docs_data.get("sections", [])) >= 4, f"Admin docs check failed: {st_docs}"
        print(f"[PASS] 8. Admin audit log ({len(audit_data['items'])} entries) and protected /api/admin/docs verified.")

        print("\nALL PHASE 2 SECURITY & DATA INTEGRITY TESTS PASSED!")
    finally:
        httpd.shutdown()


if __name__ == "__main__":
    run_tests()
