# Doppler Environment Variables Reference

Canonical list of environment variables for Echo. Use Doppler as the single source of truth.

## Shared (Backend + EchoPrism Agent)

| Variable | Description |
|----------|-------------|
| `ECHO_GCS_BUCKET` | GCS bucket name |
| `ECHO_GCP_PROJECT_ID` | GCP project ID |
| `GEMINI_API_KEY` | Gemini API key |
| `ECHOPRISM_OMNIPARSER_URL` | OmniParser service URL (empty = disabled) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service account JSON (optional; leave unset on Cloud Run) |

## Backend only

| Variable | Description |
|----------|-------------|
| `ECHO_CLOUD_RUN_REGION` | Cloud Run region (default: us-central1) |
| `FRONTEND_ORIGIN` | Allowed CORS origin (set by deploy) |
| `CORS_ORIGINS` | Additional CORS origins (comma-separated) |
| `ECHOPRISM_CHAT_MODEL` | Chat model override (default: gemini-3.1-flash-lite-preview) |
| `LIVEKIT_URL` | LiveKit WebSocket URL (e.g. wss://xxx.livekit.cloud) |
| `LIVEKIT_API_KEY` | LiveKit API key (from [cloud.livekit.io](https://cloud.livekit.io)) |
| `LIVEKIT_API_SECRET` | LiveKit API secret |
| `LIVEKIT_AGENT_SECRET` | Shared secret for /api/agent/tool (LiveKit agent) |

## Frontend (web)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend API URL |
| `NEXT_PUBLIC_ECHO_AGENT_URL` | EchoPrism Agent URL (chat, voice, synthesis) |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | GCP project ID for Firebase client config |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase config |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase config |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase config |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase config |

## Desktop (dev)

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend API URL |
| `VITE_ECHO_AGENT_URL` | EchoPrism Agent URL |
| `VITE_APP_URL` | Web app URL (default: http://localhost:3000) |
| `VITE_LIVEKIT_SANDBOX_ID` | (Optional) LiveKit Cloud sandbox token server ID; when set, skips backend token fetch for dev |

LiveKit token is fetched from `VITE_ECHO_AGENT_URL` (EchoPrismAgent). Use `VITE_API_URL` = main backend (8000), `VITE_ECHO_AGENT_URL` = EchoPrismAgent (8081) for dual-backend setup.

## Configs

- **dev** — local development; set `NEXT_PUBLIC_API_URL`, `VITE_API_URL` to `http://localhost:8000`, `NEXT_PUBLIC_ECHO_AGENT_URL`, `VITE_ECHO_AGENT_URL` to `http://localhost:8081` when running EchoPrism Agent locally; use `NEXT_PUBLIC_FIREBASE_PROJECT_ID` for Firebase
- **prd** — production; deploy script injects Cloud Run URLs at build time
