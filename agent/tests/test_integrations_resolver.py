"""Tests for get_integration_access_token (Token Vault vs legacy Firestore)."""

from __future__ import annotations

import asyncio
from typing import Any

import pytest
from echo_prism_agent.integrations.resolver import (
    get_integration_access_token,
    integration_connect_hint,
)


class _Snap:
    def __init__(self, data: dict[str, Any] | None, exists: bool = True) -> None:
        self._data = data or {}
        self.exists = exists

    def to_dict(self) -> dict[str, Any]:
        return self._data


class _IntDoc:
    def __init__(self, token: str | None) -> None:
        self._token = token

    def get(self) -> _Snap:
        if not self._token:
            return _Snap({}, False)
        return _Snap({"access_token": self._token})


class _IntCol:
    def __init__(self, token: str | None) -> None:
        self._token = token

    def document(self, _name: str) -> _IntDoc:
        return _IntDoc(self._token)


class _UserDoc:
    def __init__(self, user_data: dict[str, Any], legacy_token: str | None) -> None:
        self._user_data = user_data
        self._legacy_token = legacy_token

    def get(self) -> _Snap:
        return _Snap(self._user_data)

    def collection(self, _name: str) -> _IntCol:
        return _IntCol(self._legacy_token)


class _Users:
    def __init__(self, user_data: dict[str, Any], legacy_token: str | None) -> None:
        self._user_data = user_data
        self._legacy_token = legacy_token

    def document(self, _uid: str) -> _UserDoc:
        return _UserDoc(self._user_data, self._legacy_token)


class _FakeDb:
    def __init__(self, user_data: dict[str, Any], legacy_token: str | None = "") -> None:
        self._user_data = user_data
        self._legacy_token = legacy_token

    def collection(self, name: str) -> _Users:
        if name != "users":
            raise AssertionError(name)
        return _Users(self._user_data, self._legacy_token)


@pytest.fixture
def auth0_env_min(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AUTH0_DOMAIN", "tenant.example.com")
    monkeypatch.setenv("AUTH0_CLIENT_ID", "cid")
    monkeypatch.setenv("AUTH0_CLIENT_SECRET", "sec")


def test_legacy_firestore_token_when_vault_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AUTH0_TOKEN_VAULT", "0")
    monkeypatch.setenv("ECHO_INTEGRATIONS_TOKEN_VAULT_ONLY", "0")
    db = _FakeDb({}, legacy_token="xoxb-legacy")

    async def _run() -> str:
        return await get_integration_access_token("uid1", "slack", db)

    assert asyncio.run(_run()) == "xoxb-legacy"


def test_token_vault_short_circuits_before_legacy(
    monkeypatch: pytest.MonkeyPatch,
    auth0_env_min: None,
) -> None:
    monkeypatch.setenv("AUTH0_TOKEN_VAULT", "1")

    async def _exchange(_refresh: str, _conn: str) -> dict[str, Any]:
        return {"access_token": "from-vault"}

    monkeypatch.setattr(
        "echo_prism_agent.integrations.resolver.exchange_federated_access_token",
        _exchange,
    )

    db = _FakeDb(
        {"auth0_refresh_token": "rt"},
        legacy_token="should-not-use",
    )

    async def _run() -> str:
        return await get_integration_access_token("uid1", "slack", db)

    assert asyncio.run(_run()) == "from-vault"


def test_legacy_skipped_when_token_vault_only_and_vault_configured(
    monkeypatch: pytest.MonkeyPatch,
    auth0_env_min: None,
) -> None:
    """Vault-only + configured Auth0: do not fall back to legacy Firestore OAuth tokens."""
    monkeypatch.delenv("ECHO_INTEGRATIONS_TOKEN_VAULT_ONLY", raising=False)
    monkeypatch.setenv("AUTH0_TOKEN_VAULT", "1")
    db = _FakeDb({}, legacy_token="xoxb-should-not-read")

    async def _run() -> str:
        return await get_integration_access_token("uid1", "slack", db)

    assert asyncio.run(_run()) == ""


def test_legacy_firestore_used_when_token_vault_not_configured_on_process(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If AUTH0_* is missing on this process, federated exchange cannot run; allow legacy tokens."""
    monkeypatch.delenv("AUTH0_DOMAIN", raising=False)
    monkeypatch.delenv("AUTH0_CLIENT_ID", raising=False)
    monkeypatch.delenv("AUTH0_CLIENT_SECRET", raising=False)
    monkeypatch.delenv("ECHO_INTEGRATIONS_TOKEN_VAULT_ONLY", raising=False)
    db = _FakeDb({}, legacy_token="legacy-from-firestore")

    async def _run() -> str:
        return await get_integration_access_token("uid1", "slack", db)

    assert asyncio.run(_run()) == "legacy-from-firestore"


def test_legacy_lookup_is_case_insensitive_for_integration_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("AUTH0_DOMAIN", raising=False)
    db = _FakeDb({}, legacy_token="tok")

    async def _run() -> str:
        return await get_integration_access_token("uid1", "Slack", db)

    assert asyncio.run(_run()) == "tok"


def test_empty_when_vault_fails_and_no_legacy(
    monkeypatch: pytest.MonkeyPatch,
    auth0_env_min: None,
) -> None:
    monkeypatch.setenv("AUTH0_TOKEN_VAULT", "1")

    async def _fail(_r: str, _c: str) -> dict[str, Any]:
        raise RuntimeError("no exchange")

    monkeypatch.setattr(
        "echo_prism_agent.integrations.resolver.exchange_federated_access_token",
        _fail,
    )

    db = _FakeDb({"auth0_refresh_token": "rt"}, legacy_token=None)

    async def _run() -> str:
        return await get_integration_access_token("uid1", "slack", db)

    assert asyncio.run(_run()) == ""


def test_integration_connect_hint_link_auth0() -> None:
    db = _FakeDb({})

    async def _run() -> dict:
        return await integration_connect_hint("uid1", "slack", db)

    r = asyncio.run(_run())
    assert r["connect_kind"] == "link_auth0"
    assert r["auth0_linked"] is False
    assert r["integration"] == "slack"


def test_integration_connect_hint_vault_after_auth0_linked() -> None:
    db = _FakeDb({"auth0_refresh_token": "rt"})

    async def _run() -> dict:
        return await integration_connect_hint("uid1", "github", db)

    r = asyncio.run(_run())
    assert r["connect_kind"] == "connect_integration"
    assert r["auth0_linked"] is True
    assert r["integration"] == "github"


def test_execute_api_call_empty_token_returns_auth_meta(
    monkeypatch: pytest.MonkeyPatch,
    auth0_env_min: None,
) -> None:
    monkeypatch.setenv("AUTH0_TOKEN_VAULT", "1")

    async def empty_tok(_uid: str, _integration: str, _db: Any) -> str:
        return ""

    monkeypatch.setattr(
        "echo_prism_agent.integrations.resolver.get_integration_access_token",
        empty_tok,
    )
    db = _FakeDb({"auth0_refresh_token": "rt"})
    step = {
        "params": {
            "integration": "slack",
            "method": "post_message",
            "args": {"channel": "C", "text": "hi"},
        }
    }

    async def _run() -> tuple[bool, str, dict | None]:
        from echo_prism_agent.execution.operator import execute_api_call

        return await execute_api_call(step, "uid1", db)

    ok, err, meta = asyncio.run(_run())
    assert ok is False
    assert meta and meta.get("integration_auth_required")
    assert meta.get("auth0_linked") is True
    assert "browser" in (err or "").lower() or "connect" in (err or "").lower()
