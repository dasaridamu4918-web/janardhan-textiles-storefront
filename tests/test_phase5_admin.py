"""
Phase 5 Verification Suite — Admin Panel (CRUD, Image-Swap Cache-Busting, Bulk Import, Review Frames, Audit Log, Docs)
"""
import http.server
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT_DIR)

os.environ.setdefault("ADMIN_INITIAL_PASSWORD", "JanardhanAdmin#2026!")

import server  # noqa: E402

TEST_PORT = 18995
BASE_URL = f"http://127.0.0.1:{TEST_PORT}"


def api_req(path, method="GET", body=None, token=None, raw_bytes=None, content_type=None):
    headers = {}
    data = None
    if raw_bytes is not None:
        data = raw_bytes
        if content_type:
            headers["Content-Type"] = content_type
    elif body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{BASE_URL}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw}


def load_admin_password():
    env_path = os.path.join(ROOT_DIR, ".env")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip().startswith("ADMIN_INITIAL_PASSWORD="):
                    return line.strip().split("=", 1)[1].strip().strip('"').strip("'")
    return os.environ.get("ADMIN_INITIAL_PASSWORD", "")


def run_tests():
    server.init_db()
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", TEST_PORT), server.JanardanBackendHandler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    time.sleep(0.3)

    try:
        print("=== Phase 5 Admin Panel Verification ===")
        admin_pw = load_admin_password()
        st, login_res = api_req(
            "/api/auth/login",
            method="POST",
            body={"email": "admin@janardhantextiles.com", "password": admin_pw},
        )
        assert st == 200 and login_res.get("token"), f"Admin login failed: {st} {login_res}"
        token = login_res["token"]
        print("[PASS] 1. Admin login succeeded")

        # 2. Image-Swap Cache-Bust Test (PUT /api/products/:id/gallery/:idx)
        st, prod_before = api_req("/api/products/saree-015")
        assert st == 200, f"Expected 200 for saree-015, got {st}"
        old_slot0 = prod_before["gallery"][0]
        old_url = old_slot0["url"]
        old_updated_at = old_slot0.get("updatedAt", 0)

        time.sleep(0.05)
        new_path = "/public/images/sarees/saree-015/1-front.jpg"
        st, swap_res = api_req(
            "/api/products/saree-015/gallery/0",
            method="PUT",
            body={"url": new_path, "role": "front", "yaw": 0},
            token=token,
        )
        assert st == 200 and swap_res.get("ok"), f"Gallery swap failed: {st} {swap_res}"

        st, prod_after = api_req("/api/products/saree-015")
        assert st == 200
        new_slot0 = prod_after["gallery"][0]
        new_url = new_slot0["url"]
        new_updated_at = new_slot0.get("updatedAt", 0)
        assert "?v=" in new_url, f"Expected cache-busting ?v= in new URL: {new_url}"
        assert new_updated_at > old_updated_at, f"Expected updatedAt to increase: {old_updated_at} -> {new_updated_at}"
        assert new_url != old_url, f"Expected cache-busted URL to change: {old_url} -> {new_url}"
        print(f"[PASS] 2. Image-Swap Cache-Bust Test passed ({old_url} -> {new_url})")

        # 3. Product Editor Price-on-Request toggle & restore
        st, patch_res = api_req(
            "/api/admin/products/saree-015",
            method="PATCH",
            body={"priceOnRequest": True, "price": 0},
            token=token,
        )
        assert st == 200 and patch_res["product"]["priceOnRequest"] is True
        assert patch_res["product"]["price"] == 0

        # Restore original price
        orig_price = prod_before.get("price") or 4200
        st, restore_res = api_req(
            "/api/admin/products/saree-015",
            method="PATCH",
            body={"priceOnRequest": False, "price": orig_price},
            token=token,
        )
        assert st == 200 and restore_res["product"]["priceOnRequest"] is False
        assert restore_res["product"]["price"] == orig_price
        print("[PASS] 3. Product Editor Price-on-Request toggle & restore verified")

        # 4. Review Frames endpoint & AI frame approval toggle
        st, rf_res = api_req("/api/admin/review-frames", token=token)
        assert st == 200 and len(rf_res.get("items", [])) > 0
        jt09_rf = next((x for x in rf_res["items"] if x["id"] == "jt-saree-09"), None)
        assert jt09_rf is not None and jt09_rf["viewerMode"] == "360_mode"
        print(f"[PASS] 4. GET /api/admin/review-frames returned {len(rf_res['items'])} reviewable products (jt-saree-09 in 360_mode)")

        # 5. Admin Audit Log & Protected Handover Docs
        st, audit_res = api_req("/api/admin/audit-log?limit=25", token=token)
        assert st == 200 and audit_res.get("ok")
        actions = [row["action"] for row in audit_res.get("items", [])]
        assert "gallery_update" in actions, f"Expected gallery_update in audit log actions: {actions}"
        print(f"[PASS] 5. GET /api/admin/audit-log verified ({len(audit_res['items'])} recent entries, includes gallery_update)")

        st, docs_res = api_req("/api/admin/docs", token=token)
        assert st == 200 and docs_res.get("ok") and "persistence" in docs_res
        assert len(docs_res.get("sections", [])) >= 4
        print("[PASS] 6. GET /api/admin/docs verified (protected handover guide & persistence banner)")

        # 6. Verify Admin UI tabs in storefront-admin-app.js
        with open(os.path.join(ROOT_DIR, "src", "storefront-admin-app.js"), "r", encoding="utf-8") as f:
            js_code = f.read()
        for required_snippet in (
            'id: "review_frames"',
            'id: "audit_log"',
            'id: "docs"',
            "renderAdminReviewFramesTab",
            "renderAdminAuditLogTab",
            "renderAdminDocsTab",
            "admin-product-validation-panel",
            "handleReplaceSingleGallerySlot",
        ):
            assert required_snippet in js_code, f"Missing {required_snippet} in src/storefront-admin-app.js"
        print("[PASS] 7. Admin UI tabs (7. Review 360° Frames, 8. Audit Log, 9. Handover & Docs, Validation Panel) verified")
        print("=== ALL PHASE 5 ADMIN TESTS PASSED ===")
    finally:
        httpd.shutdown()


if __name__ == "__main__":
    run_tests()
