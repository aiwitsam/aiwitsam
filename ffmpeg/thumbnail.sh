#!/usr/bin/env bash
set -euo pipefail

# thumbnail.sh — Extract a frame from video and overlay text for social thumbnails.
# Usage: ./ffmpeg/thumbnail.sh input.mp4 output.png [TIMESTAMP] [--text "Title"] [--font-size 72]

usage() {
    cat <<'USAGE'
Usage: thumbnail.sh INPUT OUTPUT [TIMESTAMP] [--text "Title Text"] [--font-size SIZE]

Extracts a frame from a video and optionally overlays centered text with a
semi-transparent dark background bar. Output is scaled to 1920x1080.

Arguments:
  INPUT           Source video file (required)
  OUTPUT          Output image path, e.g. thumb.png (required)
  TIMESTAMP       Frame time, e.g. 00:00:05 or 5 (default: 00:00:05)

Options:
  --text TEXT     Overlay this text centered on the thumbnail
  --font-size N   Font size for overlay text (default: 72)
  -h, --help      Show this help message

Examples:
  thumbnail.sh video.mp4 thumb.png
  thumbnail.sh video.mp4 thumb.png 00:00:30 --text "Episode 1: Getting Started"
  thumbnail.sh video.mp4 thumb.png 15 --text "Big Reveal" --font-size 96
USAGE
    exit 0
}

# Show usage if no args or help requested
if [[ $# -eq 0 ]] || [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]]; then
    usage
fi

if [[ $# -lt 2 ]]; then
    echo "Error: INPUT and OUTPUT are required." >&2
    usage
fi

INPUT="$1"
OUTPUT="$2"
shift 2

TIMESTAMP="00:00:05"
TEXT=""
FONT_SIZE="72"

# Parse remaining args
while [[ $# -gt 0 ]]; do
    case "$1" in
        --text)
            [[ $# -lt 2 ]] && { echo "Error: --text requires a value." >&2; exit 1; }
            TEXT="$2"
            shift 2
            ;;
        --font-size)
            [[ $# -lt 2 ]] && { echo "Error: --font-size requires a value." >&2; exit 1; }
            FONT_SIZE="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            TIMESTAMP="$1"
            shift
            ;;
    esac
done

# Validate input
if [[ ! -f "$INPUT" ]]; then
    echo "Error: Input file '$INPUT' does not exist." >&2
    exit 1
fi

# Determine font path
FONT_PATH="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
if [[ ! -f "$FONT_PATH" ]]; then
    echo "Warning: DejaVu font not found at $FONT_PATH, using ffmpeg default font."
    FONT_PATH=""
fi

echo "Extracting thumbnail from '$INPUT' at $TIMESTAMP"
echo "  Output: $OUTPUT (1920x1080)"

if [[ -z "$TEXT" ]]; then
    # No text overlay — just extract and scale the frame
    ffmpeg -y -ss "$TIMESTAMP" -i "$INPUT" \
        -vframes 1 \
        -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black" \
        "$OUTPUT"
else
    echo "  Text: \"$TEXT\" (size: $FONT_SIZE)"

    # Build the drawtext filter
    # Semi-transparent dark bar behind text, then white text on top
    FONT_SPEC=""
    if [[ -n "$FONT_PATH" ]]; then
        FONT_SPEC="fontfile=$FONT_PATH:"
    fi

    # Bar height is font_size * 2 to give padding
    BAR_HEIGHT=$(( FONT_SIZE * 2 ))
    BAR_Y="(h-$BAR_HEIGHT)/2"
    TEXT_Y="(h-text_h)/2"

    FILTER="scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black"
    FILTER+=",drawbox=x=0:y=$BAR_Y:w=iw:h=$BAR_HEIGHT:color=black@0.6:t=fill"
    FILTER+=",drawtext=${FONT_SPEC}text='${TEXT//\'/\\\'}':fontsize=$FONT_SIZE:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=$TEXT_Y"

    ffmpeg -y -ss "$TIMESTAMP" -i "$INPUT" \
        -vframes 1 \
        -vf "$FILTER" \
        "$OUTPUT"
fi

echo "Done: $OUTPUT"
