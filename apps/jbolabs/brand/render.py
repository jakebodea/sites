"""Renders the JBO Labs favicon set and default share image.

    python3 brand/render.py <fonts-dir> public

<fonts-dir> holds geist400.ttf, geist500.ttf (Geist) and serif.ttf (Instrument
Serif Italic), downloaded from Google Fonts. Rerun after renaming the studio.
"""
import sys
from PIL import Image, ImageDraw, ImageFont
fonts, out = sys.argv[1], sys.argv[2]
PAPER = (251, 250, 247); INK = (26, 26, 31); MUTED = (118, 118, 126); RULE = (227, 225, 219); SIGNAL = (52, 178, 104)

def icon(size, path):
    # Rounded ink tile with a small paper square: the wordmark's mark, enlarged.
    scale = 4; s = size * scale
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=INK)
    m = s * 0.34; d.rounded_rectangle([m, m, s - m, s - m], radius=int(s * 0.06), fill=PAPER)
    im.resize((size, size), Image.LANCZOS).save(path)

icon(64, f"{out}/favicon.png"); icon(180, f"{out}/apple-touch-icon.png"); icon(512, f"{out}/icon-512.png")

W, H = 1200, 630
im = Image.new("RGB", (W, H), PAPER); d = ImageDraw.Draw(im)
sans = ImageFont.truetype(f"{fonts}/geist500.ttf", 78)
serif = ImageFont.truetype(f"{fonts}/serif.ttf", 86)
small = ImageFont.truetype(f"{fonts}/geist500.ttf", 30)
reg = ImageFont.truetype(f"{fonts}/geist400.ttf", 26)
x = 88
d.rounded_rectangle([x, 92, x + 22, 114], radius=5, fill=INK)
d.text((x + 38, 103), "JBO Labs", font=small, fill=INK, anchor="lm")
y = 300
d.text((x, y), "Websites and software,", font=sans, fill=INK, anchor="ls")
d.text((x, y + 100), "made with care.", font=serif, fill=INK, anchor="ls")
d.line([x, 500, W - x, 500], fill=RULE, width=2)
d.ellipse([x, 540, x + 14, 554], fill=SIGNAL)
d.text((x + 30, 547), "Independent web studio of Jake Bodea", font=reg, fill=MUTED, anchor="lm")
d.text((W - x, 547), "jbolabs.com", font=reg, fill=MUTED, anchor="rm")
im.save(f"{out}/og-default.png", optimize=True)
