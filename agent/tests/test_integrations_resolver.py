"""Tests for Composio connect hints."""

from __future__ import annotations

import asyncio

import pytest
from echo_prism_agent.integrations.resolver import integration_connect_hint


class _FakeDb:
    def collection(self, name: str):
        raise AssertionError(name)


def test_integration_connect_hint_composio() -> None:
    async def _run() -> dict:
        return await integration_connect_hint("slack", slug="SLACK_SEND_MESSAGE")

    r = asyncio.run(_run())
    assert r["connect_kind"] == "composio_oauth"
    assert r["integration"] == "slack"
    assert r["toolkit"] == "slack"


def test_integration_connect_hint_includes_slug() -> None:
    async def _run() -> dict:
        return await integration_connect_hint("github")

    r = asyncio.run(_run())
    assert r["connect_kind"] == "composio_oauth"
    assert r["integration"] == "github"


def test_execute_api_call_empty_token_returns_auth_meta(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("COMPOSIO_API_KEY", "test-key")
    from echo_prism_agent.composio_integration import client as cc

    cc._composio_client.cache_clear()

    async def composio_fail(*_a, **_k):
        return {"successful": False, "error": "not connected", "composio_auth_hint": True}

    monkeypatch.setattr(
        "echo_prism_agent.composio_integration.client.execute_composio_tool",
        composio_fail,
    )
    db = _FakeDb()
    step = {
        "params": {
            "slug": "SLACK_SEND_MESSAGE",
            "arguments": {"channel": "C", "text": "hi"},
        }
    }

    async def _run() -> tuple[bool, str, dict | None]:
        from echo_prism_agent.execution.operator import execute_api_call

        return await execute_api_call(step, "uid1", db)

    ok, err, meta = asyncio.run(_run())
    assert ok is False
    assert meta and meta.get("integration_auth_required")
    assert "connect" in (err or "").lower()
