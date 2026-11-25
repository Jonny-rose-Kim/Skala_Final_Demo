#!/usr/bin/env python3
"""
Livery textures of the CLW-08v2 vehicle (operator logo, vehicle number, safety labels, status display).

  python3 scripts/assets/make-livery.py        (npm run assets:livery; needs Pillow)

Outputs (inputs of scripts/blender/tools/clw.py):
  assets/source/textures/livery/clw08v2_livery.png   1024 x 1024 RGBA decal atlas (alpha = decal shape)
  assets/source/textures/livery/clw08v2_display.png  512 x 192 RGB emissive map of the status display
  assets/source/textures/livery/clw08v2_livery.json  atlas rectangles (pixels, top-left origin) read by Blender

The layout follows a public photo of SK hynix fab OHT vehicles (logo above the vehicle number on the front and
rear faces, warning labels at the left edge, a two-line LED display). The display shows only the static vehicle
identity, never a cycle count or other operating value: nothing on the model is an observation.
Logo: the official SK hynix image already served by the app (public/brand/sk-hynix-logo.png, 132 x 72 px),
upscaled with Lanczos; a vector original would make it sharper at close range.
Fonts: DejaVu Sans Bold / Mono Bold (Bitstream Vera license) and Noto Sans CJK KR Bold (SIL OFL 1.1), system
fonts used only to rasterise the labels.
"""
import json
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(REPO, "assets", "source", "textures", "livery")
LOGO = os.path.join(REPO, "public", "brand", "sk-hynix-logo.png")
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
FONT_KR = ("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", 1)  # face 1 = KR

VEHICLE_NUMBER = "V001"  # instance OHT-01 (the only vehicle of the bay)
INSTANCE_ID = "OHT-01"
NAVY = (46, 58, 102, 255)
SIZE = 1024

# atlas rectangles (x0, y0, x1, y1), top-left origin
RECTS = {
    "logo": (32, 16, 992, 540),
    "number": (0, 560, 1024, 720),
    "label_caution": (16, 740, 156, 1008),
    "label_electric": (176, 740, 316, 1008),
    "label_rating": (340, 740, 600, 790),
    "panel_outline": (340, 810, 600, 1000),
    "nameplate": (620, 740, 820, 820),
}


def font(spec, size):
    path, index = spec if isinstance(spec, tuple) else (spec, 0)
    return ImageFont.truetype(path, size, index=index)


def fit_text(draw, text, spec, box, fill, max_size):
    """Largest font size that fits the box; centred."""
    x0, y0, x1, y1 = box
    size = max_size
    while size > 6:
        f = font(spec, size)
        l, t, r, b = draw.textbbox((0, 0), text, font=f)
        if r - l <= x1 - x0 and b - t <= y1 - y0:
            break
        size -= 2
    l, t, r, b = draw.textbbox((0, 0), text, font=f)
    draw.text(((x0 + x1 - (r - l)) / 2 - l, (y0 + y1 - (b - t)) / 2 - t), text, font=f, fill=fill)


def warning_triangle(draw, cx, top, w, symbol):
    h = w * 0.87
    pts = [(cx, top), (cx + w / 2, top + h), (cx - w / 2, top + h)]
    draw.polygon(pts, fill=(250, 200, 0, 255), outline=(20, 20, 20, 255), width=5)
    if symbol == "!":
        draw.rounded_rectangle((cx - 5, top + h * 0.3, cx + 5, top + h * 0.68), radius=4, fill=(20, 20, 20, 255))
        draw.ellipse((cx - 6, top + h * 0.75, cx + 6, top + h * 0.87), fill=(20, 20, 20, 255))
    else:  # lightning bolt
        s = w / 100
        bolt = [(cx + 6 * s, top + 26 * s), (cx - 12 * s, top + 58 * s), (cx + 1 * s, top + 58 * s), (cx - 7 * s, top + 82 * s), (cx + 14 * s, top + 48 * s), (cx + 1 * s, top + 48 * s)]
        draw.polygon(bolt, fill=(20, 20, 20, 255))


def label(img, rect, symbol, kr, en):
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = rect
    d.rounded_rectangle(rect, radius=10, fill=(248, 248, 246, 255), outline=(200, 200, 198, 255), width=2)
    w = x1 - x0
    warning_triangle(d, (x0 + x1) / 2, y0 + 14, w * 0.72, symbol)
    ty = y0 + 14 + w * 0.72 * 0.87 + 10
    fit_text(d, kr, FONT_KR, (x0 + 8, ty, x1 - 8, ty + 34), (20, 20, 20, 255), 34)
    fit_text(d, en, FONT_BOLD, (x0 + 8, ty + 38, x1 - 8, ty + 58), (40, 40, 40, 255), 20)
    # small print (rendered as text-height grey bars; unreadable at real scale on the vehicle)
    yy = ty + 68
    k = 0
    while yy < y1 - 14:
        d.rectangle((x0 + 12, yy, x1 - 12 - (k % 3) * 14, yy + 4), fill=(140, 140, 140, 255))
        yy += 11
        k += 1


