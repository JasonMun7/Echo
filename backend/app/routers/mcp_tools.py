"""
User MCP Tools CRUD: GET/POST/PUT/DELETE /api/mcp-tools + POST /api/mcp-tools/{id}/test
"""
import logging
import uuid

import firebase_admin.firestore
import httpx
from fastapi import APIRouter, Depends, HTTPException
from google.cloud.firestore import SERVER_TIMESTAMP
from pydantic import BaseModel

from app.auth import get_current_uid, get_firebase_app

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/mcp-tools", tags=["mcp-tools"])


class McpToolBody(BaseModel):
    name: str
    description: str
    url: str
    method: str = "POST"
    headers: dict = {}
    input_schema: dict = {}


@router.get("")
async def list_mcp_tools(uid: str = Depends(get_current_uid)):
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    docs = (
        db.collection("users").document(uid).collection("mcp_tools").stream()
    )
    tools = [{"id": d.id, **d.to_dict()} for d in docs]
    return {"tools": tools}


@router.post("")
async def create_mcp_tool(body: McpToolBody, uid: str = Depends(get_current_uid)):
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    tool_id = str(uuid.uuid4())
    data = {
        **body.model_dump(),
        "createdAt": SERVER_TIMESTAMP,
        "updatedAt": SERVER_TIMESTAMP,
    }
    db.collection("users").document(uid).collection("mcp_tools").document(tool_id).set(data)
    return {"id": tool_id, **body.model_dump()}


@router.put("/{tool_id}")
async def update_mcp_tool(
    tool_id: str,
    body: McpToolBody,
    uid: str = Depends(get_current_uid),
):
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    ref = db.collection("users").document(uid).collection("mcp_tools").document(tool_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="Tool not found")
    ref.update({**body.model_dump(), "updatedAt": SERVER_TIMESTAMP})
    return {"id": tool_id, **body.model_dump()}


@router.delete("/{tool_id}")
async def delete_mcp_tool(tool_id: str, uid: str = Depends(get_current_uid)):
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    ref = db.collection("users").document(uid).collection("mcp_tools").document(tool_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="Tool not found")
    ref.delete()
    return {"ok": True}


@router.post("/{tool_id}/test")
async def test_mcp_tool(tool_id: str, uid: str = Depends(get_current_uid)):
    """Test-call a user MCP tool with empty args and return the response."""
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    ref = db.collection("users").document(uid).collection("mcp_tools").document(tool_id)
    doc = ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Tool not found")

    tool = doc.to_dict() or {}
    url = tool.get("url", "")
    method = tool.get("method", "POST").upper()
    headers = tool.get("headers", {})

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            if method == "GET":
                resp = await client.get(url, headers=headers)
            else:
                resp = await client.post(url, headers=headers, json={})
        # Update lastTestedAt
        ref.update({"lastTestedAt": SERVER_TIMESTAMP})
        return {
            "ok": resp.status_code < 400,
            "status_code": resp.status_code,
            "response": resp.text[:500],
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}
