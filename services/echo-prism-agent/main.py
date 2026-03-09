"""
EchoPrism Agent Service — standalone Cloud Run service for the agent WebSocket.

Hosts /api/agent/run. Desktop clients connect here for AI inference (step → action).
Calls OmniParser for visual element grounding.
"""
import sys
from pathlib import Path

# Ensure backend is on path
# Docker: /app/main.py, /app/backend/ | Local: repo/services/echo-prism-agent/main.py, repo/backend/
_backend = Path(__file__).resolve().parent / "backend"
if not _backend.exists():
    _backend = Path(__file__).resolve().parent.parent.parent / "backend"
if _backend.exists():
    sys.path.insert(0, str(_backend))
    sys.path.insert(0, str(_backend / "agent"))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import agent

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

app.include_router(agent.router, prefix="/api")
