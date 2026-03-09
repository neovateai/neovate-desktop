#!/usr/bin/env bash
# speed-video.sh <input> [speed] [output]
#
# Speed up a screen recording with ffmpeg.
# Defaults: 5x speed, output alongside input with "-5x.mp4" suffix.
#
# Usage:
#   bash speed-video.sh /tmp/test-auto-update.mov
#   bash speed-video.sh /tmp/test-auto-update.mov 2
#   bash speed-video.sh /tmp/test-auto-update.mov 5 /tmp/demo.mp4

INPUT="${1:?Usage: speed-video.sh <input> [speed] [output]}"
SPEED="${2:-5}"
OUTPUT="${3:-${INPUT%.*}-${SPEED}x.mp4}"

# Build atempo filter chain (max 2.0 per filter)
remaining=$SPEED
atempo_chain=""
while (( $(echo "$remaining > 2" | bc -l) )); do
  atempo_chain="${atempo_chain}atempo=2.0,"
  remaining=$(echo "scale=4; $remaining / 2" | bc)
done
atempo_chain="${atempo_chain}atempo=${remaining}"

pts=$(echo "scale=6; 1 / $SPEED" | bc)

echo "Speeding up ${INPUT} by ${SPEED}x → ${OUTPUT}"
ffmpeg -i "$INPUT" \
  -vf "setpts=${pts}*PTS" \
  -af "$atempo_chain" \
  -c:v libx264 -preset fast -crf 22 \
  "$OUTPUT" -y

echo "Done: $OUTPUT"
open "$OUTPUT"