def atlas():
    img = Image.new("RGBA", (SIZE, SIZE), (255, 255, 255, 0))
    d = ImageDraw.Draw(img)
    # operator logo (official image, upscaled)
    x0, y0, x1, y1 = RECTS["logo"]
    logo = Image.open(LOGO).convert("RGBA").resize((x1 - x0, y1 - y0), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=3, percent=60, threshold=2))
    img.alpha_composite(logo, (x0, y0))
    # vehicle number
    fit_text(d, VEHICLE_NUMBER, FONT_BOLD, RECTS["number"], NAVY, 150)
    # safety labels
    label(img, RECTS["label_caution"], "!", "주의", "CAUTION")
    label(img, RECTS["label_electric"], "bolt", "감전주의", "ELECTRIC SHOCK")
    # rating label: dark text on a white sticker
    r = RECTS["label_rating"]
    d.rounded_rectangle(r, radius=6, fill=(246, 246, 244, 255), outline=(170, 170, 170, 255), width=2)
    fit_text(d, "DC 24V  CLASS 2", FONT_BOLD, (r[0] + 10, r[1] + 8, r[2] - 10, r[3] - 8), (60, 60, 60, 255), 30)
    # access panel outline (thin seam line around a service lid)
    r = RECTS["panel_outline"]
    d.rounded_rectangle((r[0] + 4, r[1] + 4, r[2] - 4, r[3] - 4), radius=14, outline=(70, 72, 76, 255), width=5)
    # engraved nameplate text (dark on transparent; the plate itself is stainless geometry)
    r = RECTS["nameplate"]
    fit_text(d, INSTANCE_ID, FONT_BOLD, (r[0] + 10, r[1] + 6, r[2] - 10, r[1] + 44), (35, 35, 38, 255), 34)
    for k in range(2):
        d.rectangle((r[0] + 16, r[1] + 52 + k * 12, r[2] - 16 - k * 40, r[1] + 56 + k * 12), fill=(60, 60, 64, 255))
    return img


def display():
    """Two-line LED dot-matrix: vehicle number (green) and instance id (amber). Static identity only."""
    w, h = 512, 192
    txt = Image.new("RGB", (w, h), (0, 0, 0))
    d = ImageDraw.Draw(txt)
    fit_text(d, f"VHL {VEHICLE_NUMBER}", FONT_MONO, (24, 14, w - 24, 88), (60, 255, 90), 76)
    fit_text(d, INSTANCE_ID, FONT_MONO, (24, 104, w - 24, 178), (255, 170, 30), 76)
    # dot matrix: keep the text only on a grid of round LEDs, add a faint unlit-LED floor
    pitch = 6
    mask = Image.new("L", (w, h), 0)
    md = ImageDraw.Draw(mask)
    for y in range(0, h, pitch):
        for x in range(0, w, pitch):
            md.ellipse((x + 1, y + 1, x + pitch - 1, y + pitch - 1), fill=255)
    lit = Image.composite(txt.filter(ImageFilter.MaxFilter(3)), Image.new("RGB", (w, h), (0, 0, 0)), mask)
    floor = Image.composite(Image.new("RGB", (w, h), (10, 14, 10)), Image.new("RGB", (w, h), (0, 0, 0)), mask)
    out = Image.blend(floor, lit, 1.0)
    out = Image.composite(lit, floor, lit.convert("L").point(lambda v: 255 if v > 8 else 0))
    return out.filter(ImageFilter.GaussianBlur(0.6))


def main():
    os.makedirs(OUT, exist_ok=True)
    atlas().save(os.path.join(OUT, "clw08v2_livery.png"), optimize=True)
    display().save(os.path.join(OUT, "clw08v2_display.png"), optimize=True)
    with open(os.path.join(OUT, "clw08v2_livery.json"), "w") as f:
        json.dump({"size": [SIZE, SIZE], "vehicleNumber": VEHICLE_NUMBER, "instanceId": INSTANCE_ID, "rects": RECTS}, f, indent=2)
    print("wrote", os.path.relpath(OUT, REPO))


if __name__ == "__main__":
    main()
