#!/usr/bin/env python3
"""CyberNet AI v4 "Aurora": grade the Unsplash photo set into one art-directed series.

    python scripts/grade-images.py [--src DIR] [--out public/ui/img] [--only name,name] [--preview]

What it does (needs Pillow and numpy; downloads use only the standard library):
  1. Reads the six free Unsplash photos listed in SOURCES (downloaded from images.unsplash.com into
     --src when missing; the raw files are never committed).
  2. Crops each one to 3:2 (tiles) and 4:5 (phones) around a focus point.
  3. Grades it: hue squeeze into the palette (cyan, indigo, violet, magenta), gradient map
     (deep indigo shadows -> violet mids -> cyan highlights -> ice), part of the original light kept,
     a soft bloom, one coloured light leak, a gentle indigo vignette, a deeper foot for captions,
     and fine film grain.
  4. Exports WebP: <name>-800.webp, <name>-1600.webp (3:2) and <name>-4x5-800.webp, <name>-4x5-1200.webp.
     The WebP quality is searched down from 84 until the file fits its size budget.

Licence: all six photos are under the Unsplash License (free for commercial use, no payment, no
account, attribution optional). Credits are in public/ui/img/CREDITS.md. No photo shows a human face.
"""
import argparse
import io
import os
import sys
import tempfile
import urllib.request

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUT = os.path.join(os.path.dirname(HERE), "public", "ui", "img")
DEFAULT_SRC = os.path.join(tempfile.gettempdir(), "cybernet-unsplash")

# v4 Aurora palette (ui-src/DESIGN.md, research RECOMMENDATION 1)
INK = "#0B0720"
GRADE_STOPS = [  # luminance -> colour
    (0.00, "#160848"),   # lifted deep indigo, never black
    (0.20, "#2B0F6E"),   # violet stage
    (0.42, "#4A22C8"),   # electric violet
    (0.62, "#8B5CF6"),   # soft violet
    (0.78, "#22D3EE"),   # brand cyan
    (0.91, "#A5F3FC"),   # ice
    (1.00, "#F2FDFF"),
]
# source hue (degrees) -> graded hue: greens and oranges are pulled onto the palette
HUE_MAP = [(0, 312), (40, 302), (62, 282), (120, 192), (180, 192), (222, 232), (270, 266), (300, 300), (360, 312)]

# size budgets in bytes for the quality search
BUDGET = {"3x2-1600": 140_000, "3x2-800": 56_000, "4x5-1200": 140_000, "4x5-800": 82_000}

