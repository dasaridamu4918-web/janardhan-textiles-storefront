#!/usr/bin/env python3
"""
Janardhan Textiles — Responsive Image & Blur Placeholder Pipeline (scripts/build_responsive_images.py)
Generates responsive WebP variants (480w, 720w, 1080w) and tiny inline blurDataUrl placeholders
without ever overwriting original photos in assets/originals/.
"""
import base64
import io
import json
import os
import sqlite3
from PIL import Image

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAREES_DIR = os.path.join(ROOT_DIR, "public", "images", "sarees")
DERIVED_DIR = os.path.join(ROOT_DIR, "public", "images", "derived")
MANIFEST_OUT = os.path.join(DERIVED_DIR, "responsive-manifest.json")

TARGET_WIDTHS = (480, 720, 1080)


def make_blur_data_url(img):
    thumb = img.copy()
    thumb.thumbnail((18, 24), Image.Resampling.LANCZOS)
    if thumb.mode != "RGB":
        thumb = thumb.convert("RGB")
    buf = io.BytesIO()
    thumb.save(buf, format="JPEG", quality=45, optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{b64}"


def process_image_file(src_path, rel_key):
    os.makedirs(DERIVED_DIR, exist_ok=True)
    safe_stem = rel_key.replace("\\", "/").strip("/").replace("/", "__")
    SafeBase, _ = os.path.splitext(safe_stem)

    variants = {}
    mtime = int(os.path.getmtime(src_path))
    with Image.open(src_path) as im:
        if im.mode not in ("RGB", "RGBA"):
            im = im.convert("RGB")
        orig_w, orig_h = im.size
        blur_url = make_blur_data_url(im)

        for w in TARGET_WIDTHS:
            out_name = f"{SafeBase}-{w}w.webp"
            out_path = os.path.join(DERIVED_DIR, out_name)
            if not os.path.exists(out_path) or int(os.path.getmtime(out_path)) < mtime:
                target_w = min(w, orig_w)
                target_h = max(1, int(round(orig_h * (target_w / float(orig_w)))))
                resized = im.resize((target_w, target_h), Image.Resampling.LANCZOS)
                if resized.mode != "RGB":
                    resized = resized.convert("RGB")
                resized.save(out_path, format="WEBP", quality=82, method=4)
            variants[f"{w}w"] = f"/public/images/derived/{out_name}?v={mtime}"

    srcset = ", ".join(f"{variants[f'{w}w']} {w}w" for w in TARGET_WIDTHS if f"{w}w" in variants)
    return {
        "width": orig_w,
        "height": orig_h,
        "updatedAt": mtime,
        "webpUrl": variants.get("720w") or variants.get("1080w"),
        "variants": variants,
        "srcset": srcset,
        "blurDataUrl": blur_url
    }


def build_all():
    os.makedirs(DERIVED_DIR, exist_ok=True)
    manifest = {}
    if os.path.exists(MANIFEST_OUT):
        try:
            with open(MANIFEST_OUT, "r", encoding="utf-8") as f:
                manifest = json.load(f)
        except Exception:
            manifest = {}

    processed_count = 0
    # Process all studio & generated multi-view folders (jt-saree-01..11, saree-011..050, and generated front views)
    for entry in sorted(os.listdir(SAREES_DIR)):
        sub = os.path.join(SAREES_DIR, entry)
        if os.path.isdir(sub) and entry != "generated":
            for fname in sorted(os.listdir(sub)):
                if not fname.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
                    continue
                fpath = os.path.join(sub, fname)
                public_key = f"/public/images/sarees/{entry}/{fname}"
                mtime = int(os.path.getmtime(fpath))
                if public_key in manifest and manifest[public_key].get("updatedAt") == mtime:
                    continue
                try:
                    manifest[public_key] = process_image_file(fpath, f"{entry}/{fname}")
                    processed_count += 1
                except Exception as ex:
                    print(f"Warning: could not process {fpath}: {ex}")

    gen_dir = os.path.join(SAREES_DIR, "generated")
    if os.path.isdir(gen_dir):
        for fname in sorted(os.listdir(gen_dir)):
            if not fname.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
                continue
            fpath = os.path.join(gen_dir, fname)
            public_key = f"/public/images/sarees/generated/{fname}"
            mtime = int(os.path.getmtime(fpath))
            if public_key in manifest and manifest[public_key].get("updatedAt") == mtime:
                continue
            try:
                manifest[public_key] = process_image_file(fpath, f"generated/{fname}")
                processed_count += 1
            except Exception as ex:
                print(f"Warning: could not process {fpath}: {ex}")

    with open(MANIFEST_OUT, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print(f"Responsive image pipeline complete: {processed_count} newly generated, {len(manifest)} total indexed in {MANIFEST_OUT}")


if __name__ == "__main__":
    build_all()
