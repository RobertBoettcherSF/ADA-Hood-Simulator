#!/usr/bin/env bash
# Hood Simulator: put the art back. Copies the asset repository's art/, audio/
# and asset-manifest.json into public/ (and into play/, the built copy), then
# checks every file by count and SHA-256 checksum.
#
#   bash fetch-assets.sh                 clone RobertBoettcherSF/ADA-Hood-Simulator-Assets (private:
#                                        needs a GitHub login with access, via `gh auth login` or git)
#   ASSETS_DIR=/path/to/assets bash fetch-assets.sh
#                                        use a folder you already have (a clone or an unpacked download)
#   ASSET_REPO=<git url> bash fetch-assets.sh
#                                        clone from another address
set -euo pipefail
cd "$(dirname "$0")"

ASSET_REPO="${ASSET_REPO:-https://github.com/RobertBoettcherSF/ADA-Hood-Simulator-Assets.git}"
SRC="${ASSETS_DIR:-}"

if [ -z "$SRC" ]; then
  SRC=".assets"
  if [ -d "$SRC/.git" ]; then
    echo "Updating $SRC ..."
    git -C "$SRC" pull --ff-only
  else
    rm -rf "$SRC"
    echo "Cloning $ASSET_REPO (about 320 MB) ..."
    if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1 && [[ "$ASSET_REPO" == https://github.com/* ]]; then
      repo="${ASSET_REPO#https://github.com/}"; repo="${repo%.git}"
      gh repo clone "$repo" "$SRC" -- --depth 1
    else
      git clone --depth 1 "$ASSET_REPO" "$SRC"
    fi
  fi
fi

for need in art audio asset-manifest.json; do
  if [ ! -e "$SRC/$need" ]; then echo "$SRC has no $need — is it the asset repository?" >&2; exit 1; fi
done

if command -v sha256sum >/dev/null 2>&1; then SHA="sha256sum"; else SHA="shasum -a 256"; fi
list() { (cd "$1" && find art audio asset-manifest.json -type f | LC_ALL=C sort | while IFS= read -r f; do $SHA "$f"; done); }

targets=(public)
[ -f play/index.html ] && targets+=(play)
expected="$(list "$SRC")"
count="$(printf '%s\n' "$expected" | wc -l | tr -d ' ')"
status=0
for t in "${targets[@]}"; do
  echo "Copying $count files into $t/ ..."
  mkdir -p "$t"
  rm -rf "$t/art" "$t/audio"
  cp -R "$SRC/art" "$SRC/audio" "$SRC/asset-manifest.json" "$t/"
  if [ "$(list "$t")" = "$expected" ]; then
    echo "  $t/: $count files, every SHA-256 checksum matches the asset repository."
  else
    echo "  $t/: MISMATCH — the copy differs from the asset repository." >&2
    status=1
  fi
done
[ "$status" = 0 ] && echo "Done. The game now uses the real art (rebuild with: npm run play:build)."
exit "$status"
