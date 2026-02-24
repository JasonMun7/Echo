from fastapi import APIRouter, Depends, HTTPException
import firebase_admin.firestore
from google.cloud.firestore import SERVER_TIMESTAMP
from pydantic import BaseModel

from app.auth import get_current_user, get_firebase_app

router = APIRouter(prefix="/users", tags=["users"])


class UserInitResponse(BaseModel):
    uid: str
    email: str | None
    display_name: str | None
    photo_url: str | None
    provider: str
    created: bool


@router.post("/init", response_model=UserInitResponse)
async def init_user(current_user: dict = Depends(get_current_user)):
    """Verify token, ensure users/{uid} exists, create if new, return user data."""
    uid = current_user.get("uid", "")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid token")

    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)

    user_ref = db.collection("users").document(uid)
    snapshot = user_ref.get()

    provider = (
        current_user.get("firebase", {}).get("sign_in_provider")
        or current_user.get("provider", "password")
    )
    if isinstance(provider, dict):
        provider = provider.get("sign_in_provider", "password") or "password"

    user_data = {
        "uid": uid,
        "email": current_user.get("email") or None,
        "displayName": current_user.get("name") or current_user.get("email") or None,
        "photoURL": current_user.get("picture") or None,
        "provider": provider,
        "updatedAt": SERVER_TIMESTAMP,
    }

    created = False
    if not snapshot.exists:
        user_data["createdAt"] = SERVER_TIMESTAMP
        user_ref.set(user_data, merge=True)
        created = True
    else:
        user_ref.update(user_data)

    return UserInitResponse(
        uid=uid,
        email=user_data["email"],
        display_name=user_data["displayName"],
        photo_url=user_data["photoURL"],
        provider=user_data["provider"],
        created=created,
    )
