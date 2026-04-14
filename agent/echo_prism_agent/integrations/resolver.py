"""
Composio connect hints when tool execution requires OAuth (no Firestore OAuth tokens).
"""

from __future__ import annotations

from typing import Any

from echo_prism_agent.integrations.ids import normalize_integration_id


async def integration_connect_hint(
    integration: str,
    *,
    slug: str | None = None,
) -> dict[str, Any]:
    """When Composio cannot execute (no connected account), tell the client how to connect."""
    iid = normalize_integration_id(integration)
    return {
        "integration": iid,
        "toolkit": iid,
        "composio_slug": (slug or "").strip() or None,
        "connect_kind": "composio_oauth",
        "composio_connect_url": None,
    }
