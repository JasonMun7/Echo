"""Stable reference text for synthesis prompts: api_call integration ids and METHODS.

Keep in sync with echo_prism_agent.integrations.{slack,github,google} METHODS.
"""
from __future__ import annotations

import importlib
from typing import Final

_INTEGRATION_IDS: Final[tuple[str, ...]] = ("slack", "github", "google")


def build_api_call_reference_for_llm() -> str:
    """Human-readable block listing supported api_call integrations and methods."""
    lines: list[str] = [
        "api_call step shape: action \"api_call\", params: {",
        '  "integration": "slack" | "github" | "google",',
        '  "method": "<exact method name from the list below>",',
        '  "args": { }  /* method-specific; see each method line */',
        "}",
        "Tokens are resolved at runtime via Auth0 Token Vault when the user has connected the integration.",
        "",
    ]
    for iid in _INTEGRATION_IDS:
        mod = importlib.import_module(f"echo_prism_agent.integrations.{iid}")
        methods: dict[str, str] = getattr(mod, "METHODS", {}) or {}
        lines.append(f"— {iid} —")
        for name, desc in sorted(methods.items()):
            lines.append(f'  • method "{name}": {desc}')
        lines.append("")
    return "\n".join(lines).rstrip()


API_CALL_SYNTHESIS_APPENDIX: str = build_api_call_reference_for_llm()
