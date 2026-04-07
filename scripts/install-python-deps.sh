#!/usr/bin/env bash
set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "Installing backend Python dependencies..."
pip install -r "$REPO_ROOT/backend/requirements.txt"
echo "Installing Echo Prism agent (LangGraph) Python dependencies..."
pip install -r "$REPO_ROOT/agent/requirements.txt"
pip install "pytest>=8.0.0"
echo "Done."
