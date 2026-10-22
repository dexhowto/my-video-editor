import random, re
T='font-family="Arial Black, Arial, sans-serif" font-weight="900" text-anchor="middle"'
defs=open("defs.svg").read()
VB={m[0]:[float(v) for v in m[1].split()] for m in re.findall(r'<symbol id="([^"]+)" viewBox="([^"]+)"',defs)}
def sym(id_,size,cx0,cy0):
    x,y,w,h=VB[id_]; s=size/max(w,h); cx,cy=x+w/2,y+h/2
    return f'<U id="{id_}" x="{cx0-s*cx:.1f}" y="{cy0-s*cy:.1f}" s="{s:.3f}" sw="{4/s:.2f}"/>'
def maze(n,seed):
    r=random.Random(seed)
    cells={(x,y):set() for x in range(n) for y in range(n)}  # open passages
    stack=[(0,0)]; seen={(0,0)}
    while stack:
        x,y=stack[-1]
        nb=[(x+dx,y+dy) for dx,dy in((1,0),(-1,0),(0,1),(0,-1)) if (x+dx,y+dy) in cells and (x+dx,y+dy) not in seen]
        if not nb: stack.pop(); continue
        nx=r.choice(nb); cells[(x,y)].add(nx); cells[nx].add((x,y)); seen.add(nx); stack.append(nx)
    return cells
def draw(n,seed,start,end,ws,wend,sw):
    cells=maze(n,seed); S=860/n; X0,Y0=82,130
    path=[]
    for x in range(n):
        for y in range(n):
            px,py=X0+x*S,Y0+y*S
            if y==0: path.append(f"M{px:.1f} {py:.1f} H{px+S:.1f}")
            if x==0: path.append(f"M{px:.1f} {py:.1f} V{py+S:.1f}")
            if (x+1,y) not in cells[(x,y)]: path.append(f"M{px+S:.1f} {py:.1f} V{py+S:.1f}")
            if (x,y+1) not in cells[(x,y)]: path.append(f"M{px:.1f} {py+S:.1f} H{px+S:.1f}")
    b=f'<text x="512" y="62" {T} font-size="30" stroke-width="1.8" fill="#fff">AJUTĂ {ws.upper()} SĂ AJUNGĂ {wend.upper()}</text>'
    b+=f'<path d="{" ".join(path)}" fill="none" stroke-width="{sw}" stroke-linecap="square"/>'
    isz=S*0.78
    b+=sym(start,isz,X0+S/2,Y0+S/2)+sym(end,isz,X0+860-S/2,Y0+860-S/2)
    b+=f'<text x="{X0+S/2:.0f}" y="{Y0-8}" {T} font-size="26" stroke-width="1.2" fill="#fff">START</text><text x="{X0+860-S/2:.0f}" y="{Y0+860+30}" {T} font-size="26" stroke-width="1.2" fill="#fff">SOSIRE</text>'
    return b
cfg=[(6,1,"butterfly","flower","fluturele","la floare","Fluturele și floarea"),
(7,2,"puppy","gift","cățelul","la cadou","Cățelul și cadoul"),
(8,3,"kid","tent","copilul","la cort","Copilul și cortul"),
(9,4,"kitty","tulip","pisica","la lalea","Pisica și laleaua"),
(10,5,"pony","tree","poneiul","la copac","Poneiul și copacul"),
(11,6,"bot","star","robotul","la stea","Robotul și steaua"),
(12,7,"hamster","daisy","hamsterul","la margaretă","Hamsterul și margareta"),
(13,8,"kid","car","copilul","la mașină","Copilul și mașina"),
(14,9,"mom","kid","mama","la copil","Mama și copilul"),
(16,10,"butterfly","sunface","fluturele","la soare","Fluturele și soarele")]
lvl=["foarte ușor","ușor","ușor","mediu","mediu","mediu","greu","greu","greu","foarte greu"]
for i,(n,seed,s,e,w1,w2,title) in enumerate(cfg,1):
    sw=9 if n<=8 else 7 if n<=12 else 5.5
    body=draw(n,seed*17,s,e,w1,w2,sw)
    meta='{"title":"Labirint: %s","desc":"Labirint de colorat și rezolvat (nivel %s, %dx%d): ajută %s să ajungă %s, urmărind drumul corect cu creionul.","tags":"labirint, joc, logica, activitati","cats":[20]}'%(title,lvl[i-1],n,n,w1,w2)
    open(f"pages/labirint-{i}.svg","w").write(f"<!--META {meta}-->\n"+body+"\n")
