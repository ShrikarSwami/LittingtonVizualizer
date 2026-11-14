#!/usr/bin/env python3
"""Generate the LittingtonVizualizer icon set (neon swirl) into assets/icon and build/.

Run from the project root:  python3 tools/make-icons.py
Needs Pillow and numpy; uses macOS `iconutil` for the .icns.
"""
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
S = 1024          # canvas
BODY = 824        # macOS icon body inside the canvas
RADIUS = 185      # corner radius of the body


def swirl(size):
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    c = (size - 1) / 2
    dx, dy = (x - c) / c, (y - c) / c
    r = np.sqrt(dx * dx + dy * dy)
    a = np.arctan2(dy, dx)

    # Three-armed logarithmic spiral, tightened toward the centre.
    phase = 3 * a + 9.0 * np.log(r + 0.06)
    arms = 0.5 + 0.5 * np.cos(phase)
    arms = arms ** 2.2
    ripple = 0.5 + 0.5 * np.cos(phase * 2 + r * 14)

    # Palette: magenta -> violet -> cyan, cycling around the spiral.
    t = (a / (2 * np.pi) + r * 0.9) % 1.0
    stops = np.array([[255, 40, 200], [150, 60, 255], [40, 220, 255], [255, 40, 200]], np.float32)
    seg = t * 3
    i = np.clip(seg.astype(int), 0, 2)
    f = (seg - i)[..., None]
    col = stops[i] * (1 - f) + stops[i + 1] * f

    glow = np.clip(1.15 - r, 0, 1) ** 0.8
    core = np.exp(-(r / 0.13) ** 2)
    lum = (arms * 0.95 + ripple * arms * 0.25) * glow
    bg = np.array([10, 6, 22], np.float32)
    rgb = bg + col * lum[..., None] + 255 * core[..., None]
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB")


def build_master():
    art = swirl(BODY * 2).resize((BODY, BODY), Image.LANCZOS)
    bloom = art.filter(ImageFilter.GaussianBlur(14))
    art = Image.blend(art, Image.fromarray(np.maximum(np.asarray(art), np.asarray(bloom))), 0.6)

    mask = Image.new("L", (BODY * 2, BODY * 2), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, BODY * 2 - 1, BODY * 2 - 1], RADIUS * 2, fill=255)
    mask = mask.resize((BODY, BODY), Image.LANCZOS)

    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    off = (S - BODY) // 2
    shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    shadow.paste((0, 0, 0, 110), (off, off + 12), mask)
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(16)))
    canvas.paste(art, (off, off), mask)
    return canvas


def main():
    icon_dir = ROOT / "assets" / "icon"
    build = ROOT / "build"
    icon_dir.mkdir(parents=True, exist_ok=True)
    build.mkdir(exist_ok=True)

    master = build_master()
    master.save(icon_dir / "icon-1024.png")
    master.resize((512, 512), Image.LANCZOS).save(build / "icon.png")
    master.save(build / "icon.ico", sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)])

    iconset = build / "icon.iconset"
    iconset.mkdir(exist_ok=True)
    for base in (16, 32, 128, 256, 512):
        master.resize((base, base), Image.LANCZOS).save(iconset / f"icon_{base}x{base}.png")
        master.resize((base * 2, base * 2), Image.LANCZOS).save(iconset / f"icon_{base}x{base}@2x.png")
    subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(build / "icon.icns")], check=True)
    print("icons written to assets/icon and build/")


if __name__ == "__main__":
    main()
