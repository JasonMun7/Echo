"""Google Calendar integration connector."""
import httpx

METHODS = {
    "list_events": {
        "description": "List upcoming calendar events",
        "args": {"max_results": "integer (default 10)", "calendar_id": "string (default 'primary')"},
    },
    "create_event": {
        "description": "Create a new calendar event",
        "args": {
            "summary": "string (event title)",
            "start": "string (ISO 8601 datetime)",
            "end": "string (ISO 8601 datetime)",
            "description": "string (optional)",
            "location": "string (optional)",
        },
    },
    "delete_event": {
        "description": "Delete a calendar event",
        "args": {"event_id": "string", "calendar_id": "string (default 'primary')"},
    },
}

BASE_URL = "https://www.googleapis.com/calendar/v3"


async def execute(method: str, args: dict, token: str) -> dict:
    """Execute a Google Calendar API call."""
    headers = {"Authorization": f"Bearer {token}"}
    calendar_id = args.get("calendar_id", "primary")

    async with httpx.AsyncClient(timeout=15.0) as client:
        if method == "list_events":
            max_results = args.get("max_results", 10)
            resp = await client.get(
                f"{BASE_URL}/calendars/{calendar_id}/events",
                headers=headers,
                params={
                    "maxResults": max_results,
                    "orderBy": "startTime",
                    "singleEvents": True,
                },
            )
            data = resp.json()
            events = [
                {
                    "id": e.get("id"),
                    "summary": e.get("summary"),
                    "start": e.get("start"),
                    "end": e.get("end"),
                }
                for e in data.get("items", [])
            ]
            return {"ok": True, "events": events}

        elif method == "create_event":
            event_body = {
                "summary": args.get("summary", ""),
                "description": args.get("description", ""),
                "location": args.get("location", ""),
                "start": {"dateTime": args.get("start", ""), "timeZone": "UTC"},
                "end": {"dateTime": args.get("end", ""), "timeZone": "UTC"},
            }
            resp = await client.post(
                f"{BASE_URL}/calendars/{calendar_id}/events",
                headers={**headers, "Content-Type": "application/json"},
                json=event_body,
            )
            data = resp.json()
            return {"ok": resp.status_code == 200, "event_id": data.get("id"), "link": data.get("htmlLink")}

        elif method == "delete_event":
            event_id = args.get("event_id", "")
            resp = await client.delete(
                f"{BASE_URL}/calendars/{calendar_id}/events/{event_id}",
                headers=headers,
            )
            return {"ok": resp.status_code == 204}

        else:
            return {"ok": False, "error": f"Unknown method: {method}"}
