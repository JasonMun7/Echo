"""
Notifications: GET /api/notifications, PATCH /api/notifications/{id}
Notifications are created when e.g. a workflow is shared with the user.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException

import firebase_admin.firestore
from google.cloud.firestore import SERVER_TIMESTAMP

from app.auth import get_current_uid, get_firebase_app

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(uid: str = Depends(get_current_uid)):
    """List notifications for the current user, newest first."""
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    docs = (
        db.collection("notifications")
        .where("to_uid", "==", uid)
        .order_by("createdAt", direction="DESCENDING")
        .limit(100)
        .stream()
    )
    items = []
    for d in docs:
        data = d.to_dict() or {}
        items.append({"id": d.id, **data})
    return {"notifications": items}


@router.patch("/{notification_id}")
async def mark_notification_read(
    notification_id: str,
    uid: str = Depends(get_current_uid),
):
    """Mark a notification as read. Only the recipient can update."""
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    ref = db.collection("notifications").document(notification_id)
    doc = ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Notification not found")
    data = doc.to_dict() or {}
    if data.get("to_uid") != uid:
        raise HTTPException(status_code=403, detail="Forbidden")
    ref.update({"read": True, "readAt": SERVER_TIMESTAMP})
    return {"ok": True}
