"""
Echo Prism Agent Service — LangGraph + OpenRouter (UI-Tars) + Gemini.

Hosts:
  - /ws/chat — Chat (text) and Voice (Gemini Live)
  - /api/synthesize — Workflow synthesis (video, images, description)
  - /api/agent/run — Runner WebSocket (screenshot → action)
"""
import logging
import os as _os
import sys
from pathlib import Path

_log_level = getattr(logging, _os.environ.get("ECHO_LOG_LEVEL", "INFO").upper(), logging.INFO)

# google-genai warns when both GOOGLE_API_KEY and GEMINI_API_KEY are set. Doppler
# sometimes defines GEMINI_API_KEY="" or duplicates the same key under both names.
_gem = (_os.environ.get("GEMINI_API_KEY") or "").strip()
if not _gem:
    _os.environ.pop("GEMINI_API_KEY", None)
else:
    _goo = (_os.environ.get("GOOGLE_API_KEY") or "").strip()
    if _goo and _gem == _goo:
        _os.environ.pop("GEMINI_API_KEY", None)

logging.basicConfig(
    level=_log_level,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stderr,
)
logging.getLogger("google_genai.models").setLevel(logging.WARNING)

_sa = _os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "")
if _sa and not _os.path.isabs(_sa) and not _os.path.isfile(_sa):
    _service_root = Path(__file__).resolve().parent
    for _candidate in [
        _service_root.parent / _sa,
        _service_root.parent / "backend" / _sa,
        _service_root / _sa,
    ]:
        if _candidate.is_file():
            _os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(_candidate.resolve())
            logging.getLogger(__name__).info(
                "Resolved GOOGLE_APPLICATION_CREDENTIALS -> %s",
                _os.environ["GOOGLE_APPLICATION_CREDENTIALS"],
            )
            break

_service_root = Path(__file__).resolve().parent
_backend = _service_root.parent / "backend"
if _backend.exists():
    sys.path.insert(0, str(_backend))
if str(_service_root) not in sys.path:
    sys.path.insert(0, str(_service_root))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import chat, synthesize, agent as agent_router, livekit

app = FastAPI(title="Echo Prism Agent", version="0.2.0")

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
