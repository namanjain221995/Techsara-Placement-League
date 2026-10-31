#!/usr/bin/env bash
# Reproducible media extraction for the client requirement video.
# The original video is never modified: every command only reads it.
#
# usage: tools/video-analysis/extract_media.sh "<path to game building auction.mp4>" <work_dir>
set -euo pipefail
VIDEO="$1"; OUT="${2:-work/video}"
mkdir -p "$OUT/meta" "$OUT/frames/full" "$OUT/sheets"

# 1. Metadata + integrity fingerprint
ffprobe -v error -show_format -show_streams -of json "$VIDEO" > "$OUT/meta/ffprobe.json"
sha256sum "$VIDEO" > "$OUT/meta/video.sha256"

# 2. Audio for ASR: full timeline, mono, 16 kHz (Whisper's native rate), lossless FLAC + WAV
ffmpeg -v error -y -i "$VIDEO" -vn -ac 1 -ar 16000 -c:a flac "$OUT/audio16k.flac"
ffmpeg -v error -y -i "$OUT/audio16k.flac" -c:a pcm_s16le "$OUT/audio16k.wav"

# 3. Scene-change timestamps (sampled at 4 fps, 640 px, threshold 0.012)
ffmpeg -hide_banner -v info -i "$VIDEO" -an \
  -vf "fps=4,scale=640:-1,select='gt(scene,0.012)',showinfo" -f null - 2>&1 \
  | grep -oE "pts_time:[0-9.]+" | cut -d: -f2 > "$OUT/meta/scene_times.txt"

# 4. Full-resolution frame every 2 s (frame N is at t = 2*(N-1) seconds)
ffmpeg -hide_banner -v error -i "$VIDEO" -an -vf "fps=1/2:round=down" -q:v 3 "$OUT/frames/full/f_%04d.jpg"

# 5. Timestamped 3x3 contact sheets, one frame every 3 s (27 s per sheet)
FONT=$(fc-list : file | grep -iE "DejaVuSans-Bold.ttf|LiberationSans-Bold.ttf" | head -1 | cut -d: -f1)
ffmpeg -hide_banner -v error -i "$VIDEO" -an \
  -vf "fps=1/3:round=down,scale=640:-2,drawtext=fontfile=$FONT:text='%{pts\:hms}':x=8:y=8:fontsize=22:fontcolor=yellow:box=1:boxcolor=black@0.7:boxborderw=4,tile=3x3:padding=4:color=white" \
  -q:v 3 "$OUT/sheets/sheet_%02d.jpg"

echo "done: $(ls "$OUT/frames/full" | wc -l) frames, $(ls "$OUT/sheets" | wc -l) sheets"
