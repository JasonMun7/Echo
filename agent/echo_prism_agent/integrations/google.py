"""Google APIs connector (Bearer token from Auth0 Token Vault → Google).

Each method needs the corresponding OAuth scopes on the Auth0 Google connection
and Google Cloud consent screen; otherwise Google returns 403.

Maximum scope groups Auth0/Google may offer for this integration: see
``google_scopes.GOOGLE_OAUTH_MAX_BY_PRODUCT``.
"""
from __future__ import annotations

import base64
from email.message import EmailMessage
from typing import Any

import httpx

from echo_prism_agent.integrations.gmail_content_guard import (
    gmail_data_guard_error_message,
    gmail_send_body_likely_missing_requested_data,
)
from echo_prism_agent.integrations.google_rest import execute_rest
from echo_prism_agent.integrations.user_text_sanitize import strip_vlm_placeholders

_FREEBUSY_URL = "https://www.googleapis.com/calendar/v3/freeBusy"
_GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"


def _truthy_skip_gmail_data_guard(args: dict[str, Any]) -> bool:
    """Per-send opt-out after human review (workflow ``api_call`` args only)."""
    for key in ("skip_data_guard", "skip_content_guard"):
        v = args.get(key)
        if v is True:
            return True
        if isinstance(v, str) and v.strip().lower() in ("1", "true", "yes", "on"):
            return True
    return False


def _bounded_int(args: dict[str, Any], key: str, default: int, cap: int) -> int:
    try:
        v = int(args.get(key, default))
        return max(1, min(v, cap))
    except (TypeError, ValueError):
        return default


METHODS: dict[str, str] = {
    "rest": (
        "Generic Google REST to any *.googleapis.com URL — args: { verb|http_method, url, params?, json?, "
        "headers?, timeout_seconds? }. Covers Calendar, Gmail, Drive, Sheets, Slides, People (Contacts), Tasks "
        "per OAuth scopes enabled in Auth0 (see google_scopes.py). Alias: google_rest."
    ),
    "userinfo": "GET oauth2/v3/userinfo — basic profile (openid / profile / email)",
    "calendar_list": "GET calendar/v3/users/me/calendarList — needs calendar or calendar.readonly",
    "calendar_freebusy": "POST calendar/v3/freeBusy — availability query; needs calendar.freebusy (or broader calendar scope)",
    "gmail_list_labels": "GET gmail/v1/users/me/labels — needs gmail.labels or gmail.readonly",
    "gmail_send": (
        "POST gmail/v1/users/me/messages/send — args: { to, subject?, body|text?, cc?, bcc?, html?, "
        "skip_data_guard? (bool, optional) }; needs https://www.googleapis.com/auth/gmail.send. "
        "A content guard blocks prompt-like bodies that ask for data without figures—set skip_data_guard "
        "to true only after you have reviewed the draft (e.g. intentional template mail)."
    ),
    "drive_list_files": "GET drive/v3/files — needs drive.readonly or drive.metadata.readonly",
}
METHODS["google_rest"] = METHODS["rest"]


def _gmail_rfc2822_raw_b64(args: dict[str, Any]) -> tuple[str | None, str | None]:
    """Build Gmail API `raw` field: RFC 2822 message, base64url-encoded without padding."""
    to = (args.get("to") or args.get("to_email") or "").strip()
    if not to:
        return None, "gmail_send requires `to` (recipient email address)"
    subject = strip_vlm_placeholders(str(args.get("subject") or "").strip()) or "(no subject)"
    plain = strip_vlm_placeholders(str(args.get("body") or args.get("text") or ""))
    html = args.get("html")
    if html is not None and str(html).strip():
        html = strip_vlm_placeholders(str(html))
    guard_text = plain
    if html is not None and str(html).strip():
        guard_text = f"{plain}\n{html}"
    if not _truthy_skip_gmail_data_guard(args) and gmail_send_body_likely_missing_requested_data(
        guard_text, subject
    ):
        return None, gmail_data_guard_error_message()
    msg = EmailMessage()
    msg["To"] = to
    if args.get("cc"):
        msg["Cc"] = str(args["cc"]).strip()
    if args.get("bcc"):
        msg["Bcc"] = str(args["bcc"]).strip()
    msg["Subject"] = subject
    if html is not None and str(html).strip():
        msg.set_content(plain if plain else " ", subtype="plain")
        msg.add_alternative(html, subtype="html")
    else:
        msg.set_content(plain if plain else "", subtype="plain")
    raw_bytes = msg.as_bytes()
    raw_b64 = base64.urlsafe_b64encode(raw_bytes).decode("ascii").rstrip("=")
    return raw_b64, None


