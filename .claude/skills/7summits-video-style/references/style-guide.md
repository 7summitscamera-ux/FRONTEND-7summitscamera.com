# 7summits Video Style Guide (measured from the reference reel)

Reference: 35 s, 9:16, talking head at a desk + B-roll, Indonesian voice-over.
Values below are in a 1080×1920 canvas; implemented in `assets/style.json`.

## 1. Structure & pacing
| Time | What happens |
|---|---|
| 0–3 s | Hook question, typed on screen word by word with a `|` cursor ("gimana caranya focus, dalam 1 shot?") |
| 3–6 s | Two keyword cards back to back: **OBJEK** *ke* **OBJEK** (green), "lainnya dengan" **MULUS?** (orange box) |
| 6–10 s | First B-roll: split screen (film scene top, BTS B&W bottom), credit @handle |
| 10–24 s | A-roll explanation, jump cuts every 2–4 s, punch-in alternating; cards: **SIMPEL**, **FOKUS PULLER**, **FOLLOW FOCUS** (morph) |
| 24–29 s | B-roll chain: POV device demo → B&W gear close-up (zoom-through transition) |
| 29–33 s | A-roll conclusion |
| 33–35 s | B-roll split (example scene) to close |

- Average A-roll shot: ~2.5 s. No pause longer than ~0.3 s survives.
- A-roll framing alternates **wide (100%)** and **tight (≈115%)** on consecutive cuts.
  No other camera movement on A-roll; the jump between framings creates the energy.

## 2. Typography
| Element | Reference look | Implementation (free font) | Size @1080w | Color |
|---|---|---|---|---|
| Caption | Helvetica-style medium sans, lowercase as spoken | Inter SemiBold | 44 | white, 1.4 px dark outline, soft shadow |
| Keyword line | Heavy grotesk, UPPERCASE, tight tracking | Inter ExtraBold, spacing −1 | 96 | white + shadow |
| Highlight: box | Orange box behind last line | KeyBox style (opaque box, 10 px pad) | 96 | text white, box #FA6C00 |
| Highlight: green | Neon green last line | KeyGreen | 96 | #45FA00 |
| Lead line | Small line above keyword ("lainnya dengan", "namanya") | Inter SemiBold | 46 | white |
| Accent connector | Small italic serif between lines ("ke") | Playfair Display SemiBold Italic | 64 | white |
| Morph serif | Keyword shown first in serif, then snaps to bold | Playfair Display Medium | 96 | white |
| Credit | "@marcel_overwijn" bottom-right of B-roll | Inter SemiBold | 30 | white + shadow |
| Watermark | logo circle + **7summits**camera | Inter ExtraBold + SemiBold | 28 (logo 44 px) | white 92% |

If editing in CapCut/Premiere and Helvetica Neue is available, Helvetica Neue Medium/Bold matches the reference
slightly better than Inter. Keep sizes and colors the same.

## 3. Positions (fraction of height)
- Watermark: center x, y = 0.065
- Caption: center x, y = 0.515 (chest level, just under the face). Side margin 110 px, max 2 lines.
- Keyword card block: centered on y = 0.47 (covers the chest area, never the face)
- With existing burned-in captions: cards move to a free band (0.36 / 0.28 / 0.58), see the SKILL.md rule.

## 4. Text animation
- Caption: word-by-word build (each word appears on its spoken timestamp), centered, so the line grows from the center.
  Cursor `|` (70% opacity) trails during the hook (first 3 s).
- Card: each piece pops in at 118% → 100% over 140 ms, staggered 0.12 s (lead → line 1 → accent → line 2).
  Cards hide the normal caption while visible.
- Morph card: serif for 0.35 s, then the bold + highlight version pops.

## 5. Transitions (0.3 s, ease)
| Name | Look in reference | Where |
|---|---|---|
| `cut` | Hard jump cut with framing change | Between A-roll segments |
| `slideup` | New layer pushes up from the bottom with vertical motion blur; exit pushes up and away revealing A-roll | A-roll ↔ B-roll (default) |
| `zoomblur` (in) | B-roll arrives zoomed 140% and blurred, settles to 100% | Entering a punchy B-roll (gear close-up) |
| `zoomblack` (out) | Zoom-through + blur + quick dip to black | Between two consecutive B-rolls |

SFX: whoosh on every slideup/zoom transition, short pop on every keyword card.

## 6. B-roll look
- Split screen: two 16:9 panels stacked in the middle, blurred and darkened copy of the top clip as the fill.
  Typical pairing: final result (color) on top + behind-the-scenes (B&W) below.
- Product/gear close-ups: black & white, contrast +12%, slow push-in 8% over the shot.
- Credit any third-party clip with @handle bottom-right.
- Voice keeps playing under B-roll; captions and cards stay on top.

## 7. Color & audio
- A-roll: natural warm tungsten look, no heavy grade. B-roll gear: B&W.
- Loudness −14 LUFS integrated, −1 dBTP. Background music, if used, sits ~−24 dB under the voice.
