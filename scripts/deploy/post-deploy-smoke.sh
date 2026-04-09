#!/usr/bin/env bash
# Post-deploy smoke checks (run after Cloud Run deploy or against local dev).
# Usage:
#   BACKEND_URL=https://your-backend.run.app AGENT_URL=wss://your-agent.run.app ./scripts/deploy/post-deploy-smoke.sh
#   BACKEND_URL=http://127.0.0.1:8080 ./scripts/deploy/post-deploy-smoke.sh
set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8080}"
AGENT_URL="${AGENT_URL:-}"

echo "== Echo post-deploy smoke =="
echo "BACKEND_URL=$BACKEND_URL"

code=$(curl -sS -o /tmp/echo_health.json -w "%{http_code}" "${BACKEND_URL}/health" || true)
if [[ "$code" != "200" ]]; then
  echo "FAIL: GET /health expected 200, got $code"
  exit 1
fi
echo "OK GET /health -> $(cat /tmp/echo_health.json)"

code=$(curl -sS -o /tmp/echo_health_echo.json -w "%{http_code}" "${BACKEND_URL}/health/echo" || true)
if [[ "$code" != "200" ]]; then
  echo "FAIL: GET /health/echo expected 200, got $code"
  exit 1
fi
echo "OK GET /health/echo -> $(cat /tmp/echo_health_echo.json)"

if [[ -n "$AGENT_URL" ]]; then
  # Map WebSocket URL to HTTP(S) for /health (TLS agent -> https, non-TLS -> http)
  if [[ "$AGENT_URL" == wss://* ]]; then
    http_url="https://${AGENT_URL#wss://}"
  elif [[ "$AGENT_URL" == ws://* ]]; then
    http_url="http://${AGENT_URL#ws://}"
  elif [[ "$AGENT_URL" == https://* ]] || [[ "$AGENT_URL" == http://* ]]; then
    http_url="$AGENT_URL"
  else
    http_url="https://${AGENT_URL}"
  fi
  code=$(curl -sS -o /tmp/echo_agent_health.json -w "%{http_code}" "${http_url}/health" || true)
  if [[ "$code" != "200" ]]; then
    echo "WARN: GET ${http_url}/health expected 200, got $code (set AGENT_URL if agent not deployed)"
  else
    echo "OK GET ${http_url}/health -> $(cat /tmp/echo_agent_health.json)"
  fi
else
  echo "SKIP agent HTTP health (set AGENT_URL=wss://... to test echo-prism-agent)"
fi

echo "Smoke complete."
