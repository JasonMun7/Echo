"""My Account connected-accounts flow."""

from echo_prism_agent.auth0_my_account_connect import (
    _pkce_pair,
    default_google_upstream_scopes,
    upstream_scopes_for_integration,
)


def test_pkce_verifier_challenge_roundtrip_length() -> None:
    v, c = _pkce_pair()
    assert len(v) > 40
    assert len(c) > 40
    assert v != c


def test_default_google_upstream_scopes_none_uses_auth0_dashboard(monkeypatch) -> None:
    monkeypatch.delenv("AUTH0_MY_ACCOUNT_GOOGLE_SCOPES", raising=False)
    assert default_google_upstream_scopes() is None
    assert upstream_scopes_for_integration("google") is None


def test_default_google_upstream_scopes_explicit_env(monkeypatch) -> None:
    monkeypatch.setenv(
        "AUTH0_MY_ACCOUNT_GOOGLE_SCOPES",
        "https://www.googleapis.com/auth/calendar.readonly",
    )
    out = default_google_upstream_scopes()
    assert out is not None
    assert "https://www.googleapis.com/auth/calendar.readonly" in out
    assert "openid" in out
