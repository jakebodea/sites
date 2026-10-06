"""
Rebuilds the MS Custom Homes logo as vectors from the client's raster scan.

The house mark and monogram are custom drawing, so they are traced (potrace on a
6x upsample). The wordmark and phone line are set in Cormorant Garamond, each
glyph centered on the matching glyph of the scan, so spacing follows the original.

Outputs (all from one geometry, in the scan's pixel coordinates):
  brand/out/*.svg, *.png       files for print, social, and the client
  public/brand/*, public/*.png assets the site serves (favicons, OG image)
  src/components/brand/logo-paths.ts  path data the animated inline logo uses

Run: python3 brand/build_logo.py   (needs potrace, rsvg-convert, Pillow, NumPy, fontTools)
"""

import json
import subprocess
import urllib.request
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

from bake import bake
from textpath import font, glyph_name, text_path

HERE = Path(__file__).parent
SITE = HERE.parent
OUT = HERE / "out"
WORK = HERE / ".work"
FONT = WORK / "CormorantGaramond.ttf"
FONT_URL = "https://github.com/google/fonts/raw/main/ofl/cormorantgaramond/CormorantGaramond%5Bwght%5D.ttf"

# Colors sampled from the scan (median ink of each part).
INK = "#6F879D"
ROOF = "#869EB4"
WINDOW = "#A3BDD4"
RULE = "#9DB8D0"

# Glyph boxes measured on the scan (x ranges), baseline and heights in scan pixels.
WORD = "MSCUSTOMHOMES,INC."
WORD_X = [(132, 204), (225, 260), (316, 367), (388, 444), (465, 501), (522, 573), (590, 650), (669, 739), (795, 852),
          (872, 931), (949, 1020), (1040, 1081), (1102, 1138), (1156, 1166), (1219, 1237), (1257, 1313), (1332, 1384),
          (1401, 1409)]
WORD_BASELINE, WORD_CAP, WORD_WGHT = 682.5, 59.5, 550
PHONE = "949-279-1841"
PHONE_X = [(549, 571), (589, 612), (631, 654), (673, 686), (705, 726), (746, 767), (786, 809), (829, 841), (862, 870),
           (892, 915), (933, 957), (976, 984)]
PHONE_BASELINE, PHONE_HEIGHT, PHONE_WGHT = 766.5, 36.5, 400
RULES = [(205, 509), (1031, 1334)]
RULE_Y = 750
WINDOW_PANES = [(741, 152, 765, 175), (777, 152, 800, 175), (741, 186, 765, 209), (777, 185, 800, 209)]
# Centerline of the roof stroke and the chimney box: the logo animation reveals the roof along these.
ROOF_LINE = "M590 210 L770 77 L1005 272"
CHIMNEY = (918, 163, 951, 228)

MARK_BOX = (505, 60, 1045, 600)  # x0, y0, x1, y1 around house + monogram


def components(ink):
    """4-connected component labels of a boolean image."""
    lab = np.zeros(ink.shape, int)
    n = 0
    h, w = ink.shape
    for y in range(h):
        for x in range(w):
            if ink[y, x] and not lab[y, x]:
                n += 1
                q = deque([(y, x)])
                lab[y, x] = n
                while q:
                    cy, cx = q.popleft()
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < h and 0 <= nx < w and ink[ny, nx] and not lab[ny, nx]:
                            lab[ny, nx] = n
                            q.append((ny, nx))
    return lab, n


