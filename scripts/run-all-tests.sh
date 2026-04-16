#!/usr/bin/env bash
# Repo test runner: agent pytest, then desktop Vitest.
# Vendored UI-TARS-desktop/ has its own pnpm test — run there separately when changing browser-use.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PYTHONPATH=agent
pytest agent/tests "$@"
pnpm --filter echo-desktop test
(cd apps/web && pnpm test)
