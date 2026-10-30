---
name: 7summits-video-style
description: Edit or clip videos in the 7summits Camera house style (9:16 talking-head reels with typewriter captions, keyword pop-up cards in orange box / green, punch-in jump cuts, slide-up and zoom-blur B-roll transitions, 7summitscamera watermark). Use when the user asks to edit a video, make a reel/short/TikTok, clip a long video or podcast into shorts, add captions or word pop-ups, or "pakai style 7summits".
---

# 7summits Video Style

Standard editing style for 7summits Camera content, taken from the reference reel
(`references/style-guide.md` has every measured value). The pipeline is:
**footage → transcript → edit plan JSON → `scripts/render.py` → MP4**.

Talk to the user in Bahasa Indonesia. Do not render a final export until the
user has answered the confirmation questions below.

## Tools

| Script | Purpose |
|---|---|
| `scripts/analyze.sh <video>` | Probe, cut list, contact sheet, sample frames. Run first on any new footage. |
| `scripts/transcribe.py <video> -o words.json [--start --end]` | Word timestamps (faster-whisper, `pip install faster-whisper`). |
| `scripts/render.py plan.json [--dry-run] [--draft]` | Render the plan. `--dry-run` prints timeline/captions/cards, `--draft` is a fast preview. |
| `assets/style.json` | All style tokens (fonts, colors, sizes, timings). Edit here, never hard-code in plans. |
| `templates/edit_plan.example.json` | Annotated plan to copy from. |

Fonts are bundled in `assets/fonts/` (Inter SemiBold/ExtraBold, Playfair Display, all OFL).

## Workflow

### 1. Analyze the footage
Run `scripts/analyze.sh`, then look at the contact sheet and frames. Record:
- Orientation/aspect (9:16 phone talking head vs 16:9 podcast/interview).
- **Burned-in text already on the footage**: bottom captions, existing word pop-ups,
  logos, lower-thirds, sponsor overlays. Note their time ranges and vertical band (0–1 of frame height).
- Where the speaker's face sits (for crop/punch-in focus).

### 2. Transcribe and pick the clip (for clipping long videos)
Run `transcribe.py`, read the segments, and propose 2–4 candidate clips (30–60 s each) with:
a strong hook in the first 3 s, one complete idea, a clean ending. Give timestamps + the hook line.
Let the user pick before building the plan.

### 3. Ask the confirmation questions (MANDATORY, use AskUserQuestion)
Ask before building the plan. Use `references/broll-questions.md` for the full option lists
and tailor every option to the actual content of the clip (name the moments, e.g.
"saat bilang 'doomscrolling' di 0:12").

Always ask:
1. **Format/layout**: 9:16 full crop vs 9:16 contain-blur (keeps 16:9 frame whole) vs 16:9.
   If the footage has burned-in captions, recommend contain-blur, since a full crop cuts the caption sides.
2. **B-roll: pakai atau tidak?** If yes: which type (stock/own footage/screen recording/photo/
   product shot), which moments, which layout (full / split-screen), look (color/B&W), and source.
   Never insert B-roll the user did not confirm.
3. **Word pop-up emphasis**: which words to pop and highlight color (orange box = main point,
   green = contrast/comparison).
Optional: SFX on or off, watermark on or off, target duration.

### 4. Build the plan JSON
Copy `templates/edit_plan.example.json`. Times are SOURCE seconds by default (`time_base: "source"`),
so transcript timings can be used as-is; render.py maps them through the jump cuts.

**Rule: footage that already has captions → no new captions.**
Set `existing_text.has_captions: true` with its `caption_region`, and list every existing
pop-up in `existing_text.popups` (time + region). Then only add `cards` (word pop-ups) for emphasis.
render.py refuses to render if a new card overlaps an existing pop-up in time (+0.2 s gap)
and moves cards vertically so they never cover the caption band. Fix the reported conflicts
by re-timing the card; do not just delete the check.

Footage without captions → add `captions` (word timestamps or lines) plus `cards`.

**Hybrid layout for pre-edited 16:9 footage** (typography/graphics already burned in):
map every on-screen text window with a 0.5 s timestamped frame grid, then give those segments
`"fit": "contain_blur", "zoom": 1.0` and keep clean talking-head segments on `cover` with punch-ins.
List the same windows in `existing_text.popups` so new cards land only in the clean gaps.
Check a draft frame just after each window ends, since burned-in text often lingers 0.3–0.5 s past the cut.
For 4K/HEVC sources, make a 540p proxy first (analysis, transcript, drafts) and render the final from the original.

### 5. Preview, check, then render
1. `render.py plan.json --dry-run`: check timeline, chunks, and cards.
2. `render.py plan.json --draft`, then extract frames at every card, transition, and B-roll
   (`ffmpeg -ss T -i out.mp4 -frames:v 1 f.png`). Check that nothing overlaps, no text is cut off,
   and the face is not covered.
3. Show the user the frames or the draft, apply revisions, then do the final render without `--draft`.

## Style rules (summary; full spec in references/style-guide.md)

- **Pacing**: jump cuts remove every pause > 0.3 s and every filler word. Shots of 2–4 s. Alternate framing
  wide (100%) ↔ punch-in (115%) on every cut; this is the main "camera movement".
- **Captions**: Inter SemiBold 44 px, white, thin dark outline + soft shadow, centered at 51.5% height,
  max 6 words/42 chars, build up word by word (typewriter). In the first 3 s a `|` cursor trails the text (hook).
- **Word pop-up cards**: replace the caption while shown. Optional small lead line (Inter SemiBold 46)
  + 1–2 UPPERCASE lines in Inter ExtraBold 96. Last line is highlighted:
  `box` = white text on orange #FA6C00 box, `green` = text #45FA00. Optional italic serif connector
  (`accent`, e.g. "ke", "vs", "&") between two lines. Pop: scale 118% → 100% in 140 ms, lines staggered 0.12 s.
  `morph: true` shows the word in a serif for 0.35 s before snapping to the bold style (use once per video, on the key term).
  Use 1 card per 5–8 s at most. Do not put cards on consecutive sentences.
- **B-roll**: full-screen or split-screen (two 16:9 panels stacked over a blurred fill, credit
  `@handle` bottom-right). Gear/product close-ups in B&W with slow push-in (ken burns).
  Voice continues under B-roll (L-cut); captions stay on top.
- **Transitions** (0.3 s): `slideup` (push up with vertical motion blur), the default A↔B-roll;
  `zoomblur` entrance (zoom 140%→100% + blur); `zoomblack` exit (zoom-through + fade to black) between
  two B-rolls; `cut` for A-roll jump cuts. Whoosh SFX on every slide/zoom, pop SFX on every card.
- **Branding**: watermark top-center (logo circle + **7summits**camera) on A-roll only; hidden under B-roll.
- **Audio**: loudness normalized to −14 LUFS, true peak −1 dB.

## Gotchas
- Footage from screen recordings may contain phone UI (volume HUD, notifications). Cut around it.
- Footage that already has the 7summits watermark or sponsor overlay: set `"watermark": false`.
- `has_captions` disables the caption layer entirely, even if `captions` is in the plan.
- If a B-roll source is shorter than its slot, the last frame is held. Pick longer sources or shorter slots.
