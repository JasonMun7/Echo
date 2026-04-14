#!/usr/bin/env python3
"""
Emit a YAML file for `gcloud run deploy --env-vars-file` for echo-backend.

Using a file avoids comma/equals ambiguity in `--set-env-vars` (secrets, URLs with commas).
Run under `doppler run --config prd` so secrets are in the environment.
"""
from __future__ import annotations

import json
import os
import sys


def _emit(k: str, v: str) -> None:
    print(f"{k}: {json.dumps(v)}")


def main() -> None:
    if len(sys.argv) < 3:
        print(
            "usage: backend_env_to_yaml.py PROJECT_ID REGION",
            file=sys.stderr,
        )
        sys.exit(1)
    project = sys.argv[1].strip()
    region = sys.argv[2].strip()
    if not project or not region:
        print("PROJECT_ID and REGION required", file=sys.stderr)
        sys.exit(1)

    _emit("GOOGLE_CLOUD_PROJECT", project)
    _emit("ECHO_GCP_PROJECT_ID", project)
    _emit("CLOUD_RUN_REGION", region)

    front = (os.environ.get("FRONTEND_ORIGIN") or os.environ.get("FRONTEND_URL") or "").strip()
    if front:
        _emit("FRONTEND_ORIGIN", front)

    optional = [
        "ECHO_GCS_BUCKET",
        "GEMINI_API_KEY",
        "GOOGLE_API_KEY",
        "COMPOSIO_API_KEY",
        "COMPOSIO_OAUTH_CALLBACK_URL",
        "COMPOSIO_AUTH_CONFIG_SLACK",
        "COMPOSIO_AUTH_CONFIG_GITHUB",
        "COMPOSIO_AUTH_CONFIG_GOOGLE",
        "COMPOSIO_AUTH_CONFIG_GMAIL",
        "COMPOSIO_AUTH_CONFIG_GOOGLEDRIVE",
        "COMPOSIO_AUTH_CONFIG_GOOGLECALENDAR",
        "LIVEKIT_URL",
        "LIVEKIT_API_KEY",
        "LIVEKIT_API_SECRET",
        "LIVEKIT_AGENT_SECRET",
        "CORS_ORIGINS",
        "ECHOPRISM_CHAT_MODEL",
        "GOOGLE_APPLICATION_CREDENTIALS",
        "BACKEND_URL",
        "SCHEDULER_LOCATION",
        "SCHEDULER_SA_EMAIL",
    ]
    for key in optional:
        val = (os.environ.get(key) or "").strip()
        if val:
            _emit(key, val)


if __name__ == "__main__":
    main()
