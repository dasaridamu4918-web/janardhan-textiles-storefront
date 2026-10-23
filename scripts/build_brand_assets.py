"""
Build LEPAKSHI WEAVES brand assets from the original logo.

Original (never modified): assets/originals/brand/lepakshi-weaves-logo-original.png
Output:                    public/brand/*  and site-root favicon.ico / apple-touch-icon.png

Run:  python scripts/build_brand_assets.py
"""
import base64
import io
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "originals", "brand", "lepakshi-weaves-logo-original.png")
OUT = os.path.join(ROOT, "public", "brand")
os.makedirs(OUT, exist_ok=True)

WINE = (107, 29, 47)
GOLD = (196, 161, 90)
IVORY = (250, 246, 238)
WHITE = (255, 255, 255)


def trim(img, pad=4):
    a = np.array(img)[:, :, 3]
    ys, xs = np.where(a > 12)
    return img.crop((max(xs.min() - pad, 0), max(ys.min() - pad, 0),
                     min(xs.max() + pad + 1, img.width), min(ys.max() + pad + 1, img.height)))


def keep_center_components(img):
    """Keep only alpha components overlapping the central 40% box (drops stray ribbon edges)."""
    arr = np.array(img)
    mask = arr[:, :, 3] > 20
    labels, n = ndimage.label(mask)
    h, w = mask.shape
    cy0, cy1, cx0, cx1 = int(h * 0.3), int(h * 0.7), int(w * 0.3), int(w * 0.7)
    keep = set(np.unique(labels[cy0:cy1, cx0:cx1])) - {0}
    out = arr.copy()
    out[~np.isin(labels, list(keep)), 3] = 0
    return Image.fromarray(out)


def tint(img, color, min_tone=0.38):
    """One-colour version that keeps engraving detail: alpha is modulated by luminance."""
    arr = np.array(img).astype(np.float32)
    lum = (0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]) / 255.0
    lo, hi = np.percentile(lum[arr[:, :, 3] > 40], [2, 98])
    tone = np.clip((lum - lo) / max(hi - lo, 1e-3), 0, 1)
    alpha = arr[:, :, 3] * (min_tone + (1 - min_tone) * tone)
    out = np.zeros_like(arr)
    out[:, :, 0], out[:, :, 1], out[:, :, 2] = color
    out[:, :, 3] = alpha
    return Image.fromarray(out.astype(np.uint8))


def fit_width(img, width):
    return img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)


def fit_height(img, height):
    return img.resize((round(img.width * height / img.height), height), Image.LANCZOS)


