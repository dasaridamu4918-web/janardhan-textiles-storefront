"""Optimize the 300 4K JPG saree frames (3840x2160) into 1280x720 WebP frames + still poster."""
import concurrent.futures
import pathlib
from PIL import Image

SRC_DIR = pathlib.Path(r"C:\Users\91965\Downloads\zip files")
OUT_DIR = pathlib.Path(__file__).resolve().parent.parent / "public" / "assets" / "catalog-bg"


def convert_one(idx_path):
    idx, src_path = idx_path
    with Image.open(src_path) as im:
        resized = im.resize((1280, 720), Image.Resampling.LANCZOS)
        out_path = OUT_DIR / f"frame-{idx:03d}.webp"
        resized.save(out_path, "WEBP", quality=34, method=4)
        return out_path.stat().st_size


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(SRC_DIR.glob("ezgif-frame-*.jpg"))
    assert len(files) == 300, f"Expected 300 frames, found {len(files)}"

    before_bytes = sum(f.stat().st_size for f in files)
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        sizes = list(pool.map(convert_one, enumerate(files, 1)))

    # High-detail still poster (frame 001 at quality 75) for initial paint & mobile/reduced-motion fallback
    with Image.open(files[0]) as im0:
        im0.resize((1280, 720), Image.Resampling.LANCZOS).save(
            OUT_DIR / "poster.webp", "WEBP", quality=75, method=6
        )

    total_300 = sum(sizes)
    total_150 = sum(sizes[::2])
    poster_kb = (OUT_DIR / "poster.webp").stat().st_size / 1024
    print(f"Before (300 x 3840x2160 JPG): {before_bytes / (1024 * 1024):.2f} MB ({before_bytes:,} bytes)")
    print(f"After  (300 x 1280x720 WebP): {total_300 / (1024 * 1024):.2f} MB ({total_300:,} bytes)")
    print(f"Active (150 every-2nd-frame @ 15fps): {total_150 / (1024 * 1024):.2f} MB ({total_150:,} bytes)")
    print(f"Poster (poster.webp 1280x720): {poster_kb:.1f} KB")


if __name__ == "__main__":
    main()