def trace(gray, mask, threshold, name, scale=6, origin=(0, 0)):
    keep = np.array(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0
    isolated = np.where(keep, gray, 255).astype(np.uint8)
    big = Image.fromarray(isolated).resize((isolated.shape[1] * scale, isolated.shape[0] * scale), Image.LANCZOS)
    big = big.filter(ImageFilter.GaussianBlur(scale * 0.6))
    bitmap = np.array(big) < threshold
    pbm = WORK / f"{name}.pbm"
    Image.fromarray(((~bitmap) * 255).astype(np.uint8)).convert("1").save(pbm)
    svg = WORK / f"{name}.svg"
    subprocess.run(["potrace", str(pbm), "-s", "-o", str(svg), "-a", "1.1", "-O", "0.8", "-t", "40", "--flat"],
                   check=True)
    return bake(svg.read_text(), scale, *origin)


def glyphs(text, boxes, baseline, height, wght, cap=True, suffix=""):
    """One path per glyph, each centered on its box from the scan."""
    from fontTools.pens.boundsPen import BoundsPen

    f = font(str(FONT), wght)
    gs = f.getGlyphSet()
    ref = f["OS/2"].sCapHeight if cap else _digit_height(f, suffix)
    size = height / ref * f["head"].unitsPerEm
    out = []
    for ch, (x0, x1) in zip(text, boxes):
        bp = BoundsPen(gs)
        gs[glyph_name(f, ch, suffix)].draw(bp)
        gx0, _, gx1, _ = bp.bounds
        s = size / f["head"].unitsPerEm
        center = (x0 + x1 + 1) / 2
        x = center - (gx0 + gx1) / 2 * s
        d, _ = text_path(str(FONT), ch, size, x=x, baseline=baseline, wght=wght, suffix=suffix)
        out.append({"char": ch, "d": _round(d)})
    return out


def _digit_height(f, suffix):
    from fontTools.pens.boundsPen import BoundsPen

    gs = f.getGlyphSet()
    bp = BoundsPen(gs)
    gs[glyph_name(f, "4", suffix)].draw(bp)
    return bp.bounds[3]


def _round(d):
    import re

    return re.sub(r"-?\d+\.\d+", lambda m: f"{float(m.group()):.2f}".rstrip("0").rstrip("."), d)


def svg_doc(view, body, defs=""):
    x0, y0, x1, y1 = view
    w, h = x1 - x0, y1 - y0
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0} {y0} {w} {h}" width="{w}" height="{h}">'
            f'{defs}{body}</svg>\n')


def main():
    WORK.mkdir(exist_ok=True)
    OUT.mkdir(exist_ok=True)
    if not FONT.exists():
        urllib.request.urlretrieve(FONT_URL, FONT)

    gray = np.array(Image.open(HERE / "logo-scan.png").convert("L")).astype(float)
    x0, y0, x1, y1 = MARK_BOX
    region = gray[y0:y1, x0:x1]
    lab, _ = components(region < 200)
    sizes = sorted(((int((lab == i).sum()), i) for i in range(1, lab.max() + 1)), reverse=True)
    # Largest: the monogram body; next: the roof with chimney; then the inner stem of the monogram.
    # The four window panes are rebuilt as rectangles instead (sharper than a trace at this size).
    by_size = [i for _, i in sizes]
    roof_id = next(i for i in by_size if _top(lab, i) < 20)
    mono_ids = [i for i in by_size[:3] if i != roof_id]
    monogram = trace(region, np.isin(lab, mono_ids), 195, "monogram", origin=(x0, y0))
    roof = trace(region, lab == roof_id, 205, "roof", origin=(x0, y0))

    word = glyphs(WORD, WORD_X, WORD_BASELINE, WORD_CAP, WORD_WGHT)
    phone = glyphs(PHONE, PHONE_X, PHONE_BASELINE, PHONE_HEIGHT, PHONE_WGHT, cap=False, suffix=".lf")

    paths = {
        "chimney": CHIMNEY,
        "markBox": MARK_BOX,
        "monogram": _round(monogram),
        "phone": phone,
        "roof": _round(roof),
        "roofLine": ROOF_LINE,
        "rules": RULES,
        "ruleY": RULE_Y,
        "windowPanes": WINDOW_PANES,
        "word": word,
    }
    write_ts(paths)
    write_files(paths)


def _top(lab, i):
    return int(np.where((lab == i).any(1))[0].min())


def write_ts(p):
    ts = SITE / "src/components/brand/logo-paths.ts"
    ts.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(p, indent=2, sort_keys=True)
    ts.write_text(
        "/**\n * Vector geometry of the MS Custom Homes logo, in the scan's pixel coordinates.\n"
        " * Generated by brand/build_logo.py from brand/logo-scan.png; do not edit by hand.\n */\n"
        f"export const logoPaths = {body} as const;\n"
    )


def mark_svg(p, flat=None):
    roof, window, ink = (flat, flat, flat) if flat else (ROOF, WINDOW, INK)
    panes = "".join(f'<rect x="{a}" y="{b}" width="{c - a}" height="{d - b}" rx="1.5"/>' for a, b, c, d in p["windowPanes"])
    return (f'<path fill="{roof}" d="{p["roof"]}"/><g fill="{window}">{panes}</g>'
            f'<path fill="{ink}" fill-rule="evenodd" d="{p["monogram"]}"/>')


