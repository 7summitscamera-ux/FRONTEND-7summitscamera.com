#!/usr/bin/env python3
"""7summits video style renderer: edit plan (JSON) -> finished 9:16 MP4.

Usage:
  python3 render.py plan.json             # full-quality render
  python3 render.py plan.json --draft     # fast low-quality preview
  python3 render.py plan.json --dry-run   # print timeline, captions, cards; no render

Plan format: see ../templates/edit_plan.example.json and ../SKILL.md.
Style tokens (fonts, colors, sizes, timings) live in ../assets/style.json.
"""
import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SKILL_DIR = Path(__file__).resolve().parent.parent
ASSETS = SKILL_DIR / "assets"
FONTS = ASSETS / "fonts"
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".heic"}


# ---------- helpers ----------

def run(cmd, cwd=None):
    r = subprocess.run(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if r.returncode:
        sys.exit(f"Command failed:\n{' '.join(map(str, cmd))}\n\n{r.stderr[-4000:]}")
    return r.stdout


def has_audio(path):
    out = run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries",
               "stream=index", "-of", "csv=p=0", str(path)])
    return bool(out.strip())


def is_image(path):
    return Path(path).suffix.lower() in IMAGE_EXT


def ass_color(hex_rgb, alpha=0):
    h = hex_rgb.lstrip("#")
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H{alpha:02X}{b}{g}{r}".upper()


