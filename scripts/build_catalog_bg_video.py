"""
Build optimized looping MP4 and WebM background videos (< 3 MB each) + poster.webp
for the Lepakshi Weaves catalog background from the 300 4K saree frames.
Also removes the 300 individual frame-*.webp files to keep the production bundle lean.
"""
import glob
import os
import subprocess
import imageio_ffmpeg
from PIL import Image

SRC_DIR = r"C:\Users\91965\Downloads\zip files"
OUT_DIR = r"C:\Users\91965\.gemini\antigravity\scratch\janardhan-textiles-storefront\public\assets\catalog-bg"
TARGET_W = 1280
TARGET_H = 720


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    input_pattern = os.path.join(SRC_DIR, "ezgif-frame-%03d.jpg")

    # 1. Ensure poster.webp exists (1280x720 WebP)
    poster_src = os.path.join(SRC_DIR, "ezgif-frame-001.jpg")
    poster_out = os.path.join(OUT_DIR, "poster.webp")
    with Image.open(poster_src) as im:
        im = im.convert("RGB").resize((TARGET_W, TARGET_H), Image.Resampling.LANCZOS)
        im.save(poster_out, "WEBP", quality=76, method=4)

    # 2. Build seamless ping-pong MP4 (H.264, 1280x720, 24fps, muted, < 3 MB)
    # Using every 2nd frame forward + reverse (300 frames total @ 24fps = 12.5s seamless loop)
    mp4_out = os.path.join(OUT_DIR, "saree-catalog-bg.mp4")
    vf_filter = (
        "select='not(mod(n\\,2))',setpts=N/24/TB,"
        f"scale={TARGET_W}:{TARGET_H}:flags=lanczos,"
        "split[fwd][rev];"
        "[rev]trim=start_frame=1:end_frame=148,reverse,setpts=PTS-STARTPTS[r];"
        "[fwd][r]concat=n=2:v=1:a=0,format=yuv420p"
    )

    cmd_mp4 = [
        ffmpeg,
        "-y",
        "-framerate", "24",
        "-i", input_pattern,
        "-filter_complex", vf_filter,
        "-r", "24",
        "-an",
        "-c:v", "libx264",
        "-preset", "slow",
        "-crf", "28",
        "-b:v", "1400k",
        "-maxrate", "1750k",
        "-bufsize", "3500k",
        "-movflags", "+faststart",
        mp4_out,
    ]
    subprocess.run(cmd_mp4, check=True)

    # 3. Build seamless ping-pong WebM (VP9, 1280x720, 24fps, muted, < 3 MB)
    webm_out = os.path.join(OUT_DIR, "saree-catalog-bg.webm")
    cmd_webm = [
        ffmpeg,
        "-y",
        "-framerate", "24",
        "-i", input_pattern,
        "-filter_complex", vf_filter,
        "-r", "24",
        "-an",
        "-c:v", "libvpx-vp9",
        "-b:v", "1100k",
        "-maxrate", "1450k",
        "-bufsize", "2900k",
        "-crf", "33",
        "-row-mt", "1",
        "-cpu-used", "2",
        webm_out,
    ]
    subprocess.run(cmd_webm, check=True)

    # 4. Remove the 300 individual frame-*.webp files so production only ships poster + mp4 + webm
    removed = 0
    for f in glob.glob(os.path.join(OUT_DIR, "frame-*.webp")):
        os.remove(f)
        removed += 1

    mp4_mb = os.path.getsize(mp4_out) / (1024 * 1024)
    webm_mb = os.path.getsize(webm_out) / (1024 * 1024)
    poster_kb = os.path.getsize(poster_out) / 1024
    print(f"MP4 size:    {mp4_mb:.2f} MB ({os.path.getsize(mp4_out):,} bytes)")
    print(f"WebM size:   {webm_mb:.2f} MB ({os.path.getsize(webm_out):,} bytes)")
    print(f"Poster size: {poster_kb:.1f} KB ({os.path.getsize(poster_out):,} bytes)")
    print(f"Removed {removed} individual frame-*.webp files.")


if __name__ == "__main__":
    main()
