import os
from dotenv import load_dotenv

load_dotenv()

# Prefer Echo-specific env vars (ECHO_*) but fall back to legacy names for
# backwards compatibility with older deployments.
GCS_BUCKET = os.getenv("ECHO_GCS_BUCKET") or os.getenv("GCS_BUCKET", "")
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "")
# Allowed CORS origins: localhost + FRONTEND_ORIGIN (Cloud Run) or CORS_ORIGINS (comma-separated)
_defaults = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",   # desktop app (Vite dev)
    "http://127.0.0.1:5173",
]
_origin = os.getenv("FRONTEND_ORIGIN", "").strip()
_extra = os.getenv("CORS_ORIGINS", "").strip()
_origins = _defaults + ([_origin] if _origin else []) + [o.strip() for o in _extra.split(",") if o.strip()]
CORS_ORIGINS = ",".join(_origins)
# Optional: path to service account JSON. Needed for GCS signed URLs and Firebase when using
# gcloud auth application-default login (user creds can't sign). Leave unset on Cloud Run (uses ADC).
GOOGLE_APPLICATION_CREDENTIALS = os.getenv("ECHO_GOOGLE_APPLICATION_CREDENTIALS") or os.getenv(
    "GOOGLE_APPLICATION_CREDENTIALS", ""
)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
