#!/usr/bin/env bash
###############################################################################
# full-setup.sh — Run the complete GHL setup sequence
#
# Executes Day 1 revenue capture setup in order:
#   1. GHL config fixes (timezone, website, social URLs)
#   2. Consulting pipeline creation
#   3. Site patch snippet generation
#
# Prerequisites:
#   - npm install completed
#   - .env configured with real credentials
#   - Playwright Chromium installed (npx playwright install chromium)
#
# Usage: ./scripts/full-setup.sh [--headed]
###############################################################################
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

HEADED_FLAG=""
if [[ "${1:-}" == "--headed" ]]; then
  HEADED_FLAG="-- --headed"
fi

echo "============================================================"
echo "  GHL Full Setup — Day 1 Revenue Capture"
echo "  $(date -u '+%Y-%m-%d %H:%M UTC')"
echo "============================================================"

# Check prerequisites
if [[ ! -f ".env" ]]; then
  echo "ERROR: .env not found. Run: cp .env.example .env && edit with real values" >&2
  exit 1
fi

if [[ ! -d "node_modules" ]]; then
  echo "ERROR: Dependencies not installed. Run: npm install" >&2
  exit 1
fi

echo ""
echo "--- Step 1/3: GHL Configuration Fixes ---"
echo "  (timezone, website URL, social profiles)"
npx tsx playwright/setup/ghl-config.ts $HEADED_FLAG
echo ""

echo "--- Step 2/3: Consulting Pipeline Setup ---"
echo "  (pipeline stages, missed-call text-back)"
npx tsx playwright/setup/ghl-pipeline.ts $HEADED_FLAG
echo ""

echo "--- Step 3/3: Site Patch Snippets ---"
echo "  (chat widget, tracking pixel, calendar, copyright)"
bash scripts/site-patch.sh
echo ""

echo "============================================================"
echo "  Setup Complete!"
echo ""
echo "  Next steps:"
echo "    1. Review screenshots in monitoring/"
echo "    2. Apply site patches to worldclassdigital.com"
echo "    3. Connect social accounts: npm run ghl:social-connect"
echo "    4. Test chat widget on live site"
echo "============================================================"
