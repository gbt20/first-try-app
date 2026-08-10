#!/usr/bin/env python3
"""Generate the PWA icon set.

Pure standard library — no Pillow — so the icons can be rebuilt anywhere.
Shapes are drawn from signed distance fields, which gives clean anti-aliased
edges at every size without supersampling.

    python3 scripts/make-icons.py
"""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public"

# Matches --accent in src/styles.css.
TOP = (0xFF, 0x8A, 0x5C)
BOTTOM = (0xE1, 0x4F, 0x37)
INK = (0xFF, 0xFF, 0xFF)


def clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return lo if v < lo else hi if v > hi else v


def smoothstep(edge0: float, edge1: float, x: float) -> float:
    t = clamp((x - edge0) / (edge1 - edge0))
    return t * t * (3 - 2 * t)


def sd_rounded_box(px: float, py: float, half: float, radius: float) -> float:
    """Signed distance to a rounded square centred on the origin."""
    qx = abs(px) - half + radius
    qy = abs(py) - half + radius
    outside = math.hypot(max(qx, 0.0), max(qy, 0.0))
    return outside + min(max(qx, qy), 0.0) - radius


def sd_segment(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
    """Signed distance to the line segment a→b."""
    pax, pay = px - ax, py - ay
    bax, bay = bx - ax, by - ay
    denom = bax * bax + bay * bay
    h = clamp((pax * bax + pay * bay) / denom) if denom else 0.0
    return math.hypot(pax - bax * h, pay - bay * h)


def over(dst: tuple[int, int, int, int], rgb: tuple[int, int, int], alpha: float):
    """Composite `rgb` at `alpha` over an existing straight-alpha pixel."""
    if alpha <= 0:
        return dst
    dr, dg, db, da = dst
    da_f = da / 255.0
    out_a = alpha + da_f * (1 - alpha)
    if out_a <= 0:
        return (0, 0, 0, 0)
    out = tuple(
        round((c * alpha + d * da_f * (1 - alpha)) / out_a) for c, d in zip(rgb, (dr, dg, db))
    )
    return (out[0], out[1], out[2], round(out_a * 255))


def render(size: int, *, bleed: bool, art_scale: float) -> list[list[tuple[int, int, int, int]]]:
    """Draw one icon.

    bleed      — fill the whole square (iOS and Android maskable icons get
                 cropped by the platform, so they must not round their own
                 corners).
    art_scale  — how much of the square the check mark spans.
    """
    px_per_unit = size  # work in 0..1 units, one unit = the full icon
    feather = 0.9 / px_per_unit  # ~1px of anti-aliasing
    half = 0.5 if bleed else 0.5 - 0.055
    radius = 0.0 if bleed else 0.225

    # Check mark, in 0..1 coordinates, centred and scaled by art_scale.
    pts = [(-0.26, 0.02), (-0.07, 0.21), (0.28, -0.22)]
    pts = [(x * art_scale / 0.62, y * art_scale / 0.62) for x, y in pts]
    thickness = 0.105 * art_scale / 0.62

    rows = []
    for y in range(size):
        row = []
        v = (y + 0.5) / size - 0.5
        for x in range(size):
            u = (x + 0.5) / size - 0.5
            pixel = (0, 0, 0, 0)

            box = sd_rounded_box(u, v, half, radius)
            cover = smoothstep(feather, -feather, box)
            if cover > 0:
                # Vertical gradient, slightly diagonal so it does not look flat.
                t = clamp((v + 0.5) * 0.85 + (u + 0.5) * 0.15)
                base = tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOTTOM))
                pixel = over(pixel, base, cover)

            d = min(
                sd_segment(u, v, *pts[0], *pts[1]),
                sd_segment(u, v, *pts[1], *pts[2]),
            ) - thickness / 2
            mark = smoothstep(feather, -feather, d)
            if mark > 0:
                pixel = over(pixel, INK, mark)

            row.append(pixel)
        rows.append(row)
    return rows


def write_png(path: Path, rows: list[list[tuple[int, int, int, int]]]) -> None:
    height = len(rows)
    width = len(rows[0])
    raw = b"".join(b"\x00" + bytes(c for px in row for c in px) for row in rows)

    def chunk(kind: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + kind
            + data
            + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
        )

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)
    print(f"{path.relative_to(OUT.parent)}  {width}×{height}  {len(png):,} bytes")


def main() -> None:
    # Rounded, with margin — shown as-is in browser tabs and install prompts.
    write_png(OUT / "icons/icon-192.png", render(192, bleed=False, art_scale=0.62))
    write_png(OUT / "icons/icon-512.png", render(512, bleed=False, art_scale=0.62))
    # Full bleed, art inside the safe circle — Android crops these to its shape.
    write_png(OUT / "icons/maskable-192.png", render(192, bleed=True, art_scale=0.44))
    write_png(OUT / "icons/maskable-512.png", render(512, bleed=True, art_scale=0.44))
    # iOS applies its own rounding, so this one must be a full square.
    write_png(OUT / "apple-touch-icon.png", render(180, bleed=True, art_scale=0.56))
    write_png(OUT / "favicon-48.png", render(48, bleed=False, art_scale=0.66))


if __name__ == "__main__":
    main()
