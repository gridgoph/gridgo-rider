#!/usr/bin/env python3
"""Rasterise the legacy printing_app adaptive mark.

Source: printing_app ic_launcher_foreground.xml (108×108 viewport, r=6,
path starts M32/48/64 — geometric centres 38/54/70) on cockpit-black
#111111. Captain change: middle-left is #5B5B5B, not white.

    #FFFFFF  #FFFFFF  #FFDE58
    #5B5B5B  #FFFFFF  #FFFFFF
    #FFFFFF  #FFFFFF  #8A8A8A

Run from the repo root:

    python3 scripts/generate-app-icon.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

# printing_app values/ic_launcher_colors.xml
PLATE = (0x11, 0x11, 0x11, 255)
DOT_WHITE = (0xFF, 0xFF, 0xFF, 255)
DOT_YELLOW = (0xFF, 0xDE, 0x58, 255)
DOT_MID_LEFT = (0x5B, 0x5B, 0x5B, 255)
DOT_BOT_RIGHT = (0x8A, 0x8A, 0x8A, 255)

# Vector viewport 108. Path `M32,38 a6,6 …` is a r=6 circle whose centre
# is start + radius, i.e. 38 / 54 / 70. Do not add a second safe-zone
# inset: the 108 canvas already is the adaptive icon.
VIEW = 108
CENTRES = (38, 54, 70)
RADIUS = 6

SCALE = 4

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "images"


def dot_fill(col: int, row: int, *, mono: bool) -> tuple[int, int, int, int]:
    if mono:
        return DOT_WHITE
    if col == 2 and row == 0:
        return DOT_YELLOW
    if col == 0 and row == 1:
        return DOT_MID_LEFT
    if col == 2 and row == 2:
        return DOT_BOT_RIGHT
    return DOT_WHITE


def draw_mark(size: int, *, mono: bool = False) -> Image.Image:
    """Paint the 3×3 mark into a size×size opaque #111111 plate."""
    big = size * SCALE
    canvas = Image.new("RGBA", (big, big), PLATE)
    draw = ImageDraw.Draw(canvas)
    unit = size / VIEW

    for row, cy in enumerate(CENTRES):
        for col, cx in enumerate(CENTRES):
            color = dot_fill(col, row, mono=mono)
            px = cx * unit * SCALE
            py = cy * unit * SCALE
            r = RADIUS * unit * SCALE
            draw.ellipse((px - r, py - r, px + r, py + r), fill=color)

    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def save_png(image: Image.Image, name: str) -> None:
    path = OUT / name
    image.save(path, format="PNG", optimize=True)
    print(f"wrote {path.relative_to(ROOT)} ({image.size[0]}×{image.size[1]} {image.mode})")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    mark = draw_mark(1024).convert("RGB")
    save_png(mark, "icon.png")
    save_png(mark, "android-icon-foreground.png")
    save_png(Image.new("RGB", (1024, 1024), PLATE[:3]), "android-icon-background.png")
    save_png(draw_mark(1024, mono=True).convert("RGB"), "android-icon-monochrome.png")

    # Same plate + mark as the launcher so splash cannot invert or charcoal.
    save_png(mark, "splash-icon.png")
    save_png(mark, "splash-icon-dark.png")
    save_png(draw_mark(48).convert("RGB"), "favicon.png")


if __name__ == "__main__":
    main()
