from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import firebase_admin
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials

from app.config import FIREBASE_PROJECT_ID, GOOGLE_APPLICATION_CREDENTIALS

security = HTTPBearer(auto_error=False)


def get_firebase_app():
    if not firebase_admin._apps:
        cred = (
            credentials.Certificate(GOOGLE_APPLICATION_CREDENTIALS)
            if GOOGLE_APPLICATION_CREDENTIALS
            else credentials.ApplicationDefault()
        )
        opts = {"projectId": FIREBASE_PROJECT_ID} if FIREBASE_PROJECT_ID else {}
        firebase_admin.initialize_app(cred, opts)
    return firebase_admin.get_app()


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)]
) -> dict:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = credentials.credentials
    try:
        get_firebase_app()
        decoded = firebase_auth.verify_id_token(token)
        return decoded
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_uid(current_user: Annotated[dict, Depends(get_current_user)]) -> str:
    return current_user.get("uid", "")
