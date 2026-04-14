"""Composio: managed OAuth, tool execution, danger classification (Firebase uid = user_id)."""

from echo_prism_agent.composio_integration.client import (
    composio_configured,
    execute_composio_tool,
)
from echo_prism_agent.composio_integration.danger import is_dangerous_composio_slug
from echo_prism_agent.composio_integration.slugs import resolve_composio_slug

__all__ = (
    "composio_configured",
    "execute_composio_tool",
    "is_dangerous_composio_slug",
    "resolve_composio_slug",
)