# name -> source photo and per-image grade. focus = (x, y) of the subject in the source, 0..1.
SOURCES = {
    "threat-hacker": dict(
        raw="hacker", photo="photo-1549605659-32d82da3a059", w=3200, focus=(0.52, 0.50),
        credit="Kevin Horvat", page="https://unsplash.com/photos/person-in-silhouette-before-computer-code-Pyjp2zmxuLk",
        lo=0.2, hi=98.6, gamma=0.62, keep=0.30, bloom=1.0,
        leaks=[((0.90, 0.08), 0.60, "#22D3EE", 0.42), ((0.04, 0.96), 0.60, "#E879F9", 0.30), ((0.52, 0.18), 0.40, "#8B5CF6", 0.22)],
        foot=0.22, vignette=0.16, grain=0.011, seed=11),
    "threat-phone": dict(
        raw="phone", photo="photo-1600856209923-34372e319a5d", w=2592, focus=(0.50, 0.48),
        credit="Akshar Dave", page="https://unsplash.com/photos/person-holding-blue-light-in-dark-room-sgNc8aY6Z7E",
        zoom={"3x2": 0.78, "4x5": 0.60},
        lo=3.0, hi=99.92, gamma=0.50, keep=0.30, bloom=0.80, denoise=(5.5, 0.11),
        leaks=[((0.16, 0.20), 0.65, "#8B5CF6", 0.55), ((0.92, 0.88), 0.60, "#22D3EE", 0.34), ((0.70, 0.30), 0.35, "#E879F9", 0.16)],
        foot=0.22, vignette=0.18, grain=0.007, seed=12),
    "threat-ai": dict(
        raw="chip", photo="photo-1749006590639-e749e6b7d84c", w=2304, focus=(0.50, 0.49),
        credit="Omar López-Rincón", page="https://unsplash.com/photos/an-ai-chip-on-a-circuit-board-sNt81Whsncg",
        zoom={"3x2": 1.0, "4x5": 0.80},
        lo=0.5, hi=99.9, gamma=1.38, keep=0.30, bloom=0.40,
        leaks=[((0.95, 0.04), 0.5, "#22D3EE", 0.26), ((0.02, 0.98), 0.5, "#E879F9", 0.20)],
        foot=0.28, vignette=0.22, grain=0.011, seed=13),
    "ai": dict(
        raw="board", photo="photo-1782338938231-e0c8c901e6af", w=3200, focus=(0.55, 0.50),
        credit="Brecht Corbeel", page="https://unsplash.com/photos/a-computer-motherboard-with-glowing-purple-rings-and-spheres-xByHY-koWD4",
        lo=0.3, hi=99.8, gamma=0.70, keep=0.38, bloom=0.55,
        leaks=[((0.12, 0.12), 0.5, "#8B5CF6", 0.30), ((0.90, 0.92), 0.5, "#22D3EE", 0.26)],
        foot=0.20, vignette=0.18, grain=0.011, seed=14),
    "servers": dict(
        raw="servers", photo="photo-1782094673136-5198a372980c", w=3200, focus=(0.34, 0.50),
        credit="Winston Chen", page="https://unsplash.com/photos/close-up-of-server-cooling-fans-in-a-vibrant-data-center-iZe21DzHnUg",
        lo=0.5, hi=99.7, gamma=0.95, keep=0.38, bloom=0.35,
        leaks=[((0.92, 0.10), 0.5, "#22D3EE", 0.20), ((0.05, 0.90), 0.5, "#8B5CF6", 0.20)],
        foot=0.28, vignette=0.20, grain=0.006, soft=0.75, seed=15),  # busiest photo: little grain so it fits the budget
    "fingerprint": dict(
        raw="fingerprint", photo="photo-1585079374502-415f8516dcc3", w=3200, focus=(0.50, 0.50),
        credit="George Prentzas", page="https://unsplash.com/photos/glowing-fingerprint-on-circular-scanner-SRFG7iwktDk",
        lo=0.5, hi=99.9, gamma=0.72, keep=0.28, bloom=0.65,
        leaks=[((0.50, 0.46), 0.42, "#22D3EE", 0.30), ((0.92, 0.90), 0.5, "#E879F9", 0.18)],
        foot=0.25, vignette=0.20, grain=0.011, seed=16),
}


def hex_rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32) / 255.0


def make_lut(stops, n=1024):
    pos = np.array([p for p, _ in stops], dtype=np.float32)
    cols = np.stack([hex_rgb(c) for _, c in stops])
    x = np.linspace(0, 1, n, dtype=np.float32)
    return np.stack([np.interp(x, pos, cols[:, i]) for i in range(3)], axis=1)


LUT = make_lut(GRADE_STOPS)


def luma(a):
    return a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722


