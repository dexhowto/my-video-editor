import math
T='font-family="Arial Black, Arial, sans-serif" font-weight="900" text-anchor="middle"'
def R(shape,n,x,y,fs=40):
    return shape+f'<text x="{x}" y="{y+fs*0.35:.0f}" {T} font-size="{fs}" stroke="none" fill="#111">{n}</text>'
def key(colors):
    k=len(colors); step=864/k; out='<path d="M60 835 H964" fill="none" stroke-width="4" stroke-dasharray="14 10"/>'
    for i,(n,name) in enumerate(colors.items()):
        x=60+step*(i+0.5)
        out+=f'<circle cx="{x:.0f}" cy="890" r="30"/><text x="{x:.0f}" y="903" {T} font-size="36" stroke="none" fill="#111">{n}</text><text x="{x:.0f}" y="958" {T} font-size="21" stroke="none" fill="#111">{name.upper()}</text>'
    return out
P=[]
# 1 flower
b=''
for i in range(8):
    a=math.radians(45*i); px,py=512+150*math.cos(a),360+150*math.sin(a)
    b+=R(f'<ellipse cx="{px:.0f}" cy="{py:.0f}" rx="52" ry="95" transform="rotate({45*i+90} {px:.0f} {py:.0f})"/>',2,round(px),round(py),38)
b+=R('<circle cx="512" cy="360" r="78"/>',1,512,360,46)
b+=R('<rect x="492" y="500" width="40" height="290"/>',3,512,690,36)
b+=R('<ellipse cx="400" cy="640" rx="80" ry="38" transform="rotate(-25 400 640)"/>',3,400,640,32)+R('<ellipse cx="624" cy="590" rx="80" ry="38" transform="rotate(25 624 590)"/>',3,624,590,32)
b+=R('<rect x="60" y="760" width="904" height="55"/>',4,512,790,32)
P.append(("Floare","o floare mare cu petale",b,{1:"galben",2:"roz",3:"verde",4:"maro"}))
# 2 house
b=R('<rect x="260" y="470" width="500" height="290"/>',1,330,540,44)
b+=R('<polygon points="220,470 512,250 804,470"/>',2,512,400,44)
b+=R('<rect x="640" y="300" width="60" height="110"/>',2,670,355,36)
b+=R('<rect x="470" y="580" width="90" height="180"/>',3,515,670,44)
b+=R('<rect x="310" y="530" width="100" height="90"/>',4,360,575,40)+R('<rect x="610" y="530" width="100" height="90"/>',4,660,575,40)
b+=R('<rect x="60" y="760" width="904" height="60"/>',5,200,792,34)
P.append(("Căsuță","o căsuță cu acoperiș roșu",b,{1:"galben",2:"roșu",3:"maro",4:"bleu",5:"verde"}))
# 3 fish
b=R('<ellipse cx="500" cy="450" rx="240" ry="150"/>',1,520,450,46)
b+=R('<polygon points="720,450 880,320 880,580"/>',2,820,450,40)
b+=R('<ellipse cx="480" cy="290" rx="80" ry="45"/>',3,480,290,36)
b+=R('<circle cx="340" cy="420" r="30"/>',5,340,420,30)
b+=R('<circle cx="170" cy="360" r="36"/>',4,170,360,30)+R('<circle cx="140" cy="250" r="30"/>',4,140,250,28)+R('<circle cx="210" cy="190" r="34"/>',4,210,190,28)
b+=R('<rect x="60" y="720" width="904" height="100"/>',6,512,770,38)
P.append(("Pește","un pește mare cu bule",b,{1:"portocaliu",2:"roșu",3:"galben",4:"bleu",5:"negru",6:"maro"}))
# 4 boat
b=R('<rect x="60" y="740" width="904" height="85"/>',4,170,785,40)
b+=R('<polygon points="200,640 820,640 720,780 300,780"/>',1,512,710,40)
b+=R('<polygon points="500,160 500,620 240,620"/>',2,440,500,42)+R('<polygon points="530,260 530,620 760,620"/>',3,620,520,42)
b+=R('<circle cx="860" cy="240" r="75"/>',3,860,240,40)
P.append(("Barcă cu pânze","o barcă cu pânze pe mare",b,{1:"maro",2:"roșu",3:"galben",4:"bleu"}))
# 5 butterfly
b=''
for s in (1,-1):
    def X(x): return 512+s*(x-512)
    b+=R(f'<ellipse cx="{X(640)}" cy="360" rx="140" ry="120" transform="rotate({s*20} {X(640)} 360)"/>',1,X(660),350,44)
    b+=R(f'<ellipse cx="{X(610)}" cy="580" rx="105" ry="90" transform="rotate({s*-15} {X(610)} 580)"/>',2,X(610),580,40)
    b+=R(f'<circle cx="{X(690)}" cy="330" r="40"/>',4,X(690),330,32)
