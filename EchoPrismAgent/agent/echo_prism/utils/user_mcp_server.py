"""
EchoPrism User MCP Server — Dynamic tool loading from Firestore.

Builds a list of FunctionDeclaration-compatible dicts from a user's
registered custom HTTP tools (users/{uid}/mcp_tools collection).
These are injected into EchoPrism's Gemini call as additional tools so
EchoPrism can call user-registered webhooks/APIs mid-workflow.
"""
import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)


def load_user_tool_declarations(uid: str, db: Any) -> list[dict]:
    """
    Returns a list of function declaration dicts for the user's registered MCP tools.
    Each dict has: name, description, parameters (JSON Schema object).
    """
    try:
        tools_ref = db.collection("users").document(uid).collection("mcp_tools")
        tool_docs = list(tools_ref.stream())
    except Exception as e:
        logger.warning("Failed to load user MCP tools for uid=%s: %s", uid, e)
        return []

    declarations = []
    for doc in tool_docs:
        data = doc.to_dict() or {}
        name = data.get("name", "").strip().replace(" ", "_")
        if not name:
            continue
        schema = data.get("input_schema") or {"type": "object", "properties": {}}
        declarations.append({
            "name": name,
            "description": data.get("description", f"Call the {name} tool"),
            "parameters": schema,
            "_tool_id": doc.id,
        })

    logger.info("Loaded %d user MCP tools for uid=%s", len(declarations), uid)
    return declarations


async def execute_user_tool(tool_name: str, args: dict, uid: str, db: Any) -> dict:
    """
    Execute a user-registered MCP tool by sending an HTTP request to its URL.
    Looks up the tool by name in Firestore, then calls its configured endpoint.

    Returns: {"ok": bool, "result": any, "error": str | None}
    """
    try:
        tools_ref = db.collection("users").document(uid).collection("mcp_tools")
        matching = [
            doc.to_dict() | {"id": doc.id}
            for doc in tools_ref.stream()
            if (doc.to_dict() or {}).get("name", "").replace(" ", "_") == tool_name
        ]
        if not matching:
            return {"ok": False, "result": None, "error": f"Tool '{tool_name}' not found"}

        tool = matching[0]
        url = tool.get("url", "")
        method = (tool.get("method") or "POST").upper()
        headers = tool.get("headers") or {"Content-Type": "application/json"}

        if not url:
            return {"ok": False, "result": None, "error": "Tool has no URL configured"}

        async with httpx.AsyncClient(timeout=30.0) as client:
            if method == "GET":
                resp = await client.get(url, params=args, headers=headers)
            else:
                resp = await client.request(method, url, json=args, headers=headers)

        try:
            result = resp.json()
        except Exception:
            result = resp.text

        if resp.status_code >= 400:
            return {"ok": False, "result": result, "error": f"HTTP {resp.status_code}"}

        return {"ok": True, "result": result, "error": None}

    except httpx.TimeoutException:
        return {"ok": False, "result": None, "error": "Request timed out"}
    except Exception as e:
        logger.exception("Error executing user MCP tool '%s': %s", tool_name, e)
        return {"ok": False, "result": None, "error": str(e)}
