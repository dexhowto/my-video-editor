#!/usr/bin/env python3
"""Publish all pages/<prefix>-N.svg now, into a (possibly new) category.
Usage: ROU_KEY=... publish_cat.py <prefix> "<Category Name>"
- Each page's META "cats" lists extra existing category ids.
- The category is resolved to its id; if missing, the first upload creates it by name.
- Default: published_at = local time (matches the site's DB clock) minus 15 min, so pages are visible at once.
- Scheduling: set SCHEDULE_AFTER_LATEST=1 to put the pages after the latest published_at on the site
  (SCHEDULE_STEP_MIN minutes apart, default 60), or SCHEDULE_START="YYYY-MM-DD HH:MM:SS" for a fixed start.
- Resumable: results are stored in uploads.json under the page id.
"""
import datetime, glob, json, os, re, subprocess, sys, time, urllib.request

ROOT = os.environ.get("KIDS_WORK") or os.getcwd()  # work dir holding pages/ png/ uploads.json
KEY = os.environ["ROU_KEY"]
prefix, cat_name = sys.argv[1], sys.argv[2]


def categories():
    d = json.load(urllib.request.urlopen("https://www.rou.ro/api/imagini/categorii"))
    return {c["name"]: c["id"] for c in d["data"]}


def page_meta(pid):
    src = open(os.path.join(ROOT, "pages", pid + ".svg")).read()
    return json.loads(re.match(r'\s*<!--META (.*?)-->', src, re.S).group(1))


pids = sorted((os.path.basename(p)[:-4] for p in glob.glob(os.path.join(ROOT, "pages", prefix + "-*.svg"))),
              key=lambda s: int(s.rsplit("-", 1)[1]))
done_path = os.path.join(ROOT, "uploads.json")
done = json.load(open(done_path)) if os.path.exists(done_path) else {}
cat_id = categories().get(cat_name)
STEP = int(os.environ.get("SCHEDULE_STEP_MIN", "60"))
if os.environ.get("SCHEDULE_START"):
    base = datetime.datetime.strptime(os.environ["SCHEDULE_START"], "%Y-%m-%d %H:%M:%S") - datetime.timedelta(minutes=STEP)
elif os.environ.get("SCHEDULE_AFTER_LATEST"):
    latest, page = "", 1
    while True:
        d = json.load(urllib.request.urlopen(f"https://www.rou.ro/api/imagini/vezi-toate?limit=200&page={page}"))
        latest = max([latest] + [i["published_at"] for i in d["data"]])
        if len(d["data"]) < 200:
            break
        page += 1
    base = datetime.datetime.strptime(latest, "%Y-%m-%d %H:%M:%S")
else:
    base = None
    now = datetime.datetime.now() - datetime.timedelta(minutes=15)

k = 0  # counts only pages sent in this run, so resumed runs keep even spacing
for pid in pids:
    if pid in done:
        continue
    n = k
    k += 1
    assert os.path.exists(os.path.join(ROOT, "png", pid + ".png")), pid
    m = page_meta(pid)
    if base is None:
        when = (now + datetime.timedelta(seconds=n)).strftime("%Y-%m-%d %H:%M:%S")
    else:
        when = (base + datetime.timedelta(minutes=STEP * (n + 1))).strftime("%Y-%m-%d %H:%M:%S")
    cmd = ["curl", "-sS", "-m", "90", "-X", "POST", "https://www.rou.ro/api/imagini/adauga",
           "-H", f"X-API-KEY: {KEY}",
           "-F", f"title={m['title']}", "-F", f"description={m['desc']}",
           "-F", f"tags={m['tags']}", "-F", f"published_at={when}",
           "-F", f"image_file=@{os.path.join(ROOT, 'png', pid + '.png')};type=image/png"]
    cats = [str(cat_id) if cat_id else cat_name] + [str(c) for c in m.get("cats", [])]
    for c in cats:
        cmd += ["-F", f"categories[]={c}"]
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    try:
        r = json.loads(out)
    except Exception:
        sys.exit(f"FAIL {pid}: {out[:300]}")
    if not r.get("success"):
        sys.exit(f"FAIL {pid}: {r}")
    done[pid] = r
    json.dump(done, open(done_path, "w"), ensure_ascii=False, indent=1)
    print(pid, r["image_id"], r["status"], r["published_at"], r["public_url"])
    if not cat_id:
        cat_id = categories().get(cat_name)
        print("category", repr(cat_name), "-> id", cat_id)
        if not cat_id:
            sys.exit("category was not created under the expected name; stopping")
    time.sleep(0.4)

# verify
ids = {done[p]["image_id"] for p in pids if p in done}
d = json.load(urllib.request.urlopen(f"https://www.rou.ro/api/imagini/vezi-toate?limit=60&page=1"))
first = done[pids[0]]["public_url"]
code = subprocess.run(["curl", "-sS", "-o", "/dev/null", "-w", "%{http_code}", first], capture_output=True, text=True).stdout
print(f"done {len(ids)}/{len(pids)} in category {cat_name!r} (id {cat_id}); first page {first} -> HTTP {code}")
