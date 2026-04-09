#!/usr/bin/env python3
"""
Emit a YAML file for `gcloud run deploy --env-vars-file` for echo-prism-agent.

Using a file avoids comma/equals ambiguity in `--set-env-vars` (secrets with special chars).

Run under ``doppler run --config prd`` (same as backend) so **AUTH0_*** is in the environment:
workflow ``api_call`` uses Token Vault in the agent process. Without it, the web app can show
integrations as connected (echo-backend has Auth0) while runs fail with "Integration not connected".
"""
from __future__ import annotations

import json
import os
import sys


def _emit(k: str, v: str) -> None:
    """
    Emit a single YAML-style key/value line to stdout with the value JSON-encoded.
    
    Parameters:
        k (str): The environment variable name to emit as the key.
        v (str): The value to encode and emit for the key.
    """
    print(f"{k}: {json.dumps(v)}")


def main() -> None:
    """
    Generate YAML-formatted environment entries for deploying the echo-prism-agent.
    
    Reads PROJECT_ID from the first command-line argument (exits with status 1 and prints an error to stderr if missing or empty), writes three required entries for the agent and GCP project to stdout, and conditionally emits additional environment variables found in the current process environment. Output is written as YAML-style key: <JSON-encoded value> lines; optional keys are emitted only when their environment value is non-empty. If FRONTEND_URL is present and non-empty, emits it as ECHO_APP_URL.
    """
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
        # Token Vault (workflow api_call / integrations) — must match echo-backend
        "AUTH0_DOMAIN",
        "AUTH0_CLIENT_ID",
        "AUTH0_CLIENT_SECRET",
        "AUTH0_AUDIENCE",
        "AUTH0_TOKEN_VAULT",
        "AUTH0_CONNECTION_GOOGLE",
        "AUTH0_CONNECTION_GITHUB",
        "AUTH0_CONNECTION_SLACK",
        "ECHO_INTEGRATIONS_TOKEN_VAULT_ONLY",
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
