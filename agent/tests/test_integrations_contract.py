"""
Contract tests: every integration exposes the same surface (METHODS, execute shape),
normalizes method names, and ``execute_api_call`` dispatches to Composio correctly.
"""

from __future__ import annotations

import asyncio
import importlib
from contextlib import contextmanager
from unittest.mock import AsyncMock, patch

import pytest
from echo_prism_agent.execution.operator import execute_api_call
from echo_prism_agent.integrations import github, google, slack
from echo_prism_agent.integrations.ids import normalize_integration_id
from echo_prism_agent.integrations.user_text_sanitize import sanitize_api_call_string_args

INTEGRATION_MODULES = (slack, github, google)
INTEGRATION_IDS = ("slack", "github", "google")


def _run(coro):
    return asyncio.run(coro)


@contextmanager
def github_httpx_async_client_mock():
    """Shared AsyncClient context-manager mock for ``github.execute`` GET list_repos-style tests."""
    with patch("echo_prism_agent.integrations.github.httpx.AsyncClient") as mock_ac:
        mock_resp = type("R", (), {})()
        mock_resp.status_code = 200
        mock_resp.json = lambda: [{"name": "r"}]
        mc = type("C", (), {})()
        mc.get = AsyncMock(return_value=mock_resp)
        mock_ac.return_value.__aenter__ = AsyncMock(return_value=mc)
        mock_ac.return_value.__aexit__ = AsyncMock(return_value=None)
        yield mc


@pytest.mark.parametrize("mod", INTEGRATION_MODULES)
def test_methods_nonempty_descriptions_are_strings(mod) -> None:
    methods = getattr(mod, "METHODS", None)
    assert isinstance(methods, dict) and methods, f"{mod.__name__}.METHODS must be non-empty"
    for key, desc in methods.items():
        assert key and isinstance(key, str)
        assert isinstance(desc, str) and desc.strip()


@pytest.mark.parametrize("mod", INTEGRATION_MODULES)
def test_execute_missing_token_contract(mod) -> None:
    method = "list_channels" if mod is slack else ("list_repos" if mod is github else "userinfo")
    out = _run(mod.execute(method, {}, ""))
    assert isinstance(out, dict)
    assert out.get("ok") is False
    assert out.get("error") == "missing_access_token"
    assert out.get("result") == {}


def test_execute_success_includes_result() -> None:
    """Happy paths must include ``result`` so ``execute_api_call`` can inspect ``ok``."""
    with github_httpx_async_client_mock():
        out = _run(github.execute("list_repos", {}, "ghs_x"))
    assert out["ok"] is True
    assert "result" in out


@pytest.mark.parametrize("mod_name", INTEGRATION_IDS)
def test_dynamic_import_matches_package(mod_name) -> None:
    m = importlib.import_module(f"echo_prism_agent.integrations.{mod_name}")
    assert hasattr(m, "METHODS")
    assert callable(m.execute)


@pytest.mark.parametrize("mod_name", INTEGRATION_IDS)
def test_integration_id_normalization(mod_name) -> None:
    assert normalize_integration_id(mod_name) == mod_name


@pytest.mark.parametrize(
    ("mod", "method", "args"),
    [
        (github, "List-Repos", {}),
        (slack, "LIST_CHANNELS", {}),
        (google, "USERINFO", {}),
    ],
)
def test_method_string_normalized_before_http(mod, method, args) -> None:
    """Non-canonical method strings normalize and hit the intended branch (not unknown_method)."""
    if mod is github:
        with github_httpx_async_client_mock() as mc:
            out = _run(mod.execute(method, args, "test-token"))
        assert out.get("ok") is True
        assert mc.get.await_count >= 1
        return
    with patch(f"{mod.__name__}.httpx.AsyncClient") as mock_ac:
        mock_resp = type("R", (), {})()
        mock_resp.status_code = 200
        if mod is slack:
            mock_resp.json = lambda: {"ok": True, "channels": []}
        else:
            mock_resp.json = lambda: {"sub": "x"}
        mc = type("C", (), {})()
        mc.get = AsyncMock(return_value=mock_resp)
        mock_ac.return_value.__aenter__ = AsyncMock(return_value=mc)
        mock_ac.return_value.__aexit__ = AsyncMock(return_value=None)
        out = _run(mod.execute(method, args, "test-token"))
    assert out.get("ok") is True
    assert mc.get.await_count >= 1


def test_google_duplicate_method_alias_documented() -> None:
    """``google_rest`` mirrors ``rest`` for synthesis / UX."""
    assert google.METHODS.get("rest") and google.METHODS.get("rest") == google.METHODS.get("google_rest")


def test_sanitize_api_call_args_strips_vlm_from_body() -> None:
    raw = {
        "channel": "C1",
        "text": "Hello [VLM: fill]",
        "body": "Note [VLM: x]",
    }
    clean = sanitize_api_call_string_args(raw)
    assert clean["channel"] == "C1"
    assert "[VLM:" not in clean["text"]
    assert "[VLM:" not in clean["body"]


@pytest.fixture
def composio_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("COMPOSIO_API_KEY", "test-composio-key")
    from echo_prism_agent.composio_integration import client as cc

    cc._composio_client.cache_clear()


@pytest.mark.asyncio
async def test_execute_api_call_composio_success(composio_key: None, monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_execute(uid: str, slug: str, args: dict) -> dict:
        assert uid == "uid-1"
        assert slug == "SLACK_LIST_ALL_CHANNELS"
        assert args == {"limit": 10}
        return {"successful": True, "data": {"ok": True}}

    monkeypatch.setattr(
        "echo_prism_agent.composio_integration.client.execute_composio_tool",
        fake_execute,
    )
    ok, err, meta = await execute_api_call(
        {
            "params": {
                "slug": "SLACK_LIST_ALL_CHANNELS",
                "arguments": {"limit": 10},
            }
        },
        "uid-1",
        None,
    )
    assert ok is True
    assert err == ""
    assert meta is None


@pytest.mark.asyncio
async def test_execute_api_call_requires_slug(composio_key: None) -> None:
    ok, err, _meta = await execute_api_call(
        {"params": {"arguments": {}}},
        "u",
        None,
    )
    assert ok is False
    assert "slug" in err.lower()


@pytest.mark.asyncio
async def test_execute_api_call_composio_auth_hint(composio_key: None, monkeypatch: pytest.MonkeyPatch) -> None:
    async def no_account(*_a, **_k):
        return {"successful": False, "error": "not connected", "data": {}, "composio_auth_hint": True}

    monkeypatch.setattr(
        "echo_prism_agent.composio_integration.client.execute_composio_tool",
        no_account,
    )
    with patch(
        "echo_prism_agent.integrations.resolver.integration_connect_hint",
        new_callable=AsyncMock,
    ) as hint:
        hint.return_value = {
            "integration": "slack",
            "toolkit": "slack",
            "connect_kind": "composio_oauth",
        }
        ok, err, meta = await execute_api_call(
            {
                "params": {
                    "slug": "SLACK_LIST_ALL_CHANNELS",
                    "arguments": {},
                }
            },
            "u",
            None,
        )
    assert ok is False
    assert "composio connected account" in err.lower()
    assert meta and meta.get("integration_auth_required")
