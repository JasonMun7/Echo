from fastapi import APIRouter

from app.config import ECHO_GCP_PROJECT_ID

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
async def health_check():
    """
    Report basic service health.
    
    Returns:
        dict: A JSON-serializable object with key `"status"` set to `"ok"`.
    """
    return {"status": "ok"}


@router.get("/echo")
async def echo_public_config():
    """
    Expose the non-secret Firebase/GCP project ID the API uses for ID token verification for comparison with the web build.
    
    Returns:
        dict: JSON object with:
            - status (str): "ok"
            - echo_gcp_project_id (str or None): the public Firebase/GCP project ID used to verify ID tokens, or None if not configured
    """
    return {
        "status": "ok",
        "echo_gcp_project_id": ECHO_GCP_PROJECT_ID or None,
    }
