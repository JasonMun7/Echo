import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

GCS_BUCKET = os.getenv("ECHO_GCS_BUCKET", "")
ECHO_GCP_PROJECT_ID = os.getenv("ECHO_GCP_PROJECT_ID", "")
# Allowed CORS origins: localhost + FRONTEND_ORIGIN (Cloud Run) or CORS_ORIGINS (comma-separated)
_defaults = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",  # desktop app (Vite dev)
    "http://127.0.0.1:5173",
]
_origin = os.getenv("FRONTEND_ORIGIN", "").strip()
_extra = os.getenv("CORS_ORIGINS", "").strip()
_origins = (
    _defaults
    + ([_origin] if _origin else [])
    + [o.strip() for o in _extra.split(",") if o.strip()]
)
CORS_ORIGINS = ",".join(_origins)
# Optional: path to service account JSON. Needed for GCS signed URLs and Firebase when using
# gcloud auth application-default login (user creds can't sign). Leave unset on Cloud Run (uses ADC).
# Resolve relative paths against backend/ so EchoPrism Agent (running from EchoPrismAgent/) finds it.
_creds = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
if _creds and not os.path.isabs(_creds):
    _creds_path = Path(_creds)
    if not _creds_path.is_file():
        _backend_dir = Path(__file__).resolve().parent.parent
        # Check project root (../ from backend/) first, then backend/ itself
        for _search_dir in [_backend_dir.parent, _backend_dir]:
            _alt = _search_dir / _creds
            if _alt.is_file():
                _creds = str(_alt)
                break
GOOGLE_APPLICATION_CREDENTIALS = _creds
if _creds:
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = _creds
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# EchoPrism model overrides
CHAT_MODEL = os.getenv("ECHOPRISM_CHAT_MODEL", "gemini-3.1-flash-lite-preview")
