"""
EchoPrism Agent Service — standalone Cloud Run service for all AI/agent logic.

Hosts:
  - /ws/chat — Chat (text) and Voice (Gemini Live)
  - /api/synthesize — Workflow synthesis (video, images, description)
  - /api/agent/run — Runner WebSocket (screenshot → action)
"""
import logging
import sys
from pathlib import Path

# Configure logging early so all modules inherit a visible level.
# Set to INFO by default; override with ECHO_LOG_LEVEL env var.
import os as _os
_log_level = getattr(logging, _os.environ.get("ECHO_LOG_LEVEL", "INFO").upper(), logging.INFO)
logging.basicConfig(
    level=_log_level,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stderr,
)
# Silence verbose INFO logs from google_genai (e.g. "AFC is enabled with max remote calls: 10")
logging.getLogger("google_genai.models").setLevel(logging.WARNING)

# Resolve GOOGLE_APPLICATION_CREDENTIALS early — Doppler sets a relative path
# (e.g. "service-account.json") which resolves from the repo root (echo/) but
# uvicorn may run from EchoPrismAgent/. Search common locations.
_sa = _os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "")
if _sa and not _os.path.isabs(_sa) and not _os.path.isfile(_sa):
    for _candidate in [
        _os.path.join("..", _sa),            # repo root (echo/) from EchoPrismAgent/
        _os.path.join("..", "backend", _sa),  # legacy backend/ location
        _os.path.join("backend", _sa),
    ]:
        if _os.path.isfile(_candidate):
            _os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = _os.path.abspath(_candidate)
            logging.getLogger(__name__).info(
                "Resolved GOOGLE_APPLICATION_CREDENTIALS -> %s",
                _os.environ["GOOGLE_APPLICATION_CREDENTIALS"],
            )
            break

# Ensure backend (app) and agent are on path
# Docker: /app/backend, /app/agent | Local: repo root
_service_root = Path(__file__).resolve().parent
_backend = _service_root / "backend"
_agent_dir = _service_root / "agent"
if not _backend.exists():
    _backend = _service_root.parent / "backend"
if not _agent_dir.exists():
    _agent_dir = _backend / "agent"
if _backend.exists():
    sys.path.insert(0, str(_backend))
if _agent_dir.exists():
    sys.path.insert(0, str(_agent_dir))
if str(_service_root) not in sys.path:
    sys.path.insert(0, str(_service_root))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import chat, synthesize, agent as agent_router, traces, livekit

app = FastAPI(title="EchoPrism Agent", version="0.1.0")

_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
_origin_regex = r"https://echo-frontend-[a-z0-9.-]+\.run\.app|http://(localhost|127\.0\.0\.1)(:[0-9]+)?"
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_origin_regex=_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router)
app.include_router(livekit.router, prefix="/api")
app.include_router(synthesize.router, prefix="/api")
app.include_router(agent_router.router, prefix="/api")
app.include_router(traces.router, prefix="/api")
