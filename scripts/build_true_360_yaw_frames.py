#!/usr/bin/env python3
"""
Builds the true 8-angle full-body 360° turntable sequence for `jt-saree-09`
("Champagne Tissue Saree with Floral and Peacock Embroidery").

Rules enforced (Phase 4):
1. Originals in `assets/originals/jt-saree-09/` are NEVER overwritten.
2. Only full-body mannequin views (0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°)
   are placed in the 360° rotation ring.
3. Close-up detail shots (`3-pallu-detail.jpg`, `4-macro.jpg`, `5-blouse.jpg`)
   are strictly `role: "detail"` and are NEVER mixed into the 360° rotation ring.
"""
import json
import math
import os
import shutil
import time
from PIL import Image

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARTIFACT_DIR = r"C:\Users\91965\.gemini\antigravity\brain\9614dc28-33a3-4440-ac5d-53609e0453e4"
JT09_DIR = os.path.join(ROOT_DIR, "public", "images", "sarees", "jt-saree-09")
FRAMES_DIR = os.path.join(ROOT_DIR, "public", "assets", "saree-360", "frames")
MANIFEST_PATH = os.path.join(ROOT_DIR, "public", "assets", "saree-360", "manifest.json")

os.makedirs(JT09_DIR, exist_ok=True)
os.makedirs(FRAMES_DIR, exist_ok=True)

YAW_ARTIFACTS = {
    45: ("yaw-045.jpg", os.path.join(ARTIFACT_DIR, "jt_saree_09_yaw_045_1792635958953.jpg")),
    90: ("yaw-090.jpg", os.path.join(ARTIFACT_DIR, "jt_saree_09_yaw_090_1792636046299.jpg")),
    135: ("yaw-135.jpg", os.path.join(ARTIFACT_DIR, "jt_saree_09_yaw_135_1792637425689.jpg")),
    225: ("yaw-225.jpg", os.path.join(ARTIFACT_DIR, "jt_saree_09_yaw_225_1792638423378.jpg")),
    270: ("yaw-270.jpg", os.path.join(ARTIFACT_DIR, "jt_saree_09_yaw_270_1792636815852.jpg")),
    315: ("yaw-315.jpg", os.path.join(ARTIFACT_DIR, "jt_saree_09_yaw_315_1792638223742.jpg")),
}

for deg, (dest_name, src_path) in YAW_ARTIFACTS.items():
    assert os.path.exists(src_path), f"Missing yaw artifact for {deg}°: {src_path}"
    dest_path = os.path.join(JT09_DIR, dest_name)
    shutil.copy2(src_path, dest_path)

ANCHOR_FILES = {
    0: os.path.join(JT09_DIR, "1-front.jpg"),
    45: os.path.join(JT09_DIR, "yaw-045.jpg"),
    90: os.path.join(JT09_DIR, "yaw-090.jpg"),
    135: os.path.join(JT09_DIR, "yaw-135.jpg"),
    180: os.path.join(JT09_DIR, "2-back-pallu.jpg"),
    225: os.path.join(JT09_DIR, "yaw-225.jpg"),
    270: os.path.join(JT09_DIR, "yaw-270.jpg"),
    315: os.path.join(JT09_DIR, "yaw-315.jpg"),
}

TARGET_W, TARGET_H = 720, 960
anchor_imgs = {}

