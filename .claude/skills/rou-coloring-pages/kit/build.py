#!/usr/bin/env python3
"""Render coloring pages: pages/NN.svg (META comment + SVG body) -> png/NN.png.
Usage: build.py [ids...]   (default: all pages newer than their PNG)
       build.py --sheet ids...  (contact sheet of given ids -> sheet.png)
Macro: <U id="sun" x="100" y="100" s="1" r="0"/> places a symbol with its origin at x,y.
"""
import json, math, os, re, subprocess, sys, glob

SKILL_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get("KIDS_WORK") or os.getcwd()  # work dir holding defs.svg, pages/, png/
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
DEFS = open(os.path.join(ROOT, "defs.svg") if os.path.exists(os.path.join(ROOT, "defs.svg")) else os.path.join(SKILL_DIR, "defs.svg")).read()
VB = {m[0]: [float(v) for v in m[1].split()] for m in re.findall(r'<symbol id="([^"]+)" viewBox="([^"]+)"', DEFS)}


def expand(m):
    a = dict(re.findall(r'(\w+)="([^"]*)"', m.group(1)))
    x, y, w, h = VB[a["id"]]
    t = f'translate({a.get("x", 0)},{a.get("y", 0)}) scale({a.get("s", 1)})'
    if "r" in a:
        t += f' rotate({a["r"]})'
    if "fx" in a:
        t += ' scale(-1,1)'
    extra = f' stroke-width="{a["sw"]}"' if "sw" in a else ""
    return f'<use href="#{a["id"]}" x="{x}" y="{y}" width="{w}" height="{h}" transform="{t}"{extra}/>'


def ring(m):
    """<Z|S cx cy rx ry a0 a1 n d [close] [rest]/> zigzag (Z) or scallop (S) along an ellipse arc.
    Angles in degrees, 0 = right, 90 = down. d = spike length / scallop bulge."""
    kind = m.group(1)
    a = dict(re.findall(r'(\w+)="([^"]*)"', m.group(2)))
    cx, cy, rx, ry = (float(a[k]) for k in ("cx", "cy", "rx", "ry"))
    a0, a1, n, d = float(a.get("a0", 0)), float(a.get("a1", 360)), int(a["n"]), float(a["d"])
    close = a.get("close", "1" if a1 - a0 >= 360 else "0") == "1"
    pt = lambda ang, k: (cx + (rx + k) * math.cos(math.radians(ang)), cy + (ry + k) * math.sin(math.radians(ang)))
    step = (a1 - a0) / n
    x, y = pt(a0, 0)
    out = [f"M{x:.1f} {y:.1f}"]
    for i in range(n):
        if kind == "Z":
            px, py = pt(a0 + step * (i + 0.5), d)
            qx, qy = pt(a0 + step * (i + 1), 0)
            out.append(f"L{px:.1f} {py:.1f} L{qx:.1f} {qy:.1f}")
        else:
            px, py = pt(a0 + step * (i + 0.5), d * 2)
            qx, qy = pt(a0 + step * (i + 1), 0)
            out.append(f"Q{px:.1f} {py:.1f} {qx:.1f} {qy:.1f}")
    if close:
        out.append("Z")
    rest = " ".join(f'{k}="{v}"' for k, v in a.items() if k not in ("cx", "cy", "rx", "ry", "a0", "a1", "n", "d", "close"))
    return f'<path d="{" ".join(out)}" {rest}/>'


def parse(path):
    src = open(path).read()
    m = re.match(r'\s*<!--META (.*?)-->', src, re.S)
    meta = json.loads(m.group(1))
    body = re.sub(r'<U ([^>]*?)/>', expand, src[m.end():])
    body = re.sub(r'<([ZS]) ([^>]*?)/>', ring, body)
    return meta, body


def html(body, size=1024):
    return f'''<!doctype html><html><head><meta charset="utf-8">
<style>html,body{{margin:0;background:#fff}}svg{{display:block}}</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 1024 1024"
 fill="#fff" stroke="#111" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
<rect width="1024" height="1024" stroke="none"/>{DEFS}{body}</svg></body></html>'''


def shot(html_path, png_path, w, h, tries=3):
    for t in range(tries):
        r = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                            "--force-device-scale-factor=1", f"--window-size={w},{h}",
                            f"--screenshot={png_path}", "file://" + html_path],
                   stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        if r.returncode == 0:
            return
    raise RuntimeError(r.stderr[-500:])


def render(pid):
    meta, body = parse(os.path.join(ROOT, "pages", pid + ".svg"))
    hp = os.path.join(ROOT, "png", pid + ".html")
    open(hp, "w").write(html(body))
    shot(hp, os.path.join(ROOT, "png", pid + ".png"), 1024, 1024)
    os.remove(hp)
    print(pid, meta["title"])


def sheet(ids):
    cells = "".join(
        f'<div><img src="png/{i}.png"><p>{i}</p></div>' for i in ids)
    cols = 4 if len(ids) > 3 else len(ids)
    rows = (len(ids) + cols - 1) // cols
    page = f'''<!doctype html><html><head><meta charset="utf-8"><style>
body{{margin:0;background:#888;display:grid;grid-template-columns:repeat({cols},500px);gap:8px;padding:8px}}
div{{background:#fff;position:relative}}img{{width:500px;height:500px;display:block}}
p{{position:absolute;top:0;left:6px;margin:0;font:bold 28px sans-serif;color:#c00}}</style></head><body>{cells}</body></html>'''
    hp = os.path.join(ROOT, "sheet.html")
    open(hp, "w").write(page)
    shot(hp, os.path.join(ROOT, "sheet.png"), cols * 508 + 8, rows * 508 + 8)


if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0] == "--sheet":
        sheet(args[1:])
        sys.exit()
    ids = args or [os.path.basename(p)[:-4] for p in sorted(glob.glob(os.path.join(ROOT, "pages", "*.svg")))
                   if not os.path.exists(os.path.join(ROOT, "png", os.path.basename(p)[:-4] + ".png"))
                   or os.path.getmtime(p) > os.path.getmtime(os.path.join(ROOT, "png", os.path.basename(p)[:-4] + ".png"))]
    for i in ids:
        render(i)
