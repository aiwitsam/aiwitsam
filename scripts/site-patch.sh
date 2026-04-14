#!/usr/bin/env bash
###############################################################################
# site-patch.sh — Generate HTML snippets for embedding GHL components into
# worldclassdigital.com. This script is INFORMATIONAL ONLY: it prints
# ready-to-paste snippets but does NOT modify any files in the WCD repo.
#
# Usage:  ./scripts/site-patch.sh
# Prereq: cp .env.example .env && fill in real values
###############################################################################
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env"

# ── Load .env ────────────────────────────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: .env not found at ${ENV_FILE}" >&2
  echo "" >&2
  echo "Copy the example and fill in your values:" >&2
  echo "  cp ${REPO_ROOT}/.env.example ${ENV_FILE}" >&2
  echo "  \$EDITOR ${ENV_FILE}" >&2
  exit 1
fi

# shellcheck source=/dev/null
source "$ENV_FILE"

# ── Validate required vars ───────────────────────────────────────────────────
missing=()
[[ -z "${GHL_CHAT_WIDGET_ID:-}" ]]       && missing+=("GHL_CHAT_WIDGET_ID")
[[ -z "${GHL_TRACKING_LOCATION_ID:-}" ]] && missing+=("GHL_TRACKING_LOCATION_ID")
[[ -z "${GHL_CALENDAR_EMBED_URL:-}" ]]   && missing+=("GHL_CALENDAR_EMBED_URL")

# Also catch placeholder values left from .env.example
for var in GHL_CHAT_WIDGET_ID GHL_CALENDAR_EMBED_URL; do
  val="${!var:-}"
  if [[ "$val" == "change-me" || "$val" == *"change-me"* ]]; then
    missing+=("${var} (still set to placeholder)")
  fi
done

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "ERROR: The following required variables are missing or unset in ${ENV_FILE}:" >&2
  for v in "${missing[@]}"; do
    echo "  - ${v}" >&2
  done
  echo "" >&2
  echo "Open ${ENV_FILE} and set them before re-running." >&2
  exit 1
fi

# ── Output snippets ──────────────────────────────────────────────────────────
cat <<SNIPPETS
================================================================================
  GHL SITE PATCHES FOR worldclassdigital.com
  Generated: $(date -u '+%Y-%m-%d %H:%M UTC')
================================================================================

────────────────────────────────────────────────────────────────────────────────
1. GHL CHAT WIDGET
   Paste inside <body>, just before </body>, on ALL pages.
────────────────────────────────────────────────────────────────────────────────

<script
  src="https://widgets.leadconnectorhq.com/loader.js"
  data-resources-url="https://widgets.leadconnectorhq.com/chat-widget/loader.js"
  data-widget-id="${GHL_CHAT_WIDGET_ID}">
</script>

────────────────────────────────────────────────────────────────────────────────
2. GHL TRACKING PIXEL
   Paste inside <head> on ALL pages (one line).
────────────────────────────────────────────────────────────────────────────────

<script src="https://tracking.leadconnectorhq.com/tracking.js" data-location-id="${GHL_TRACKING_LOCATION_ID}"></script>

────────────────────────────────────────────────────────────────────────────────
3. GHL BOOKING CALENDAR (replaces Calendly)
   Replace any existing Calendly <iframe> or embed div with this snippet.
────────────────────────────────────────────────────────────────────────────────

<iframe
  src="${GHL_CALENDAR_EMBED_URL}"
  style="width:100%;border:none;overflow:hidden;"
  scrolling="no"
  id="ghl-calendar">
</iframe>

────────────────────────────────────────────────────────────────────────────────
4. COPYRIGHT YEAR FIX
   Run this sed command inside the worldclassdigital.com repo to update
   the copyright year from 2025 to 2026 across all HTML files:
────────────────────────────────────────────────────────────────────────────────

find ~/worldclassdigital.com -name '*.html' -exec sed -i 's/© 2025/© 2026/g' {} +

────────────────────────────────────────────────────────────────────────────────
5. SOCIAL LINK FIXES
   Update the LinkedIn placeholder href from "#" to the real profile URL.
   In every HTML file that contains a LinkedIn icon/link, change:

     href="#"  (on the LinkedIn <a> tag)
   to:
     href="https://linkedin.com/in/samuelmargolis"

   Tip: search for the LinkedIn link in your templates:
     grep -rn 'linkedin' ~/worldclassdigital.com/
   then update each match.
────────────────────────────────────────────────────────────────────────────────

================================================================================
  DONE — Paste the snippets above into the appropriate locations.
  Remember: this script does NOT modify worldclassdigital.com directly.
================================================================================
SNIPPETS