def ass_time(t):
    t = max(0.0, t)
    cs = int(round(t * 100))
    h, cs = divmod(cs, 360000)
    m, cs = divmod(cs, 6000)
    s, cs = divmod(cs, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def ass_escape(text):
    return text.replace("\\", "\\\\").replace("{", "(").replace("}", ")")


# ---------- timeline ----------

class Timeline:
    """Maps A-roll source time to output timeline time across jump-cut segments."""

    def __init__(self, segments):
        self.segs = []
        t = 0.0
        for s in segments:
            d = s["out"] - s["in"]
            if d <= 0:
                sys.exit(f"Segment has out <= in: {s}")
            self.segs.append((s["in"], s["out"], t))
            t += d
        self.duration = t

    def map_span(self, s, e):
        """Map a source span to timeline; returns (ts, te) or None if s is cut out.

        The end may land in a later segment (cards spanning a jump cut); if it falls in a
        removed gap it is clamped to the end of the last segment before it."""
        start = None
        for a, b, t0 in self.segs:
            if start is None and a <= s < b:
                start = t0 + s - a
            if start is not None:
                if e <= b:
                    return start, t0 + max(0.0, e - a)
                end = t0 + b - a
        return (start, end) if start is not None else None


# ---------- captions & cards (ASS) ----------

def load_words(cap, plan_dir):
    words = cap.get("words")
    if isinstance(words, str):
        words = json.loads((plan_dir / words).read_text())
        if isinstance(words, dict):
            words = words.get("words", [])
    return words or []


def build_chunks(cap, st, tl, plan_dir):
    """Return caption chunks in timeline time: [[{w,s,e}, ...], ...]."""
    base = cap.get("time_base", "source")
    cs = st["captions"]

    def to_tl(s, e):
        return (s, e) if base == "timeline" else tl.map_span(s, e)

    chunks = []
    if cap.get("lines"):
        for ln in cap["lines"]:
            span = to_tl(ln["s"], ln["e"])
            if not span:
                continue
            ws = ln["text"].split()
            step = (span[1] - span[0]) / max(1, len(ws))
            chunks.append([{"w": w, "s": span[0] + i * step, "e": span[0] + (i + 1) * step}
                           for i, w in enumerate(ws)])
        return chunks

    words = []
    for w in load_words(cap, plan_dir):
        span = to_tl(w["s"], w["e"])
        if span:
            words.append({"w": w["w"].strip(), "s": span[0], "e": span[1]})
    cur = []
    for w in words:
        if cur:
            text = " ".join(x["w"] for x in cur + [w])
            if (len(cur) >= cs["max_words"] or len(text) > cs["max_chars"]
                    or w["s"] - cur[-1]["e"] > cs["break_gap"]):
                chunks.append(cur)
                cur = []
        cur.append(w)
        if re.search(r"[.?!,]$", w["w"]) and len(cur) >= 2:
            chunks.append(cur)
            cur = []
    if cur:
        chunks.append(cur)
    return chunks


def ass_header(st):
    W, H = st["canvas"]["w"], st["canvas"]["h"]
    c, f, z = st["colors"], st["fonts"], st["sizes"]
    white, orange, green = ass_color(c["white"]), ass_color(c["orange"]), ass_color(c["green"])
    blk, shadow = ass_color(c["shadow"]), ass_color(c["shadow"], 0x70)
    pad = z["box_padding"]
    fmt = ("Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
           "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, "
           "Shadow, Alignment, MarginL, MarginR, MarginV, Encoding")
    styles = [
        f"Style: Caption,{f['caption']},{z['caption']},{white},{white},{blk},{shadow},0,0,0,0,100,100,0,0,1,1.4,1.5,5,0,0,0,1",
        f"Style: Lead,{f['caption']},{z['lead']},{white},{white},{blk},{shadow},0,0,0,0,100,100,0,0,1,0,2.5,5,0,0,0,1",
        f"Style: Key,{f['keyword']},{z['keyword']},{white},{white},{blk},{shadow},0,0,0,0,100,100,-1,0,1,0,3,5,0,0,0,1",
        f"Style: KeyGreen,{f['keyword']},{z['keyword']},{green},{green},{blk},{shadow},0,0,0,0,100,100,-1,0,1,0,3,5,0,0,0,1",
        f"Style: KeyBox,{f['keyword']},{z['keyword']},{white},{white},{orange},{orange},0,0,0,0,100,100,-1,0,3,{pad},0,5,0,0,0,1",
        f"Style: Accent,{f['accent']},{z['accent']},{white},{white},{blk},{shadow},0,-1,0,0,100,100,0,0,1,0,2.5,5,0,0,0,1",
        f"Style: Serif,{f['morph_serif']},{z['keyword']},{white},{white},{blk},{shadow},0,0,0,0,100,100,2,0,1,0,3,5,0,0,0,1",
        f"Style: Credit,{f['caption']},{z['credit']},{white},{white},{blk},{shadow},0,0,0,0,100,100,0,0,1,0,2,3,0,0,0,1",
    ]
    return "\n".join([
        "[Script Info]", "ScriptType: v4.00+", f"PlayResX: {W}", f"PlayResY: {H}",
        "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
        "[V4+ Styles]", fmt, *styles, "",
        "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ])


def dialogue(s, e, style, text, layer=0, margin_x=0):
    return f"Dialogue: {layer},{ass_time(s)},{ass_time(e)},{style},,{margin_x},{margin_x},0,,{text}"


def card_events(card, st):
    """Keyword card: optional small lead line + big UPPERCASE lines, last line highlighted."""
    W, H = st["canvas"]["w"], st["canvas"]["h"]
    z, cc = st["sizes"], st["cards"]
    s, e = card["s"], card["e"]
    hl = card.get("hl", "box")
    lines = [ln.upper() for ln in card["lines"]]
    pieces = []  # (kind, text, height)
    if card.get("lead"):
        pieces.append(("lead", card["lead"], z["lead"] * 1.15))
    for i, ln in enumerate(lines):
        last = i == len(lines) - 1
        style = {"box": "KeyBox", "green": "KeyGreen"}.get(hl, "Key") if last and len(lines) > 0 else "Key"
        if last and len(lines) == 1 and hl == "box":
            style = "KeyBox"
        pieces.append((style, ln, z["keyword"] * (1.12 if style == "KeyBox" else 0.98)))
        if i == 0 and card.get("accent"):
            pieces.append(("accent", card["accent"], z["accent"] * 0.45))
    total = sum(p[2] for p in pieces)
    y = H * card.get("_y", st["layout"]["card_y"]) - total / 2
    cx = W / 2
    pop = f"\\fscx{cc['pop_scale']}\\fscy{cc['pop_scale']}\\t(0,{cc['pop_ms']},\\fscx100\\fscy100)"
    morph = card.get("morph", False)
    out = []
    k = 0
    for kind, text, h in pieces:
        yc = y + h / 2
        y += h
        t0 = s + k * cc["stagger"]
        k += 1
        pos = f"\\an5\\pos({cx:.0f},{yc:.0f})"
        if kind == "lead":
            out.append(dialogue(t0, e, "Lead", f"{{{pos}\\fad(80,0)}}{ass_escape(text)}", 2))
        elif kind == "accent":
            out.append(dialogue(t0, e, "Accent", f"{{{pos}\\fad(60,0){pop}}}{ass_escape(text)}", 4))
        else:
            if morph:
                mt = t0 + cc["morph_dur"]
                out.append(dialogue(t0, mt, "Serif", f"{{{pos}\\fad(80,0)}}{ass_escape(text)}", 3))
                t0 = mt
            out.append(dialogue(t0, e, kind, f"{{{pos}{pop}}}{ass_escape(text)}", 3))
    return out


def card_height(card, st):
    z = st["sizes"]
    h = z["lead"] * 1.15 if card.get("lead") else 0
    h += z["keyword"] * 1.12 * len(card["lines"])
    h += z["accent"] * 0.45 if card.get("accent") else 0
    return h / st["canvas"]["h"]


def place_cards(cards, existing, st, default_ys):
    """Footage with burned-in text: keep new pop-ups off existing captions and pop-ups.

    Rule 1: a new card never overlaps an existing pop-up in time (+ gap) -> hard error.
    Rule 2: a new card never covers the existing caption band -> pick a free y.
    """
    if not existing:
        for c in cards:
            c["_y"] = c.get("y", default_ys[0])
        return
    gap = existing.get("min_gap", 0.2)
    band = existing.get("caption_region") if existing.get("has_captions") else None
    problems = []
    for c in cards:
        for p in existing.get("popups", []):
            if c["s"] < p["e"] + gap and p["s"] < c["e"] + gap:
                problems.append(f"card {c['lines']} {c['s']:.2f}-{c['e']:.2f}s clashes with existing "
                                f"pop-up '{p.get('text', '?')}' {p['s']:.2f}-{p['e']:.2f}s")
        if "y" in c:
            c["_y"] = c["y"]
            continue
        h = card_height(c, st) / 2 + 0.02
        blocked = [band] if band else []
        for y in existing.get("card_y_candidates", default_ys):
            if all(y + h <= b0 or y - h >= b1 for b0, b1 in blocked):
                c["_y"] = y
                break
        else:
            problems.append(f"card {c['lines']}: no free vertical position; set \"y\" manually")
    if problems:
        sys.exit("Pop-up conflicts with existing on-screen text:\n  " + "\n  ".join(problems))


def build_ass(plan, st, tl, plan_dir, brolls):
    cap = plan.get("captions", {})
    cs = st["captions"]
    W, H = st["canvas"]["w"], st["canvas"]["h"]
    base = cap.get("time_base", "source")

    cards = []
    for c in plan.get("cards", []):
        span = (c["s"], c["e"]) if c.get("time_base", base) == "timeline" else tl.map_span(c["s"], c["e"])
        if span:
            cards.append({**c, "s": span[0], "e": span[1]})

    existing = plan.get("existing_text")
    if existing and existing.get("popups"):
        mapped = []
        for p in existing["popups"]:
            span = (p["s"], p["e"]) if p.get("time_base", base) == "timeline" else tl.map_span(p["s"], p["e"])
            if span:
                mapped.append({**p, "s": span[0], "e": span[1]})
        existing = {**existing, "popups": mapped}
    ar = plan["aroll"]
    # 16:9 frame in the middle: pop-ups go in the blurred band above it, never on the face
    top = 0.5 - st["canvas"]["w"] * 9 / 16 / st["canvas"]["h"] / 2 * ar.get("fg_scale", 1.0)
    contain_ys = [round(top / 2 + 0.04, 3), 0.80]
    cover_ys = [st["layout"]["card_y"], 0.36, 0.28, 0.58]

    def fit_at(t):
        for seg, (a, b, t0) in zip(ar["segments"], tl.segs):
            if t0 <= t < t0 + b - a:
                return seg.get("fit", ar.get("fit", "cover"))
        return ar.get("fit", "cover")

    for c in cards:
        place_cards([c], existing, st, contain_ys if fit_at(c["s"]) == "contain_blur" else cover_ys)

    def blocked(t):
        return any(c["s"] - 0.02 <= t < c["e"] for c in cards)

    events = []
    # footage that already carries captions gets pop-ups only, never a second caption layer
    skip_captions = (existing or {}).get("has_captions") or cap.get("mode") == "none"
    chunks = build_chunks(cap, st, tl, plan_dir) if cap and not skip_captions else []
    y = H * st["layout"]["caption_y"]
    mx = st["layout"]["caption_margin_x"]
    for ci, ch in enumerate(chunks):
        nxt = chunks[ci + 1][0]["s"] if ci + 1 < len(chunks) else tl.duration
        end = min(nxt, ch[-1]["e"] + cs["hold"]) if nxt - ch[-1]["e"] > 0.6 else nxt
        for i, w in enumerate(ch):
            s = w["s"] if i else ch[0]["s"]
            e = ch[i + 1]["s"] if i + 1 < len(ch) else end
            if e <= s or blocked(s):
                continue
            for c in cards:
                if s < c["s"] < e:
                    e = c["s"]
            text = ass_escape(" ".join(x["w"] for x in ch[: i + 1]))
            if s < cs["hook_cursor_secs"]:
                text += f"{{\\alpha&H30&}}{cs['cursor']}"
            pos = f"{{\\an5\\pos({W / 2:.0f},{y:.0f})\\q0}}"
            events.append(dialogue(s, e, "Caption", pos + text, 1, mx))

    for c in cards:
        events += card_events(c, st)

    T = st["motion"]["transition_dur"]
    for b in brolls:
        if b.get("credit"):
            x, yb = W - 40, H - 240
            if b.get("layout") == "split":
                ph = round(W * 9 / 16 / 2) * 2
                yb = (H - 2 * ph) / 2 + 2 * ph - 18
            events.append(dialogue(b["at"] + T, b["at"] + b["dur"] - T, "Credit",
                                   f"{{\\an3\\pos({x},{yb:.0f})\\fad(120,120)}}{ass_escape(b['credit'])}", 5))
    return ass_header(st) + "\n" + "\n".join(events) + "\n", chunks, cards


# ---------- watermark ----------

def make_watermark(st, path):
    W, H = st["canvas"]["w"], st["canvas"]["h"]
    L = st["layout"]
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    logo = Image.open(ASSETS / "logo-mark-circle.png").convert("RGBA")
    lp = L["watermark_logo_px"]
    logo = logo.resize((lp, lp), Image.LANCZOS)
    tp = L["watermark_text_px"]
    f_bold = ImageFont.truetype(str(FONTS / "Inter-ExtraBold.ttf"), tp)
    f_reg = ImageFont.truetype(str(FONTS / "Inter-SemiBold.ttf"), tp)
    w1 = f_bold.getlength("7summits")
    w2 = f_reg.getlength("camera")
    gap = 10
    total = lp + gap + w1 + w2
    x0 = (W - total) / 2
    yc = H * L["watermark_y"]
    d = ImageDraw.Draw(img)
    ty = yc - tp * 0.62
    for dx, dy, col in ((2, 2, (0, 0, 0, 90)), (0, 0, (255, 255, 255, 235))):
        d.text((x0 + lp + gap + dx, ty + dy), "7summits", font=f_bold, fill=col)
        d.text((x0 + lp + gap + w1 + dx, ty + dy), "camera", font=f_reg, fill=col)
    img.alpha_composite(logo, (int(x0), int(yc - lp / 2)))
    img.save(path)


# ---------- video building ----------

def enc_args(st, draft, audio=True):
    ex = st["export"]
    v = ["-c:v", "libx264", "-pix_fmt", "yuv420p",
         "-crf", "28" if draft else str(ex["crf"]),
         "-preset", "ultrafast" if draft else ex["preset"]]
    a = ["-c:a", "aac", "-b:a", ex["audio_bitrate"], "-ar", "48000", "-ac", "2"] if audio else ["-an"]
    return v + a


def cover(W, H):
    return f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1"


def render_aroll(plan, st, tmp, draft, plan_dir):
    W, H, fps = st["canvas"]["w"], st["canvas"]["h"], st["canvas"]["fps"]
    ar = plan["aroll"]
    src = plan_dir / ar["src"]
    levels = ar.get("auto_punch", st["motion"]["punch_levels"])
    focus_y = ar.get("focus_y", st["layout"]["aroll_focus_y"])
    audio = has_audio(src)
    files = []
    for i, seg in enumerate(ar["segments"]):
        fit = seg.get("fit", ar.get("fit", "cover"))  # per-segment override enables hybrid layouts
        z = seg.get("zoom", levels[i % len(levels)] if levels else 1.0)
        fy = seg.get("focus_y", focus_y)
        cx = seg.get("crop_x", ar.get("crop_x", 0.5))
        d = seg["out"] - seg["in"]
        if fit == "contain_blur":
            # 16:9 source kept whole (burned-in captions survive) over a blurred fill
            fw = int(W * ar.get("fg_scale", 1.0) * z) // 2 * 2
            fg_y = ar.get("fg_y", 0.5)
            fc = (f"[0:v]fps={fps},split[a][b];"
                  f"[a]{cover(W, H)},gblur=sigma=30,eq=brightness=-0.15[bg];"
                  f"[b]scale={fw}:-2,crop='min(iw,{W})':ih:(iw-ow)*{cx}:0,setsar=1[fg];"
                  f"[bg][fg]overlay=(W-w)/2:{H}*{fg_y}-h/2[v]")
        else:
            zw, zh = int(W * z) // 2 * 2, int(H * z) // 2 * 2
            fc = (f"[0:v]fps={fps},scale={W}:{H}:force_original_aspect_ratio=increase,"
                  f"crop={W}:{H}:(iw-ow)*{cx}:(ih-oh)/2,setsar=1,scale={zw}:{zh},"
                  f"crop={W}:{H}:(iw-ow)/2:(ih-oh)*{fy}[v]")
        out = tmp / f"aroll_{i:03d}.mp4"
        cmd = ["ffmpeg", "-y", "-v", "error", "-ss", str(seg["in"]), "-t", f"{d:.3f}", "-i", str(src)]
        if not audio:
            cmd += ["-f", "lavfi", "-t", f"{d:.3f}", "-i", "anullsrc=r=48000:cl=stereo"]
        cmd += ["-filter_complex", fc, "-map", "[v]", "-r", str(fps)]
        if audio:
            cmd += ["-map", "0:a", "-af",
                    f"afade=t=in:d=0.01,afade=t=out:st={max(0, d - 0.015):.3f}:d=0.015"]
        else:
            cmd += ["-map", "1:a"]
        cmd += enc_args(st, draft) + ["-t", f"{d:.3f}", str(out)]
        run(cmd)
        files.append(out)
    lst = tmp / "aroll.txt"
    lst.write_text("".join(f"file '{f.name}'\n" for f in files))
    base = tmp / "base.mp4"
    run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", lst.name,
         "-c", "copy", base.name], cwd=tmp)
    return base


def broll_input(spec, D, fps, plan_dir):
    p = plan_dir / spec["src"]
    if is_image(p):
        return ["-loop", "1", "-framerate", str(fps), "-t", f"{D:.3f}", "-i", str(p)]
    return ["-ss", str(spec.get("in", 0)), "-t", f"{D:.3f}", "-i", str(p)]


def look(spec):
    f = []
    if spec.get("bw"):
        f.append("hue=s=0,eq=contrast=1.12")
    if spec.get("speed"):
        f.append(f"setpts=PTS/{spec['speed']}")
    return f


def render_broll(b, i, st, tmp, draft, plan_dir):
    W, H, fps = st["canvas"]["w"], st["canvas"]["h"], st["canvas"]["fps"]
    m = st["motion"]
    D, T = b["dur"], m["transition_dur"]
    tin, tout = b.get("in_tr", "slideup"), b.get("out_tr", "slideup")
    layout = b.get("layout", "full")
    args, fc = [], []
    # sources play for D seconds at their own speed; speed>1 needs more source
    if layout == "split":
        top, bot = b["top"], b["bottom"]
        args += broll_input(top, D * top.get("speed", 1), fps, plan_dir)
        args += broll_input(bot, D * bot.get("speed", 1), fps, plan_dir)
        ph = round(W * 9 / 16 / 2) * 2
        y0 = (H - 2 * ph) // 2
        fc.append(f"[0:v]{','.join(['setpts=PTS-STARTPTS'] + look(top) + [f'fps={fps}'])},split[t0][t1]")
        fc.append(f"[t0]{cover(W, H)},gblur=sigma=40,eq=brightness=-0.12[bg]")
        fc.append(f"[t1]{cover(W, ph)}[tp]")
        fc.append(f"[1:v]{','.join(['setpts=PTS-STARTPTS'] + look(bot) + [f'fps={fps}', cover(W, ph)])}[bt]")
        fc.append(f"[bg][tp]overlay=0:{y0}[x0];[x0][bt]overlay=0:{y0 + ph}[raw]")
    else:
        args += broll_input(b, D * b.get("speed", 1), fps, plan_dir)
        fc.append(f"[0:v]{','.join(['setpts=PTS-STARTPTS'] + look(b) + [f'fps={fps}', cover(W, H)])}[raw]")

    # zoom: zoom-in entrance, zoom-through exit, optional slow push (ken burns)
    z = ["1"]
    if tin == "zoomblur":
        z.append(f"{m['zoom_in_amount']}*pow(max(0,1-t/{T}),3)")
    if tout == "zoomblack":
        z.append(f"{m['zoom_out_amount']}*pow(max(0,(t-{D - T})/{T}),3)")
    if b.get("kenburns"):
        z.append(f"{m['kenburns_amount']}*t/{D}")
    chain = [f"tpad=stop_mode=clone:stop_duration={D}", f"trim=duration={D}", "setpts=PTS-STARTPTS"]
    if len(z) > 1:
        zz = "+".join(z)
        chain += [f"scale=w='trunc({W}*({zz})/2)*2':h='trunc({H}*({zz})/2)*2':eval=frame",
                  f"crop={W}:{H}"]
    fc.append(f"[raw]{','.join(chain)}[zm]")

    # motion blur during transitions: blend with a blurred copy, weight K(T)
    k_in = {"slideup": f"max(0,1-T/{T})", "zoomblur": f"max(0,1-T/{T})"}.get(tin)
    k_out = {"slideup": f"max(0,(T-{D - T})/{T})", "zoomblack": f"max(0,(T-{D - T})/{T})"}.get(tout)
    ks = [k for k in (k_in, k_out) if k]
    if ks:
        K = ks[0] if len(ks) == 1 else f"max({ks[0]},{ks[1]})"
        vertical = "slideup" in (tin, tout) and not ({"zoomblur", "zoomblack"} & {tin, tout})
        blur = (f"gblur=sigma=2:sigmaV={m['slide_blur_v']}" if vertical
                else f"gblur=sigma={m['zoom_blur']}")
        fc.append(f"[zm]split[ba][bb];[bb]{blur}[bbl];[ba][bbl]blend=all_expr='A*(1-{K})+B*{K}'[bl]")
        last = "bl"
    else:
        last = "zm"
    fades = []
    if tin == "zoomblur":
        fades.append("fade=t=in:d=0.08")
    if tout == "zoomblack":
        fades.append(f"fade=t=out:st={D - 0.12:.3f}:d=0.12")
    fc.append(f"[{last}]{','.join(fades + ['format=yuv420p'])}[out]")
    out = tmp / f"broll_{i:02d}.mp4"
    run(["ffmpeg", "-y", "-v", "error", *args, "-filter_complex", ";".join(fc), "-map", "[out]",
         "-r", str(fps), "-t", f"{D:.3f}", *enc_args(st, draft, audio=False), str(out)])
    return out


def synth_sfx(tmp):
    """License-free fallback whoosh/pop generated with ffmpeg."""
    whoosh, pop = tmp / "whoosh.wav", tmp / "pop.wav"
    run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "anoisesrc=d=0.45:c=pink:a=0.8",
         "-af", "highpass=f=300,lowpass=f=6000,afade=t=in:d=0.25:curve=exp,"
                "afade=t=out:st=0.25:d=0.2,volume=1.5", "-ar", "48000", "-ac", "2", str(whoosh)])
    run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "sine=f=900:d=0.12",
         "-af", "asetrate=48000*1.0,afade=t=out:st=0.01:d=0.11:curve=exp,volume=0.8",
         "-ar", "48000", "-ac", "2", str(pop)])
    return whoosh, pop


