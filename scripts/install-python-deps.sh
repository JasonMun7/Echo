#!/usr/bin/env bash
set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "Installing backend Python dependencies..."
pip install -r "$REPO_ROOT/backend/requirements.txt"
echo "Installing agent Python dependencies..."
pip install -r "$REPO_ROOT/backend/agent/requirements.txt"
echo "Installing EchoPrism Agent dependencies..."
pip install -r "$REPO_ROOT/EchoPrismAgent/requirements.txt"
echo "Done."
