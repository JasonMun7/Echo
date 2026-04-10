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
        'api_call step shape: action "api_call", params: {',
        '  "integration": "slack" | "github" | "google",',
        '  "method": "<exact method name from the list below>",',
        '  "args": { }  /* method-specific; see each method line */',
        "}",
        "Tokens are resolved at runtime via Auth0 Token Vault when the user has connected the integration.",
        "",
        "CRITICAL — messaging (gmail_send, Slack, etc.):",
        "  • args.body / args.text must be the FINAL text to send, including any numbers, tickers, or bullet lists.",
        "  • Do NOT use only a prompt such as “Please find the top 5 stocks…” without the actual list—add steps BEFORE",
        "    this one to gather data (navigate, UI, copy), then put merged content in args.",
        "  • If the user gave little detail, still expand the workflow with reasonable data-collection steps before send.",
        "  • gmail_send only: set args.skip_data_guard to true if the body was reviewed and you intentionally send",
        "    prompt-like text (otherwise a server guard may block).",
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
