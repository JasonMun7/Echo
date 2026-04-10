"""Slack Web API connector (Bearer token)."""

from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

METHODS: dict[str, str] = {
    "list_channels": "List public channels (conversations.list)",
    "post_message": "Post a message to a channel (chat.postMessage)",
}


async def execute(method: str, args: dict[str, Any], access_token: str) -> dict[str, Any]:
    if not access_token:
        return {"ok": False, "error": "missing_access_token", "result": {}}
    method = (method or "").strip().lower().replace("-", "_")
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=30.0) as client:
        if method == "list_channels":
            r = await client.get(
                "https://slack.com/api/conversations.list",
                headers=headers,
                params={"types": "public_channel", "limit": args.get("limit", 100)},
            )
            data = r.json()
            return {"ok": bool(data.get("ok")), "result": data}
        if method == "post_message":
            body = {
                "channel": args.get("channel", ""),
                "text": args.get("text", ""),
            }
            if not body["channel"]:
                return {"ok": False, "error": "channel required", "result": {}}
            r = await client.post("https://slack.com/api/chat.postMessage", headers=headers, json=body)
            data = r.json()
            return {"ok": bool(data.get("ok")), "result": data}

    return {"ok": False, "error": f"unknown_method:{method}", "result": {}}
