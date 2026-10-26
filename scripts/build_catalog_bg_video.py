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

    poster_src = os.path.join(SRC_DIR, "ezgif-frame-001.jpg")
    poster_out = os.path.join(OUT_DIR, "poster.webp")
    with Image.open(poster_src) as im:
        im = im.convert("RGB").resize((TARGET_W, TARGET_H), Image.Resampling.LANCZOS)
        im.save(poster_out, "WEBP", quality=76, method=4)

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

    removed = 0
    for f in glob.glob(os.path.join(OUT_DIR, "frame-*.webp")):
        os.remove(f)
        removed += 1

    print(f"MP4: {os.path.getsize(mp4_out)/1024/1024:.2f} MB, WebM: {os.path.getsize(webm_out)/1024/1024:.2f} MB, Removed {removed} webp frames")


if __name__ == "__main__":
    main()
