"""
Maximum Google OAuth 2 scopes Echo may use when fully enabled in Auth0 + Google consent.

Auth0’s Google connection UI groups these as Calendar / Gmail / Drive / etc. Enable only what
you need; the federated access token will include scopes the user consented to.

Canonical scope URLs: https://developers.google.com/identity/protocols/oauth2/scopes
"""

from __future__ import annotations

# (Auth0 / Google Cloud label, OAuth 2 scope URL)
# Aligns with Auth0 Social → Google: Basic/Extended profile, Calendar, Gmail, Drive, Sheets, Slides, Contacts, Tasks.
GOOGLE_OAUTH_MAX_BY_PRODUCT: dict[str, list[tuple[str, str]]] = {
    "Sign-in / profile": [
        ("openid", "openid"),
        ("email", "https://www.googleapis.com/auth/userinfo.email"),
        ("profile", "https://www.googleapis.com/auth/userinfo.profile"),
    ],
    "Calendar": [
        ("Calendar.FreeBusy", "https://www.googleapis.com/auth/calendar.freebusy"),
        ("Calendar (full)", "https://www.googleapis.com/auth/calendar"),
        ("Calendar.Read", "https://www.googleapis.com/auth/calendar.readonly"),
        ("Calendar.Events", "https://www.googleapis.com/auth/calendar.events"),
        ("Calendar.Events.ReadOnly", "https://www.googleapis.com/auth/calendar.events.readonly"),
        (
            "Calendar.Settings.ReadOnly",
            "https://www.googleapis.com/auth/calendar.settings.readonly",
        ),
        ("Calendar.Addons.Execute", "https://www.googleapis.com/auth/calendar.addons.execute"),
    ],
    "Gmail": [
        ("Gmail.Labels", "https://www.googleapis.com/auth/gmail.labels"),
        ("Gmail.Send", "https://www.googleapis.com/auth/gmail.send"),
        ("Gmail.Readonly", "https://www.googleapis.com/auth/gmail.readonly"),
        ("Gmail.Compose", "https://www.googleapis.com/auth/gmail.compose"),
        ("Gmail.Insert", "https://www.googleapis.com/auth/gmail.insert"),
        ("Gmail.Modify", "https://www.googleapis.com/auth/gmail.modify"),
        ("Gmail.Metadata", "https://www.googleapis.com/auth/gmail.metadata"),
        ("Gmail.Settings.Basic", "https://www.googleapis.com/auth/gmail.settings.basic"),
        ("Gmail.Settings.Sharing", "https://www.googleapis.com/auth/gmail.settings.sharing"),
        (
            "Gmail (full mailbox)",
            "https://mail.google.com/",
        ),
    ],
    "Drive": [
        ("Drive.Apps.ReadOnly", "https://www.googleapis.com/auth/drive.apps.readonly"),
        ("Drive.Activity", "https://www.googleapis.com/auth/drive.activity"),
        ("Drive.Activity.ReadOnly", "https://www.googleapis.com/auth/drive.activity.readonly"),
        ("Drive (full)", "https://www.googleapis.com/auth/drive"),
        ("Drive.ReadOnly", "https://www.googleapis.com/auth/drive.readonly"),
        ("Drive.File", "https://www.googleapis.com/auth/drive.file"),
        ("Drive.Appdata", "https://www.googleapis.com/auth/drive.appdata"),
        ("Drive.Metadata", "https://www.googleapis.com/auth/drive.metadata"),
        ("Drive.Metadata.ReadOnly", "https://www.googleapis.com/auth/drive.metadata.readonly"),
        ("Drive.Photos.ReadOnly", "https://www.googleapis.com/auth/drive.photos.readonly"),
        ("Drive.Scripts", "https://www.googleapis.com/auth/drive.scripts"),
    ],
    "Sheets": [
        ("Spreadsheets", "https://www.googleapis.com/auth/spreadsheets"),
        ("Spreadsheets.ReadOnly", "https://www.googleapis.com/auth/spreadsheets.readonly"),
    ],
    "Slides": [
        ("Presentations", "https://www.googleapis.com/auth/presentations"),
        ("Presentations.ReadOnly", "https://www.googleapis.com/auth/presentations.readonly"),
    ],
    "Contacts": [
        ("Contacts (full)", "https://www.googleapis.com/auth/contacts"),
        ("Contacts.ReadOnly", "https://www.googleapis.com/auth/contacts.readonly"),
        ("Contacts.Other.ReadOnly", "https://www.googleapis.com/auth/contacts.other.readonly"),
        ("Directory.ReadOnly", "https://www.googleapis.com/auth/directory.readonly"),
    ],
    "Tasks": [
        ("Tasks (full)", "https://www.googleapis.com/auth/tasks"),
        ("Tasks.Readonly", "https://www.googleapis.com/auth/tasks.readonly"),
    ],
}


def all_max_scope_urls() -> frozenset[str]:
    """Distinct OAuth scope URLs if every group above is enabled."""
    urls: set[str] = set()
    for _product, pairs in GOOGLE_OAUTH_MAX_BY_PRODUCT.items():
        for _label, scope in pairs:
            urls.add(scope)
    return frozenset(urls)
