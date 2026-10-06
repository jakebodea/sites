"""Bake potrace SVG paths (transform translate(0,H) scale(.1,-.1), relative m/l/c/z) into absolute coords."""
import re
def bake(svgtext, S, ox, oy, prec=2):
    tr=re.search(r'translate\(([\d.\-]+),([\d.\-]+)\) scale\(([\d.\-]+),([\d.\-]+)\)',svgtext)
    tx,ty,sx,sy=map(float,tr.groups())
    out=[]
    for d in re.findall(r'<path d="([^"]+)"',svgtext,re.S):
        toks=re.findall(r'[MmLlCcZz]|-?\d+\.?\d*',d)
        i=0; cx=cy=0; sx0=sy0=0; cmd=None; res=[]
        def P(x,y):
            X=(tx+sx*x)/S+ox; Y=(ty+sy*y)/S+oy
            return f"{X:.{prec}f} {Y:.{prec}f}"
        while i<len(toks):
            t=toks[i]
            if re.match(r'[A-Za-z]',t): cmd=t; i+=1
            if cmd in 'Zz':
                res.append('Z'); cx,cy=sx0,sy0; continue
            n={'M':2,'m':2,'L':2,'l':2,'C':6,'c':6}[cmd]
            v=list(map(float,toks[i:i+n])); i+=n
            rel=cmd.islower()
            if cmd in 'Mm':
                cx,cy=(cx+v[0],cy+v[1]) if rel else (v[0],v[1]); sx0,sy0=cx,cy
                res.append('M'+P(cx,cy)); cmd='l' if rel else 'L'
            elif cmd in 'Ll':
                cx,cy=(cx+v[0],cy+v[1]) if rel else (v[0],v[1]); res.append('L'+P(cx,cy))
            else:
                pts=[(cx+v[k],cy+v[k+1]) if rel else (v[k],v[k+1]) for k in (0,2,4)]
                res.append('C'+' '.join(P(*p) for p in pts)); cx,cy=pts[2]
        out.append(''.join(res))
    return ' '.join(out)
