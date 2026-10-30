"""Crop a screenshot to its top part: from the top edge to just below the last content above the
tab bar (the poster's Focus shot, where the single card leaves the rest of the screen empty).

The bottom edge is found, not fixed: the last pixel row in the upper 85 % of the image that
differs from the screen background (sampled beside the content), plus a margin. Usage:
    crop_top.py <in.png> <out.png> [margin_px]
"""

import sys

from PIL import Image

TOLERANCE = 6  # per channel: the card is white on an off-white surface, a few levels apart


def content_bottom(img: Image.Image) -> int:
    rgb = img.convert("RGB")
    w, h = rgb.size
    bg = rgb.getpixel((w // 2, int(h * 0.80)))
    px = rgb.load()
    for y in range(int(h * 0.85), -1, -1):
        for x in range(0, w, 4):
            p = px[x, y]
            if any(abs(p[c] - bg[c]) > TOLERANCE for c in range(3)):
                return y
    raise SystemExit("crop_top: no content found above the tab bar")


def main() -> None:
    src, dst = sys.argv[1], sys.argv[2]
    margin = int(sys.argv[3]) if len(sys.argv) > 3 else 96
    img = Image.open(src)
    bottom = min(img.height, content_bottom(img) + margin)
    img.crop((0, 0, img.width, bottom)).save(dst)
    print(f"{dst}: {img.width} × {bottom} (content ends at y={bottom - margin})")


if __name__ == "__main__":
    main()