def compose(plan, st, tmp, base, brolls, broll_files, ass_text, cards, out, draft, plan_dir):
    W, H, fps = st["canvas"]["w"], st["canvas"]["h"], st["canvas"]["fps"]
    T = st["motion"]["transition_dur"]
    au = st["audio"]
    (tmp / "captions.ass").write_text(ass_text, encoding="utf-8")
    fonts_link = tmp / "fonts"
    if not fonts_link.exists():
        shutil.copytree(FONTS, fonts_link)
    wm = tmp / "watermark.png"
    use_wm = plan.get("watermark", True)
    if use_wm:
        make_watermark(st, wm)

    sfx_cfg = plan.get("sfx", {})
    whoosh, pop = synth_sfx(tmp)
    if sfx_cfg.get("whoosh"):
        whoosh = plan_dir / sfx_cfg["whoosh"]
    if sfx_cfg.get("pop"):
        pop = plan_dir / sfx_cfg["pop"]
    hits = []
    if sfx_cfg.get("enabled", True):
        for b in brolls:
            if b.get("in_tr", "slideup") != "cut":
                hits.append((whoosh, max(0, b["at"] - 0.1), au["whoosh_volume"]))
            if b.get("out_tr", "slideup") != "cut":
                hits.append((whoosh, max(0, b["at"] + b["dur"] - T - 0.05), au["whoosh_volume"]))
        for c in cards:
            hits.append((pop, c["s"], au["pop_volume"]))

    inputs = ["-i", str(base)]
    idx = 1
    if use_wm:
        inputs += ["-i", str(wm)]
        wm_idx = idx
        idx += 1
    b_idx = []
    for f in broll_files:
        inputs += ["-i", str(f)]
        b_idx.append(idx)
        idx += 1
    s_idx = []
    for f, _, _ in hits:
        inputs += ["-i", str(f)]
        s_idx.append(idx)
        idx += 1

    fc = []
    cur = "0:v"
    if use_wm:
        fc.append(f"[0:v][{wm_idx}:v]overlay=0:0[w0]")
        cur = "w0"
    for n, (b, bi) in enumerate(zip(brolls, b_idx)):
        at, D = b["at"], b["dur"]
        y = ["0"]
        if b.get("in_tr", "slideup") == "slideup":
            y.append(f"{H}*pow(1-min(1,max(0,(t-{at})/{T})),3)")
        if b.get("out_tr", "slideup") == "slideup":
            y.append(f"-{H}*pow(max(0,(t-{at + D - T})/{T}),2)")
        fc.append(f"[{bi}:v]setpts=PTS-STARTPTS+{at}/TB[b{n}]")
        fc.append(f"[{cur}][b{n}]overlay=x=0:y='{'+'.join(y)}':eof_action=pass:"
                  f"enable='between(t,{at},{at + D})'[v{n}]")
        cur = f"v{n}"
    fc.append(f"[{cur}]subtitles=f=captions.ass:fontsdir=fonts,format=yuv420p[vout]")

    a_parts = ["[0:a]anull[a0]"]
    labels = ["[a0]"]
    for n, ((_, t, vol), si) in enumerate(zip(hits, s_idx)):
        ms = int(t * 1000)
        a_parts.append(f"[{si}:a]volume={vol},adelay={ms}|{ms}[s{n}]")
        labels.append(f"[s{n}]")
    a_parts.append(f"{''.join(labels)}amix=inputs={len(labels)}:normalize=0:duration=first,"
                   f"loudnorm=I={au['loudness_lufs']}:TP=-1:LRA=11[aout]")
    fc += a_parts
    run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", ";".join(fc),
         "-map", "[vout]", "-map", "[aout]", "-r", str(fps), *enc_args(st, draft),
         "-movflags", "+faststart", "-t", f"{_duration(base):.3f}", str(out)], cwd=tmp)


