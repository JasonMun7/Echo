"""Build google.genai Tool list from Composio Tool Router (v3 session + meta tools) for chat."""

from __future__ import annotations

import logging
import os
from typing import Any

from echo_prism_agent.composio_integration.chat_session import get_or_create_chat_router_session
from google.genai import types

logger = logging.getLogger(__name__)


def fetch_composio_genai_tool(uid: str) -> types.Tool | None:
    """
    Return ``types.Tool`` objects whose function_declarations are Composio **meta tools**
    (Tool Router session: ``COMPOSIO_SEARCH_TOOLS``, ``COMPOSIO_MULTI_EXECUTE_TOOL``, …),
    or None if Composio is unavailable.

    Replaces bulk ``get_raw_composio_tools`` + per-slug declarations for the chat agent loop.
    """
    _ = os  # reserved for future feature flags
    try:
        from langchain_google_genai._function_utils import convert_to_genai_function_declarations
    except Exception as e:
        logger.debug("langchain_google_genai not available for Composio meta tools: %s", e)
        return None

    _, lc_tools = get_or_create_chat_router_session(uid)
    if not lc_tools:
        return None
    try:
        genai_list = convert_to_genai_function_declarations(lc_tools)
    except Exception as e:
        logger.warning("convert_to_genai_function_declarations failed for Composio session tools: %s", e)
        return None

    if not genai_list:
        return None
    # Merge all function declarations into one Tool blob (matches prior Echo behavior).
    merged: list[Any] = []
    for t in genai_list:
        fds = getattr(t, "function_declarations", None)
        if fds:
            merged.extend(fds)
    if not merged:
        return None
    return types.Tool(function_declarations=merged)


def merge_chat_tools(base_tools: list[types.Tool], uid: str) -> list[types.Tool]:
    """Append Composio Tool Router (meta tool) declarations to existing genai tools."""
    extra = fetch_composio_genai_tool(uid)
    if extra is None:
        return base_tools
    return list(base_tools) + [extra]
