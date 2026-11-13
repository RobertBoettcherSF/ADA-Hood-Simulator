#!/usr/bin/env bash
# Hood Simulator: install (if needed), typecheck, the test suite and a short headless Auto Test.
# Usage: bash run-tests.sh     Writes tests-report.txt.
set -uo pipefail
cd "$(dirname "$0")"

REPORT="tests-report.txt"
AUTOTEST_WEEKS="${AUTOTEST_WEEKS:-3}"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install Node.js 20 or newer from https://nodejs.org and run this again." >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js $(node -v) is too old. Install Node.js 20 or newer." >&2
  exit 1
fi

{
  echo "Hood Simulator $(node -p 'require("./package.json").version') test report"
  echo "Date: $(date)"
  echo "Node: $(node -v)   npm: $(npm -v)   System: $(uname -srm 2>/dev/null || echo unknown)"
  echo
} > "$REPORT"

if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  echo "Installing packages..."
  { echo "== npm install"; npm install --no-audit --no-fund 2>&1; echo "exit $?"; echo; } >> "$REPORT"
fi

if [ ! -f public/asset-manifest.json ]; then
  echo "Note: no art in public/ (run bash fetch-assets.sh first). Tests that check the art files will fail without it."
  echo "Note: no art in public/ — tests that check the art files need bash fetch-assets.sh first." >> "$REPORT"
  echo >> "$REPORT"
fi

echo "Typecheck..."
{ echo "== typecheck"; npm run --silent typecheck 2>&1; echo "exit $?"; echo; } >> "$REPORT"

echo "Test suite (this can take several minutes)..."
{ echo "== test suite"; npx --no-install vitest run 2>&1; echo "exit $?"; echo; } >> "$REPORT"

echo "Short headless Auto Test ($AUTOTEST_WEEKS weeks)..."
{
  echo "== headless Auto Test, $AUTOTEST_WEEKS weeks"
  bash run-memory.sh "$AUTOTEST_WEEKS" 2>&1
  echo "exit $?"
  echo
} >> "$REPORT"

echo "Done. Please upload $REPORT (and the memory-report-*.txt files it names)."
