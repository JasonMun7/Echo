"""Composio Tool Router session wiring for Gemini tool declarations (mocked)."""

from __future__ import annotations

from unittest.mock import MagicMock

from echo_prism_agent.composio_integration import genai_tools


def test_fetch_composio_genai_tool_returns_none_when_session_disabled(monkeypatch) -> None:
    monkeypatch.setenv("COMPOSIO_DISABLE_CHAT_SESSION", "1")
    assert genai_tools.fetch_composio_genai_tool("user-1") is None


def test_merge_chat_tools_passes_through_when_fetch_returns_none(monkeypatch) -> None:
    monkeypatch.setattr(genai_tools, "fetch_composio_genai_tool", lambda _uid: None)
    base = [MagicMock()]
    assert genai_tools.merge_chat_tools(base, "u1") is base
