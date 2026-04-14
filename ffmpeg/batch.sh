#!/usr/bin/env bash
set -euo pipefail

# batch.sh — Process a video into platform-specific format variants.
# Usage: ./ffmpeg/batch.sh input.mp4 output_dir/

usage() {
    cat <<'USAGE'
Usage: batch.sh INPUT OUTPUT_DIR

Processes a video into 3 platform-specific variants:

  youtube-16x9.mp4  — 1920x1080, h264/aac, padded to fit aspect ratio
  reels-9x16.mp4    — 1080x1920, h264/aac, center-cropped
  linkedin-1x1.mp4  — 1080x1080, h264/aac, center-cropped

All outputs use h264 video, aac audio, -preset fast, -crf 23.

Arguments:
  INPUT       Source video file (required)
  OUTPUT_DIR  Directory to write output files (required, created if missing)

Options:
  -h, --help  Show this help message

Examples:
  batch.sh recording.mp4 ./exports/
  batch.sh raw.mov /tmp/social-cuts/
USAGE
    exit 0
}

# Show usage if no args or help requested
if [[ $# -eq 0 ]] || [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]]; then
    usage
fi

if [[ $# -lt 2 ]]; then
    echo "Error: INPUT and OUTPUT_DIR are required." >&2
    usage
fi

INPUT="$1"
OUTPUT_DIR="$2"

# Validate input
if [[ ! -f "$INPUT" ]]; then
    echo "Error: Input file '$INPUT' does not exist." >&2
    exit 1
fi

# Create output directory if needed
mkdir -p "$OUTPUT_DIR"

echo "Processing '$INPUT' into platform variants"
echo "  Output directory: $OUTPUT_DIR"
echo ""

# --- YouTube 16:9 (1920x1080) ---
# Scale to fit within 1920x1080, pad with black bars if aspect ratio differs
YOUTUBE_OUT="$OUTPUT_DIR/youtube-16x9.mp4"
echo "[1/3] YouTube 16:9 (1920x1080) — padded to fit"
ffmpeg -y -i "$INPUT" \
    -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black" \
    -c:v libx264 -preset fast -crf 23 \
    -c:a aac -b:a 128k \
    -movflags +faststart \
    "$YOUTUBE_OUT"
echo "  -> $YOUTUBE_OUT"
echo ""

# --- Reels 9:16 (1080x1920) ---
# Center-crop from source to 9:16 aspect ratio, then scale to 1080x1920
REELS_OUT="$OUTPUT_DIR/reels-9x16.mp4"
echo "[2/3] Reels 9:16 (1080x1920) — center-cropped"
ffmpeg -y -i "$INPUT" \
    -vf "crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920" \
    -c:v libx264 -preset fast -crf 23 \
    -c:a aac -b:a 128k \
    -movflags +faststart \
    "$REELS_OUT"
echo "  -> $REELS_OUT"
echo ""

# --- LinkedIn 1:1 (1080x1080) ---
# Center-crop to square from source, then scale to 1080x1080
LINKEDIN_OUT="$OUTPUT_DIR/linkedin-1x1.mp4"
echo "[3/3] LinkedIn 1:1 (1080x1080) — center-cropped"
ffmpeg -y -i "$INPUT" \
    -vf "crop=min(iw\,ih):min(iw\,ih):(iw-min(iw\,ih))/2:(ih-min(iw\,ih))/2,scale=1080:1080" \
    -c:v libx264 -preset fast -crf 23 \
    -c:a aac -b:a 128k \
    -movflags +faststart \
    "$LINKEDIN_OUT"
echo "  -> $LINKEDIN_OUT"
echo ""

echo "Done. Created 3 variants in $OUTPUT_DIR:"
echo "  - youtube-16x9.mp4  (1920x1080)"
echo "  - reels-9x16.mp4    (1080x1920)"
echo "  - linkedin-1x1.mp4  (1080x1080)"