def _http_result(r: httpx.Response) -> dict[str, Any]:
    if r.status_code >= 400:
        return {"ok": False, "error": r.text or f"http_{r.status_code}", "result": {}}
    try:
        data = r.json()
    except Exception:
        data = {"raw": r.text}
    return {"ok": True, "result": data}


async def execute(method: str, args: dict[str, Any], access_token: str) -> dict[str, Any]:
    if not access_token:
        return {"ok": False, "error": "missing_access_token", "result": {}}
    method = (method or "").strip().lower().replace("-", "_")
    headers = {"Authorization": f"Bearer {access_token}"}

    async with httpx.AsyncClient(timeout=30.0) as client:
        if method in ("rest", "google_rest"):
            return await execute_rest(client, args, headers, _http_result)

        if method == "userinfo":
            r = await client.get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers=headers,
            )
            return _http_result(r)

        if method == "calendar_list":
            params: dict[str, Any] = {
                "maxResults": _bounded_int(args, "maxResults", 10, 250),
            }
            if args.get("pageToken"):
                params["pageToken"] = str(args["pageToken"])
            r = await client.get(
                "https://www.googleapis.com/calendar/v3/users/me/calendarList",
                headers=headers,
                params=params,
            )
            return _http_result(r)

        if method == "calendar_freebusy":
            time_min = (args.get("timeMin") or args.get("time_min") or "").strip()
            time_max = (args.get("timeMax") or args.get("time_max") or "").strip()
            if not time_min or not time_max:
                return {
                    "ok": False,
                    "error": "calendar_freebusy requires timeMin and timeMax (RFC3339)",
                    "result": {},
                }
            body: dict[str, Any] = {
                "timeMin": time_min,
                "timeMax": time_max,
            }
            tz = (args.get("timeZone") or args.get("timezone") or "UTC").strip()
            if tz:
                body["timeZone"] = tz
            items = args.get("items")
            if items is None:
                body["items"] = [{"id": "primary"}]
            elif isinstance(items, list):
                body["items"] = items
            else:
                return {
                    "ok": False,
                    "error": "calendar_freebusy items must be a list of {id: calendarId}",
                    "result": {},
                }
            r = await client.post(
                _FREEBUSY_URL,
                headers={**headers, "Content-Type": "application/json"},
                json=body,
            )
            return _http_result(r)

        if method == "gmail_list_labels":
            r = await client.get(
                "https://gmail.googleapis.com/gmail/v1/users/me/labels",
                headers=headers,
            )
            return _http_result(r)

        if method == "gmail_send":
            raw_b64, err = _gmail_rfc2822_raw_b64(args)
            if err or not raw_b64:
                return {"ok": False, "error": err or "gmail_send_failed_to_build_message", "result": {}}
            r = await client.post(
                _GMAIL_SEND_URL,
                headers={**headers, "Content-Type": "application/json"},
                json={"raw": raw_b64},
            )
            return _http_result(r)

        if method == "drive_list_files":
            params = {
                "pageSize": _bounded_int(args, "pageSize", 10, 100),
                "fields": args.get(
                    "fields",
                    "nextPageToken, files(id, name, mimeType, modifiedTime)",
                ),
            }
            if args.get("q"):
                params["q"] = str(args["q"])
            if args.get("pageToken"):
                params["pageToken"] = str(args["pageToken"])
            r = await client.get(
                "https://www.googleapis.com/drive/v3/files",
                headers=headers,
                params=params,
            )
            return _http_result(r)

    return {"ok": False, "error": f"unknown_method:{method}", "result": {}}
