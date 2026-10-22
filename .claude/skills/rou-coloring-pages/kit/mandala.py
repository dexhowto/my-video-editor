import math, random
C = 512
def P(r, a): return (C + r*math.cos(a), C + r*math.sin(a))
def f(p): return f"{p[0]:.1f} {p[1]:.1f}"
def circle(r, sw=7, fill="#fff"): return f'<circle cx="{C}" cy="{C}" r="{r}" stroke-width="{sw}" fill="{fill}"/>'
def petals(n, r0, r1, w, off=0, sw=6):
    out=[]
    for i in range(n):
        a=2*math.pi*i/n+off
        b=P(r0,a); t=P(r1,a)
        c1=P(r0+(r1-r0)*0.45, a-w); c2=P(r0+(r1-r0)*0.45, a+w)
        out.append(f'M{f(b)} Q{f(c1)} {f(t)} Q{f(c2)} {f(b)} Z')
    return f'<path d="{" ".join(out)}" stroke-width="{sw}"/>'
def inner_lines(n, r0, r1, off=0, sw=4):
    return f'<path d="{" ".join("M"+f(P(r0,2*math.pi*i/n+off))+" L"+f(P(r1,2*math.pi*i/n+off)) for i in range(n))}" fill="none" stroke-width="{sw}"/>'
def scallop(n, r, d, sw=6):
    pts=[f"M{f(P(r,0))}"]
    for i in range(n):
        a0=2*math.pi*i/n; a1=2*math.pi*(i+1)/n
        pts.append(f"Q{f(P(r+d*2,(a0+a1)/2))} {f(P(r,a1))}")
    return f'<path d="{" ".join(pts)} Z" stroke-width="{sw}"/>'
def zig(n, r, d, sw=6):
    pts=[f"M{f(P(r,0))}"]
    for i in range(n):
        a0=2*math.pi*i/n; a1=2*math.pi*(i+1)/n
        pts.append(f"L{f(P(r+d,(a0+a1)/2))} L{f(P(r,a1))}")
    return f'<path d="{" ".join(pts)} Z" stroke-width="{sw}"/>'
def dots(n, r, rd, off=0, fill="#fff"):
    return "".join(f'<circle cx="{P(r,2*math.pi*i/n+off)[0]:.1f}" cy="{P(r,2*math.pi*i/n+off)[1]:.1f}" r="{rd}" stroke-width="5" fill="{fill}"/>' for i in range(n))
def arcs(n, r, d, sw=5):
    out=[]
    for i in range(n):
        a0=2*math.pi*i/n; a1=2*math.pi*(i+1)/n
        out.append(f"M{f(P(r,a0))} Q{f(P(r-d,(a0+a1)/2))} {f(P(r,a1))}")
    return f'<path d="{" ".join(out)}" fill="none" stroke-width="{sw}"/>'
def hearts(n, r, s):
    out=[]
    for i in range(n):
        a=2*math.pi*i/n; x,y=P(r,a)
        out.append(f'<g transform="translate({x:.1f},{y:.1f}) rotate({math.degrees(a)+90:.1f}) scale({s})"><path d="M0 50 C-60 10 -60 -45 -25 -45 C-10 -45 0 -30 0 -20 C0 -30 10 -45 25 -45 C60 -45 60 10 0 50 Z" stroke-width="{5/s:.1f}"/></g>')
    return "".join(out)
def mandala(seed):
    rnd=random.Random(seed)
    n=rnd.choice([8,10,12,12,16])
    layers=[]
    r=470
    style=rnd.randint(0,2)
    if style==0: layers.append(scallop(n*2,r-30,15))
    elif style==1: layers.append(zig(n*2,r-60,60))
    else: layers.append(petals(n,330,r,0.22))
    r=400
    while r>70:
        k=rnd.randint(0,6); m=rnd.choice([n, n, 2*n])
        if k==0:
            layers.append(petals(m, r*0.62, r, rnd.uniform(0.12,0.3), off=rnd.choice([0, math.pi/m])))
            layers.append(petals(m, r*0.66, r*0.86, 0.08, off=0, sw=4) if rnd.random()<0.5 else "")
            r*=0.62
        elif k==1:
            layers.append(scallop(m, r-24, 12)); r-=40
        elif k==2:
            layers.append(circle(r)); layers.append(dots(m, r-22, 12, fill=rnd.choice(["#fff","#111"]))); layers.append(circle(r-44)); r-=44
        elif k==3:
            layers.append(zig(m, r-40, 40)); r-=40
        elif k==4:
            layers.append(circle(r)); layers.append(arcs(m, r, 30)); layers.append(inner_lines(m, r-30, r)); r-=34
        elif k==5 and r>140:
            layers.append(circle(r)); layers.append(hearts(m//2 if m>8 else m, r-45, 0.42)); layers.append(circle(r-90)); r-=90
        else:
            layers.append(circle(r)); layers.append(inner_lines(m, r*0.7, r, off=math.pi/m)); layers.append(circle(r*0.7)); r*=0.7
    layers.append(circle(max(r,40)))
    layers.append(petals(6, 0, max(r,40)-6, 0.4, sw=5))
    return "\n".join(l for l in layers if l)
