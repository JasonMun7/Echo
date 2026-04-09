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
    """
    Remove single-line `[VLM: ...]` instruction blocks and normalize surrounding whitespace.
    
    Parameters:
        text (str): Input text to sanitize. If falsy or not a `str`, the original value is returned unchanged.
    
    Returns:
        str: The input text with single-line `[VLM: ...]` blocks removed, runs of spaces/tabs before newlines collapsed, trailing whitespace removed from each line, sequences of three or more consecutive newlines reduced to two, and leading/trailing whitespace stripped.
    """
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
    """
    Produce a shallow copy of `args` with VLM `[VLM: ...]` placeholders removed from selected string fields.
    
    Parameters:
        args (dict[str, Any]): Mapping of API call arguments whose string values under user-visible keys
            (case-insensitive keys in the module's `_SANITIZE_KEYS` set, e.g. "body", "text", "subject")
            will have VLM placeholders stripped. If `args` is falsy, it is returned unchanged.
    
    Returns:
        dict[str, Any]: A shallow copy of `args` where string values for matching keys have been
        sanitized via `strip_vlm_placeholders`. Non-string values and keys not listed in `_SANITIZE_KEYS`
        are preserved as-is.
    """
    if not args:
        return args
    out: dict[str, Any] = dict(args)
    for k, v in list(out.items()):
        if isinstance(k, str) and k.lower() in _SANITIZE_KEYS and isinstance(v, str):
            out[k] = strip_vlm_placeholders(v)
    return out
