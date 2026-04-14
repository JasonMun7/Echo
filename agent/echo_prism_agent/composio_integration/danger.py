"""Heuristic classification of Composio tool slugs for selective HITL."""

from __future__ import annotations

import re

# Slugs forced safe even if they match dangerous patterns (false positives).
SAFE_OVERRIDES: frozenset[str] = frozenset(
    {
        # Add edge cases here as you discover them.
    }
)

# Slugs forced dangerous even if heuristic misses.
DANGEROUS_OVERRIDES: frozenset[str] = frozenset(
    {
        # Add edge cases here as you discover them.
    }
)

_DANGEROUS_RE = re.compile(
    r"(SEND|POST|CREATE|DELETE|UPDATE|MERGE|PUBLISH|INVITE|REMOVE|DESTROY|"
    r"DROP|TRASH|ARCHIVE|TRANSFER|PURCHASE|CHARGE|SUBSCRIBE|UNSUBSCRIBE|"
    r"REVOK|GRANT|PERMISSION|SHARE|EXPORT|UPLOAD|DEPLOY|RELEASE)",
    re.IGNORECASE,
)


def is_dangerous_composio_slug(slug: str) -> bool:
    """
    Return True if this tool should require human approval before execution.

    Heuristic: match risky substrings in the slug; consult override sets.
    """
    s = (slug or "").strip()
    if not s:
        return True
    u = s.upper()
    # Tool Router meta tools (v3 session) are governed by Composio — not Echo HITL heuristics here.
    if u.startswith("COMPOSIO_"):
        return False
    if u in SAFE_OVERRIDES:
        return False
    if u in DANGEROUS_OVERRIDES:
        return True
    if _DANGEROUS_RE.search(u):
        return True
    # Reads / lists / gets (Composio slugs often use LIST_ALL, GET_, FETCH_, etc.)
    if (
        "_LIST_" in u
        or "_LISTS_" in u
        or "LIST_ALL" in u
        or "_GET_" in u
        or "_FETCH_" in u
        or "_SEARCH_" in u
        or "_RETRIEV" in u
        or "_READ_" in u
    ):
        return False
    if re.search(r"(LIST|GET|FETCH|RETRIEV|SEARCH|FIND|READ|SHOW|DESCRIBE|CHECK|VERIFY)_", u):
        return False
    return True
