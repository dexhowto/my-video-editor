#!/usr/bin/env python3
"""Generate alphabet coloring pages litere-11 .. litere-31 (letters not yet in litere-1..10)."""
import re, math
T='font-family="Arial Black, Arial, sans-serif" font-weight="900" text-anchor="middle"'
defs=open("defs.svg").read()
VB={m[0]:[float(v) for v in m[1].split()] for m in re.findall(r'<symbol id="([^"]+)" viewBox="([^"]+)"',defs)}
def sym(id_,size=300):
    x,y,w,h=VB[id_]; s=size/max(w,h); cx,cy=x+w/2,y+h/2
    return f'<U id="{id_}" x="{-s*cx:.1f}" y="{-s*cy:.1f}" s="{s:.3f}" sw="{7/s:.2f}"/>'
def thick(d,w=44,inner=28):
    return f'<path d="{d}" fill="none" stroke-width="{w}"/><path d="{d}" fill="none" stroke="#fff" stroke-width="{inner}"/>'
A={}
A["apple"]='<path d="M0 -60 C-110 -100 -170 -20 -150 70 C-130 160 -50 190 0 160 C50 190 130 160 150 70 C170 -20 110 -100 0 -60 Z"/><path d="M0 -60 Q0 -110 30 -140" fill="none"/><path d="M15 -115 Q70 -160 110 -125 Q70 -90 15 -115 Z"/>'
A["lemon"]='<path d="M-170 0 Q-130 -100 0 -100 Q130 -100 170 0 Q130 100 0 100 Q-130 100 -170 0 Z"/><path d="M-170 0 l-22 -10 M170 0 l22 -10" fill="none"/><path d="M20 -100 Q60 -150 110 -130 Q80 -90 20 -100 Z"/>'
A["bread"]='<path d="M-150 80 Q-175 -30 -100 -80 Q0 -140 100 -80 Q175 -30 150 80 Z"/><path d="M-80 -40 q30 40 20 90 M0 -70 q30 50 20 120 M80 -40 q30 40 20 90" fill="none"/>'
A["river"]='<path d="M-170 -90 q42 -35 85 0 t85 0 t85 0 t85 0 M-170 -20 q42 -35 85 0 t85 0 t85 0 t85 0 M-170 50 q42 -35 85 0 t85 0 t85 0 t85 0 M-170 120 q42 -35 85 0 t85 0 t85 0 t85 0" fill="none"/>'
A["icecream"]='<path d="M-75 -10 L0 175 L75 -10 Z"/><path d="M-60 20 l60 60 M0 -10 l60 60 M60 20 l-60 60 M-30 -10 l-30 30" fill="none" stroke-width="4"/><path d="M-95 -5 Q-105 -100 0 -100 Q105 -100 95 -5 Z"/><circle cx="0" cy="-135" r="24"/><path d="M0 -158 Q10 -185 35 -190" fill="none"/>'
A["pumpkin"]='<ellipse cx="0" cy="20" rx="150" ry="110"/><ellipse cx="0" cy="20" rx="75" ry="110"/><path d="M0 -90 Q-10 -140 25 -160" fill="none" stroke-width="14"/>'
A["tooth"]='<path d="M-95 -105 Q-105 20 -65 125 Q-45 160 -28 105 Q0 55 28 105 Q45 160 65 125 Q105 20 95 -105 Q0 -145 -95 -105 Z"/><circle cx="-35" cy="-40" r="9" fill="#111" stroke="none"/><circle cx="35" cy="-40" r="9" fill="#111" stroke="none"/><path d="M-25 0 q25 22 50 0" fill="none"/>'
A["elephant"]='<ellipse cx="40" cy="0" rx="140" ry="90"/><rect x="-10" y="70" width="48" height="90"/><rect x="100" y="70" width="48" height="90"/><circle cx="-125" cy="-25" r="78"/><ellipse cx="-75" cy="-15" rx="32" ry="60"/>'+thick("M-180 25 Q-205 110 -150 135",42,26)+'<circle cx="-145" cy="-45" r="9" fill="#111" stroke="none"/><path d="M180 -10 Q215 20 195 70" fill="none"/>'
A["tube"]='<path d="M-45 -150 V90 Q-45 150 0 150 Q45 150 45 90 V-150 Z"/><path d="M-65 -150 H65" fill="none" stroke-width="14"/><path d="M-45 10 H45" fill="none"/><circle cx="-10" cy="60" r="12"/><circle cx="14" cy="90" r="9"/>'
A["globe"]='<g transform="translate(0,-20)"><circle r="125"/><ellipse rx="55" ry="125" fill="none"/><path d="M-125 0 H125 M-105 -60 H105 M-105 60 H105" fill="none"/><path d="M0 125 V165 M-60 165 H60" fill="none" stroke-width="14"/></g>'
A["bucket"]='<path d="M-100 -30 L-80 140 H80 L100 -30 Z"/><ellipse cx="0" cy="-30" rx="100" ry="20"/><path d="M-100 -30 Q0 -170 100 -30" fill="none"/><path d="M-90 40 H90" fill="none" stroke-width="5"/>'
A["map"]='<path d="M-165 -95 L-55 -115 L55 -95 L165 -115 V95 L55 115 L-55 95 L-165 115 Z"/><path d="M-55 -115 V95 M55 -95 V115" fill="none"/><path d="M-130 40 Q-90 -40 -20 0 T90 -30" fill="none" stroke-width="5" stroke-dasharray="12 10"/><path d="M95 -20 l24 24 M119 -20 l-24 24" fill="none" stroke-width="9"/>'
A["tophat"]='<rect x="-95" y="-130" width="190" height="170"/><rect x="-95" y="-20" width="190" height="34" stroke-width="5"/><ellipse cx="0" cy="40" rx="160" ry="28"/>'
A["blocks"]='<rect x="-140" y="30" width="125" height="115"/><rect x="15" y="30" width="125" height="115"/><rect x="-62" y="-90" width="125" height="120"/><circle cx="0" cy="-30" r="26" fill="none" stroke-width="5"/><path d="M-110 70 L-45 70 M-110 100 L-45 100 M45 70 h60" fill="none" stroke-width="5"/>'
A["koala"]='<circle cx="-85" cy="-70" r="48"/><circle cx="-85" cy="-70" r="24" fill="none" stroke-width="5"/><circle cx="85" cy="-70" r="48"/><circle cx="85" cy="-70" r="24" fill="none" stroke-width="5"/><circle cx="0" cy="0" r="115"/><ellipse cx="0" cy="25" rx="28" ry="42" fill="#111"/><circle cx="-48" cy="-15" r="11" fill="#111" stroke="none"/><circle cx="48" cy="-15" r="11" fill="#111" stroke="none"/><path d="M-25 85 q25 18 50 0" fill="none" stroke-width="6"/>'
A["kiwi"]='<circle r="140"/><circle r="112" fill="none"/>'+"".join(f'<ellipse cx="{70*math.cos(math.radians(30*i)):.0f}" cy="{70*math.sin(math.radians(30*i)):.0f}" rx="7" ry="14" fill="#111" stroke="none" transform="rotate({30*i+90} {70*math.cos(math.radians(30*i)):.0f} {70*math.sin(math.radians(30*i)):.0f})"/>' for i in range(12))+'<circle r="26"/>'
A["egg"]='<path d="M0 -155 C-105 -155 -135 0 -125 60 C-115 135 -60 165 0 165 C60 165 115 135 125 60 C135 0 105 -155 0 -155 Z"/><circle cx="-45" cy="0" r="14"/><circle cx="35" cy="-40" r="11"/><circle cx="40" cy="55" r="16"/><circle cx="-30" cy="85" r="10"/>'
A["eye"]='<path d="M-165 0 Q0 -140 165 0 Q0 140 -165 0 Z"/><circle r="62"/><circle r="28" fill="#111"/><circle cx="-12" cy="-12" r="9" stroke="none"/><path d="M-110 -75 l-18 -34 M-60 -100 l-10 -38 M0 -112 v-38 M60 -100 l10 -38 M110 -75 l18 -34" fill="none" stroke-width="8"/>'
A["quiz"]='<rect x="-135" y="-140" width="270" height="280" rx="34"/>'+f'<text x="0" y="75" {T} font-size="270" stroke-width="9" fill="#fff">?</text>'
A["wheel"]='<circle r="150"/><circle r="110" fill="none"/>'+"".join(f'<line x1="0" y1="0" x2="{110*math.cos(math.radians(45*i)):.0f}" y2="{110*math.sin(math.radians(45*i)):.0f}"/>' for i in range(8))+'<circle r="32"/>'
A["snake"]=thick("M-150 100 C-150 10 -40 30 -20 -20 C0 -70 90 -70 100 -15 C108 35 135 40 150 90",52,34)+'<circle cx="-155" cy="105" r="40"/><circle cx="-165" cy="95" r="8" fill="#111" stroke="none"/><path d="M-185 120 l-30 12 M-185 120 l-28 -4" fill="none" stroke-width="6"/>'
A["cap"]='<path d="M-120 25 Q-120 -105 0 -105 Q120 -105 120 25 Z"/><path d="M-135 25 H175 Q205 25 205 52 H-135 Z"/><circle cx="0" cy="-110" r="14"/><path d="M0 -105 V25" fill="none" stroke-width="5"/>'
A["turtle"]='<path d="M-155 70 C-155 -105 155 -105 155 70 Z"/><path d="M-60 -70 L60 -70 L100 -5 L60 60 L-60 60 L-100 -5 Z" fill="none" stroke-width="5"/><circle cx="195" cy="35" r="42"/><circle cx="205" cy="25" r="8" fill="#111" stroke="none"/><ellipse cx="-90" cy="95" rx="42" ry="26"/><ellipse cx="90" cy="95" rx="42" ry="26"/><path d="M-155 55 L-205 80 L-155 85" />'
A["icicle"]='<rect x="-160" y="-150" width="320" height="32"/><path d="M-125 -118 L-85 110 L-45 -118 Z M-30 -118 L10 150 L50 -118 Z M65 -118 L95 55 L125 -118 Z"/><path d="M-85 -60 V30 M10 -60 V60" fill="none" stroke-width="4"/>'
A["bear"]='<circle cx="-95" cy="-100" r="48"/><circle cx="-95" cy="-100" r="24" fill="none" stroke-width="5"/><circle cx="95" cy="-100" r="48"/><circle cx="95" cy="-100" r="24" fill="none" stroke-width="5"/><circle cx="0" cy="0" r="135"/><ellipse cx="0" cy="40" rx="62" ry="46"/><ellipse cx="0" cy="22" rx="24" ry="16" fill="#111" stroke="none"/><path d="M0 38 V54 M0 54 q-20 18 -36 4 M0 54 q20 18 36 4" fill="none" stroke-width="5"/><circle cx="-50" cy="-25" r="13" fill="#111" stroke="none"/><circle cx="50" cy="-25" r="13" fill="#111" stroke="none"/>'
A["umbrella"]='<path d="M-165 25 Q-165 -130 0 -140 Q165 -130 165 25 Q137 0 110 25 Q82 0 55 25 Q27 0 0 25 Q-27 0 -55 25 Q-82 0 -110 25 Q-137 0 -165 25 Z"/><path d="M0 -140 Q-55 -50 -55 25 M0 -140 Q55 -50 55 25" fill="none" stroke-width="5"/>'+thick("M0 25 V120 Q0 160 -38 150",16,6)
A["violin"]='<g transform="translate(0,20)"><path d="M0 -20 C-95 -30 -115 40 -72 92 C-112 142 -102 205 0 210 C102 205 112 142 72 92 C115 40 95 -30 0 -20 Z"/><rect x="-16" y="-185" width="32" height="165"/><circle cx="0" cy="-205" r="24"/><path d="M-6 -185 V150 M6 -185 V150" fill="none" stroke-width="3"/><rect x="-30" y="140" width="60" height="18" rx="6"/></g>'
A["vase"]='<path d="M-60 -60 H60 Q55 0 100 60 Q150 120 110 190 H-110 Q-150 120 -100 60 Q-55 0 -60 -60 Z"/><path d="M-20 -60 Q-40 -120 -60 -150 M0 -60 V-170 M20 -60 Q40 -120 60 -150" fill="none" stroke-width="8"/><circle cx="-62" cy="-165" r="26"/><circle cx="0" cy="-185" r="26"/><circle cx="62" cy="-165" r="26"/>'
A["wafer"]='<rect x="-145" y="-105" width="290" height="210" rx="16"/>'+"".join(f'<path d="M{-145+58*i} -105 V105 M-145 {-105+52*i} H145" fill="none" stroke-width="5"/>' for i in range(1,5))
A["wifi"]=thick("M-135 -20 A190 190 0 0 1 135 -20",52,34)+thick("M-90 30 A120 120 0 0 1 90 30",52,34)+thick("M-45 80 A55 55 0 0 1 45 80",52,34)+'<circle cx="0" cy="125" r="26"/>'
A["xylo"]="".join(f'<rect x="{-150+i*54}" y="{-100+i*14}" width="44" height="{200-i*28}" rx="8"/>' for i in range(6))+'<path d="M-150 -120 L150 -60" fill="none" stroke-width="12" opacity="0"/><path d="M-60 -160 L20 -80 M60 -170 L130 -90" fill="none" stroke-width="10"/><circle cx="-62" cy="-165" r="20"/><circle cx="58" cy="-175" r="20"/>'
A["yoyo"]='<circle cx="0" cy="55" r="105"/><circle cx="0" cy="55" r="60" fill="none"/><circle cx="0" cy="55" r="16" fill="#111"/><path d="M0 -50 V-140" fill="none" stroke-width="6"/><circle cx="0" cy="-160" r="22"/>'
A["yacht"]='<path d="M-140 90 H140 L98 150 H-98 Z"/><path d="M0 90 V-165" fill="none" stroke-width="10"/><path d="M12 -155 Q110 -50 110 80 H12 Z"/><path d="M-12 -115 Q-100 -20 -110 80 H-12 Z"/><path d="M0 -165 L50 -180 L0 -195 Z"/>'
A["kite"]='<g transform="scale(0.85)"><polygon points="0,-155 105,-20 0,105 -105,-20"/><path d="M0 -155 V105 M-105 -20 H105" fill="none"/><path d="M0 105 Q-35 150 5 195 Q45 235 0 280" fill="none" stroke-width="6"/><polygon points="-20 185 -45 170 -45 205" /></g>'
A["smile"]='<circle r="145"/><circle cx="-52" cy="-35" r="20" fill="#111" stroke="none"/><circle cx="52" cy="-35" r="20" fill="#111" stroke="none"/><path d="M-85 35 Q0 125 85 35" fill="none" stroke-width="14"/>'
SC={'violin':0.68,'vase':0.82,'yoyo':0.82,'xylo':0.85,'kite':0.62,'yacht':0.82,'icicle':0.85,'icecream':0.85,'quiz':0.95}
DY={'violin':10,'vase':20,'yoyo':10,'xylo':25,'kite':-10,'yacht':25,'icicle':20,'icecream':25}
def pic(k): return A[k] if k in A else sym(k)
S=[ # (letter, [(word, art), ...], title-mode)
("Ă",[("Măr","apple"),("Lămâie","lemon")],"în cuvintele"),
("Â",[("Pâine","bread"),("Râu","river")],"în cuvintele"),
("D",[("Dovleac","pumpkin"),("Dinte","tooth")],"de la"),
("E",[("Elefant","elephant"),("Eprubetă","tube")],"de la"),
("G",[("Glob","globe"),("Găleată","bucket")],"de la"),
("H",[("Hamster","hamster"),("Hartă","map")],"de la"),
("I",[("Inimă","heart"),("Iarbă","grass")],"de la"),
("Î",[("Înghețată","icecream")],"de la"),
("J",[("Joben","tophat"),("Jucărie","blocks")],"de la"),
("K",[("Koala","koala"),("Kiwi","kiwi")],"de la"),
("O",[("Ou","egg"),("Ochi","eye")],"de la"),
("Q",[("Quiz","quiz")],"de la"),
("R",[("Robot","bot"),("Roată","wheel")],"de la"),
("Ș",[("Șarpe","snake"),("Șapcă","cap")],"de la"),
("Ț",[("Țestoasă","turtle"),("Țurțure","icicle")],"de la"),
("U",[("Urs","bear"),("Umbrelă","umbrella")],"de la"),
("V",[("Vioară","violin"),("Vază","vase")],"de la"),
("W",[("Wafă","wafer"),("Wi-Fi","wifi")],"de la"),
("X",[("Xilofon","xylo")],"de la"),
("Y",[("Yoyo","yoyo"),("Yacht","yacht")],"de la"),
("Z",[("Zmeu","kite"),("Zâmbet","smile")],"de la"),
]
for n,(L,items,mode) in enumerate(S,11):
    acc=L in 'ĂÂÎȘȚ'
    ly,lf=(515,430) if L in 'ĂÂÎ' else ((450,430) if L in 'ȘȚ' else (470,470))
    b=f'<text x="360" y="{ly}" {T} font-size="{lf}" stroke-width="10" fill="#fff">{L}</text><text x="720" y="{ly}" {T} font-size="330" stroke-width="8" fill="#fff">{L.lower()}</text>'
    b+='<path d="M60 560 H964" fill="none" stroke-width="5" stroke-dasharray="16 12"/>'
    xs=[512] if len(items)==1 else [270,754]
    for x,(w,art) in zip(xs,items):
        sc='' if art in A else ''
        inner=pic(art)
        if art in A:
            k=SC.get(art,0.98); dy=DY.get(art,0)
            inner=f'<g transform="translate(0,{dy}) scale({k})">{A[art]}</g>'
        b+=f'<g transform="translate({x},745)">{inner}</g><text x="{x}" y="965" {T} font-size="52" stroke-width="2.5" fill="#fff">{w.upper()}</text>'
    words=" și ".join(w for w,_ in items)
    t=f"Litera {L} {mode} {words}"
    d=f"Planșă de colorat educativă cu litera {L} mare, de colorat, și "+("desenul " if len(items)==1 else "desenele ")+f"care ilustrează cuvintele: {words}."
    meta='{"title":"%s","desc":"%s","tags":"alfabet, litere, litera %s, educatie","cats":[20]}'%(t,d,L.lower())
    open(f"pages/litere-{n}.svg","w").write(f"<!--META {meta}-->\n"+b+"\n")
print("wrote",len(S),"pages")
