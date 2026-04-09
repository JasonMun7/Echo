import base64
import json
import logging
import os
from pathlib import Path
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import firebase_admin
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials

from app.config import ECHO_GCP_PROJECT_ID, GOOGLE_APPLICATION_CREDENTIALS

logger = logging.getLogger(__name__)

security = HTTPBearer(auto_error=False)


def _id_token_aud_unverified(token: str) -> str | None:
    """Decode JWT payload without verification (debug only)."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        payload = parts[1]
        pad = "=" * (-len(payload) % 4)
        raw = base64.urlsafe_b64decode(payload + pad)
        data = json.loads(raw)
        aud = data.get("aud")
        return aud if isinstance(aud, str) else None
    except Exception:
        return None


def get_firebase_app():
    if not firebase_admin._apps:
        cred_path = (GOOGLE_APPLICATION_CREDENTIALS or "").strip()
        if cred_path and not Path(cred_path).is_file():
            logger.warning(
                "GOOGLE_APPLICATION_CREDENTIALS points to missing file (%s); "
                "clearing env and using Application Default Credentials",
                cred_path,
            )
            # ADC still honors GOOGLE_APPLICATION_CREDENTIALS; remove so metadata/Workload Identity is used.
            os.environ.pop("GOOGLE_APPLICATION_CREDENTIALS", None)
            cred_path = ""
        cred = (
            credentials.Certificate(cred_path)
            if cred_path
            else credentials.ApplicationDefault()
        )
        opts = {"projectId": ECHO_GCP_PROJECT_ID} if ECHO_GCP_PROJECT_ID else {}
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
    except Exception as e:
        aud = _id_token_aud_unverified(token)
        logger.warning(
            "verify_id_token failed (ECHO_GCP_PROJECT_ID=%s, token aud=%s): %s",
            ECHO_GCP_PROJECT_ID or "(unset)",
            aud or "(unparsed)",
            e,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_uid(current_user: Annotated[dict, Depends(get_current_user)]) -> str:
    return current_user.get("uid", "")
