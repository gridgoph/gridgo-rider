#!/usr/bin/env python3
"""Rasterise the GRIDGO 3×3 mark onto a black plate.

Captain correction 2026-08-19: the launcher is a black rounded tile, not a
white plate. Pure-black dots vanish on that plate; middle-right must be
drawn grey so the background cannot show through as a hole.

  python3 scripts/generate-app-icon.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

# Readable on #000000. Pure black dots disappear into the plate.
DOT_STRUCT = (0x2A, 0x2A, 0x2A, 255)
DOT_YELLOW = (0xFF, 0xDE, 0x58, 255)
DOT_GRAY = (0x5B, 0x5B, 0x5B, 255)
PLATE = (0x00, 0x00, 0x00, 255)
MONO = (0xFF, 0xFF, 0xFF, 255)

# favicon.svg viewBox="0 0 48 48": centres at 8/24/40, r=5.
CENTRES = (8, 24, 40)
RADIUS = 5
VIEW = 48

# Android adaptive icons are 108dp; the unmasked safe zone is the inner 66dp.
SAFE_ZONE = 66 / 108

# Super-sample then Lanczos-down so the dots stay round, not stair-stepped.
SCALE = 4

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "images"


def dot_fill(col: int, row: int, *, mono: bool) -> tuple[int, int, int, int]:
    if mono:
        return MONO
    if col == 2 and row == 0:
        return DOT_YELLOW
    # Middle-right and bottom-right are both grey. An empty middle-right
    # cell used to punch a white hole through the old light plate.
    if col == 2:
        return DOT_GRAY
    return DOT_STRUCT


def draw_mark(
    size: int,
    *,
    mono: bool = False,
    inner_ratio: float = 1.0,
    background: tuple[int, int, int, int] = (0, 0, 0, 0),
) -> Image.Image:
    """Paint all nine dots into a size×size canvas.

    `inner_ratio` is the fraction of the canvas the 48-unit viewBox occupies
    (centred). 66/108 puts every dot inside Android's adaptive safe zone.
    """
    big = size * SCALE
    canvas = Image.new("RGBA", (big, big), background)
    draw = ImageDraw.Draw(canvas)

    inner = size * inner_ratio
    origin = (size - inner) / 2
    unit = inner / VIEW

    for row, cy in enumerate(CENTRES):
        for col, cx in enumerate(CENTRES):
            fill = dot_fill(col, row, mono=mono)
            px = (origin + cx * unit) * SCALE
            py = (origin + cy * unit) * SCALE
            r = RADIUS * unit * SCALE
            draw.ellipse((px - r, py - r, px + r, py + r), fill=fill)

    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def composite_plate(
    mark: Image.Image,
    color: tuple[int, int, int, int] = PLATE,
) -> Image.Image:
    plate = Image.new("RGBA", mark.size, color)
    plate.alpha_composite(mark)
    return plate.convert("RGB")


def save_png(image: Image.Image, name: str) -> None:
    path = OUT / name
    image.save(path, format="PNG", optimize=True)
    print(f"wrote {path.relative_to(ROOT)} ({image.size[0]}×{image.size[1]} {image.mode})")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    # Home-screen / iOS icon: opaque black plate, mark inset so the squircle
    # mask does not clip a corner dot.
    save_png(composite_plate(draw_mark(1024, inner_ratio=0.70)), "icon.png")

    # Adaptive layers. Foreground draws every dot (no holes). Background is
    # the black tile. Monochrome is a white nine-dot silhouette so Android
    # can tint it; on the black plate all nine stay visible.
    save_png(draw_mark(1024, inner_ratio=SAFE_ZONE), "android-icon-foreground.png")
    save_png(Image.new("RGB", (1024, 1024), PLATE[:3]), "android-icon-background.png")
    save_png(draw_mark(1024, mono=True, inner_ratio=SAFE_ZONE), "android-icon-monochrome.png")

    # Splash matches the tile: same nine-dot mark on a black field.
    save_png(draw_mark(1024, inner_ratio=0.72), "splash-icon.png")
    save_png(draw_mark(1024, inner_ratio=0.72), "splash-icon-dark.png")

    # Web tab icon: same black plate so it does not flash white in a dark tab.
    save_png(composite_plate(draw_mark(48, inner_ratio=0.84)), "favicon.png")


if __name__ == "__main__":
    main()