def square(img, size, bg=None, pad_ratio=0.1):
    canvas = Image.new("RGBA", (size, size), bg + (255,) if bg else (0, 0, 0, 0))
    inner = int(size * (1 - 2 * pad_ratio))
    s = img.copy()
    s.thumbnail((inner, inner), Image.LANCZOS)
    canvas.alpha_composite(s, ((size - s.width) // 2, (size - s.height) // 2))
    return canvas


def save_pair(img, name, webp_q=88):
    img.save(os.path.join(OUT, f"{name}.png"), optimize=True)
    img.save(os.path.join(OUT, f"{name}.webp"), "WEBP", quality=webp_q, method=6)


def save_svg(img, name, title):
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'viewBox="0 0 {img.width} {img.height}" width="{img.width}" height="{img.height}" role="img" aria-label="{title}">'
        f"<title>{title}</title>"
        f'<image width="{img.width}" height="{img.height}" href="data:image/png;base64,{b64}" '
        f'xlink:href="data:image/png;base64,{b64}"/></svg>'
    )
    with open(os.path.join(OUT, f"{name}.svg"), "w", encoding="utf-8") as f:
        f.write(svg)


src = Image.open(SRC).convert("RGBA")

# 1. Full stacked logo
full = trim(src)
full_web = fit_width(full, 960)
save_pair(full_web, "lepakshi-weaves-logo")
save_svg(fit_width(full, 720), "lepakshi-weaves-logo", "LEPAKSHI WEAVES logo")

# 2. Emblem (arch + rose + ribbon + shuttle) and wordmark crops
emblem = trim(src.crop((150, 0, 890, 500)))


def drop_top_slivers(img, band=30):
    """Remove alpha components that live entirely in the top band (ribbon fragments above the lettering)."""
    arr = np.array(img)
    labels, n = ndimage.label(arr[:, :, 3] > 20)
    for i, sl in enumerate(ndimage.find_objects(labels), start=1):
        if sl is not None and sl[0].stop <= band:
            arr[labels == i, 3] = 0
    return Image.fromarray(arr)


wordmark = trim(drop_top_slivers(src.crop((0, 488, src.width, src.height))))
save_pair(fit_height(emblem, 400), "lepakshi-weaves-emblem")

# 3. Rose-only emblem (small screens, favicons)
rose = trim(keep_center_components(src.crop((418, 165, 612, 368))))
rose_sq = square(rose, 256, pad_ratio=0.04)
save_pair(rose_sq, "lepakshi-weaves-rose")
save_svg(rose_sq, "lepakshi-weaves-rose", "LEPAKSHI WEAVES rose emblem")

# 4. Compact horizontal lockup: emblem left, wordmark right (desktop header & footer)
H = 160
e = fit_height(emblem, H)
w = fit_height(wordmark, int(H * 0.52))
gap = 18
horiz = Image.new("RGBA", (e.width + gap + w.width, H), (0, 0, 0, 0))
horiz.alpha_composite(e, (0, 0))
horiz.alpha_composite(w, (e.width + gap, (H - w.height) // 2 + 4))
save_pair(horiz, "lepakshi-weaves-logo-horizontal")
save_svg(horiz, "lepakshi-weaves-logo-horizontal", "LEPAKSHI WEAVES logo")
# Lightweight 2x header sizes (displayed at 44px tall desktop / 36px rose on mobile)
save_pair(fit_height(horiz, 88), "lepakshi-weaves-logo-horizontal-88", webp_q=86)
save_pair(square(rose, 96, pad_ratio=0.02), "lepakshi-weaves-rose-96", webp_q=86)
save_pair(fit_height(full, 240), "lepakshi-weaves-logo-240", webp_q=86)

# 5. One-colour gold and white versions (for dark backgrounds)
for label, color in (("gold", GOLD), ("white", WHITE)):
    save_pair(tint(full_web, color), f"lepakshi-weaves-logo-{label}")
    save_svg(tint(fit_width(full, 720), color), f"lepakshi-weaves-logo-{label}", f"LEPAKSHI WEAVES logo ({label})")
    save_pair(tint(horiz, color), f"lepakshi-weaves-logo-horizontal-{label}")
    save_svg(tint(horiz, color), f"lepakshi-weaves-logo-horizontal-{label}", f"LEPAKSHI WEAVES logo ({label})")
    save_pair(tint(rose_sq, color), f"lepakshi-weaves-rose-{label}")
    save_svg(tint(rose_sq, color), f"lepakshi-weaves-rose-{label}", f"LEPAKSHI WEAVES rose emblem ({label})")

# 6. Favicons & app icons (rose on ivory with wine ring so it reads at 16px)
def app_icon(size, pad=0.12, ring=True):
    c = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(c)
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * 0.22), fill=IVORY + (255,))
    if ring and size >= 48:
        t = max(2, size // 40)
        d.rounded_rectangle((t, t, size - 1 - t, size - 1 - t), radius=int(size * 0.2), outline=GOLD + (255,), width=t)
    s = rose.copy()
    s.thumbnail((int(size * (1 - 2 * pad)),) * 2, Image.LANCZOS)
    c.alpha_composite(s, ((size - s.width) // 2, (size - s.height) // 2))
    return c


app_icon(32, pad=0.06, ring=False).save(os.path.join(OUT, "favicon-32x32.png"))
app_icon(16, pad=0.04, ring=False).save(os.path.join(OUT, "favicon-16x16.png"))
app_icon(180).convert("RGB").save(os.path.join(OUT, "apple-touch-icon.png"))
app_icon(180).convert("RGB").save(os.path.join(ROOT, "apple-touch-icon.png"))
app_icon(192).save(os.path.join(OUT, "icon-192.png"))
app_icon(512).save(os.path.join(OUT, "icon-512.png"))
mask = Image.new("RGBA", (512, 512), IVORY + (255,))
r = rose.copy(); r.thumbnail((300, 300), Image.LANCZOS)
mask.alpha_composite(r, ((512 - r.width) // 2, (512 - r.height) // 2))
mask.save(os.path.join(OUT, "icon-maskable-512.png"))
ico = app_icon(48, pad=0.06, ring=False)
ico.save(os.path.join(ROOT, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])
ico.save(os.path.join(OUT, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])

# 7. Social share image 1200x630 (WhatsApp / Google / Facebook)
og = Image.new("RGB", (1200, 630), IVORY)
d = ImageDraw.Draw(og)
d.rectangle((0, 0, 1199, 629), outline=WINE, width=18)
d.rectangle((26, 26, 1173, 603), outline=GOLD, width=3)
logo = full.copy(); logo.thumbnail((620, 420), Image.LANCZOS)
og.paste(logo, ((1200 - logo.width) // 2, 70), logo)
try:
    font = ImageFont.truetype("C:/Windows/Fonts/georgiai.ttf", 34)
except Exception:
    font = ImageFont.load_default()
tag = "Fine sarees woven on ~600 power looms"
tw = d.textlength(tag, font=font)
d.text(((1200 - tw) / 2, 515), tag, fill=WINE, font=font)
og.save(os.path.join(OUT, "og-image.jpg"), "JPEG", quality=84, optimize=True, progressive=True)

for f in sorted(os.listdir(OUT)):
    print(f"{f:48s} {os.path.getsize(os.path.join(OUT, f)) / 1024:8.1f} KB")
