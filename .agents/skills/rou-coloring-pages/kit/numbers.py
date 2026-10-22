#!/usr/bin/env python3
"""Generate number coloring pages cifre-11 .. cifre-100 (outline number, Romanian word, tens/units, dot grid)."""
import math
T='font-family="Arial Black, Arial, sans-serif" font-weight="900" text-anchor="middle"'
U=["zero","unu","doi","trei","patru","cinci","șase","șapte","opt","nouă"]
TEENS={11:"unsprezece",12:"doisprezece",13:"treisprezece",14:"paisprezece",15:"cincisprezece",16:"șaisprezece",17:"șaptesprezece",18:"optsprezece",19:"nouăsprezece"}
TENS={2:"douăzeci",3:"treizeci",4:"patruzeci",5:"cincizeci",6:"șaizeci",7:"șaptezeci",8:"optzeci",9:"nouăzeci"}
def word(n):
    if n==100: return "o sută"
    if n in TEENS: return TEENS[n]
    t,u=divmod(n,10)
    return TENS[t] if u==0 else f"{TENS[t]} și {U[u]}"
def plural(k,one,many): return one if k==1 else many
for n in range(11,101):
    w=word(n).upper()
    b=f'<text x="512" y="400" {T} font-size="{400 if n<100 else 320}" stroke-width="10" fill="#fff">{n}</text>'
    fs=min(70,int(880/(len(w)*0.62)))
    b+=f'<text x="512" y="500" {T} font-size="{fs}" stroke-width="3" fill="#fff">{w}</text>'
    z,u=divmod(n,10)
    if u==0: info=f"{z} ZECI"
    else: info=f"{z} {plural(z,'ZECE','ZECI')} ȘI {u} {plural(u,'UNITATE','UNITĂȚI')}"
    b+=f'<text x="512" y="552" {T} font-size="34" stroke-width="1.5" fill="#fff">{info}</text>'
    b+='<path d="M40 575 H984" fill="none" stroke-width="5" stroke-dasharray="16 12"/>'
    rows=math.ceil(n/10)
    sy=min(80,380/rows); r=min(28,sy*0.36)
    y0=640 if rows<=5 else 615
    for i in range(n):
        row,col=divmod(i,10)
        x=82+col*84+(22 if col>=5 else 0)+ (0)
        y=y0+row*sy
        b+=f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r:.0f}" stroke-width="{4 if r<20 else 5}"/>'
    meta='{"title":"Numărul %d: %s","desc":"Planșă de colorat educativă cu numărul %d mare, scris și cu litere (%s), cu descompunerea în zeci și unități (%s) și %d cercuri de numărat și colorat.","tags":"cifre, numere, numere pana la 100, numarat, matematica, educatie","cats":[20]}'%(n,word(n),n,word(n),info.lower(),n)
    open(f"pages/cifre-{n}.svg","w").write(f"<!--META {meta}-->\n"+b+"\n")
print("ok")
