"""
Strip workflow / synthesis artifacts that must never be sent to external APIs (e.g. Gmail).

Steps sometimes include bracketed VLM instructions like ``[VLM: Extract ...]`` — those are
hints for the desktop agent, not user-facing email or chat content.
"""

from __future__ import annotations

import re
from typing import Any

# Matches [VLM: ...] (single-line). Case-insensitive "VLM".
_VLM_BRACKET = re.compile(r"\[VLM:[^\]]*\]", re.IGNORECASE)

# Some templates use a newline before the bracket block
_MULTISPACE = re.compile(r"[ \t]+\n")


def strip_vlm_placeholders(text: str) -> str:
    """Remove ``[VLM: ...]`` instruction blocks from free-form text."""
    if not text or not isinstance(text, str):
        return text
    cleaned = _VLM_BRACKET.sub("", text)
    cleaned = _MULTISPACE.sub("\n", cleaned)
    lines = [ln.rstrip() for ln in cleaned.splitlines()]
    cleaned = "\n".join(lines)
    return re.sub(r"\n{3,}", "\n\n", cleaned).strip()


# Keys in api_call ``args`` that are user-visible or message body (never pass VLM hints through).
_SANITIZE_KEYS = frozenset(
    k.lower()
    for k in (
        "body",
        "text",
        "subject",
        "html",
        "message",
        "content",
        "body_text",
        "snippet",
        "query",
    )
)


def sanitize_api_call_string_args(args: dict[str, Any]) -> dict[str, Any]:
    """Return a shallow copy of ``args`` with VLM placeholders stripped from string content fields."""
    if not args:
        return args
    out: dict[str, Any] = dict(args)
    for k, v in list(out.items()):
        if isinstance(k, str) and k.lower() in _SANITIZE_KEYS and isinstance(v, str):
            out[k] = strip_vlm_placeholders(v)
    return out
