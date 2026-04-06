import os
from pathlib import Path

from dotenv import load_dotenv

_backend_dir = Path(__file__).resolve().parent.parent
_repo_root = _backend_dir.parent
# CWD-only `load_dotenv()` misses keys in repo root or `agent/.env` when uvicorn cwd is `agent/`.
for _env_path in (_repo_root / ".env", _backend_dir / ".env", _repo_root / "agent" / ".env"):
    if _env_path.is_file():
        load_dotenv(_env_path, override=True)

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
# Resolve relative paths against backend/ so relative credential paths resolve from repo root.
_creds = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
if _creds and not os.path.isabs(_creds):
    _creds_path = Path(_creds)
    if not _creds_path.is_file():
        # Check project root (../ from backend/) first, then backend/ itself
        for _search_dir in [_repo_root, _backend_dir]:
            _alt = _search_dir / _creds
            if _alt.is_file():
                _creds = str(_alt)
                break
GOOGLE_APPLICATION_CREDENTIALS = _creds
if _creds:
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = _creds
# Gemini / google-genai accept either name; Doppler or Google AI Studio often use one or the other.
GEMINI_API_KEY = (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()

# EchoPrism model overrides
CHAT_MODEL = os.getenv("ECHOPRISM_CHAT_MODEL", "gemini-3.1-flash-lite-preview")

# Auth0 (Token Vault + Regular Web app — see README Auth0 section)
AUTH0_DOMAIN = (os.getenv("AUTH0_DOMAIN") or "").strip().replace("https://", "").rstrip("/")
AUTH0_CLIENT_ID = (os.getenv("AUTH0_CLIENT_ID") or "").strip()
AUTH0_CLIENT_SECRET = (os.getenv("AUTH0_CLIENT_SECRET") or "").strip()
AUTH0_AUDIENCE = (os.getenv("AUTH0_AUDIENCE") or "").strip()
AUTH0_TOKEN_VAULT = os.getenv("AUTH0_TOKEN_VAULT", "1").strip() not in ("0", "false", "False")
# Optional: Machine-to-Machine app for Management API (debug: GET user connected-accounts). Never expose to frontend.
AUTH0_MGMT_CLIENT_ID = (os.getenv("AUTH0_MGMT_CLIENT_ID") or "").strip()
AUTH0_MGMT_CLIENT_SECRET = (os.getenv("AUTH0_MGMT_CLIENT_SECRET") or "").strip()

# LiveKit (for /api/livekit/token, /api/agent/tool)
LIVEKIT_URL = os.getenv("LIVEKIT_URL", "")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY", "")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "")
LIVEKIT_AGENT_SECRET = os.getenv("LIVEKIT_AGENT_SECRET", "")
