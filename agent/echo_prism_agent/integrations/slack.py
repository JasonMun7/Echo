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
    """
    Perform a Slack Web API call using a bearer OAuth access token.
    
    Supported logical methods:
    - "list_channels": calls `conversations.list` for public channels. Accepts `limit` in `args`.
    - "post_message": calls `chat.postMessage`. Requires `args["channel"]`; optional `args["text"]`.
    
    Parameters:
        method (str): Logical method name (e.g., "list_channels", "post_message").
        args (dict[str, Any]): Method-specific arguments (see supported methods above).
        access_token (str): OAuth bearer token used in the Authorization header.
    
    Returns:
        dict: A result object with the following keys:
            - `ok` (bool): `true` if the Slack API reported success, `false` otherwise.
            - `result` (dict): Parsed JSON response from Slack on success, or an empty dict on validation/unknown-method failures.
            - `error` (str, optional): Present when `ok` is `false`, with values like `"missing_access_token"`, `"channel required"`, or `"unknown_method:<method>"`.
    """
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
