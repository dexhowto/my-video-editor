---
name: rou-coloring-pages
description: Create printable kids' coloring pages as code-drawn SVG (no image service), render them to 1024x1024 PNG with headless Chrome, check them on a contact sheet, and publish or schedule them on rou.ro through the /api/imagini/adauga endpoint. Use when the user asks for coloring pages / planșe de colorat, kids' drawings, mazes, connect-the-dots, alphabet or number sheets, adding images to a rou.ro category, or scheduling image batches on imagini-de-colorat.rou.ro.
---

# rou.ro coloring pages

Pipeline: **draw SVG → render PNG → inspect contact sheet → upload to rou.ro**.
Everything is local code; no paid image API. The drawings are line art (black
outline, white fill) for printing, so kids can color them.

## Setup (once per work session)

```bash
SKILL=.agents/skills/rou-coloring-pages        # adjust if called from elsewhere
export KIDS_WORK=~/kids-work                   # any scratch folder, NOT inside a published repo
mkdir -p $KIDS_WORK/pages $KIDS_WORK/png && cp $SKILL/kit/defs.svg $KIDS_WORK/
cd $KIDS_WORK
```

Requirements: macOS Google Chrome at `/Applications/Google Chrome.app`, Python 3, curl.
The API key is the server's `CRON_SECRET_KEY`. **Ask the user for it or read it
from the environment (`ROU_KEY`); never write it into a file, commit, or print it.**

## 1. Page format

Each page is `pages/<prefix>-<n>.svg`: a `META` JSON comment, then SVG body in a
**1024×1024** coordinate space. The renderer wraps it in an `<svg>` with stroke
`#111`, stroke-width 7, round joins, white fill, so you only write shapes.

```
<!--META {"title":"Elefănțel cu umbrelă în ploaie","desc":"...","tags":"animale, elefant","cats":[1]}-->
<ellipse cx="512" cy="770" rx="205" ry="180"/> ...
```

- `title` (Romanian, unique on the site; a duplicate gets a `-1` slug), `desc` (1–2 sentences),
  `tags` (comma list), `cats` = extra existing category IDs (the main category comes from the
  publish command). **Only send IDs, never names** for extra categories (a typo creates a new category).
- Write all text content in Romanian. Diacritics are fine.

Shared macros (`kit/build.py` expands them; see `kit/defs.svg`):

- `<U id="sun" x="880" y="110" s="0.45" r="0" sw="3"/>` places a symbol (origin = viewBox origin;
  `s` scale, `r` rotation, `fx="1"` flips, `sw` stroke width). Symbols include: sun, sunface, cloud,
  daisy, flower, tulip, grass, tree, pine, star, heart, bush, bird, butterfly, bubble, seaweed, rock,
  pony, puppy, kitty, kid, mom, dad, grandpa, grandma, hamster, bot, tent, fire, car, note, note2,
  flake, snowkid, balloon, partyhat, gift, backpack, pencil, romb, pomvietii.
- `<Z cx cy rx ry a0 a1 n d/>` zig-zag and `<S .../>` scallop along an ellipse arc (manes, fur, foam).
- Plain SVG (path, ellipse, rect, text) works too. Text: `font-family="Arial Black, Arial"
  font-weight="900"` with `fill="#fff"` and a stroke so letters stay colorable.

Design rules that avoided visible bugs:
- Draw back-to-front; solid fills hide what is behind, so order matters.
- Hats/hair go on top of a `kid`: translate them up (about −50) so they sit above the face, not over it.
- Keep a clear margin (≥40 px); labels at y≈975 max; nothing may cross the page edge.
- Do not rely on a symbol's stroke at large scale; pass `sw="7/s"` to keep line weight uniform.
- Target audience decides detail: toddlers = few huge shapes with 22 px strokes; ~10 year olds = scenes with
  many small elements, patterns, mandalas, labelled diagrams.

## 2. Generators (reusable)

Run from `$KIDS_WORK`: `python3 $SKILL/kit/<script>`; they write `pages/…svg`.

| Script | Makes |
| --- | --- |
| `maze.py` | 10 mazes (6×6 … 16×16), start/end icons from symbols |
| `mandala.py` | importable `mandala(seed)` for symmetric mandalas |
| `letters.py` | alphabet pages (big outline letter + pictures); edit the `S` list |
| `numbers.py` | numbers 11–100: outline number, Romanian words, tens/units, dot grid |
| `bynum.py` | color-by-number scenes with a color key |

For other categories write the SVG by hand or with a short Python generator (see `examples/`).

## 3. Render and check (mandatory)

```bash
python3 $SKILL/kit/build.py                     # renders new/changed pages to png/
python3 $SKILL/kit/build.py --sheet id1 id2 …   # contact sheet -> sheet.png (4 columns)
```

Open `sheet.png` and look at every page: cropped shapes, text overflow, floating parts, overlapping
labels. Fix the SVG and re-run `build.py` (it re-renders anything newer than its PNG). A lint pass
does not prove it looks right.

## 4. Publish

```bash
ROU_KEY=… python3 $SKILL/kit/publish_cat.py <prefix> "<Category Name>"
```

Sends `pages/<prefix>-*.svg` (in numeric order) one at a time; creates the category by name on the
first upload if it does not exist, then reuses its ID; resumable via `uploads.json`; prints each
public URL and a final HTTP check.

- **Live now** (default): `published_at` = local time − 15 min.
- **Scheduled**: `SCHEDULE_AFTER_LATEST=1` places pages after the latest `published_at` on the site,
  `SCHEDULE_STEP_MIN` minutes apart (default 60). Or `SCHEDULE_START="2026-10-18 19:32:07"`.
- Confirm with the user before publishing anything new publicly, unless they already approved it.

### API facts (from the rou.ro controller)

- `GET https://www.rou.ro/api/imagini/categorii` → categories (id, name, slug). `GET …/vezi-toate?limit=200&page=N` → images.
- `POST https://www.rou.ro/api/imagini/adauga` (multipart): header `X-API-KEY`; `title` (required),
  `image_file` or `image_url`, `description`, `tags`, `published_at`, `categories[]` (**array form only**;
  a plain `categories=3,1` string crashes the server), `slug` optional.
- The server's PHP clock runs ahead of the database clock, so a page without `published_at` stays
  hidden (404) for hours. Always send `published_at` (the script does).
- There is no update/delete endpoint: a published image cannot be fixed through the API. Check the sheet first.
- Page URL: `https://imagini-de-colorat.rou.ro/<slug>.html`; image file under `/uploads/images/`.

## Checklist

1. Category and audience agreed (age, complexity, how many, live or scheduled).
2. SVGs written with unique Romanian titles; `cats` use IDs.
3. `build.py` run; contact sheet inspected; problems fixed.
4. Published with `publish_cat.py`; final line shows `done N/N` and HTTP 200.
5. Report counts per category and any known gaps. Never print the API key.
