"""Unit tests for Slack, GitHub, and Google integration connectors (mocked HTTP)."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from echo_prism_agent.integrations import github, google, slack


def _run(coro):
    return asyncio.run(coro)


def test_google_missing_token() -> None:
    out = _run(google.execute("userinfo", {}, ""))
    assert out["ok"] is False
    assert out.get("error") == "missing_access_token"


def test_google_unknown_method() -> None:
    out = _run(google.execute("not_a_real_method", {}, "tok"))
    assert out["ok"] is False
    assert "unknown_method" in (out.get("error") or "")


def test_google_rest_requires_url() -> None:
    out = _run(google.execute("rest", {}, "tok"))
    assert out["ok"] is False
    assert "url" in (out.get("error") or "").lower()


def test_google_rest_rejects_non_googleapis_host() -> None:
    out = _run(
        google.execute(
            "rest",
            {"verb": "GET", "url": "https://evil.example.com/"},
            "tok",
        )
    )
    assert out["ok"] is False
    assert "googleapis" in (out.get("error") or "").lower()


@patch("echo_prism_agent.integrations.google.httpx.AsyncClient")
def test_google_rest_get(mock_ac: MagicMock) -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json = MagicMock(return_value={"items": []})
    mc = MagicMock()
    mc.request = AsyncMock(return_value=mock_resp)
    mock_ac.return_value.__aenter__ = AsyncMock(return_value=mc)
    mock_ac.return_value.__aexit__ = AsyncMock(return_value=None)

    out = _run(
        google.execute(
            "google_rest",
            {
                "url": "https://tasks.googleapis.com/tasks/v1/users/@me/lists",
                "verb": "GET",
            },
            "tok",
        )
    )
    assert out["ok"] is True
    call_kw = mc.request.call_args
    assert call_kw[1]["method"] == "GET"
    assert "tasks.googleapis.com" in call_kw[1]["url"]


@patch("echo_prism_agent.integrations.google.httpx.AsyncClient")
def test_google_userinfo_success(mock_ac: MagicMock) -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json = MagicMock(return_value={"email": "a@example.com", "sub": "x"})
    mc = MagicMock()
    mc.get = AsyncMock(return_value=mock_resp)
    mock_ac.return_value.__aenter__ = AsyncMock(return_value=mc)
    mock_ac.return_value.__aexit__ = AsyncMock(return_value=None)

    out = _run(google.execute("userinfo", {}, "Bearer-token"))
    assert out["ok"] is True
    assert out["result"]["email"] == "a@example.com"


@patch("echo_prism_agent.integrations.google.httpx.AsyncClient")
def test_google_userinfo_http_error(mock_ac: MagicMock) -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 401
    mock_resp.text = "invalid_token"
    mc = MagicMock()
    mc.get = AsyncMock(return_value=mock_resp)
    mock_ac.return_value.__aenter__ = AsyncMock(return_value=mc)
    mock_ac.return_value.__aexit__ = AsyncMock(return_value=None)

    out = _run(google.execute("userinfo", {}, "bad"))
    assert out["ok"] is False
    assert "invalid_token" in (out.get("error") or "")


def test_google_calendar_freebusy_missing_times() -> None:
    out = _run(google.execute("calendar_freebusy", {}, "tok"))
    assert out["ok"] is False
    assert "timeMin" in (out.get("error") or "")


@patch("echo_prism_agent.integrations.google.httpx.AsyncClient")
def test_google_calendar_freebusy(mock_ac: MagicMock) -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json = MagicMock(
        return_value={
            "calendars": {
                "primary": {"busy": []},
            },
        }
    )
    mc = MagicMock()
    mc.post = AsyncMock(return_value=mock_resp)
    mock_ac.return_value.__aenter__ = AsyncMock(return_value=mc)
    mock_ac.return_value.__aexit__ = AsyncMock(return_value=None)

    out = _run(
        google.execute(
            "calendar_freebusy",
            {
                "timeMin": "2026-04-06T10:00:00Z",
                "timeMax": "2026-04-06T11:00:00Z",
                "timeZone": "UTC",
            },
            "tok",
        )
    )
    assert out["ok"] is True
    assert out["result"]["calendars"]["primary"]["busy"] == []
    call_kw = mc.post.call_args
    assert "calendar/v3/freeBusy" in call_kw[0][0]
    posted = call_kw[1]["json"]
    assert posted["timeMin"] == "2026-04-06T10:00:00Z"
    assert posted["timeMax"] == "2026-04-06T11:00:00Z"
    assert posted["items"] == [{"id": "primary"}]


@patch("echo_prism_agent.integrations.google.httpx.AsyncClient")
def test_google_calendar_list(mock_ac: MagicMock) -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json = MagicMock(return_value={"items": [{"id": "primary"}]})
    mc = MagicMock()
    mc.get = AsyncMock(return_value=mock_resp)
    mock_ac.return_value.__aenter__ = AsyncMock(return_value=mc)
    mock_ac.return_value.__aexit__ = AsyncMock(return_value=None)

    out = _run(google.execute("calendar_list", {"maxResults": 5}, "tok"))
    assert out["ok"] is True
    assert out["result"]["items"][0]["id"] == "primary"
    call_kw = mc.get.call_args
    assert "calendar/v3/users/me/calendarList" in call_kw[0][0]


def test_google_gmail_send_missing_to() -> None:
    out = _run(google.execute("gmail_send", {"subject": "x", "body": "y"}, "tok"))
    assert out["ok"] is False
    assert "to" in (out.get("error") or "").lower()


@patch("echo_prism_agent.integrations.google.httpx.AsyncClient")
def test_google_gmail_send(mock_ac: MagicMock) -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json = MagicMock(return_value={"id": "msg123", "threadId": "t1"})
    mc = MagicMock()
    mc.post = AsyncMock(return_value=mock_resp)
    mock_ac.return_value.__aenter__ = AsyncMock(return_value=mc)
    mock_ac.return_value.__aexit__ = AsyncMock(return_value=None)

    out = _run(
        google.execute(
            "gmail_send",
            {
                "to": "jason@example.com",
                "subject": "Hello",
                "body": "Sent from Echo",
            },
            "tok",
        )
    )
    assert out["ok"] is True
    assert out["result"]["id"] == "msg123"
    call_kw = mc.post.call_args
    assert "gmail/v1/users/me/messages/send" in call_kw[0][0]
    posted = call_kw[1]["json"]
    assert "raw" in posted
    assert isinstance(posted["raw"], str)
    assert len(posted["raw"]) > 10


@patch("echo_prism_agent.integrations.google.httpx.AsyncClient")
def test_google_gmail_labels(mock_ac: MagicMock) -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json = MagicMock(return_value={"labels": [{"id": "INBOX"}]})
    mc = MagicMock()
    mc.get = AsyncMock(return_value=mock_resp)
    mock_ac.return_value.__aenter__ = AsyncMock(return_value=mc)
    mock_ac.return_value.__aexit__ = AsyncMock(return_value=None)

    out = _run(google.execute("gmail_list_labels", {}, "tok"))
    assert out["ok"] is True
    assert any(l["id"] == "INBOX" for l in out["result"]["labels"])


@patch("echo_prism_agent.integrations.google.httpx.AsyncClient")
def test_google_drive_list(mock_ac: MagicMock) -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json = MagicMock(return_value={"files": [{"id": "1", "name": "a"}]})
    mc = MagicMock()
    mc.get = AsyncMock(return_value=mock_resp)
    mock_ac.return_value.__aenter__ = AsyncMock(return_value=mc)
    mock_ac.return_value.__aexit__ = AsyncMock(return_value=None)

    out = _run(google.execute("drive_list_files", {"q": "mimeType = 'application/vnd.google-apps.folder'"}, "tok"))
    assert out["ok"] is True
    assert out["result"]["files"][0]["name"] == "a"


def test_slack_missing_token() -> None:
    out = _run(slack.execute("list_channels", {}, ""))
    assert out["ok"] is False


def test_slack_unknown_method() -> None:
    out = _run(slack.execute("unknown_xyz", {}, "xoxb-test"))
    assert out["ok"] is False


@patch("echo_prism_agent.integrations.slack.httpx.AsyncClient")
def test_slack_list_channels(mock_ac: MagicMock) -> None:
    mock_resp = MagicMock()
    mock_resp.json = MagicMock(return_value={"ok": True, "channels": [{"id": "C1", "name": "general"}]})
    mc = MagicMock()
    mc.get = AsyncMock(return_value=mock_resp)
    mock_ac.return_value.__aenter__ = AsyncMock(return_value=mc)
    mock_ac.return_value.__aexit__ = AsyncMock(return_value=None)

    out = _run(slack.execute("list_channels", {"limit": 50}, "xoxb-t"))
    assert out["ok"] is True
    assert out["result"]["channels"][0]["name"] == "general"


@patch("echo_prism_agent.integrations.slack.httpx.AsyncClient")
def test_slack_post_message(mock_ac: MagicMock) -> None:
    mock_resp = MagicMock()
    mock_resp.json = MagicMock(return_value={"ok": True, "ts": "123.456"})
    mc = MagicMock()
    mc.post = AsyncMock(return_value=mock_resp)
    mock_ac.return_value.__aenter__ = AsyncMock(return_value=mc)
    mock_ac.return_value.__aexit__ = AsyncMock(return_value=None)

    out = _run(
        slack.execute(
            "post_message",
            {"channel": "C1", "text": "hello"},
            "xoxb-t",
        )
    )
    assert out["ok"] is True


def test_slack_post_message_no_channel() -> None:
    out = _run(slack.execute("post_message", {"text": "hi"}, "tok"))
    assert out["ok"] is False


def test_github_missing_token() -> None:
    out = _run(github.execute("list_repos", {}, ""))
    assert out["ok"] is False


def test_github_create_issue_missing_args() -> None:
    out = _run(github.execute("create_issue", {"owner": "a"}, "ghs_tok"))
    assert out["ok"] is False


@patch("echo_prism_agent.integrations.github.httpx.AsyncClient")
def test_github_list_repos(mock_ac: MagicMock) -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json = MagicMock(return_value=[{"name": "echo", "full_name": "org/echo"}])
    mc = MagicMock()
    mc.get = AsyncMock(return_value=mock_resp)
    mock_ac.return_value.__aenter__ = AsyncMock(return_value=mc)
    mock_ac.return_value.__aexit__ = AsyncMock(return_value=None)

    out = _run(github.execute("list_repos", {}, "ghs_test"))
    assert out["ok"] is True
    assert out["result"][0]["name"] == "echo"


@patch("echo_prism_agent.integrations.github.httpx.AsyncClient")
def test_github_list_repos_http_error(mock_ac: MagicMock) -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 401
    mock_resp.text = "Bad credentials"
    mc = MagicMock()
    mc.get = AsyncMock(return_value=mock_resp)
    mock_ac.return_value.__aenter__ = AsyncMock(return_value=mc)
    mock_ac.return_value.__aexit__ = AsyncMock(return_value=None)

    out = _run(github.execute("list_repos", {}, "bad"))
    assert out["ok"] is False


def test_methods_dicts_nonempty() -> None:
    for mod in (slack, github, google):
        assert getattr(mod, "METHODS", {}), f"{mod.__name__} should expose METHODS"

