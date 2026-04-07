#!/usr/bin/env python3
"""
Emit a YAML file for `gcloud run deploy --env-vars-file` for echo-prism-agent.

Using a file avoids comma/equals ambiguity in `--set-env-vars` (secrets with special chars).
"""
from __future__ import annotations

import json
import os
import sys


def _emit(k: str, v: str) -> None:
    print(f"{k}: {json.dumps(v)}")


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: agent_env_to_yaml.py PROJECT_ID", file=sys.stderr)
        sys.exit(1)
    project = sys.argv[1].strip()
    if not project:
        print("PROJECT_ID required", file=sys.stderr)
        sys.exit(1)

    _emit("ECHOPRISM_INFERENCE_BACKEND", "openrouter")
    _emit("ECHO_GCP_PROJECT_ID", project)
    _emit("GOOGLE_CLOUD_PROJECT", project)

    optional = [
        "GEMINI_API_KEY",
        "OPENROUTER_API_KEY",
        "OPENROUTER_BASE_URL",
        "UI_TARS_MODEL_ID",
        "ECHO_GCS_BUCKET",
        "LIVEKIT_URL",
        "LIVEKIT_API_KEY",
        "LIVEKIT_API_SECRET",
        "LIVEKIT_AGENT_SECRET",
    ]
    for key in optional:
        val = (os.environ.get(key) or "").strip()
        if val:
            _emit(key, val)

    # Set by load_config in deploy-echo-prism-agent.sh (not always in Doppler)
    front = (os.environ.get("FRONTEND_URL") or "").strip()
    if front:
        _emit("ECHO_APP_URL", front)


if __name__ == "__main__":
    main()
