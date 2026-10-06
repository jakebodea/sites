from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.varLib import instancer
_cache={}
def font(path, wght=None):
    k=(path,wght)
    if k not in _cache:
        f=TTFont(path)
        if wght is not None and 'fvar' in f:
            f=instancer.instantiateVariableFont(f,{"wght":wght})
        _cache[k]=f
    return _cache[k]
def glyph_name(f, ch, suffix=""):
    """The glyph for `ch`, preferring the `suffix` variant (e.g. ".lf" lining figures) when the font has one."""
    base = f.getBestCmap().get(ord(ch))
    return base + suffix if base and base + suffix in f.getGlyphSet() else base

def text_path(path, text, size, x=0, baseline=0, tracking=0.0, wght=None, suffix=""):
    """Returns (d, width). tracking in em."""
    f=font(path,wght); gs=f.getGlyphSet(); cmap=f.getBestCmap(); upm=f['head'].unitsPerEm
    s=size/upm; pen=SVGPathPen(gs); cx=x; ds=[]
    for i,ch in enumerate(text):
        g=glyph_name(f,ch,suffix)
        if g is None: continue
        sp=SVGPathPen(gs)
        gs[g].draw(TransformPen(sp,(s,0,0,-s,cx,baseline)))
        ds.append(sp.getCommands())
        cx+=gs[g].width*s+tracking*size
    return " ".join(d for d in ds if d), cx-x-tracking*size
