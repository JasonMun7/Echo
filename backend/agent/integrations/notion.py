"""Notion integration connector."""
import httpx

METHODS = {
    "create_page": {
        "description": "Create a new Notion page in a database",
        "args": {"database_id": "string", "title": "string", "content": "string (optional)"},
    },
    "query_database": {
        "description": "Query a Notion database",
        "args": {"database_id": "string", "filter": "object (optional Notion filter)"},
    },
    "update_page": {
        "description": "Update a Notion page's title or properties",
        "args": {"page_id": "string", "title": "string (optional)"},
    },
}

BASE_URL = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"


async def execute(method: str, args: dict, token: str) -> dict:
    """Execute a Notion API call."""
    headers = {
        "Authorization": f"Bearer {token}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        if method == "create_page":
            database_id = args.get("database_id", "")
            title = args.get("title", "Untitled")
            content = args.get("content", "")
            body = {
                "parent": {"database_id": database_id},
                "properties": {
                    "Name": {"title": [{"text": {"content": title}}]}
                },
            }
            if content:
                body["children"] = [
                    {
                        "object": "block",
                        "type": "paragraph",
                        "paragraph": {"rich_text": [{"text": {"content": content}}]},
                    }
                ]
            resp = await client.post(f"{BASE_URL}/pages", headers=headers, json=body)
            data = resp.json()
            return {"ok": resp.status_code == 200, "page_id": data.get("id"), "url": data.get("url")}

        elif method == "query_database":
            database_id = args.get("database_id", "")
            filter_ = args.get("filter")
            body = {}
            if filter_:
                body["filter"] = filter_
            resp = await client.post(
                f"{BASE_URL}/databases/{database_id}/query", headers=headers, json=body
            )
            data = resp.json()
            pages = [{"id": p.get("id"), "url": p.get("url")} for p in data.get("results", [])]
            return {"ok": True, "pages": pages, "count": len(pages)}

        elif method == "update_page":
            page_id = args.get("page_id", "")
            title = args.get("title")
            props = {}
            if title:
                props["Name"] = {"title": [{"text": {"content": title}}]}
            resp = await client.patch(
                f"{BASE_URL}/pages/{page_id}", headers=headers, json={"properties": props}
            )
            return {"ok": resp.status_code == 200}

        else:
            return {"ok": False, "error": f"Unknown method: {method}"}
