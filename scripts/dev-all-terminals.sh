#!/usr/bin/env bash
# Opens three Terminal windows, each running a dev server:
#   1. pnpm backend:dev
#   2. pnpm dev
#   3. pnpm dev:desktop
#
# Usage: ./scripts/dev-all-terminals.sh
# Or: pnpm dev:terminals

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "This script uses macOS Terminal.app. On other platforms, consider: pnpm run dev:all"
  exit 1
fi

osascript -e "tell application \"Terminal\" to do script \"cd '$ROOT_DIR' && pnpm backend:dev\""
osascript -e "tell application \"Terminal\" to do script \"cd '$ROOT_DIR' && pnpm dev\""
osascript -e "tell application \"Terminal\" to do script \"cd '$ROOT_DIR' && pnpm dev:desktop\""

echo "Opened 3 terminals: backend, web, desktop"
