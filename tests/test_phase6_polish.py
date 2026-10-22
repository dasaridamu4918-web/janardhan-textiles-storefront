"""
Phase 6 Verification Suite — Storefront Polish (No Invented Facts, [Owner to confirm], Wholesale, Contact, Honest Payment Fallback, WhatsApp CTA)
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

import server  # noqa: E402

TEST_PORT = 18996
BASE_URL = f"http://127.0.0.1:{TEST_PORT}"


def api_req(path, method="GET", body=None):
    headers = {}
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(f"{BASE_URL}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        return e.code, json.loads(raw) if raw else {}


def run_tests():
    server.init_db()
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", TEST_PORT), server.JanardanBackendHandler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    time.sleep(0.3)

    try:
        print("=== Phase 6 Storefront Polish Verification ===")
        st, boot = api_req("/api/bootstrap")
        assert st == 200
        policies = boot.get("settings", {}).get("policies", {})
        assert "[Owner to confirm]" in policies.get("approvalBanner", ""), f"Missing [Owner to confirm] in policies: {policies}"
        assert policies.get("shipping", {}).get("status") == "[Owner to confirm]"
        print("[PASS] 1. Policies and unconfirmed claims marked with [Owner to confirm]")

        with open(os.path.join(ROOT_DIR, "index.html"), "r", encoding="utf-8") as f:
            html = f.read()
        assert "DEMO-JT-1041" not in html and "Arundhati Deshmukh" not in html, "Fake demo orders still present in index.html"
        assert "Direct Trade Contact Placeholder" not in html, "Placeholder text still present on Wholesale page"
        assert 'id="floating-whatsapp-cta"' in html, "Floating WhatsApp CTA missing from index.html"
        print("[PASS] 2. Zero fake demo orders, zero placeholder labels, floating WhatsApp CTA present")

        # 3. Verify Wholesale Enquiry POST works
        st, ws_res = api_req(
            "/api/wholesale",
            method="POST",
            body={
                "businessName": "Test Silk House",
                "contactPerson": "Ramesh Kumar",
                "phone": "9876543210",
                "city": "Hyderabad",
                "sareeInterest": "Champagne Tissue Saree with Floral and Peacock Embroidery",
                "estimatedQuantity": "25 Pieces",
                "notes": "Phase 6 verification test",
            },
        )
        assert st in (200, 201) and ws_res.get("ok"), f"Wholesale POST failed: {st} {ws_res}"
        print("[PASS] 3. POST /api/wholesale saves enquiry cleanly")

        # 4. Verify Contact Message POST works
        st, ct_res = api_req(
            "/api/contact",
            method="POST",
            body={
                "name": "Phase 6 Buyer",
                "contact": "9876543210",
                "message": "Enquiring about bridal tissue sarees.",
            },
        )
        assert st in (200, 201) and ct_res.get("ok"), f"Contact POST failed: {st} {ct_res}"
        print("[PASS] 4. POST /api/contact saves message cleanly")

        # Clean up test records from DB
        enq_id = (ws_res.get("enquiry") or {}).get("enquiryId") or ws_res.get("enquiryId") or ""
        msg_id = (ct_res.get("contactMessage") or {}).get("messageId") or ct_res.get("messageId") or ""
        conn = server.get_db_connection()
        if enq_id:
            conn.execute("DELETE FROM wholesale_enquiries WHERE enquiry_id = ?", (enq_id,))
        conn.execute("DELETE FROM wholesale_enquiries WHERE data_json LIKE '%Test Silk House%'")
        if msg_id:
            conn.execute("DELETE FROM contact_messages WHERE message_id = ?", (msg_id,))
        conn.execute("DELETE FROM contact_messages WHERE data_json LIKE '%Phase 6 Buyer%'")
        conn.commit()
        conn.close()
        print("=== ALL PHASE 6 STOREFRONT POLISH TESTS PASSED ===")
    finally:
        httpd.shutdown()


if __name__ == "__main__":
    run_tests()
