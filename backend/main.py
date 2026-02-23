from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import CORS_ORIGINS
from app.routers import health, storage, users, synthesize, workflows, runs, schedule

app = FastAPI(title="Echo API", version="0.1.0")

_origins = [o.strip() for o in CORS_ORIGINS.split(",") if o.strip()]
# Fallback regex for Cloud Run frontend in case env not set
_origin_regex = r"https://echo-frontend-[a-z0-9.-]+\.run\.app"
if not _origins:
    _origins = ["http://localhost:3000", "http://127.0.0.1:3000"]  # dev defaults
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_origin_regex=_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.include_router(health.router)
app.include_router(storage.router)
app.include_router(users.router, prefix="/api")
app.include_router(synthesize.router, prefix="/api")
app.include_router(workflows.router, prefix="/api")
app.include_router(runs.router, prefix="/api")
app.include_router(schedule.router, prefix="/api")
