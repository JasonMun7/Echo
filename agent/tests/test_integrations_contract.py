"""
Contract tests: every integration exposes the same surface (METHODS, execute shape),
normalizes method names, lines up with Token Vault ids, and ``execute_api_call`` dispatches correctly.
"""

from __future__ import annotations

import asyncio
import importlib
from contextlib import contextmanager
from unittest.mock import AsyncMock, patch

import pytest
from echo_prism_agent.auth0_token_vault import (
    connection_name_for_integration,
    normalize_integration_id,
)
from echo_prism_agent.execution.operator import execute_api_call
from echo_prism_agent.integrations import github, google, slack
from echo_prism_agent.integrations.gmail_content_guard import (
    gmail_data_guard_error_message,
    gmail_send_body_likely_missing_requested_data,
)
from echo_prism_agent.integrations.google import _gmail_rfc2822_raw_b64
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
def test_token_vault_connection_mapping(mod_name) -> None:
    assert connection_name_for_integration(normalize_integration_id(mod_name))


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


def test_gmail_guard_blocks_prompt_only_data_request() -> None:
    body = "Please find the top 5 stocks based on the latest market data. List them here."
    assert gmail_send_body_likely_missing_requested_data(body, "Weekly picks") is True
    msg = gmail_data_guard_error_message()
    assert "blocked" in msg.lower() and "concrete" in msg.lower()


def test_gmail_skip_data_guard_bypasses_heuristic() -> None:
    blocked_body = "Please find the top 5 stocks based on the latest market data. List them here."
    raw, err = _gmail_rfc2822_raw_b64(
        {
            "to": "user@example.com",
            "subject": "Weekly picks",
            "body": blocked_body,
            "skip_data_guard": True,
        }
    )
    assert err is None
    assert raw


def test_gmail_guard_allows_body_with_figures() -> None:
    body = "Top picks: AAPL +2.3%, MSFT +1.1% (see attached screen)."
    assert gmail_send_body_likely_missing_requested_data(body, "Update") is False


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


@pytest.mark.asyncio
async def test_execute_api_call_dispatches_to_slack_connector() -> None:
    async def fake_token(*_a, **_k):
        return "xoxb-test"

    with patch(
        "echo_prism_agent.integrations.resolver.get_integration_access_token",
        fake_token,
    ):
        with patch(
            "echo_prism_agent.integrations.slack.execute",
            new_callable=AsyncMock,
        ) as m_exec:
            m_exec.return_value = {"ok": True, "result": {"ok": True}}
            ok, err, meta = await execute_api_call(
                {
                    "params": {
                        "integration": "slack",
                        "method": "list_channels",
                        "args": {"limit": 10},
                    }
                },
                "uid-1",
                None,
            )
    assert ok is True
    assert err == ""
    assert meta is None
    m_exec.assert_awaited_once()
    call = m_exec.await_args
    assert call[0][0] == "list_channels"
    assert call[0][1] == {"limit": 10}
    assert call[0][2] == "xoxb-test"


@pytest.mark.asyncio
async def test_execute_api_call_unknown_integration() -> None:
    ok, err, _meta = await execute_api_call(
        {"params": {"integration": "not_real", "method": "x", "args": {}}},
        "u",
        None,
    )
    assert ok is False
    assert "Unknown integration" in err


@pytest.mark.asyncio
async def test_execute_api_call_no_token_returns_hint_metadata() -> None:
    async def no_token(*_a, **_k):
        return ""

    with patch(
        "echo_prism_agent.integrations.resolver.get_integration_access_token",
        no_token,
    ):
        with patch(
            "echo_prism_agent.integrations.resolver.integration_connect_hint",
            new_callable=AsyncMock,
        ) as hint:
            hint.return_value = {
                "auth0_linked": False,
                "connect_kind": "link_auth0",
                "integration": "slack",
            }
            ok, err, meta = await execute_api_call(
                {
                    "params": {
                        "integration": "slack",
                        "method": "list_channels",
                        "args": {},
                    }
                },
                "u",
                None,
            )
    assert ok is False
    assert "not connected" in err.lower()
    assert meta and meta.get("integration_auth_required")
