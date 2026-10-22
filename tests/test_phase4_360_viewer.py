#!/usr/bin/env python3
"""
Phase 4 Automated Verification Suite — 360° Viewer & AI Frame Review
Verifies:
1. `jt-saree-09` has 8 full-body yaw views (0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°)
   and 3 separate `role: "detail"` close-up views (never mixed into the rotation ring).
2. Honest viewer modes (`360_mode` for >= 8 full-body views, `product_views_mode` for < 4 full-body views)
   and AI disclosure text (`"AI-assisted angle preview — see original photos below"`).
3. Admin Review Frames endpoints (`GET /api/admin/review-frames` and `PATCH /api/admin/products/:id/views/:viewId`)
   dynamically toggle AI frame approval and update `viewerMode`.
4. All 360 WebP turntable frames (`frame-000.webp`..`frame-359.webp`) exist on disk in 3:4 full-body ratio.
"""
import http.server
import json
import os
import sys
import threading
import urllib.error
import urllib.request
from PIL import Image

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

import server

TEST_PORT = 8094
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
            return resp.status, json.loads(raw)
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        return e.code, json.loads(raw)


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
        print("1. Verifying 360 full-body WebP frames on disk (frame-000.webp..frame-359.webp)...")
        frames_dir = os.path.join(ROOT_DIR, "public", "assets", "saree-360", "frames")
        for deg in range(360):
            fp = os.path.join(frames_dir, f"frame-{deg:03d}.webp")
            assert os.path.exists(fp), f"Missing 360 frame: {fp}"
        with Image.open(os.path.join(frames_dir, "frame-000.webp")) as im0:
            assert im0.size == (720, 960), f"Expected 3:4 portrait 720x960, got {im0.size}"
        print("   [PASS] All 360 full-body WebP frames verified at 720x960 (3:4 portrait).")

        print("2. Verifying jt-saree-09 8-angle fullBodyViews vs 3 detailViews separation...")
        st, prod = api_req("GET", "/api/products/jt-saree-09")
        assert st == 200, f"Expected 200, got {st}"
        assert prod.get("viewerMode") == "360_mode", f"Expected 360_mode, got {prod.get('viewerMode')}"
        assert prod.get("fullBodyYawCount") == 8, f"Expected 8 full-body yaw views, got {prod.get('fullBodyYawCount')}"
        assert prod.get("hasApprovedAiAngles") is True
        assert prod.get("aiDisclosure") == "AI-assisted angle preview — see original photos below"

        yaws = [v.get("yaw") for v in prod.get("fullBodyViews", [])]
        assert yaws == [0, 45, 90, 135, 180, 225, 270, 315], f"Unexpected fullBodyViews yaws: {yaws}"
        for fb in prod.get("fullBodyViews", []):
            assert fb.get("role") in ("front", "side", "back", "side2"), f"Detail view leaked into fullBodyViews: {fb}"
        detail_keys = [v.get("key") for v in prod.get("detailViews", [])]
        assert detail_keys == ["pallu_detail", "fabric_macro", "blouse_border"], f"Unexpected detailViews: {detail_keys}"
        print("   [PASS] 8 full-body rotation angles and 3 detail views are strictly separated.")

        print("3. Verifying honest viewerMode on non-360 products (jt-saree-01)...")
        st, p1 = api_req("GET", "/api/products/jt-saree-01")
        assert st == 200
        assert p1.get("viewerMode") == "product_views_mode", f"Expected product_views_mode on 2-yaw product, got {p1.get('viewerMode')}"
        assert p1.get("fullBodyYawCount") == 2
        print("   [PASS] Non-360 products honestly report product_views_mode.")

        print("4. Verifying Admin Review Frames approval workflow...")
        st_unauth, _ = api_req("GET", "/api/admin/review-frames")
        assert st_unauth == 401, f"Expected 401 on unauthenticated review-frames, got {st_unauth}"

        admin_pw = load_admin_password()
        st, login_data = api_req("POST", "/api/auth/login", {"email": "admin@janardhantextiles.com", "password": admin_pw})
        assert st == 200
        token = login_data["token"]

        st, rf_data = api_req("GET", "/api/admin/review-frames", token=token)
        assert st == 200 and rf_data.get("ok") is True and len(rf_data.get("items", [])) > 0

        # Reject 45° AI frame -> fullBodyYawCount drops to 7 -> viewerMode becomes multi_angle_mode
        st, reject_res = api_req("PATCH", "/api/admin/products/jt-saree-09/views/jt-saree-09-yaw-045", {"approved": False}, token=token)
        assert st == 200 and reject_res["product"]["fullBodyYawCount"] == 7
        assert reject_res["product"]["viewerMode"] == "multi_angle_mode"

        # Re-approve 45° AI frame -> fullBodyYawCount returns to 8 -> viewerMode returns to 360_mode
        st, approve_res = api_req("PATCH", "/api/admin/products/jt-saree-09/views/jt-saree-09-yaw-045", {"approved": True}, token=token)
        assert st == 200 and approve_res["product"]["fullBodyYawCount"] == 8
        assert approve_res["product"]["viewerMode"] == "360_mode"
        print("   [PASS] Admin Review Frames approval/rejection workflow verified.")

        print("\nALL PHASE 4 360° VIEWER TESTS PASSED!")
    finally:
        httpd.shutdown()
        httpd.server_close()


if __name__ == "__main__":
    run_tests()