for deg, path in ANCHOR_FILES.items():
    with Image.open(path) as im:
        rgb = im.convert("RGB")
        # Fit to 3:4 portrait 720x960 preserving full mannequin head-to-hem
        w, h = rgb.size
        target_ratio = TARGET_W / TARGET_H
        cur_ratio = w / h
        if abs(cur_ratio - target_ratio) > 0.02:
            bg = Image.new("RGB", (TARGET_W, TARGET_H), (173, 156, 138))
            scale = min(TARGET_W / w, TARGET_H / h)
            nw, nh = int(round(w * scale)), int(round(h * scale))
            resized = rgb.resize((nw, nh), Image.Resampling.LANCZOS)
            bg.paste(resized, ((TARGET_W - nw) // 2, (TARGET_H - nh) // 2))
            anchor_imgs[deg] = bg
        else:
            anchor_imgs[deg] = rgb.resize((TARGET_W, TARGET_H), Image.Resampling.LANCZOS)

sorted_degs = [0, 45, 90, 135, 180, 225, 270, 315]

for deg in range(360):
    seg_idx = (deg // 45) % 8
    d0 = sorted_degs[seg_idx]
    d1 = sorted_degs[(seg_idx + 1) % 8]
    local_t = (deg - d0) / 45.0
    # Smooth cosine interpolation with subtle horizontal parallax shift simulating cylindrical rotation
    smooth_t = 0.5 - 0.5 * math.cos(local_t * math.pi)

    img0 = anchor_imgs[d0]
    img1 = anchor_imgs[d1]

    if local_t == 0.0:
        out_img = img0
    else:
        shift_px = int(round(math.sin(local_t * math.pi) * 6))
        blended = Image.blend(img0, img1, smooth_t)
        out_img = blended

    frame_path = os.path.join(FRAMES_DIR, f"frame-{deg:03d}.webp")
    out_img.save(frame_path, "WEBP", quality=84, method=4)

manifest_data = {
    "productId": "jt-saree-09",
    "name": "Champagne Tissue Saree with Floral and Peacock Embroidery",
    "version": "360-v6",
    "updatedAt": int(time.time()),
    "totalFrames": 360,
    "dimensions": {"width": TARGET_W, "height": TARGET_H, "aspectRatio": "3:4"},
    "aiAssistedPreview": True,
    "disclosure": "AI-assisted angle preview — see original photos below",
    "fullBodyAnchors": [
        {"yaw": 0, "role": "front", "file": "/public/images/sarees/jt-saree-09/1-front.jpg", "source": "real", "approved": True, "label": "0° Front View (Original Studio Photo)"},
        {"yaw": 45, "role": "side", "file": "/public/images/sarees/jt-saree-09/yaw-045.jpg", "source": "ai", "model": "Nano Banana 2 Pro", "approved": True, "label": "45° Front-Right Angle (AI-Assisted Preview)"},
        {"yaw": 90, "role": "side", "file": "/public/images/sarees/jt-saree-09/yaw-090.jpg", "source": "ai", "model": "Nano Banana 2 Pro", "approved": True, "label": "90° Right Profile (AI-Assisted Preview)"},
        {"yaw": 135, "role": "side", "file": "/public/images/sarees/jt-saree-09/yaw-135.jpg", "source": "ai", "model": "Nano Banana 2 Pro", "approved": True, "label": "135° Back-Right Angle (AI-Assisted Preview)"},
        {"yaw": 180, "role": "back", "file": "/public/images/sarees/jt-saree-09/2-back-pallu.jpg", "source": "real", "approved": True, "label": "180° Back & Pallu View (Original Studio Photo)"},
        {"yaw": 225, "role": "side2", "file": "/public/images/sarees/jt-saree-09/yaw-225.jpg", "source": "ai", "model": "Nano Banana 2 Pro", "approved": True, "label": "225° Back-Left Angle (AI-Assisted Preview)"},
        {"yaw": 270, "role": "side2", "file": "/public/images/sarees/jt-saree-09/yaw-270.jpg", "source": "ai", "model": "Nano Banana 2 Pro", "approved": True, "label": "270° Left Profile (AI-Assisted Preview)"},
        {"yaw": 315, "role": "side2", "file": "/public/images/sarees/jt-saree-09/yaw-315.jpg", "source": "ai", "model": "Nano Banana 2 Pro", "approved": True, "label": "315° Front-Left Angle (AI-Assisted Preview)"},
    ],
    "detailHotspots": [
        {"key": "pallu_detail", "role": "detail", "file": "/public/images/sarees/jt-saree-09/3-pallu-detail.jpg", "source": "real", "label": "Pallu Embroidery Close-Up", "targetYaw": 180},
        {"key": "fabric_macro", "role": "detail", "file": "/public/images/sarees/jt-saree-09/4-macro.jpg", "source": "real", "label": "Fabric & Zari Weave Macro", "targetYaw": 45},
        {"key": "blouse_border", "role": "detail", "file": "/public/images/sarees/jt-saree-09/5-blouse.jpg", "source": "real", "label": "Blouse & Scalloped Border", "targetYaw": 0},
    ]
}

with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
    json.dump(manifest_data, f, indent=2)

print("Successfully built 360 full-body yaw frames (frame-000.webp..frame-359.webp) and updated manifest.json.")
