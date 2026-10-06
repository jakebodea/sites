"""Render the approved JBO Labs share cards and icon set.

    uv run --with pillow python brand/render.py <fonts-dir> public

The fonts directory holds static Montserrat 200/300/700 and Figtree 400 TTFs,
named montserrat-200.ttf, montserrat-300.ttf, montserrat-700.ttf, figtree-400.ttf.
See brand/README.md for preparation. Keep the headline and typography aligned
with src/content/home.ts and src/styles/global.css.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import sys
FONTS = Path(sys.argv[1])
ROOT = Path(sys.argv[2])
ROOT.mkdir(parents=True, exist_ok=True)
S = 2
INK = '#101218'; MUTED = '#626772'; RULE = '#e6e8ed'
def font(family,weight,size):
    return ImageFont.truetype(str(FONTS / f'{family}-{weight}.ttf'),round(size*S))
def text(d, xy, value, family='montserrat', weight=300, size=80, fill=INK, tracking=0):
    f = font(family,weight,size)
    x,y = (v*S for v in xy)
    for char in value:
        d.text((round(x),round(y)),char,font=f,fill=fill,anchor='ls')
        x += d.textlength(char,font=f) + tracking*size*S
def wordmark(d,x,y,size):
    text(d,(x,y),'jbo',weight=700,size=size)
    width = d.textlength('jbo',font=font('montserrat',700,size))/S
    text(d,(x+width-1,y),'labs',weight=200,size=size)
def card(name,width,height):
    im=Image.new('RGB',(width*S,height*S),'white');d=ImageDraw.Draw(im)
    x=80
    wordmark(d,x,116,50)
    square=width==height
    y=height*.44 if square else 285
    text(d,(x,y),'great websites,',size=88 if square else 86,tracking=-.025)
    text(d,(x,y+(88 if square else 86)*1.02),'shipped fast.',weight=700,size=88 if square else 86,tracking=-.035)
    text(d,(x,y+182),'Websites and web apps for small businesses.',family='figtree',weight=400,size=27,fill=MUTED)
    footer=height-80
    d.line((x*S,(footer-40)*S,(width-x)*S,(footer-40)*S),fill=RULE,width=S)
    domain='jbolabs.com'; f=font('figtree',400,22)
    text(d,(width-x-d.textlength(domain,font=f)/S,footer),domain,family='figtree',weight=400,size=22,fill=MUTED)
    im.resize((width,height),Image.Resampling.LANCZOS).save(ROOT/name,optimize=True)
card('og-default.png',1200,630)
card('og-square.png',1200,1200)
for size,name in [(64,'favicon.png'),(180,'apple-touch-icon.png'),(512,'icon-512.png')]:
    im=Image.new('RGB',(size*S,size*S),INK);d=ImageDraw.Draw(im)
    f=font('montserrat',700,size*.39)
    box=d.textbbox((0,0),'jbo',font=f)
    d.text(((size*S-(box[2]-box[0]))/2-box[0],(size*S-(box[3]-box[1]))/2-box[1]),'jbo',font=f,fill='white')
    im.resize((size,size),Image.Resampling.LANCZOS).save(ROOT/name,optimize=True)
print('Rendered share cards and icon set to',ROOT)
