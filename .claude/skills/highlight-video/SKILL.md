---
name: highlight-video
description: Add red highlight boxes with a fading spotlight dim to a phone or screen recording, one box per tutorial step, from a recording copied into video-projects/<project>/highlight/ and a step script. Use when the user says "highlight video", "/highlight-video <file>", asks for a highlight box, spotlight, dim-around-the-button, or step callouts on a screen recording. Only adds the box and dim; touch dots and other effects already in the footage are left as they are.
---

# Highlight Video

Adds a rounded red outline around a target, dims the rest of the frame to 50%,
and fades both in and out. This adds one highlight per step of a screen-recording
tutorial. The look matches the reference clip `examples/Untitled-partajat.mp4`:
pure red `#ff0000` 6px border, small radius, 50% black dim, 1.0s ease-in fade,
0.9s ease-out fade.

The renderer is a single local script (Node + ffmpeg, no browser, no API calls):
`.claude/skills/highlight-video/scripts/highlight.mjs`. It renders a 14 s 1080p-class
clip in under 10 s.

## Folder convention

Every file a render needs lives in one project folder,
`video-projects/<project>/highlight/` (gitignored, personal footage):

| File | Who writes it |
| --- | --- |
| `video-projects/<project>/highlight/<name>.mp4` | copied in from the user's recording (never modified) |
| `video-projects/<project>/highlight/<name>.txt` | user (optional step script; may also be given in chat) |
| `video-projects/<project>/highlight/<name>.highlight.json` | this skill (the plan) |
| `video-projects/<project>/highlight/<name>.highlighted.mp4` | this skill (output) |
| `video-projects/<project>/highlight/<name>.highlighted.previews/` | this skill (check frames) |

The user calls `/highlight-video <name>.mp4` (or just the name), optionally with
a project. Without a project, use `<project>` = the recording name in lowercase
with spaces and underscores turned into hyphens. Find the recording in this order:
`video-projects/<project>/highlight/`, then `projects-full/<project>/` (any
subfolder), then the path the user gave. If it is not inside `highlight/` yet,
copy it there (`cp`, never move or modify the original) before step 1. If it
cannot be found, list `video-projects/*/highlight/` and `projects-full/` and ask.

## Workflow

Run commands from the repo root. `H=.claude/skills/highlight-video/scripts/highlight.mjs`.

1. **Probe** the video: `node $H probe video-projects/<project>/highlight/<name>.mp4` (size, fps, duration).
2. **Get the script.** Use the steps from the chat message, else `video-projects/<project>/highlight/<name>.txt`
   (or `.md`). Each step names a target ("tap Settings", "Dex Howto account row"),
   optionally with a time and a hold. If there is no script at all, ask for one;
   do not invent steps.
3. **Find step times** when the script gives none. Make a contact sheet and look
   for where the touch dot arrives on each target and where the screen changes:
   ```bash
   ffmpeg -v error -y -i video-projects/<project>/highlight/<name>.mp4 \
     -vf "fps=4,scale=180:-1,tile=8x6" -frames:v 1 <scratchpad>/sheet.png
   ```
   Use a denser sheet over a short range (`-ss A -t B`, `fps=10`) to pin times to 0.1 s.
   Timing rules (from the reference clip):
   - `start` = when the dot reaches the target (fade-in begins).
   - The fade-out must **finish before the screen changes** after the tap, so the
     box never sits over the next screen. Shorten `hold` if needed.
   - Default `hold` 3.0 s when the script gives none and the footage has room.
   - Steps must not overlap (each finishes fading before the next starts).
4. **Find each box.** Make a labeled grid frame at the step's hold time and read it:
   ```bash
   node $H grid video-projects/<project>/highlight/<name>.mp4 <time> --out <scratchpad>/grid-1.png
   ```
   Lines every 100 px (magenta every 500 px), labels in source pixels. Crop and
   read the region with ffmpeg (`crop=w=..:h=..:x=..:y=..`) to estimate edges
   to about 10 px. The box encloses the whole target: an icon plus its label, or
   a full list row edge to edge, like the reference.
5. **Write the plan** `video-projects/<project>/highlight/<name>.highlight.json`:
   ```json
   {
     "video": "<name>.mp4",
     "output": "<name>.highlighted.mp4",
     "style": { "dim": 0.5, "color": "#ff0000", "border": 6, "radius": 12, "pad": 0,
                "fadeIn": 1.0, "fadeOut": 0.9, "easeIn": "in", "easeOut": "out" },
     "steps": [
       { "label": "Settings icon", "start": 2.8, "hold": 2.9, "box": [58, 440, 196, 236] }
     ]
   }
   ```
   `box` is `[x, y, width, height]` in source pixels; the border is drawn just
   outside it. Any style key can be overridden per step. Eases: `linear`, `in`,
   `out`, `inOut`. Apply style requests from the user here (color, dim strength,
   fade speed).
6. **Preview** each step at full strength and read every PNG:
   ```bash
   node $H preview video-projects/<project>/highlight/<name>.highlight.json
   ```
   Check the box fully encloses the target with no clipping, does not cut through
   neighboring items, and sits on the right screen. Adjust and re-preview until right.
7. **Render** (audio is copied unchanged):
   ```bash
   node $H render video-projects/<project>/highlight/<name>.highlight.json
   ```
8. **Verify the output.** Extract frames across each step's fade-in, hold, and
   fade-out, and right after each fade-out, and read them:
   ```bash
   ffmpeg -v error -y -ss <start-0.3> -t <fadeIn+hold+fadeOut+0.6> \
     -i video-projects/<project>/highlight/<name>.highlighted.mp4 -vf "fps=5,scale=200:-1,tile=8x3" \
     -frames:v 1 <scratchpad>/check-1.png
   ```
   Confirm: smooth fades, no box left over a changed screen, no black flashes,
   duration and frame count match the source (`node $H probe` both files).
9. **Report** the output path, the step table (label, start, hold, box), and any
   timing you had to guess. The user reviews the video; adjust the plan and
   re-render on feedback (renders are fast and only overwrite the skill's own output).

## Rules

- Never modify or overwrite the source recording. The script refuses an output
  path equal to the source.
- Do not add touch dots, captions, zooms, or other effects unless asked; this
  skill is box + dim only.
- Keep footage, plans, and renders in `video-projects/<project>/highlight/`, so
  everything a render needs sits in the project folder. Never copy them into
  `examples/` or the style library.