def rgb2hsv(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(-1), a.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    m = d > 1e-6
    rc = m & (mx == r)
    gc = m & (mx == g) & ~rc
    bc = m & ~rc & ~gc
    h[rc] = ((g - b)[rc] / d[rc]) % 6
    h[gc] = (b - r)[gc] / d[gc] + 2
    h[bc] = (r - g)[bc] / d[bc] + 4
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    return h * 60.0, s, mx


def hsv2rgb(h, s, v):
    h = (h % 360) / 60.0
    c = v * s
    x = c * (1 - np.abs(h % 2 - 1))
    z = np.zeros_like(h)
    conds = [h < 1, h < 2, h < 3, h < 4, h < 5, h >= 5]
    rs = np.select(conds, [c, x, z, z, x, c])
    gs = np.select(conds, [x, c, c, x, z, z])
    bs = np.select(conds, [z, z, x, c, c, x])
    m = v - c
    return np.stack([rs + m, gs + m, bs + m], axis=-1)


def squeeze_hue(a):
    h, s, v = rgb2hsv(a)
    src = np.array([p for p, _ in HUE_MAP], dtype=np.float32)
    dst = np.array([q for _, q in HUE_MAP], dtype=np.float32)
    return hsv2rgb(np.interp(h, src, dst), s, v)


def screen(base, add):
    return 1.0 - (1.0 - base) * (1.0 - np.clip(add, 0, 1))


def blur(a, radius):
    im = Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32) / 255.0


def crop_to(im, aw, ah, focus, zoom=1.0):
    """Largest aw:ah crop around focus; zoom < 1 tightens it (subject fills more of the frame)."""
    w, h = im.size
    if w * ah >= h * aw:  # source wider than target: full height
        ch, cw = h, int(round(h * aw / ah))
    else:
        cw, ch = w, int(round(w * ah / aw))
    cw, ch = int(round(cw * zoom)), int(round(ch * zoom))
    x0 = int(round(min(max(focus[0] * w - cw / 2, 0), w - cw)))
    y0 = int(round(min(max(focus[1] * h - ch / 2, 0), h - ch)))
    return im.crop((x0, y0, x0 + cw, y0 + ch))


def grade(im, P):
    """im: RGB PIL image at master size. Returns float RGB 0..1 (no grain)."""
    a = np.asarray(im, dtype=np.float32) / 255.0
    H, W = a.shape[:2]
    if P.get("denoise"):  # very dark source: smooth sensor noise in the shadows before they are lifted
        r, thr = P["denoise"]
        wd = (np.clip(1 - luma(a) / thr, 0, 1) ** 0.7)[..., None]
        a = a * (1 - wd) + blur(a, r) * wd
    a = squeeze_hue(a)
    L = luma(a)
    lo, hi = np.percentile(L, P["lo"]), np.percentile(L, P["hi"])
    scale = max(hi - lo, 1e-4)
    Ln = np.clip((L - lo) / scale, 0, 1) ** P["gamma"]
    orig = np.clip((a - lo) / scale, 0, 1) ** P["gamma"]
    gm = LUT[np.clip((Ln * (len(LUT) - 1)).astype(np.int32), 0, len(LUT) - 1)]
    out = gm * (1 - P["keep"]) + orig * P["keep"]

    # bloom: highlights spread softly, cool tinted
    hi_mask = np.clip((Ln - 0.55) / 0.45, 0, 1) ** 1.4
    glow = blur(hi_mask[..., None] * hard_tint(), W * 0.010) * 0.55 + blur(hi_mask[..., None] * hard_tint(), W * 0.035) * 0.75
    out = screen(out, glow * P["bloom"])

    # coloured light leaks
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    for (cx, cy), r, col, s in P["leaks"]:
        d2 = ((xx / W - cx) ** 2 * (W / H) ** 2 + (yy / H - cy) ** 2) / (r * r)
        out = screen(out, (np.exp(-d2 * 2.2) * s)[..., None] * hex_rgb(col))

    # gentle indigo vignette + deeper foot for captions
    ink = hex_rgb("#160848")
    nx, ny = xx / W - 0.5, yy / H - 0.5
    vig = np.clip((np.sqrt(nx * nx * 1.1 + ny * ny * 1.6) - 0.30) / 0.55, 0, 1) ** 1.6 * P["vignette"]
    foot = np.clip((yy / H - 0.62) / 0.38, 0, 1) ** 1.5 * P["foot"]
    k = np.clip(vig + foot, 0, 0.7)[..., None]
    out = out * (1 - k) + ink * k
    return np.clip(out, 0, 1)


_TINT = None


