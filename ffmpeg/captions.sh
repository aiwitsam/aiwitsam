#!/usr/bin/env bash
set -euo pipefail

# captions.sh — Burn subtitles into video using ffmpeg's subtitles filter (libass).
# Usage: ./ffmpeg/captions.sh input.mp4 subtitles.srt output.mp4 [--style "FontSize=24,..."]

usage() {
    cat <<'USAGE'
Usage: captions.sh INPUT SUBTITLES OUTPUT [--style "ASS_STYLE_STRING"]

Burns .srt subtitles into a video using ffmpeg's subtitles filter (libass).

Arguments:
  INPUT       Source video file (required)
  SUBTITLES   Subtitle file in .srt format (required)
  OUTPUT      Output video file path (required)

Options:
  --style STR   ASS subtitle style override string
                Default: "FontSize=24,PrimaryColour=&HFFFFFF&,OutlineColour=&H40000000&,BorderStyle=3,Outline=2"
                (white text, size 24, dark outline)
  -h, --help    Show this help message

Examples:
  captions.sh video.mp4 subs.srt captioned.mp4
  captions.sh video.mp4 subs.srt captioned.mp4 --style "FontSize=32,PrimaryColour=&H00FFFF&"
USAGE
    exit 0
}

# Show usage if no args or help requested
if [[ $# -eq 0 ]] || [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]]; then
    usage
fi

if [[ $# -lt 3 ]]; then
    echo "Error: INPUT, SUBTITLES, and OUTPUT are required." >&2
    usage
fi

INPUT="$1"
SUBTITLES="$2"
OUTPUT="$3"
shift 3

# Default style: white text, size 24, dark outline for readability
STYLE="FontSize=24,PrimaryColour=&HFFFFFF&,OutlineColour=&H40000000&,BorderStyle=3,Outline=2"

# Parse optional args
while [[ $# -gt 0 ]]; do
    case "$1" in
        --style)
            [[ $# -lt 2 ]] && { echo "Error: --style requires a value." >&2; exit 1; }
            STYLE="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo "Error: Unexpected argument '$1'." >&2
            exit 1
            ;;
    esac
done

# Validate inputs
if [[ ! -f "$INPUT" ]]; then
    echo "Error: Input video '$INPUT' does not exist." >&2
    exit 1
fi

if [[ ! -f "$SUBTITLES" ]]; then
    echo "Error: Subtitle file '$SUBTITLES' does not exist." >&2
    exit 1
fi

echo "Burning subtitles into video"
echo "  Input:     $INPUT"
echo "  Subtitles: $SUBTITLES"
echo "  Output:    $OUTPUT"
echo "  Style:     $STYLE"

# The subtitles filter needs the path escaped for ffmpeg filter syntax.
# Colons, backslashes, and single quotes in the path must be escaped.
ESCAPED_SUBS="$(printf '%s' "$SUBTITLES" | sed "s/\\\\/\\\\\\\\\\\\\\\\/g; s/:/\\\\\\\\:/g; s/'/\\\\\\\\'/g")"

ffmpeg -y -i "$INPUT" \
    -vf "subtitles=${ESCAPED_SUBS}:force_style='${STYLE}'" \
    -c:v libx264 -preset fast -crf 18 \
    -c:a copy \
    "$OUTPUT"

echo "Done: $OUTPUT"
