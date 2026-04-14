"""Resolve Composio tool slug from workflow params (explicit slug only)."""

from __future__ import annotations


def toolkit_hint_from_slug(slug: str) -> str:
    """
    Infer Composio toolkit id for connect links and HITL.

    Composio stores **one connected account per toolkit**. Tool Router uses concrete slugs
    (e.g. ``gmail``, ``googlecalendar``); the legacy umbrella ``google`` is invalid.
    Order matters: check longer prefixes before generic ``GOOGLE``.
    """
    u = (slug or "").strip().upper()
    if u.startswith("SLACK"):
        return "slack"
    if u.startswith("GITHUB"):
        return "github"
    if u.startswith("GMAIL"):
        return "gmail"
    if u.startswith("GOOGLECALENDAR"):
        return "googlecalendar"
    if u.startswith("GOOGLEDRIVE"):
        return "googledrive"
    if u.startswith("GOOGLE"):
        return "googlecalendar"
    return "integration"


def resolve_composio_slug(params: dict) -> tuple[str | None, str | None, str | None]:
    """
    Returns (slug, toolkit_hint, error_message).

    Requires ``params.slug`` (Composio tool slug). Optional ``params.arguments`` or ``params.args``.
    """
    raw_slug = (params.get("slug") or "").strip()
    if not raw_slug:
        return (
            None,
            None,
            'api_call requires params.slug (Composio tool slug, e.g. "GMAIL_SEND_EMAIL").',
        )
    slug = raw_slug.upper()
    return slug, toolkit_hint_from_slug(slug), None


def args_from_params(params: dict) -> dict:
    """Prefer arguments; fall back to args."""
    if isinstance(params.get("arguments"), dict):
        return dict(params["arguments"])
    if isinstance(params.get("args"), dict):
        return dict(params["args"])
    return {}