def word_svg(p, color):
    return f'<path fill="{color}" d="{" ".join(g["d"] for g in p["word"])}"/>'


def phone_svg(p, color, rule):
    rules = "".join(f'<rect x="{a}" y="{p["ruleY"] - 1.5}" width="{b - a}" height="3" fill="{rule}"/>' for a, b in p["rules"])
    return f'<path fill="{color}" d="{" ".join(g["d"] for g in p["phone"])}"/>{rules}'


def write_files(p):
    pad = 40
    mark_view = p["markBox"]
    stacked_view = (132 - pad, 60, 1409 + pad, 700 + pad)
    full_view = (132 - pad, 60, 1409 + pad, 770 + pad)
    variants = {
        "mark": (mark_view, lambda c: mark_svg(p, c)),
        "logo-stacked": (stacked_view, lambda c: mark_svg(p, c) + word_svg(p, c or INK)),
        "logo-stacked-phone": (full_view,
                               lambda c: mark_svg(p, c) + word_svg(p, c or INK) + phone_svg(p, c or INK, c or RULE)),
    }
    for name, (view, body) in variants.items():
        (OUT / f"{name}.svg").write_text(svg_doc(view, body(None)))
        (OUT / f"{name}-white.svg").write_text(svg_doc(view, body("#FFFFFF")))
        (OUT / f"{name}-navy.svg").write_text(svg_doc(view, body("#24364A")))

    # Horizontal lockup: mark, then the wordmark on one line, vertically centered on the monogram.
    mx0, my0, mx1, my1 = p["markBox"]
    gap = 70
    scale = 1.55
    word_w = (1409 - 132) * scale
    shift_x = mx1 + gap - 132 * scale
    shift_y = (my0 + my1) / 2 + 40 - WORD_BASELINE * scale + WORD_CAP * scale / 2
    horiz_view = (mx0, my0, mx1 + gap + word_w + 30, my1)
    for suffix, color in (("", None), ("-white", "#FFFFFF"), ("-navy", "#24364A")):
        body = mark_svg(p, color) + f'<g transform="translate({shift_x:.1f} {shift_y:.1f}) scale({scale})">{word_svg(p, color or INK)}</g>'
        (OUT / f"logo-horizontal{suffix}.svg").write_text(svg_doc(horiz_view, body))

    public = SITE / "public"
    (public / "brand").mkdir(parents=True, exist_ok=True)

    def png(svg, dest, width=None, height=None, background=None):
        args = ["rsvg-convert", str(svg), "-o", str(dest)]
        if width:
            args += ["-w", str(width)]
        if height:
            args += ["-h", str(height)]
        if background:
            args += ["-b", background]
        subprocess.run(args, check=True)

    for name in ("mark", "logo-stacked", "logo-stacked-phone", "logo-horizontal"):
        png(OUT / f"{name}.svg", OUT / f"{name}.png", width=2400)
        png(OUT / f"{name}-white.svg", OUT / f"{name}-white.png", width=2400)
    # Site assets: the structured-data logo, and icons on the site's ivory so they read on any tab bar.
    png(OUT / "logo-stacked.svg", public / "brand/logo.png", width=1200)
    (public / "brand/mark.svg").write_text((OUT / "mark.svg").read_text())
    icon = WORK / "icon.svg"
    icon.write_text(svg_doc((475, 30, 1075, 630), f'<rect x="475" y="30" width="600" height="600" rx="120" fill="#FAF7F2"/>' + mark_svg(p)))
    png(icon, public / "favicon.png", width=64)
    png(icon, public / "apple-touch-icon.png", width=180)
    png(icon, public / "icon-512.png", width=512)
    og = WORK / "og.svg"
    og.write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">'
        f'<rect width="1200" height="630" fill="#FAF7F2"/>'
        f'<g transform="translate(600 315) scale(0.62) translate({-(132 + 1409) / 2} {-(60 + 700) / 2})">'
        f'{mark_svg(p)}{word_svg(p, INK)}</g></svg>'
    )
    png(og, public / "og-default.png", width=1200)


if __name__ == "__main__":
    main()
