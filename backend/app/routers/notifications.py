"""
Notifications API (Firebase Admin):
  GET    /api/notifications
  POST   /api/notifications/mark-all-read
  POST   /api/notifications/delete-all
  PATCH  /api/notifications/{id}
  DELETE /api/notifications/{id}

Notifications are created when e.g. a workflow is shared with the user.
"""

import logging

import firebase_admin.firestore
from fastapi import APIRouter, Depends, HTTPException
from google.cloud.firestore import SERVER_TIMESTAMP

from app.auth import get_current_uid, get_firebase_app

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/notifications", tags=["notifications"])

_BATCH_SIZE = 500
# Mark-all / delete-all paginate with `.where("to_uid").order_by("createdAt")` — ensure a composite
# index exists in Firestore for `notifications`: `to_uid` ASC, `createdAt` ASC (Admin SDK will log the
# console link if the index is missing).


def _chunked(items: list, size: int):
    for i in range(0, len(items), size):
        yield items[i : i + size]


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


@router.post("/mark-all-read")
async def mark_all_notifications_read(uid: str = Depends(get_current_uid)):
    """Mark every notification for the current user as read."""
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    updated_total = 0
    last_snap = None
    while True:
        q = db.collection("notifications").where("to_uid", "==", uid).order_by("createdAt").limit(_BATCH_SIZE)
        if last_snap is not None:
            q = q.start_after(last_snap)
        docs = list(q.stream())
        if not docs:
            break
        unread_refs = [d.reference for d in docs if not (d.to_dict() or {}).get("read")]
        for chunk in _chunked(unread_refs, _BATCH_SIZE):
            batch = db.batch()
            for ref in chunk:
                batch.update(ref, {"read": True, "readAt": SERVER_TIMESTAMP})
            batch.commit()
            updated_total += len(chunk)
        last_snap = docs[-1]

    return {"ok": True, "updated": updated_total}


@router.post("/delete-all")
async def delete_all_notifications(uid: str = Depends(get_current_uid)):
    """Delete all notifications for the current user (Admin SDK; client rules forbid delete)."""
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    deleted_total = 0
    last_snap = None
    while True:
        q = db.collection("notifications").where("to_uid", "==", uid).order_by("createdAt").limit(_BATCH_SIZE)
        if last_snap is not None:
            q = q.start_after(last_snap)
        docs = list(q.stream())
        if not docs:
            break
        for chunk in _chunked([d.reference for d in docs], _BATCH_SIZE):
            batch = db.batch()
            for ref in chunk:
                batch.delete(ref)
            batch.commit()
            deleted_total += len(chunk)
        last_snap = docs[-1]

    return {"ok": True, "deleted": deleted_total}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    uid: str = Depends(get_current_uid),
):
    """Delete a notification. Only the recipient can delete."""
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    ref = db.collection("notifications").document(notification_id)
    doc = ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Notification not found")
    data = doc.to_dict() or {}
    if data.get("to_uid") != uid:
        raise HTTPException(status_code=403, detail="Forbidden")
    ref.delete()
    return {"ok": True}


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
