from fastapi import APIRouter

from app.config import ECHO_GCP_PROJECT_ID

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
async def health_check():
    return {"status": "ok"}


@router.get("/echo")
async def echo_public_config():
    """Non-secret: Firebase/GCP project id the API uses to verify ID tokens. Compare to NEXT_PUBLIC_FIREBASE_PROJECT_ID in the web build."""
    return {
        "status": "ok",
        "echo_gcp_project_id": ECHO_GCP_PROJECT_ID or None,
    }
