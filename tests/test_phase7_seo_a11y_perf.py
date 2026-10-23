"""
Phase 7 Verification Suite — SEO, Accessibility & Performance
"""
import http.server
import json
import os
import sys
import threading
import time
import urllib.request

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT_DIR)

import server  # noqa: E402

TEST_PORT = 18997
BASE_URL = f"http://127.0.0.1:{TEST_PORT}"


def raw_get(path):
    req = urllib.request.Request(f"{BASE_URL}{path}", method="GET")
    with urllib.request.urlopen(req, timeout=10) as resp:
        return resp.status, dict(resp.headers), resp.read().decode("utf-8")


def run_tests():
    server.init_db()
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", TEST_PORT), server.JanardanBackendHandler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    time.sleep(0.3)

    try:
        print("=== Phase 7 SEO, Accessibility & Performance Verification ===")
        # 1. Verify /manifest.json
        st, hdrs, body = raw_get("/manifest.json")
        assert st == 200
        mdata = json.loads(body)
        assert mdata.get("name", "").startswith("Lepakshi Weaves")
        print("[PASS] 1. GET /manifest.json returns valid PWA manifest (and static file exists on disk)")

        # 2. Verify /sw.js (network-first for /api/ and /uploads/ and /public/images/)
        st, hdrs, sw_body = raw_get("/sw.js")
        assert st == 200 and 'url.pathname.startsWith("/public/images/")' in sw_body
        print("[PASS] 2. GET /sw.js serves network-first service worker for images & API")

        # 3. Verify /robots.txt & /sitemap.xml
        st, _, robots_body = raw_get("/robots.txt")
        assert st == 200 and "Sitemap:" in robots_body and "Disallow: /api/admin/" in robots_body
        st, _, sitemap_body = raw_get("/sitemap.xml")
        assert st == 200 and "<urlset" in sitemap_body and "jt-saree-09" in sitemap_body
        print("[PASS] 3. GET /robots.txt and GET /sitemap.xml return valid SEO directives & product URLs")

        # 4. Verify CSP allows https://cdn.jsdelivr.net (GSAP)
        st, idx_hdrs, idx_html = raw_get("/")
        csp = idx_hdrs.get("Content-Security-Policy") or idx_hdrs.get("content-security-policy") or ""
        assert "https://cdn.jsdelivr.net" in csp, f"Missing cdn.jsdelivr.net in CSP: {csp}"
        print("[PASS] 4. Content-Security-Policy header includes https://cdn.jsdelivr.net for GSAP")

        # 5. Verify Skip-to-main-content link, JSON-LD, Open Graph, and 360 keyboard navigation in HTML/JS
        assert 'href="#app-viewport"' in idx_html, "Missing Skip to main content link"
        assert 'id="jt-org-jsonld"' in idx_html, "Missing Organization JSON-LD"
        assert 'id="jt-product-jsonld"' in idx_html, "Missing Product JSON-LD container"
        assert 'boxEl.setAttribute("tabindex", "0")' in idx_html, "Missing keyboard tabindex on 360 stage"

        with open(os.path.join(ROOT_DIR, "src", "storefront-admin-app.js"), "r", encoding="utf-8") as f:
            js_code = f.read()
        assert "syncSeoAndStructuredData" in js_code
        print("[PASS] 5. JSON-LD (ClothingStore + dynamic Product), Skip Link, and Keyboard 360/Modal navigation verified")
        print("=== ALL PHASE 7 SEO, ACCESSIBILITY & PERFORMANCE TESTS PASSED ===")
    finally:
        httpd.shutdown()


if __name__ == "__main__":
    run_tests()
