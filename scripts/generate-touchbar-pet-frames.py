#!/usr/bin/env python3

from pathlib import Path
from PIL import Image

PROJECT_DIR = Path(__file__).resolve().parents[1]
SHEET_PATH = PROJECT_DIR / "assets" / "pet" / "codex-spritesheet.webp"
OUT_DIR = PROJECT_DIR / "assets" / "pet" / "frames"

CELL_W = 192
CELL_H = 208
SIZE = 36
PADDING = 10

FRAMES = {
    "idle": [(0, 0), (1, 0), (0, 0), (5, 0)],
    "thinking": [(0, 7), (1, 7), (2, 7), (3, 7)],
    "tool": [(0, 1), (1, 1), (2, 1), (3, 1), (4, 1), (5, 1)],
    "wait": [(3, 5), (7, 5)],
    "ok": [(1, 8), (2, 8), (5, 8)],
    "error": [(2, 5), (3, 5)],
}


def square_crop(image):
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        return image

    left, top, right, bottom = bbox
    left = max(0, left - PADDING)
    top = max(0, top - PADDING)
    right = min(image.width, right + PADDING)
    bottom = min(image.height, bottom + PADDING)

    width = right - left
    height = bottom - top
    side = max(width, height)
    cx = (left + right) // 2
    cy = (top + bottom) // 2

    left = max(0, min(image.width - side, cx - side // 2))
    top = max(0, min(image.height - side, cy - side // 2))
    return image.crop((left, top, left + side, top + side))


def main():
    sheet = Image.open(SHEET_PATH).convert("RGBA")
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for state, cells in FRAMES.items():
        for index, (col, row) in enumerate(cells):
            cell = sheet.crop(
                (col * CELL_W, row * CELL_H, (col + 1) * CELL_W, (row + 1) * CELL_H)
            )
            frame = square_crop(cell).resize((SIZE, SIZE), Image.Resampling.LANCZOS)
            frame.save(OUT_DIR / f"codex-pet-{state}-{index}.png")


if __name__ == "__main__":
    main()
