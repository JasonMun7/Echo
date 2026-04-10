"""Unit tests for Google REST URL allowlist."""

from __future__ import annotations

from echo_prism_agent.integrations.google_rest import (
    is_trusted_google_api_host,
    sanitize_extra_headers,
)


def test_host_allowlist_accepts_googleapis() -> None:
    assert is_trusted_google_api_host("www.googleapis.com")
    assert is_trusted_google_api_host("gmail.googleapis.com")
    assert is_trusted_google_api_host("sheets.googleapis.com")
    assert is_trusted_google_api_host("tasks.googleapis.com:443")


def test_host_allowlist_rejects() -> None:
    assert not is_trusted_google_api_host("google.com")
    assert not is_trusted_google_api_host("evil.googleapis.com.evil.com")
    assert not is_trusted_google_api_host("")
    assert not is_trusted_google_api_host("notgoogleapis.com")


def test_sanitize_extra_headers_strips_auth() -> None:
    h = sanitize_extra_headers({"X-Goog-User-Project": "p", "Authorization": "Bearer x", "Cookie": "a=b"})
    assert h == {"X-Goog-User-Project": "p"}
