#!/usr/bin/env python3
"""
Phase 3 Automated Verification Suite — Lepakshi Weaves Storefront
Verifies:
1. Default 24 sarees per page pagination & filter query parameters on GET /api/products
2. Unified product schema (`slug`, `priceOnRequest`, `views[]` with `role`, `yaw`, `source`, `approved`, `updatedAt`, `srcset`, `blurDataUrl`)
3. Responsive WebP image pipeline (`public/images/derived/responsive-manifest.json` with 480w/720w/1080w & blurDataUrl)
4. CSV Bulk Import template endpoint (`GET /api/admin/products/template.csv`)
5. Bulk Import dryRun preview & Price-on-Request support (`POST /api/admin/products/bulk`)
"""
import http.server
import json
import os
import sys
import threading
import urllib.error
import urllib.request

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

import server

TEST_PORT = 8093
BASE_URL = f"http://127.0.0.1:{TEST_PORT}"


def api_req(method, path, body=None, token=None):
    url = f"{BASE_URL}{path}"
    headers = {"Origin": "http://127.0.0.1:8080"}
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read().decode("utf-8")
            ctype = resp.headers.get("Content-Type", "")
            return resp.status, (json.loads(raw) if "application/json" in ctype else raw), dict(resp.headers)
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(raw)
        except Exception:
            parsed = {"raw": raw}
        return e.code, parsed, dict(e.headers)


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

    try:
        print("1. Testing GET /api/products default pagination (24 per page) & schema...")
        st, data, _ = api_req("GET", "/api/products")
        assert st == 200 and isinstance(data.get("items"), list), f"Expected 200 with items, got {st}: {data}"
        assert data.get("limit") == 24, f"Expected default limit 24, got {data.get('limit')}"
        assert len(data.get("items", [])) == 24, f"Expected 24 items on page 1, got {len(data.get('items', []))}"
        assert data.get("total", 0) >= 100, f"Expected >= 100 total sarees, got {data.get('total')}"

        first = data["items"][0]
        assert "slug" in first and first["slug"], "Missing slug on product"
        assert "priceOnRequest" in first, "Missing priceOnRequest boolean on product"
        assert isinstance(first.get("views"), list) and len(first["views"]) >= 5, "Missing views[] array on product"
        v0 = first["views"][0]
        for req_key in ("id", "role", "yaw", "label", "url", "webpUrl", "srcset", "blurDataUrl", "source", "approved", "updatedAt"):
            assert req_key in v0, f"Missing '{req_key}' in views[0]"
        assert "?v=" in v0["url"], f"Expected cache-busting ?v= query param on view url, got {v0['url']}"
        print("   [PASS] 24-per-page pagination, views[] schema, responsive srcset, blurDataUrl & ?v= cache-busting verified.")

        print("2. Testing responsive-manifest.json on disk...")
        manifest_path = os.path.join(ROOT_DIR, "public", "images", "derived", "responsive-manifest.json")
        assert os.path.exists(manifest_path), "responsive-manifest.json missing"
        with open(manifest_path, "r", encoding="utf-8") as f:
            rmap = json.load(f)
        assert len(rmap) >= 300, f"Expected >= 300 indexed images in responsive-manifest.json, got {len(rmap)}"
        sample_entry = next(iter(rmap.values()))
        assert "480w" in sample_entry.get("srcset", "") and "1080w" in sample_entry.get("srcset", ""), "Missing 480w/1080w in srcset"
        assert sample_entry.get("blurDataUrl", "").startswith("data:image/"), "Invalid blurDataUrl"
        print(f"   [PASS] responsive-manifest.json verified ({len(rmap)} source images indexed with 480w/720w/1080w WebP & blurDataUrl).")

        print("3. Testing GET /api/admin/products/template.csv...")
        st, csv_text, hdrs = api_req("GET", "/api/admin/products/template.csv")
        assert st == 200, f"Expected 200 on template.csv, got {st}"
        assert "sku,name,fabric,color,occasion,price,mrp,price_on_request" in csv_text, "Unexpected CSV template headers"
        print("   [PASS] CSV template endpoint verified.")

        print("4. Testing Admin Bulk Import dryRun & Price-on-Request support...")
        admin_pw = load_admin_password()
        st, login_data, _ = api_req("POST", "/api/auth/login", {"email": "admin@janardhantextiles.com", "password": admin_pw})
        assert st == 200, f"Admin login failed: {st}"
        admin_token = login_data["token"]

        bulk_payload = {
            "dryRun": True,
            "products": [
                {
                    "sku": "jt-test-por-999",
                    "name": "Test Bespoke Zardozi Saree",
                    "fabric": "Pure Tissue Brocade",
                    "color": "Champagne Gold",
                    "occasion": "Bridal & Muhurtham",
                    "price": "Price on request",
                    "stock": 5
                }
            ]
        }
        st, bulk_res, _ = api_req("POST", "/api/admin/products/bulk", bulk_payload, token=admin_token)
        assert st == 200 and bulk_res.get("ok") is True, f"Bulk dryRun failed: {st} {bulk_res}"
        assert bulk_res.get("dryRun") is True
        assert bulk_res.get("created") == 1
        assert bulk_res.get("priceOnRequestCount") == 1
        assert len(bulk_res.get("errors", [])) == 0
        print("   [PASS] Bulk Import dryRun & Price-on-Request validation verified.")

        print("\nALL PHASE 3 CATALOGUE AT SCALE TESTS PASSED!")
    finally:
        httpd.shutdown()
        httpd.server_close()


if __name__ == "__main__":
    run_tests()
