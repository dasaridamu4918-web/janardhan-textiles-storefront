#!/usr/bin/env python3
"""
Phase 8: Full Automated Test Suite & Playwright Multi-Viewport E2E Verification
Runs Phases 2-7 test suites and executes headless Chromium E2E checks at 375px, 768px, and 1280px.
"""
import os
import sys
import time
import json
import subprocess
import threading
from http.server import ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

os.environ.setdefault("JT_ENV", "development")

import server


def run_phase_suites():
    suites = [
        "tests/test_phase2_security.py",
        "tests/test_phase3_catalogue.py",
        "tests/test_phase4_360_viewer.py",
        "tests/test_phase5_admin.py",
        "tests/test_phase6_polish.py",
        "tests/test_phase7_seo_a11y_perf.py",
    ]
    print("=== Running Phase 2-7 Automated Test Suites ===")
    for suite in suites:
        suite_path = os.path.join(ROOT, suite)
        res = subprocess.run([sys.executable, suite_path], cwd=ROOT, capture_output=True, text=True)
        if res.returncode != 0:
            print(f"[FAIL] {suite}:\n{res.stdout}\n{res.stderr}")
            sys.exit(1)
        print(f"[PASS] {suite}")


def run_playwright_e2e():
    from playwright.sync_api import sync_playwright

    server.init_db()
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.JanardanBackendHandler)
    port = httpd.server_address[1]
    base_url = f"http://127.0.0.1:{port}"
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()

    print(f"\n=== Running Playwright Multi-Viewport E2E Verification on {base_url} ===")
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)

            for width, height, label in [(375, 812, "Mobile 375px"), (768, 1024, "Tablet 768px"), (1280, 800, "Desktop 1280px")]:
                context = browser.new_context(viewport={"width": width, "height": height})
                page = context.new_page()
                console_errors = []
                page_errors = []
                not_found_urls = []
                page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
                page.on("pageerror", lambda err: page_errors.append(str(err)))
                page.on("response", lambda resp: not_found_urls.append(resp.url) if resp.status == 404 else None)

                # 1. Home page load
                page.goto(base_url, wait_until="networkidle", timeout=30000)
                page.wait_for_timeout(400)
                assert "Janardhan Textiles" in page.title(), f"{label}: Unexpected title {page.title()}"

                # Check skip link exists
                assert page.locator('a[href="#app-viewport"]').count() >= 1, f"{label}: Missing skip link"

                # Check floating WhatsApp button exists
                assert page.locator("#floating-whatsapp-cta").count() == 1, f"{label}: Missing floating WhatsApp CTA"

                # 2. Navigate to Shop & verify 24 sarees per page pagination
                page.evaluate("window.app.navigate('shop')")
                page.wait_for_timeout(400)
                cq_info = page.evaluate("window.app.state.catalogueQuery")
                assert cq_info["limit"] == 24, f"{label}: Expected 24 per page, got {cq_info}"

                # 3. Navigate to Product Detail & verify dynamic Product JSON-LD
                page.evaluate("window.app.openProductDetail('jt-saree-09')")
                page.wait_for_timeout(400)
                prod_ld = page.locator("#jt-product-jsonld").inner_text()
                prod_ld_obj = json.loads(prod_ld)
                assert prod_ld_obj.get("@type") == "Product", f"{label}: Missing Product JSON-LD"
                assert prod_ld_obj.get("sku") == "jt-saree-09", f"{label}: Product JSON-LD SKU mismatch"

                # 4. Verify 360 viewer rotation & AI disclosure badge
                page.evaluate("window.app.navigate('home')")
                page.wait_for_timeout(400)
                ai_badge_text = page.locator(".saree-360-ai-disclosure").inner_text()
                assert "AI-assisted angle preview" in ai_badge_text, f"{label}: Missing AI disclosure badge"

                # Rotate 360 viewer to 90 deg via ShowcaseScrollEngine.setDegree(90)
                page.evaluate("ShowcaseScrollEngine.setDegree(90)")
                page.wait_for_timeout(300)
                deg_text = page.locator("#saree-360-angle-badge").inner_text()
                assert "90°" in deg_text, f"{label}: Expected 90° indicator, got {deg_text}"

                # Filter out any harmless favicon/network messages if any, verify zero JS/console errors
                real_console_errors = [e for e in console_errors if "favicon" not in e.lower()]
                assert len(real_console_errors) == 0, f"{label} Console errors: {real_console_errors} (404 URLs: {not_found_urls})"
                assert len(page_errors) == 0, f"{label} Page errors: {page_errors}"

                print(f"[PASS] {label} ({width}x{height}): Home, Shop (24/page), Product JSON-LD, 360° Viewer (90°), 0 console/page errors")
                context.close()

            browser.close()
    finally:
        httpd.shutdown()


if __name__ == "__main__":
    run_phase_suites()
    run_playwright_e2e()
    print("\n=== ALL PHASE 8 AUTOMATED & PLAYWRIGHT E2E VERIFICATIONS PASSED ===")
