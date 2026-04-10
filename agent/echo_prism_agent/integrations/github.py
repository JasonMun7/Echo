"""GitHub REST API connector (Bearer token)."""

from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

METHODS: dict[str, str] = {
    "list_repos": "List repositories for the authenticated user",
    "create_issue": "Create an issue on a repository",
}


async def execute(method: str, args: dict[str, Any], access_token: str) -> dict[str, Any]:
    if not access_token:
        return {"ok": False, "error": "missing_access_token", "result": {}}
    method = (method or "").strip().lower().replace("-", "_")
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/vnd.github+json",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        if method == "list_repos":
            r = await client.get(
                "https://api.github.com/user/repos",
                headers=headers,
                params={"per_page": args.get("per_page", 30)},
            )
            if r.status_code >= 400:
                return {"ok": False, "error": r.text, "result": {}}
            return {"ok": True, "result": r.json()}
        if method == "create_issue":
            owner = args.get("owner", "")
            repo = args.get("repo", "")
            title = args.get("title", "")
            if not owner or not repo or not title:
                return {"ok": False, "error": "owner, repo, title required", "result": {}}
            body = {"title": title, "body": args.get("body", "")}
            r = await client.post(
                f"https://api.github.com/repos/{owner}/{repo}/issues",
                headers=headers,
                json=body,
            )
            if r.status_code >= 400:
                return {"ok": False, "error": r.text, "result": {}}
            return {"ok": True, "result": r.json()}

    return {"ok": False, "error": f"unknown_method:{method}", "result": {}}
