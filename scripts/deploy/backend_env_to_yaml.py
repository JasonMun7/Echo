#!/usr/bin/env python3
"""
Emit a YAML file for `gcloud run deploy --env-vars-file` for echo-backend.

Using a file avoids comma/equals ambiguity in `--set-env-vars` (Auth0 secrets, URLs with commas).
Run under `doppler run --config prd` so AUTH0_* and other secrets are in the environment.
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
        "AUTH0_DOMAIN",
        "AUTH0_CLIENT_ID",
        "AUTH0_CLIENT_SECRET",
        "AUTH0_AUDIENCE",
        "AUTH0_CALLBACK_URL",
        "AUTH0_LINK_CONNECTION",
        "AUTH0_CONNECTION_GOOGLE",
        "AUTH0_CONNECTION_GITHUB",
        "AUTH0_CONNECTION_SLACK",
        "AUTH0_VAULT_CALLBACK_URL",
        "AUTH0_VAULT_USE_MY_ACCOUNT_CONNECT",
        "AUTH0_VAULT_VERIFY_ATTEMPTS",
        "AUTH0_MY_ACCOUNT_GOOGLE_SCOPES",
        "AUTH0_TOKEN_VAULT",
        "AUTH0_MGMT_CLIENT_ID",
        "AUTH0_MGMT_CLIENT_SECRET",
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
