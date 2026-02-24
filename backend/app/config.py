import os
from dotenv import load_dotenv

load_dotenv()

GCS_BUCKET = os.getenv("GCS_BUCKET", "")
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "")
# Allowed CORS origins: localhost + FRONTEND_ORIGIN (Cloud Run) or CORS_ORIGINS (comma-separated)
_defaults = ["http://localhost:3000", "http://127.0.0.1:3000"]
_origin = os.getenv("FRONTEND_ORIGIN", "").strip()
_extra = os.getenv("CORS_ORIGINS", "").strip()
_origins = _defaults + ([_origin] if _origin else []) + [o.strip() for o in _extra.split(",") if o.strip()]
CORS_ORIGINS = ",".join(_origins)
GOOGLE_APPLICATION_CREDENTIALS = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
