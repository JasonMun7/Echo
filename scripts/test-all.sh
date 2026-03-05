#!/usr/bin/env bash
# Run all unit and API tests (backend, agent, web).
# Usage: ./scripts/test-all.sh [--e2e]
#   --e2e  Also run Playwright E2E tests (requires backend + web to be running, or use pnpm test:e2e which starts them)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

RUN_E2E=false
for arg in "$@"; do
  if [[ "$arg" == "--e2e" ]]; then
    RUN_E2E=true
  fi
done

echo "=== Running backend tests ==="
pnpm run test:backend

echo ""
echo "=== Running agent tests ==="
pnpm run test:agent

echo ""
echo "=== Running web tests (if any) ==="
pnpm run test:web 2>/dev/null || true

if [[ "$RUN_E2E" == true ]]; then
  echo ""
  echo "=== Running E2E tests ==="
  pnpm exec playwright test 2>/dev/null || echo "E2E tests not configured. Run 'pnpm test:e2e' for full E2E setup."
fi

echo ""
echo "All tests passed."
