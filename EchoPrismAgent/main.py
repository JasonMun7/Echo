"""
EchoPrism Agent Service — standalone Cloud Run service for all AI/agent logic.

Hosts:
  - /ws/chat — Chat (text) and Voice (Gemini Live)
  - /api/synthesize — Workflow synthesis (video, images, description)
  - /api/agent/run — Runner WebSocket (screenshot → action)
"""
import sys
from pathlib import Path

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

from routers import chat, synthesize, agent as agent_router, traces

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
app.include_router(synthesize.router, prefix="/api")
app.include_router(agent_router.router, prefix="/api")
app.include_router(traces.router, prefix="/api")
