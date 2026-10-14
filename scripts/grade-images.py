#!/usr/bin/env python3
"""CyberNet AI v4.1 "Midnight": grade the Unsplash photo set into one restrained, art-directed series.

    python scripts/grade-images.py [--src DIR] [--out public/ui/img] [--only name,name] [--preview]

What it does (needs Pillow and numpy; downloads use only the standard library):
  1. Reads the five free Unsplash photos listed in SOURCES (downloaded from images.unsplash.com into
     --src when missing; the raw files are never committed).
  2. Crops each one to 3:2 (tiles) and 4:5 (phones) around a focus point.
  3. Grades it to the v4.1 palette (ui-src/DESIGN.md): midnight navy shadows, neutral slate mids, cyan
     highlights, and nothing purple. Hues are collapsed onto one cool axis, luminance goes through a
     navy -> slate -> cyan gradient map, a little of the (desaturated) original is kept for texture,
     a restrained bloom and ONE cyan rim light are added, then a navy vignette and a deeper foot for
     captions. Everything is resized from a larger master and finished with a light unsharp mask so the
     result stays crisp, with only a whisper of grain.
  4. Exports WebP: <name>-800.webp, <name>-1600.webp (3:2) and <name>-4x5-800.webp, <name>-4x5-1200.webp.
     The WebP quality is searched down from 86 until the file fits its size budget (<= 140 KB at 1600).

Licence: all five photos are under the Unsplash License (free for commercial use, no payment, no
account, attribution optional; none is an Unsplash+ photo). Credits are in public/ui/img/CREDITS.md.
No photo shows a human face.
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

# v4.1 Midnight palette (ui-src/DESIGN.md): ground #060A14, surfaces #0C1220 / #121A2B, cyan #22D3EE, blue #3B82F6
GROUND = "#060A14"
GRADE_STOPS = [  # luminance -> colour: navy shadows, neutral slate mids, cyan highlights
    (0.00, "#04070E"),
    (0.12, "#080F1D"),   # midnight
    (0.28, "#111D33"),   # navy
    (0.46, "#2D3D57"),   # blue slate
    (0.60, "#66768C"),   # neutral slate
    (0.72, "#93B2C4"),   # cool grey, the start of the cyan
    (0.82, "#5CD9EE"),   # cyan highlight
    (0.92, "#B4F2FB"),   # ice
    (1.00, "#F4FDFF"),
]
# every source hue is pulled onto one cool axis (cyan to steel blue): no violet, magenta, orange or green survives
HUE_MAP = [(0, 214), (30, 208), (60, 200), (120, 194), (180, 192), (225, 214), (270, 220), (310, 218), (360, 214)]
KEEP_SAT = 0.55          # saturation of the kept original (after the hue collapse)

# size budgets in bytes for the quality search
BUDGET = {"3x2-1600": 140_000, "3x2-800": 56_000, "4x5-1200": 140_000, "4x5-800": 82_000}

# name -> source photo and per-image grade. focus = (x, y) of the subject in the source, 0..1.
#   lo/hi: black and white percentiles; gamma > 1 darkens the mids; contrast: S-curve strength;
#   keep: share of the desaturated original; bloom: highlight glow; rim: [(centre), radius, strength] of the single cyan light
#   foot/vignette: navy darkening; grain: noise sigma; sharp: unsharp-mask percent; denoise: (radius, threshold)
SOURCES = {
    "threat-hacker": dict(
        raw="hacker2", photo="photo-1760199789455-49098afd02f0", w=3200, focus=(0.50, 0.50), focus_4x5=(0.52, 0.50),
        # paints out a stray mangled scribble ("Julio") on the left monitor's bezel; the line is the bezel's top edge
        retouch=[(0.384, 0.6065, 0.416, 0.6340, ((0.38656, 0.61372), (0.415625, 0.60869)), 0.36)],
        credit="Julio Lopez", page="https://unsplash.com/photos/hacker-in-hoodie-working-on-multiple-computer-screens-hLAmfdxGlls",
        lo=0.3, hi=99.6, gamma=1.30, contrast=0.55, keep=0.16, bloom=0.30,
        rim=((0.96, 0.04), 0.55, 0.30),
        foot=0.0, vignette=0.55, grain=0.0045, sharp=70, seed=11),
    "threat-ai": dict(
        raw="chip", photo="photo-1749006590639-e749e6b7d84c", w=2304, focus=(0.50, 0.49),
        credit="Omar López-Rincón", page="https://unsplash.com/photos/an-ai-chip-on-a-circuit-board-sNt81Whsncg",
        zoom={"3x2": 1.0, "4x5": 0.80},
        lo=0.5, hi=99.9, gamma=1.55, contrast=0.55, keep=0.16, bloom=0.22,
        rim=((0.96, 0.04), 0.5, 0.22),
        foot=0.30, vignette=0.40, grain=0.005, sharp=60, seed=13),
    "ai": dict(
        raw="board", photo="photo-1782338938231-e0c8c901e6af", w=3200, focus=(0.55, 0.50),
        credit="Brecht Corbeel", page="https://unsplash.com/photos/a-computer-motherboard-with-glowing-purple-rings-and-spheres-xByHY-koWD4",
        lo=0.3, hi=99.8, gamma=1.10, contrast=0.50, keep=0.16, bloom=0.30,
        rim=((0.94, 0.06), 0.5, 0.20),
        foot=0.24, vignette=0.34, grain=0.005, sharp=60, seed=14),
    "servers": dict(
        raw="servers", photo="photo-1782094673136-5198a372980c", w=3200, focus=(0.34, 0.50),
        credit="Winston Chen", page="https://unsplash.com/photos/close-up-of-server-cooling-fans-in-a-vibrant-data-center-iZe21DzHnUg",
        lo=0.5, hi=99.9, gamma=1.70, contrast=0.32, keep=0.14, bloom=0.14,
        rim=((0.94, 0.06), 0.5, 0.14),
        foot=0.30, vignette=0.45, grain=0.0, sharp=0, soft=0.8, seed=15),  # busiest photo: darker, no grain, a touch of softening so it fits the budget at a clean quality
    "fingerprint": dict(
        raw="fingerprint", photo="photo-1585079374502-415f8516dcc3", w=3200, focus=(0.50, 0.50),
        credit="George Prentzas", page="https://unsplash.com/photos/glowing-fingerprint-on-circular-scanner-SRFG7iwktDk",
        lo=0.5, hi=99.9, gamma=1.10, contrast=0.50, keep=0.16, bloom=0.40,
        rim=((0.50, 0.48), 0.42, 0.18),
        foot=0.26, vignette=0.34, grain=0.005, sharp=60, seed=16),
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


def collapse_hue(a):
    """Pull every hue onto the cool axis and mute it: the kept original can never read purple."""
    h, s, v = rgb2hsv(a)
    src = np.array([p for p, _ in HUE_MAP], dtype=np.float32)
    dst = np.array([q for _, q in HUE_MAP], dtype=np.float32)
    return hsv2rgb(np.interp(h, src, dst), s * KEEP_SAT, v)


def screen(base, add):
    return 1.0 - (1.0 - base) * (1.0 - np.clip(add, 0, 1))


def blur(a, radius):
    im = Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32) / 255.0


def scurve(x, k):
    """Smooth S-curve on 0..1, k = 0 is the identity, k = 1 is strong."""
    return x + k * (x - 0.5) * (1 - x) * x * 4 * 0.5 if k else x


def fblur(a, sigma):
    """Float separable Gaussian blur of an HxWxC array (exact weights, for small regions)."""
    n = int(sigma * 3) | 1
    x = np.arange(n) - n // 2
    k = np.exp(-x * x / (2 * sigma * sigma))
    k /= k.sum()
    pad = n // 2
    out = np.pad(a, ((pad, pad), (pad, pad), (0, 0)), mode="edge")
    out = np.apply_along_axis(lambda v: np.convolve(v, k, mode="valid"), 0, out)
    return np.apply_along_axis(lambda v: np.convolve(v, k, mode="valid"), 1, out)


def retouch(im, spots):
    """Paint out stray marks in the RAW photo (before crop and grade): each spot is
    (x0, y0, x1, y1, line, dark) in source fractions; pixels darker than `dark`, or than their neighbourhood, inside the box (below the optional
    slanted edge line ((xa, ya), (xb, yb)) in fractions) are removed and filled from their surroundings
    (normalised blur, widened until it closes)."""
    a = np.asarray(im, dtype=np.float32) / 255.0
    H, W = a.shape[:2]
    for (x0, y0, x1, y1, line, dark) in spots:
        X0, Y0, X1, Y1 = int(x0 * W), int(y0 * H), int(x1 * W), int(y1 * H)
        box = a[Y0:Y1, X0:X1]
        L = luma(box)
        yy, xx = np.mgrid[Y0:Y1, X0:X1].astype(np.float32)
        local = fblur(L[..., None], 7)[..., 0]  # thin marks are darker than their own neighbourhood
        m = (L < dark) | (L < local - 0.05)
        if line:  # keep the bright edge line and everything above it
            (xa, ya), (xb, yb) = line
            ly = (ya + (yb - ya) * (xx / W - xa) / (xb - xa)) * H
            m &= yy > ly + 4
        mm = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))
        m = (np.asarray(mm, dtype=np.float32) / 255.0)[..., None]
        known = 1.0 - m
        fill = box
        for r in (3, 6, 12, 24):
            num = fblur(box * known, r)
            den = np.maximum(fblur(known, r), 1e-4)
            est = np.clip(num / den, 0, 1)
            fill = np.where(m > 0.5, est, fill)
            known = np.where(m > 0.5, np.where(den > 0.05, 1.0, 0.0), known)
            m = np.where(known > 0.5, 0.0, m)
            box = np.where(known > 0.5, fill, box)
        a[Y0:Y1, X0:X1] = fill
    return to_img(a)


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
    L = luma(a)
    lo, hi = np.percentile(L, P["lo"]), np.percentile(L, P["hi"])
    scale = max(hi - lo, 1e-4)
    Ln = np.clip((L - lo) / scale, 0, 1) ** P["gamma"]
    Ln = np.clip(scurve(Ln, P.get("contrast", 0.5)), 0, 1)
    gm = LUT[np.clip((Ln * (len(LUT) - 1)).astype(np.int32), 0, len(LUT) - 1)]

    # the kept original: hue collapsed onto the cool axis and muted, then matched to the graded luminance
    orig = collapse_hue(np.clip((a - lo) / scale, 0, 1) ** P["gamma"])
    ol = np.maximum(luma(orig), 1e-4)[..., None]
    orig = np.clip(orig * (Ln[..., None] / ol), 0, 1)
    out = gm * (1 - P["keep"]) + orig * P["keep"]

    # restrained bloom: only the real highlights spread, in ice
    ice = hex_rgb("#BDF1FB")
    hi_mask = np.clip((Ln - 0.62) / 0.38, 0, 1) ** 1.6
    glow = blur(hi_mask[..., None] * ice, W * 0.006) * 0.55 + blur(hi_mask[..., None] * ice, W * 0.028) * 0.55
    out = screen(out, glow * P["bloom"])

    # one cyan rim light, never a second colour
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    (cx, cy), r, s = P["rim"]
    d2 = ((xx / W - cx) ** 2 * (W / H) ** 2 + (yy / H - cy) ** 2) / (r * r)
    out = screen(out, (np.exp(-d2 * 2.4) * s)[..., None] * hex_rgb("#22D3EE"))

    # navy vignette, plus a deeper foot where captions sit
    ink = hex_rgb(GROUND)
    nx, ny = xx / W - 0.5, yy / H - 0.5
    vig = np.clip((np.sqrt(nx * nx * 1.1 + ny * ny * 1.5) - 0.26) / 0.55, 0, 1) ** 1.5 * P["vignette"]
    foot = np.clip((yy / H - 0.62) / 0.38, 0, 1) ** 1.5 * P["foot"]
    k = np.clip(vig + foot, 0, 0.8)[..., None]
    out = out * (1 - k) + ink * k
    return np.clip(out, 0, 1)


def add_grain(a, sigma, seed):
    if not sigma:
        return a
    rng = np.random.default_rng(seed)
    n = rng.normal(0, sigma, a.shape[:2]).astype(np.float32)[..., None]
    # less grain in the brightest highlights keeps WebP smaller and the glow clean
    w = 1.0 - 0.5 * np.clip((luma(a) - 0.7) / 0.3, 0, 1)[..., None]
    return np.clip(a + n * w, 0, 1)


def to_img(a):
    return Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB")


def encode(img, budget, qmax=86, qmin=52):
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
        if P.get("retouch"):
            raw = retouch(raw, P["retouch"])
        variants = [("3x2", 3, 2, 1600, [1600, 800]), ("4x5", 4, 5, 1200, [1200, 800])]
        for tag, aw, ah, master_w, widths in variants:
            crop = crop_to(raw, aw, ah, P.get("focus_" + tag, P["focus"]), P.get("zoom", {}).get(tag, 1.0))
            # grade at the master size (never upscaled by more than a hair), then resize each export from it
            master = crop.resize((master_w, round(master_w * ah / aw)), Image.LANCZOS)
            graded = grade(master, P)
            gimg = to_img(graded)
            if P.get("soft"):  # tame razor-sharp detail so the file fits its budget
                gimg = gimg.filter(ImageFilter.GaussianBlur(P["soft"]))
            for w in widths:
                h = round(w * ah / aw)
                small = gimg if w == master_w else gimg.resize((w, h), Image.LANCZOS)
                if P.get("sharp"):  # keep it crisp after the resize
                    small = small.filter(ImageFilter.UnsharpMask(radius=0.9 if w >= 1200 else 0.7, percent=P["sharp"], threshold=2))
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
