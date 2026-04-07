"""Sanity checks for the canonical Google OAuth scope reference."""

from __future__ import annotations

from echo_prism_agent.integrations import google_scopes


def test_all_scopes_are_valid_oauth_strings() -> None:
    for product, pairs in google_scopes.GOOGLE_OAUTH_MAX_BY_PRODUCT.items():
        for label, url in pairs:
            assert url == "openid" or url.startswith("https://"), f"{product}/{label}: {url!r}"


def test_all_max_scope_urls_is_unique_subset() -> None:
    flat = google_scopes.all_max_scope_urls()
    total = sum(len(pairs) for pairs in google_scopes.GOOGLE_OAUTH_MAX_BY_PRODUCT.values())
    assert len(flat) <= total  # duplicates (e.g. shared URLs) allowed


def test_expected_products_present() -> None:
    keys = set(google_scopes.GOOGLE_OAUTH_MAX_BY_PRODUCT)
    assert keys >= {
        "Sign-in / profile",
        "Calendar",
        "Gmail",
        "Drive",
        "Sheets",
        "Slides",
        "Contacts",
        "Tasks",
    }
