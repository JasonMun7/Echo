"""Exchange Firebase Bearer for a short-lived HttpOnly cookie used by EventSource (SSE)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response

from app.auth import get_current_uid
from app.sse_session import SSE_COOKIE_NAME, SSE_MAX_AGE_SEC, issue_sse_cookie_value

router = APIRouter(tags=["session"])


@router.post("/session/sse")
async def exchange_sse_session(
    request: Request,
    response: Response,
    uid: str = Depends(get_current_uid),
) -> dict:
    """
    Set HttpOnly cookie valid for GET /api/run/*/stream (EventSource cannot send Bearer).
    Call with credentials: 'include' from the browser before opening EventSource.
    """
    token = issue_sse_cookie_value(uid)
    secure = request.url.scheme == "https"
    response.set_cookie(
        key=SSE_COOKIE_NAME,
        value=token,
        max_age=SSE_MAX_AGE_SEC,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/api/run",
    )
    return {"ok": True}
