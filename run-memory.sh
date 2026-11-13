#!/usr/bin/env bash
# Hood Simulator 1.2.28: Auto Test in Node with no renderer, for the memory diagnosis.
# Usage: bash run-memory.sh [weeks]    (default 20 weeks, Full Game 40x32, seed 3064130186)
# Writes memory-report-<time>.txt (weekly heap after a forced GC, and the MEMPROBE line)
# and memory-report-<time>-autotest.txt (the Auto Test report).
set -euo pipefail
cd "$(dirname "$0")"

WEEKS="${1:-${WEEKS:-20}}"
SEED="${SEED:-3064130186}"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install Node.js 20 or newer from https://nodejs.org and run this again." >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js $(node -v) is too old. Install Node.js 20 or newer." >&2
  exit 1
fi
if [ ! -x node_modules/.bin/esbuild ]; then
  echo "Installing packages (first run only)..."
  npm install --no-audit --no-fund
fi

VERSION="$(node -p 'require("./package.json").version')"
mkdir -p .memrun
node_modules/.bin/esbuild scripts/memory-run.ts --bundle --platform=node --format=esm --target=node20 \
  --packages=external --log-level=warning --outfile=.memrun/memory-run.mjs \
  --define:__APP_VERSION__="\"$VERSION\"" \
  --define:import.meta.env='{"BASE_URL":"./","DEV":false,"PROD":true,"MODE":"production","SSR":true}'

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="memory-report-$STAMP.txt"
echo "Running $WEEKS weeks (seed $SEED). This takes a while; each week is printed as it finishes."
WEEKS="$WEEKS" SEED="$SEED" OUT="$OUT" node --expose-gc --max-old-space-size=8192 .memrun/memory-run.mjs
echo
echo "Done. Please upload these files:"
echo "  $OUT"
echo "  ${OUT%.txt}-autotest.txt"
