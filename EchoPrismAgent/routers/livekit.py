"""
LiveKit integration: token issuance and agent tool execution.

- POST /api/livekit/token: issue LiveKit room token (Bearer Firebase ID token)
- POST /api/agent/tool: execute EchoPrism tool (X-Agent-Secret + uid, used by LiveKit agent)
"""
import logging
import os
import sys
from pathlib import Path

import firebase_admin.firestore
from fastapi import APIRouter, Body, Depends, HTTPException, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.auth import get_firebase_app
from app.config import (
    LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET,
    LIVEKIT_AGENT_SECRET,
    LIVEKIT_URL,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["livekit"])
security = HTTPBearer(auto_error=False)


def _verify_firebase_token(token: str) -> str | None:
    """Verify Firebase ID token and return uid."""
    try:
        from firebase_admin import auth as firebase_auth
        get_firebase_app()
        decoded = firebase_auth.verify_id_token(token)
        return decoded.get("uid")
    except Exception:
        return None


def _ensure_agent_path() -> None:
    """Ensure agent (echo_prism, etc.) is on sys.path."""
    base = Path(__file__).resolve().parent.parent
    agent_dir = base / "agent" if (base / "agent").exists() else base / "backend" / "agent"
    if not agent_dir.exists():
        agent_dir = base.parent.parent / "backend" / "agent"
    agent_dir = agent_dir.resolve()
    if agent_dir.exists() and str(agent_dir) not in sys.path:
        sys.path.insert(0, str(agent_dir))


class LiveKitTokenBody(BaseModel):
    """LiveKit endpoint token request body (standard format)."""
    room_name: str | None = None
    participant_identity: str | None = None
    participant_name: str | None = None
    participant_metadata: str | None = None
    participant_attributes: dict | None = None
    room_config: dict | None = None


@router.post("/livekit/token")
async def livekit_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    body: LiveKitTokenBody | None = Body(None),
) -> dict:
    """
    Issue a LiveKit room token for the authenticated user.
    Standard endpoint format: POST JSON with room_name, room_config, etc.
    Requires: Authorization: Bearer <Firebase ID token>
    Returns: { server_url, participant_token }
    """
    if not credentials:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    if not LIVEKIT_API_KEY or not LIVEKIT_API_SECRET or not LIVEKIT_URL:
        raise HTTPException(
            status_code=503,
            detail="LiveKit not configured (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)",
        )

    uid = _verify_firebase_token(credentials.credentials)
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    try:
        from livekit.api import AccessToken, VideoGrants
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="livekit-api package not installed",
        )

    room_name = (body and body.room_name) or f"echoprism-{uid}"
    token = AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
    token = token.with_identity(uid).with_name(uid)
    token = token.with_grants(VideoGrants(
        room_join=True,
        room_create=True,
        room=room_name,
        can_publish=True,
        can_subscribe=True,
        can_publish_data=True,
    ))

    # Embed participant attributes (e.g. mode=voice-interruption, workflow_id, run_id)
    participant_attributes: dict[str, str] | None = None
    if body and body.participant_attributes and isinstance(body.participant_attributes, dict):
        participant_attributes = {str(k): str(v) for k, v in body.participant_attributes.items()}
        try:
            token = token.with_attributes(participant_attributes)
        except Exception:
            # Fallback: inject via JWT claims below
            pass

    jwt_val = token.to_jwt()

    needs_jwt_patch = (
        (body and body.room_config and isinstance(body.room_config, dict)) or
        participant_attributes
    )
    if needs_jwt_patch:
        # Workaround for google.protobuf FieldDescriptor issues in livekit-api 1.1.0 vs protobuf 6.33
        import jwt
        claims = jwt.decode(jwt_val, options={"verify_signature": False})

        if body and body.room_config and isinstance(body.room_config, dict):
            agents_out = []
            for a in body.room_config.get("agents") or []:
                if isinstance(a, dict):
                    agent_name = a.get("agentName") or a.get("agent_name")
                    if agent_name:
                        agents_out.append({"agentName": agent_name})
            if agents_out:
                claims["roomConfig"] = {"agents": agents_out}

        if participant_attributes:
            # Always overwrite — with_attributes() may silently produce an empty
            # map due to the livekit-api/protobuf version conflict, so we force
            # the correct values here unconditionally.
            claims["attributes"] = participant_attributes

        jwt_val = jwt.encode(claims, LIVEKIT_API_SECRET, algorithm="HS256")

    return {"server_url": LIVEKIT_URL, "participant_token": jwt_val}


class AgentToolRequest(BaseModel):
    uid: str
    name: str
    args: dict = {}


@router.post("/agent/tool")
async def agent_tool(
    body: AgentToolRequest,
    x_agent_secret: str | None = Header(None, alias="X-Agent-Secret"),
) -> dict:
    """
    Execute an EchoPrism tool on behalf of a user.
    Used by the LiveKit agent; requires X-Agent-Secret header (LIVEKIT_AGENT_SECRET).
    """
    if not LIVEKIT_AGENT_SECRET or x_agent_secret != LIVEKIT_AGENT_SECRET:
        raise HTTPException(status_code=403, detail="Invalid agent secret")

    _ensure_agent_path()
    from routers.chat import _execute_tool

    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)

    try:
        result = await _execute_tool(
            body.name,
            body.args,
            body.uid,
            db,
            websocket=None,
        )
        return result
    except Exception as e:
        logger.exception("Agent tool %s failed: %s", body.name, e)
        return {"ok": False, "error": str(e)}
