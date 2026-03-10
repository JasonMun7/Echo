"""Gmail integration connector (uses Google OAuth token from Firebase sign-in)."""
import base64
import email.mime.text
import httpx

METHODS = {
    "send_email": {
        "description": "Send an email",
        "args": {"to": "string", "subject": "string", "body": "string", "cc": "string (optional)"},
    },
    "list_messages": {
        "description": "List recent inbox messages",
        "args": {"max_results": "integer (default 10)", "query": "string (Gmail search query)"},
    },
    "get_message": {
        "description": "Get a specific message by ID",
        "args": {"message_id": "string"},
    },
}

BASE_URL = "https://gmail.googleapis.com/gmail/v1/users/me"


async def execute(method: str, args: dict, token: str) -> dict:
    """Execute a Gmail API call."""
    headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient(timeout=15.0) as client:
        if method == "send_email":
            to = args.get("to", "")
            subject = args.get("subject", "")
            body = args.get("body", "")
            cc = args.get("cc", "")

            msg = email.mime.text.MIMEText(body)
            msg["to"] = to
            msg["subject"] = subject
            if cc:
                msg["cc"] = cc

            raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
            resp = await client.post(
                f"{BASE_URL}/messages/send",
                headers={**headers, "Content-Type": "application/json"},
                json={"raw": raw},
            )
            data = resp.json()
            return {"ok": resp.status_code == 200, "id": data.get("id"), "error": data.get("error")}

        elif method == "list_messages":
            max_results = args.get("max_results", 10)
            query = args.get("query", "in:inbox")
            resp = await client.get(
                f"{BASE_URL}/messages",
                headers=headers,
                params={"maxResults": max_results, "q": query},
            )
            data = resp.json()
            messages = data.get("messages", [])
            return {"ok": True, "messages": messages, "count": len(messages)}

        elif method == "get_message":
            msg_id = args.get("message_id", "")
            resp = await client.get(
                f"{BASE_URL}/messages/{msg_id}",
                headers=headers,
                params={"format": "metadata"},
            )
            return {"ok": resp.status_code == 200, "message": resp.json()}

        else:
            return {"ok": False, "error": f"Unknown method: {method}"}
