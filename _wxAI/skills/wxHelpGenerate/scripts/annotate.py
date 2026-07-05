#!/usr/bin/env python3
"""Crop and annotate a screenshot from a small JSON spec.

Turns a raw browser screenshot into a documentation-ready image: optionally
crop to a region, then draw numbered callout markers, arrows, boxes, and solid
redaction blocks over sensitive data.

Usage:
    python annotate.py --in raw/board.png --out img/board-toolbar.png \\
        --spec spec.json
    # or inline:
    python annotate.py --in raw/board.png --out img/board.png \\
        --crop 0,0,1440,120 --marker 40,60,1 --marker 300,60,2

Spec JSON (all keys optional):
{
  "crop":   [left, top, right, bottom],          # pixels; omit to keep full image
  "scale":  1.0,                                  # resize factor applied after crop
  "redact": [[l,t,r,b], ...],                     # solid boxes drawn FIRST (privacy)
  "boxes":  [{"xy":[l,t,r,b], "color":"#e11"}],   # outlined rectangles
  "arrows": [{"from":[x,y], "to":[x,y], "color":"#e11"}],
  "markers":[{"x":x, "y":y, "n":1, "color":"#e11"}]  # numbered circles
}

Coordinates are in pixels of the INPUT image (before crop). The script
translates them into the cropped frame automatically.

Requires Pillow:  pip install pillow
"""
import argparse
import json
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("Pillow is required: pip install pillow")


def load_font(size):
    for name in ("DejaVuSans-Bold.ttf", "Arial Bold.ttf", "Arial.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            continue
    return ImageFont.load_default()


def parse_color(c, default=(225, 29, 29, 255)):
    if not c:
        return default
    c = c.lstrip("#")
    if len(c) == 6:
        return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4)) + (255,)
    return default


def translate(pt, crop):
    if not crop:
        return pt
    return (pt[0] - crop[0], pt[1] - crop[1])


def main():
    ap = argparse.ArgumentParser(description="Crop + annotate a screenshot.")
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", dest="out", required=True)
    ap.add_argument("--spec", help="path to JSON spec (see module docstring)")
    ap.add_argument("--crop", help="inline crop: left,top,right,bottom")
    ap.add_argument("--scale", type=float, help="inline scale factor")
    ap.add_argument("--marker", action="append", default=[],
                    help="inline numbered marker: x,y,n  (repeatable)")
    args = ap.parse_args()

    spec = {}
    if args.spec:
        with open(args.spec) as f:
            spec = json.load(f)
    if args.crop:
        spec["crop"] = [int(x) for x in args.crop.split(",")]
    if args.scale:
        spec["scale"] = args.scale
    for m in args.marker:
        x, y, n = m.split(",")
        spec.setdefault("markers", []).append({"x": int(x), "y": int(y), "n": int(n)})

    img = Image.open(args.inp).convert("RGBA")
    crop = spec.get("crop")

    # Redaction happens on the FULL image, before cropping, so nothing leaks.
    draw = ImageDraw.Draw(img)
    for box in spec.get("redact", []):
        draw.rectangle(box, fill=(20, 20, 20, 255))

    if crop:
        img = img.crop(tuple(crop))
    draw = ImageDraw.Draw(img)

    def C(color):
        return parse_color(color)

    for b in spec.get("boxes", []):
        xy = [translate((b["xy"][0], b["xy"][1]), crop),
              translate((b["xy"][2], b["xy"][3]), crop)]
        draw.rectangle([xy[0][0], xy[0][1], xy[1][0], xy[1][1]],
                       outline=C(b.get("color")), width=4)

    for a in spec.get("arrows", []):
        fr = translate(tuple(a["from"]), crop)
        to = translate(tuple(a["to"]), crop)
        col = C(a.get("color"))
        draw.line([fr, to], fill=col, width=4)
        # simple arrowhead
        import math
        ang = math.atan2(to[1] - fr[1], to[0] - fr[0])
        for da in (math.radians(150), math.radians(-150)):
            hx = to[0] + 16 * math.cos(ang + da)
            hy = to[1] + 16 * math.sin(ang + da)
            draw.line([to, (hx, hy)], fill=col, width=4)

    r = 18
    font = load_font(24)
    for m in spec.get("markers", []):
        x, y = translate((m["x"], m["y"]), crop)
        col = C(m.get("color"))
        draw.ellipse([x - r, y - r, x + r, y + r], fill=col, outline=(255, 255, 255, 255), width=3)
        n = str(m.get("n", "?"))
        tb = draw.textbbox((0, 0), n, font=font)
        draw.text((x - (tb[2] - tb[0]) / 2, y - (tb[3] - tb[1]) / 2 - 2),
                  n, fill=(255, 255, 255, 255), font=font)

    scale = spec.get("scale")
    if scale and scale != 1.0:
        img = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)

    import os
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    img.convert("RGB").save(args.out)
    print(f"wrote {args.out} ({img.width}x{img.height})")


if __name__ == "__main__":
    main()
