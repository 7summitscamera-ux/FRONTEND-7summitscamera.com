#!/usr/bin/env bash
# Analyze footage before editing: metadata, cut list, contact sheet, sample frames.
# Usage: analyze.sh <video> [out_dir] [sheet_interval_sec]
set -euo pipefail
IN="$1"
OUT="${2:-./analysis}"
STEP="${3:-}"
mkdir -p "$OUT"

DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN")
[ -z "$STEP" ] && STEP=$(python3 -c "print(max(0.5, round($DUR/60, 2)))")

echo "== Metadata"
ffprobe -v error -show_entries format=duration:stream=codec_type,codec_name,width,height,r_frame_rate \
  -of compact "$IN" | tee "$OUT/meta.txt"

echo "== Scene cuts (score > 0.3)"
ffmpeg -i "$IN" -an -vf "select='gt(scene,0.3)',metadata=print" -f null - 2>&1 \
  | grep -o 'pts_time:[0-9.]*' | cut -d: -f2 | tee "$OUT/cuts.txt" | tr '\n' ' '
echo

echo "== Loudness"
ffmpeg -i "$IN" -vn -af ebur128 -f null - 2>&1 | grep -E '^\s+(I|LRA):' | tail -2

echo "== Contact sheet (1 frame / ${STEP}s, 10 per row)"
ffmpeg -v error -y -i "$IN" -vf "fps=1/$STEP,scale=192:-1,tile=10x6" -frames:v 1 "$OUT/sheet.jpg"

echo "== Sample frames (full res) at 10/30/50/70/90%"
for p in 10 30 50 70 90; do
  T=$(python3 -c "print(round($DUR*$p/100, 2))")
  ffmpeg -v error -y -ss "$T" -i "$IN" -frames:v 1 "$OUT/frame_${p}pct_${T}s.jpg"
done
echo "Saved to $OUT. Look at sheet.jpg and the frames for burned-in captions, pop-ups, logos, face position."
