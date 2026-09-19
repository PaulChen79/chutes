#!/usr/bin/env bash
# Builds a throwaway repository for recording the README demo.
#
# It uses the committed fixture codebase and the recorded Judge answers, so the
# demo runs offline, costs nothing and produces the same output every time.
#
#   ./scripts/demo-repo.sh            # builds it, prints the path
#   cd "$(./scripts/demo-repo.sh)"    # builds it and drops you in
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dest="${1:-${TMPDIR:-/tmp}/chutes-demo}"

rm -rf "$dest"
mkdir -p "$dest/.chutes/fixture"
cp -R "$here/fixtures/repo/." "$dest/"
cp "$here/fixtures/migration.yml" "$dest/.chutes/fixture/migration.yml"
cp "$here/fixtures/replay.json" "$dest/.chutes/replay.json"

echo "$dest"