def _duration(path):
    return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                      "-of", "csv=p=0", str(path)]).strip())


# ---------- main ----------

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("plan")
    ap.add_argument("--draft", action="store_true", help="fast low-quality preview")
    ap.add_argument("--dry-run", action="store_true", help="print timeline only")
    ap.add_argument("--keep-temp", action="store_true")
    a = ap.parse_args()

    plan_path = Path(a.plan).resolve()
    plan_dir = plan_path.parent
    plan = json.loads(plan_path.read_text())
    st = json.loads((ASSETS / "style.json").read_text())
    if plan.get("canvas"):
        st["canvas"].update(plan["canvas"])

    tl = Timeline(plan["aroll"]["segments"])
    brolls = []
    for b in plan.get("broll", []):
        b = dict(b)
        if "at_src" in b:
            span = tl.map_span(b["at_src"], b["at_src"] + b["dur"])
            if not span:
                sys.exit(f"B-roll at_src {b['at_src']} falls in a removed part of the A-roll")
            b["at"] = span[0]
        b["dur"] = min(b["dur"], tl.duration - b["at"])
        brolls.append(b)
    ass_text, chunks, cards = build_ass(plan, st, tl, plan_dir, brolls)

    print(f"Timeline: {tl.duration:.2f}s, {len(tl.segs)} A-roll segments")
    for i, (s, e, t0) in enumerate(tl.segs):
        print(f"  seg {i:02d}  src {s:7.2f}-{e:7.2f}  ->  tl {t0:6.2f}-{t0 + e - s:6.2f}")
    for b in brolls:
        name = b.get("src") or f"{b['top']['src']} / {b['bottom']['src']}"
        print(f"  broll {b.get('layout', 'full'):5s} tl {b['at']:6.2f}-{b['at'] + b['dur']:6.2f}  "
              f"{b.get('in_tr', 'slideup')}/{b.get('out_tr', 'slideup')}  {name}")
    print(f"Captions: {len(chunks)} chunks")
    for ch in chunks:
        print(f"  {ch[0]['s']:6.2f}-{ch[-1]['e']:6.2f}  {' '.join(w['w'] for w in ch)}")
    for c in cards:
        print(f"  CARD {c['s']:6.2f}-{c['e']:6.2f}  {c.get('lead', '')} | {' / '.join(c['lines'])} [{c.get('hl', 'box')}]")
    if a.dry_run:
        return

    out = Path(plan.get("output", "output.mp4"))
    out = out if out.is_absolute() else plan_dir / out
    tmp = Path(tempfile.mkdtemp(prefix="7s_render_"))
    try:
        print("Rendering A-roll segments...")
        base = render_aroll(plan, st, tmp, a.draft, plan_dir)
        print("Rendering B-roll...")
        bfiles = [render_broll(b, i, st, tmp, a.draft, plan_dir) for i, b in enumerate(brolls)]
        print("Compositing captions, watermark, SFX, loudness...")
        compose(plan, st, tmp, base, brolls, bfiles, ass_text, cards, out, a.draft, plan_dir)
    finally:
        if a.keep_temp:
            print(f"Temp kept at {tmp}")
        else:
            shutil.rmtree(tmp, ignore_errors=True)
    print(f"Done: {out}")


if __name__ == "__main__":
    main()
