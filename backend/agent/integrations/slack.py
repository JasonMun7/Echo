"""Slack integration connector."""
import httpx

METHODS = {
    "send_message": {
        "description": "Send a message to a Slack channel",
        "args": {"channel": "string (channel name or ID)", "text": "string (message text)"},
    },
    "list_channels": {
        "description": "List public channels in the workspace",
        "args": {},
    },
    "send_dm": {
        "description": "Send a direct message to a user",
        "args": {"user_id": "string", "text": "string"},
    },
}


async def execute(method: str, args: dict, token: str) -> dict:
    """Execute a Slack API call."""
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=10.0) as client:
        if method == "send_message":
            resp = await client.post(
                "https://slack.com/api/chat.postMessage",
                headers=headers,
                json={"channel": args.get("channel", ""), "text": args.get("text", "")},
            )
            data = resp.json()
            return {"ok": data.get("ok", False), "ts": data.get("ts"), "error": data.get("error")}

        elif method == "list_channels":
            resp = await client.get(
                "https://slack.com/api/conversations.list",
                headers=headers,
                params={"limit": 100, "types": "public_channel"},
            )
            data = resp.json()
            channels = [{"id": c["id"], "name": c["name"]} for c in data.get("channels", [])]
            return {"ok": data.get("ok", False), "channels": channels}

        elif method == "send_dm":
            # Open DM channel first
            open_resp = await client.post(
                "https://slack.com/api/conversations.open",
                headers=headers,
                json={"users": args.get("user_id", "")},
            )
            channel = open_resp.json().get("channel", {}).get("id", "")
            resp = await client.post(
                "https://slack.com/api/chat.postMessage",
                headers=headers,
                json={"channel": channel, "text": args.get("text", "")},
            )
            data = resp.json()
            return {"ok": data.get("ok", False), "ts": data.get("ts")}

        else:
            return {"ok": False, "error": f"Unknown method: {method}"}
