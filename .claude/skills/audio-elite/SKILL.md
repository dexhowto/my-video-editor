---
name: audio-elite
description: Generate a voice track (MP3) from any text or text file with the OpenRouter TTS API, using the Fish Audio Drama 3 model and the elite voice ID by default. One request takes at most 10000 characters; longer text is split at a natural point and the skill gives one command per part. Use for "/audio-elite", "audio-elite this", "elite voice", or "generate this with Fish Audio / Drama 3".
---

# audio-elite

Turn text into speech through OpenRouter (`POST https://openrouter.ai/api/v1/audio/speech`).
The helper is `scripts/audio-elite.mjs` (it runs `scripts/audio-mark.mjs` with the
elite preset). Run it from the workspace root.

## Defaults

| Setting | Value |
| --- | --- |
| Model | `fish-audio/drama-3` |
| Voice | `edb4d200ed2f4eb8b9b58dd042e21c6a` |
| Format | `mp3` |
| API key | `OPENROUTER_API_KEY`, from the environment or the workspace `.env` |
| Output | `video-projects/_audio-elite/<name>.mp3` (gitignored) |

Never write the API key into this skill, a script, or chat output. If the key is
missing, ask the user to add `OPENROUTER_API_KEY=...` to `.env`.

Task 4 (audio) of `/video-full-deploy` uses this skill for the narration, through
`.claude/skills/video-full-deploy/scripts/voice-generate.mjs --engine elite`, which
calls `scripts/audio-elite.mjs` once per script group. For other `/video-*`
narration, use it only when the user asks for audio-elite.

## Input

- Inline text: `node scripts/audio-elite.mjs "Text to speak"`
- A file: `node scripts/audio-elite.mjs --file path/to/script.txt`
  (output name = file stem)

If the user pastes long text in chat, save it to a `.txt` file in the scratchpad
or the project folder first, then use `--file`. Do not pass very long text as a
shell argument.

Optional flags: `--output <path>`, `--voice <id>`, `--model <id>`,
`--instructions <text>`, `--speed <n>`, `--format mp3|pcm`.

## Character limit: 10000

1. Count the characters before calling the API.
2. 10000 characters or fewer: run the command. It generates the audio.
3. More than 10000 characters: the script does not call the API. It splits the
   text at the best natural point (paragraph break, then sentence end, then line
   break, then clause, then word), near an even share of the text. It writes
   `<name>.part1.txt`, `<name>.part2.txt` next to the source file (or in
   `video-projects/_audio-elite/` for inline text) and prints one command per part.
4. Show the user each part: its character count, where it ends, and its command
   in its own `bash` block. Text up to 20000 characters gives 2 commands; longer
   text gives more.
5. Check each split point. If a cut lands inside a heading or a list that belongs
   together, move it by editing the part files, keep each part at 10000 characters
   or fewer, and give the commands again.
6. Run the part commands only when the user asks for it.

## After generation

- Report the output path, duration (`ffprobe -v error -show_entries format=duration -of csv=p=0 <file>`),
  and the generation ID.
- Send the MP3 to the user with SendUserFile.
- Cost: Drama 3 is listed at $2 per million UTF-8 bytes (shown as 80% off, so
  the price can rise). 10000 characters is about $0.02. Check the price at
  https://openrouter.ai/fish-audio/drama-3 before a run above 10000 characters.
- If the audio feeds a video, normalize it with `node scripts/normalize-audio.mjs <file>`.

## Errors

| Status | Meaning |
| --- | --- |
| 401 | Bad or missing key |
| 402 | No OpenRouter credits left |
| 400 | Bad voice, model, or format (this model takes `mp3` or `pcm`) |
| 429 / 5xx | Rate limit or provider failure; wait and retry once |