def hard_tint():
    global _TINT
    if _TINT is None:
        _TINT = hex_rgb("#7FE7FF") * 0.8 + hex_rgb("#C4B5FD") * 0.2
    return _TINT


def add_grain(a, sigma, seed):
    rng = np.random.default_rng(seed)
    n = rng.normal(0, sigma, a.shape[:2]).astype(np.float32)[..., None]
    # a little less grain in the brightest highlights keeps WebP smaller and the glow clean
    w = 1.0 - 0.5 * np.clip((luma(a) - 0.7) / 0.3, 0, 1)[..., None]
    return np.clip(a + n * w, 0, 1)


def to_img(a):
    return Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB")


def encode(img, budget, qmax=84, qmin=56):
    """Highest WebP quality (>= qmin) that fits the byte budget."""
    best = None
    lo, hi = qmin, qmax
    while lo <= hi:
        mid = (lo + hi) // 2
        buf = io.BytesIO()
        img.save(buf, "WEBP", quality=mid, method=6)
        if buf.tell() <= budget:
            best, lo = (mid, buf.getvalue()), mid + 1
        else:
            hi = mid - 1
    if best is None:
        buf = io.BytesIO()
        img.save(buf, "WEBP", quality=qmin, method=6)
        best = (qmin, buf.getvalue())
    return best


def fetch_raw(name, P, src_dir):
    path = os.path.join(src_dir, P["raw"] + ".jpg")
    if os.path.exists(path):
        return path
    os.makedirs(src_dir, exist_ok=True)
    url = f"https://images.unsplash.com/{P['photo']}?w={P['w']}&q=88&fm=jpg"
    print(f"  downloading {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "cybernet-grade-images/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r, open(path, "wb") as f:
        f.write(r.read())
    return path


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", default=DEFAULT_SRC, help="folder holding (or receiving) the raw photos")
    ap.add_argument("--out", default=DEFAULT_OUT, help="output folder (default public/ui/img)")
    ap.add_argument("--only", default="", help="comma separated image names")
    ap.add_argument("--preview", action="store_true", help="write PNG previews instead of WebP (for tuning)")
    args = ap.parse_args()
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    os.makedirs(args.out, exist_ok=True)
    report = []
    for name, P in SOURCES.items():
        if only and name not in only:
            continue
        print(name)
        raw = Image.open(fetch_raw(name, P, args.src)).convert("RGB")
        variants = [("3x2", 3, 2, 1600, [1600, 800]), ("4x5", 4, 5, 1200, [1200, 800])]
        for tag, aw, ah, master_w, widths in variants:
            crop = crop_to(raw, aw, ah, P["focus"], P.get("zoom", {}).get(tag, 1.0))
            master = crop.resize((master_w, round(master_w * ah / aw)), Image.LANCZOS)
            graded = grade(master, P)
            gimg = to_img(graded)
            if P.get("soft"):  # tame razor-sharp detail so the file fits its budget
                gimg = gimg.filter(ImageFilter.GaussianBlur(P["soft"]))
            for w in widths:
                h = round(w * ah / aw)
                small = gimg if w == master_w else gimg.resize((w, h), Image.LANCZOS)
                final = to_img(add_grain(np.asarray(small, dtype=np.float32) / 255.0, P["grain"], P["seed"] + w))
                stem = f"{name}-{w}" if tag == "3x2" else f"{name}-4x5-{w}"
                if args.preview:
                    final.save(os.path.join(args.out, stem + ".png"))
                    continue
                q, data = encode(final, BUDGET[f"{tag}-{w}"])
                with open(os.path.join(args.out, stem + ".webp"), "wb") as f:
                    f.write(data)
                report.append((stem + ".webp", w, h, q, len(data)))
                print(f"  {stem}.webp  {w}x{h}  q{q}  {len(data) / 1024:.1f} KB")
    if report:
        total = sum(r[4] for r in report)
        print(f"{len(report)} files, {total / 1024:.0f} KB total")


if __name__ == "__main__":
    sys.exit(main())
