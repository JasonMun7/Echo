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
| `NEXT_PUBLIC_DESKTOP_DOWNLOAD_MAC_URL` | Mac DMG download URL (e.g. GitHub release asset); when set, download page shows "Download for Mac" |
| `NEXT_PUBLIC_DESKTOP_DOWNLOAD_WIN_URL` | Windows installer download URL; when set, download page shows "Download for Windows" |

## Desktop (dev + production)

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend API URL |
| `VITE_ECHO_AGENT_URL` | EchoPrism Agent URL |
| `VITE_APP_URL` | Web app URL (default: http://localhost:3000). **Production:** set to your deployed web app URL (e.g. https://app.echo.ai) so "Sign in" opens the real site. |
| `VITE_LIVEKIT_SANDBOX_ID` | (Optional) LiveKit Cloud sandbox token server ID; when set, skips backend token fetch for dev |

LiveKit token is fetched from `VITE_ECHO_AGENT_URL` (EchoPrismAgent). Use `VITE_API_URL` = main backend (8000), `VITE_ECHO_AGENT_URL` = EchoPrismAgent (8081) for dual-backend setup.

## Configs

- **dev** — local development; set `NEXT_PUBLIC_API_URL`, `VITE_API_URL` to `http://localhost:8000`, `NEXT_PUBLIC_ECHO_AGENT_URL`, `VITE_ECHO_AGENT_URL` to `http://localhost:8081` when running EchoPrism Agent locally; use `NEXT_PUBLIC_FIREBASE_PROJECT_ID` for Firebase
- **prd** — production; deploy script injects Cloud Run URLs at build time

---

## Dev vs production (Voice / LiveKit)

| Context | Variable | Dev | Production |
|--------|----------|-----|------------|
| **Desktop app** | `VITE_API_URL` | `http://localhost:8000` | Set at **build time** to backend Cloud Run URL (e.g. `https://echo-backend-{PROJECT_NUMBER}.{REGION}.run.app`) |
| **Desktop app** | `VITE_ECHO_AGENT_URL` | `http://localhost:8081` | Set at **build time** to EchoPrism Cloud Run URL (e.g. `https://echo-prism-agent-{PROJECT_NUMBER}.{REGION}.run.app`) |
| **Desktop app** | `VITE_LIVEKIT_SANDBOX_ID` | Optional; when set, desktop uses LiveKit Cloud sandbox for tokens and does not call your backend | Leave **unset** so the desktop fetches the token from EchoPrism (`/api/livekit/token`) |
| **EchoPrism Agent** (Cloud Run) | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Not needed if you only run chat/synthesis locally | **Required** for voice; set in Cloud Run (e.g. via Doppler secrets or `gcloud run services update --set-env-vars`) so `/api/livekit/token` can issue tokens |
| **EchoPrism Agent** (Cloud Run) | `GEMINI_API_KEY`, `ECHO_GCS_BUCKET` | From Doppler/local env when running locally | Injected by deploy script from your Doppler **prd** (or shell) when you run `deploy-echo-prism-agent.sh` |
| **LiveKit Agent** (worker, Cloud Run) | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | From Doppler when running `pnpm run dev:livekit-agent` | Set by `deploy-livekit-agent.sh` from your shell/Doppler (same values as LiveKit Cloud project) |
| **LiveKit Agent** (worker) | `ECHOPRISM_AGENT_URL` | `http://localhost:8081` (EchoPrism local) | Set by deploy script to **EchoPrism Cloud Run URL** so the worker can call `/api/agent/tool` |
| **LiveKit Agent** (worker) | `LIVEKIT_AGENT_SECRET`, `GEMINI_API_KEY` | From Doppler for local worker | Set by deploy script from shell/Doppler |

Summary: In **dev**, desktop and LiveKit worker point at localhost URLs. In **production**, desktop must be built with Cloud Run URLs; EchoPrism and the LiveKit worker are deployed with the same LiveKit credentials, and the worker’s `ECHOPRISM_AGENT_URL` must be the deployed EchoPrism service URL.
