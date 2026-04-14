"""Composio slug resolution (slug required; toolkit hints for connect flows)."""

from echo_prism_agent.composio_integration.slugs import resolve_composio_slug, toolkit_hint_from_slug


def test_gmail_slug_uses_gmail_toolkit_not_google() -> None:
    assert toolkit_hint_from_slug("GMAIL_SEND_EMAIL") == "gmail"
    assert toolkit_hint_from_slug("GMAIL_LIST_LABELS") == "gmail"


def test_resolve_requires_slug() -> None:
    slug, tk, err = resolve_composio_slug({"integration": "google", "method": "gmail_send", "args": {}})
    assert slug is None
    assert tk is None
    assert err and "slug" in err.lower()


def test_resolve_rejects_non_string_slug() -> None:
    slug, tk, err = resolve_composio_slug({"slug": 123})
    assert slug is None
    assert tk is None
    assert err and "slug" in err.lower()


def test_resolve_slug_returns_toolkit() -> None:
    slug, tk, err = resolve_composio_slug({"slug": "GMAIL_SEND_EMAIL", "arguments": {}})
    assert err is None
    assert slug == "GMAIL_SEND_EMAIL"
    assert tk == "gmail"


def test_resolve_slug_normalizes_whitespace_and_case() -> None:
    slug, tk, err = resolve_composio_slug({"slug": " gmail_send_email ", "arguments": {}})
    assert err is None
    assert slug == "GMAIL_SEND_EMAIL"
    assert tk == "gmail"


def test_unknown_google_prefix_maps_neutral() -> None:
    assert toolkit_hint_from_slug("GOOGLEGET_USER_INFO") == "integration"


def test_googlecalendar_prefix() -> None:
    assert toolkit_hint_from_slug("GOOGLECALENDAR_CALENDAR_LIST") == "googlecalendar"


def test_googledrive_prefix_before_google() -> None:
    assert toolkit_hint_from_slug("GOOGLEDRIVE_LIST_FILES") == "googledrive"


def test_git_prefix_not_overbroad() -> None:
    assert toolkit_hint_from_slug("GITHUB_LIST_REPOS") == "github"
    assert toolkit_hint_from_slug("GITLAB_CREATE_ISSUE") == "integration"