b+=R('<ellipse cx="512" cy="480" rx="36" ry="190"/>',3,512,480,32)+R('<circle cx="512" cy="260" r="42"/>',3,512,260,30)
b+='<path d="M495 225 Q470 160 430 140 M529 225 Q554 160 594 140" fill="none" stroke-width="6"/>'
P.append(("Fluture","un fluture cu aripi mari",b,{1:"mov",2:"roz",3:"maro",4:"galben"}))
# 6 tree
b=R('<ellipse cx="512" cy="790" rx="420" ry="55"/>',4,230,795,36)
b+=R('<rect x="462" y="520" width="100" height="270"/>',2,512,650,44)
b+=R('<ellipse cx="512" cy="360" rx="240" ry="200"/>',1,520,375,48)
for x,y in((400,330),(570,290),(630,410),(450,440)): b+=R(f'<circle cx="{x}" cy="{y}" r="40"/>',3,x,y,34)
P.append(("Măr cu mere","un măr plin cu mere roșii",b,{1:"verde",2:"maro",3:"roșu",4:"galben"}))
# 7 car
b=R('<rect x="60" y="720" width="904" height="100"/>',4,512,770,40)
b+=R('<polygon points="160,640 160,520 330,490 400,350 640,350 730,490 860,520 860,640"/>',1,512,590,50)
b+=R('<polygon points="420,375 500,375 500,470 345,470"/>',2,460,425,34)+R('<polygon points="525,375 620,375 695,470 525,470"/>',2,600,425,34)
for x in (300,720):
    b+=R(f'<circle cx="{x}" cy="660" r="80"/>',3,x,660,34)+f'<circle cx="{x}" cy="660" r="32"/>'
P.append(("Mașină","o mașină roșie",b,{1:"roșu",2:"bleu",3:"negru",4:"gri"}))
# 8 ladybug
b=R('<ellipse cx="512" cy="810" rx="420" ry="55"/>',3,200,815,36)
b+=R('<circle cx="512" cy="520" r="240"/>',1,512,680,48)
b+=R('<ellipse cx="512" cy="270" rx="120" ry="85"/>',2,512,270,40)
for x,y in((400,460),(630,460),(430,610),(600,610)): b+=R(f'<circle cx="{x}" cy="{y}" r="48"/>',2,x,y,38)
b+='<path d="M450 200 Q420 140 380 130 M575 200 Q605 140 645 130" fill="none" stroke-width="6"/>'
P.append(("Buburuză","o buburuză pe o frunză",b,{1:"roșu",2:"negru",3:"verde"}))
# 9 rainbow
b=R('<rect x="60" y="700" width="904" height="120"/>',7,512,760,40).replace('>7<','>6<')
for i,r in enumerate((400,350,300,250,200)):
    path=f'M{512-r} 700 A{r} {r} 0 0 1 {512+r} 700 L{512+r-50} 700 A{r-50} {r-50} 0 0 0 {512-r+50} 700 Z'
    b+=R(f'<path d="{path}"/>',i+1,512,700-r+28,34)
b+=R('<ellipse cx="170" cy="700" rx="130" ry="60"/>',6,170,700,32)+R('<ellipse cx="854" cy="700" rx="130" ry="60"/>',6,854,700,32)
P.append(("Curcubeu","un curcubeu mare între doi nori",b,{1:"roșu",2:"portocaliu",3:"galben",4:"verde",5:"albastru",6:"bleu"}))
# 10 rocket
b=R('<rect x="414" y="300" width="196" height="360"/>',1,512,560,48)
b+=R('<polygon points="512,140 610,300 414,300"/>',2,512,260,34)
b+=R('<circle cx="512" cy="430" r="62"/>',3,512,430,40)
b+=R('<polygon points="414,520 290,700 414,660"/>',2,372,620,32)+R('<polygon points="610,520 734,700 610,660"/>',2,652,620,32)
b+=R('<polygon points="440,660 512,850 584,660"/>',4,512,720,34)
for x,y in((190,280),(840,330),(230,520),(800,560)): b+=R(f'<circle cx="{x}" cy="{y}" r="34"/>',5,x,y,30)
P.append(("Rachetă","o rachetă spațială cu flăcări",b,{1:"gri",2:"roșu",3:"bleu",4:"portocaliu",5:"galben"}))
for i,(name,desc,body,colors) in enumerate(P,1):
    page=f'<text x="512" y="70" {T} font-size="44" stroke-width="2" fill="#fff">COLOREAZĂ DUPĂ NUMERE</text>'+body+key(colors)
    meta='{"title":"Colorează după numere: %s","desc":"Joc de colorat după numere: fiecare număr corespunde unei culori din cheia de jos, iar copiii colorează %s.","tags":"coloreaza dupa numere, joc, culori, numere","cats":[20]}'%(name,desc)
    open(f"pages/numere-{i}.svg","w").write(f"<!--META {meta}-->\n"+page+"\n")
