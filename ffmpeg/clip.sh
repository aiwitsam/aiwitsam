#!/usr/bin/env bash
set -euo pipefail

# clip.sh — Trim a raw video recording to a clip with optional intro/outro bumpers.
# Usage: ./ffmpeg/clip.sh input.mp4 output.mp4 [START] [END] [--intro intro.mp4] [--outro outro.mp4]

usage() {
    cat <<'USAGE'
Usage: clip.sh INPUT OUTPUT [START] [END] [--intro INTRO.mp4] [--outro OUTRO.mp4]

Trims a video from START to END, optionally prepending an intro and/or appending an outro.

Arguments:
  INPUT           Source video file (required)
  OUTPUT          Output file path (required)
  START           Start timestamp, e.g. 00:00:30 or 30 (default: beginning)
  END             End timestamp, e.g. 00:01:00 or 60 (default: end of file)

Options:
  --intro FILE    Prepend this video before the trimmed clip
  --outro FILE    Append this video after the trimmed clip
  -h, --help      Show this help message

Examples:
  clip.sh raw.mp4 trimmed.mp4 00:00:10 00:01:30
  clip.sh raw.mp4 final.mp4 10 90 --intro bumper.mp4 --outro endcard.mp4
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

START=""
END=""
INTRO=""
OUTRO=""

# Parse positional START/END and named options
while [[ $# -gt 0 ]]; do
    case "$1" in
        --intro)
            [[ $# -lt 2 ]] && { echo "Error: --intro requires a file argument." >&2; exit 1; }
            INTRO="$2"
            shift 2
            ;;
        --outro)
            [[ $# -lt 2 ]] && { echo "Error: --outro requires a file argument." >&2; exit 1; }
            OUTRO="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            # First non-option positional is START, second is END
            if [[ -z "$START" ]]; then
                START="$1"
            elif [[ -z "$END" ]]; then
                END="$1"
            else
                echo "Error: Unexpected argument '$1'." >&2
                exit 1
            fi
            shift
            ;;
    esac
done

# Validate inputs
if [[ ! -f "$INPUT" ]]; then
    echo "Error: Input file '$INPUT' does not exist." >&2
    exit 1
fi

if [[ -n "$INTRO" ]] && [[ ! -f "$INTRO" ]]; then
    echo "Error: Intro file '$INTRO' does not exist." >&2
    exit 1
fi

if [[ -n "$OUTRO" ]] && [[ ! -f "$OUTRO" ]]; then
    echo "Error: Outro file '$OUTRO' does not exist." >&2
    exit 1
fi

# Build ffmpeg trim args
TRIM_ARGS=()
if [[ -n "$START" ]]; then
    TRIM_ARGS+=(-ss "$START")
fi
if [[ -n "$END" ]]; then
    TRIM_ARGS+=(-to "$END")
fi

# If no intro or outro, just trim directly
if [[ -z "$INTRO" ]] && [[ -z "$OUTRO" ]]; then
    echo "Trimming '$INPUT' -> '$OUTPUT'"
    [[ -n "$START" ]] && echo "  Start: $START"
    [[ -n "$END" ]] && echo "  End:   $END"

    ffmpeg -y "${TRIM_ARGS[@]}" -i "$INPUT" -c copy "$OUTPUT"
    echo "Done: $OUTPUT"
    exit 0
fi

# With intro/outro we need the concat demuxer
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

TRIMMED="$TMPDIR/trimmed.mp4"
CONCAT_LIST="$TMPDIR/concat.txt"

# Step 1: Trim the main clip (re-encode to ensure consistent format for concat)
echo "Trimming clip..."
[[ -n "$START" ]] && echo "  Start: $START"
[[ -n "$END" ]] && echo "  End:   $END"

ffmpeg -y "${TRIM_ARGS[@]}" -i "$INPUT" \
    -c:v libx264 -preset fast -crf 18 \
    -c:a aac -b:a 192k \
    "$TRIMMED"

# Step 2: Build the concat list
echo "Building concat list..."
: > "$CONCAT_LIST"
if [[ -n "$INTRO" ]]; then
    echo "file '$(realpath "$INTRO")'" >> "$CONCAT_LIST"
    echo "  + intro: $INTRO"
fi
echo "file '$TRIMMED'" >> "$CONCAT_LIST"
if [[ -n "$OUTRO" ]]; then
    echo "file '$(realpath "$OUTRO")'" >> "$CONCAT_LIST"
    echo "  + outro: $OUTRO"
fi

# Step 3: Concatenate
echo "Concatenating segments..."
ffmpeg -y -f concat -safe 0 -i "$CONCAT_LIST" -c copy "$OUTPUT"

echo "Done: $OUTPUT"
