"""Tests for Auth0 Token Vault integration id → connection name mapping."""

from __future__ import annotations

import os

import pytest
from echo_prism_agent.auth0_token_vault import connection_name_for_integration


@pytest.fixture(autouse=True)
def clear_auth0_connection_overrides(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in list(os.environ.keys()):
        if key.startswith("AUTH0_CONNECTION_"):
            monkeypatch.delenv(key, raising=False)


def test_default_slack_github_google() -> None:
    assert connection_name_for_integration("slack") == "slack"
    assert connection_name_for_integration("github") == "github"
    assert connection_name_for_integration("google") == "google-oauth2"


def test_mapping_is_case_insensitive() -> None:
    assert connection_name_for_integration("Slack") == "slack"
    assert connection_name_for_integration("GITHUB") == "github"
    assert connection_name_for_integration(" Google ") == "google-oauth2"


def test_unknown_integration() -> None:
    assert connection_name_for_integration("not_real") is None


def test_env_override(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AUTH0_CONNECTION_GOOGLE", "my-google-conn")
    assert connection_name_for_integration("google") == "my-google-conn"
    assert connection_name_for_integration("Google") == "my-google-conn"
