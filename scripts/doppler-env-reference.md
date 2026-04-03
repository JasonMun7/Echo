# Doppler Environment Variables Reference

Canonical list of environment variables for Echo. Use Doppler as the single source of truth.

## Shared (Backend + Echo Prism agent)

| Variable | Description |
|----------|-------------|
| `ECHO_GCS_BUCKET` | GCS bucket name |
| `ECHO_GCP_PROJECT_ID` | GCP project ID |
| `GEMINI_API_KEY` | Gemini API key |
| `OPENROUTER_API_KEY` | OpenRouter API key (LangGraph / UI-Tars inference; optional if using Gemini-only `ECHOPRISM_INFERENCE_BACKEND=gemini`) |
| `OPENROUTER_BASE_URL` | OpenRouter API base (default: `https://openrouter.ai/api/v1`) |
| `UI_TARS_MODEL_ID` | OpenRouter model id for UI automation (default in app: `bytedance/ui-tars-1.5-7b`) |
| `ECHOPRISM_INFERENCE_BACKEND` | `openrouter` (default) or `gemini` for ambiguous step inference |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service account JSON (optional; leave unset on Cloud Run) |

**Note:** OmniParser is not used. Remove any legacy `ECHOPRISM_OMNIPARSER_URL` / `OMNIPARSER_URL` values from config. Ambiguous-step coordinates come from the VLM (OpenRouter UI-Tars by default, or Gemini when `ECHOPRISM_INFERENCE_BACKEND=gemini`).

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
| `LIVEKIT_AGENT_SECRET` | Shared secret for /api/agent/tool and /api/livekit/user-by-phone (LiveKit agent) |

## Frontend (web)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend API URL |
| `NEXT_PUBLIC_ECHO_AGENT_URL` | Echo Prism agent URL (chat, voice, synthesis) |
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
| `VITE_ECHO_AGENT_URL` | Echo Prism agent URL |
| `VITE_APP_URL` | Web app URL (default: http://localhost:3000). **Production:** set to your deployed web app URL (e.g. https://app.echo.ai) so "Sign in" opens the real site. |
| `VITE_LIVEKIT_SANDBOX_ID` | (Optional) LiveKit Cloud sandbox token server ID; when set, skips backend token fetch for dev |
| `GH_TOKEN` or `GITHUB_TOKEN` | (Optional) For `pnpm desktop:dist`: when set, electron-builder publishes the build to GitHub Releases so existing users receive the update. |

LiveKit token is fetched from `VITE_ECHO_AGENT_URL` (Echo Prism agent). Use `VITE_API_URL` = main backend (8000), `VITE_ECHO_AGENT_URL` = agent service (8081) for dual-backend setup.

## Configs

- **dev** — local development; set `NEXT_PUBLIC_API_URL`, `VITE_API_URL` to `http://localhost:8000`, `NEXT_PUBLIC_ECHO_AGENT_URL`, `VITE_ECHO_AGENT_URL` to `http://localhost:8081` when running the Echo Prism agent (`pnpm run dev:agent`); use `NEXT_PUBLIC_FIREBASE_PROJECT_ID` for Firebase
- **prd** — production; deploy script injects Cloud Run URLs at build time

---

## Dev vs production (Voice / LiveKit)

| Context | Variable | Dev | Production |
|--------|----------|-----|------------|
| **Desktop app** | `VITE_API_URL` | `http://localhost:8000` | Set at **build time** to backend Cloud Run URL (e.g. `https://echo-backend-{PROJECT_NUMBER}.{REGION}.run.app`) |
| **Desktop app** | `VITE_ECHO_AGENT_URL` | `http://localhost:8081` | Set at **build time** to Echo Prism agent Cloud Run URL (e.g. `https://echo-prism-agent-{PROJECT_NUMBER}.{REGION}.run.app`) |
| **Desktop app** | `VITE_LIVEKIT_SANDBOX_ID` | Optional; when set, desktop uses LiveKit Cloud sandbox for tokens and does not call your backend | Leave **unset** so the desktop fetches the token from EchoPrism (`/api/livekit/token`) |
| **Echo Prism agent** (Cloud Run) | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Not needed if you only run chat/synthesis locally | **Required** for voice; set in Cloud Run (e.g. via Doppler secrets or `gcloud run services update --set-env-vars`) so `/api/livekit/token` can issue tokens |
| **Echo Prism agent** (Cloud Run) | `GEMINI_API_KEY`, `ECHO_GCS_BUCKET`, `OPENROUTER_API_KEY` | From Doppler/local env when running locally | Injected by deploy script from your Doppler **prd** (or shell) when you run `pnpm run deploy:agent` |
| **LiveKit worker** (Cloud Run) | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | From Doppler when running `pnpm run dev:livekit-agent` (repo root; `PYTHONPATH` set in the npm script) | Set by `deploy-livekit-agent.sh` from your shell/Doppler (same values as LiveKit Cloud project) |
| **LiveKit Agent** (worker) | `ECHOPRISM_AGENT_URL` | `http://localhost:8081` (local agent) | Set by deploy script to **Echo Prism agent Cloud Run URL** so the worker can call `/api/agent/tool` |
| **LiveKit Agent** (worker) | `LIVEKIT_AGENT_SECRET`, `GEMINI_API_KEY` | From Doppler for local worker | Set by deploy script from shell/Doppler |

Summary: In **dev**, desktop and LiveKit worker point at localhost URLs. In **production**, desktop must be built with Cloud Run URLs; the Echo Prism agent and the LiveKit worker are deployed with the same LiveKit credentials, and the worker’s `ECHOPRISM_AGENT_URL` must be the deployed agent service URL.

### Voice/phone runs: visibility and execution

When a run is started from a **phone call** (SIP), the run is created in Firestore but no desktop is in the LiveKit room to receive `run_started`, so the run does not auto-execute. The user can:
- **See the run**: Open the Echo web dashboard; the run appears under that workflow’s runs. Set `ECHO_APP_URL` (or `FRONTEND_URL`) on the EchoPrism Agent so the tool returns `run_dashboard_url` and the agent can tell the user where to look.
- **Run it**: Open the Echo desktop app and start the same workflow from the UI, or use a future run executor (e.g. Cloud Run Job) if you deploy one.

| Variable | Where | Description |
|----------|--------|-------------|
| `ECHO_APP_URL` | Echo Prism agent | Web app base URL (e.g. `https://echo-frontend-xxx.run.app`). When set, `run_workflow` returns `run_dashboard_url` so the voice agent can tell the user where to track the run. Deploy script sets this from `FRONTEND_URL`. |

### Telephony personalization (phone → user)

When a caller joins via SIP, the LiveKit agent calls EchoPrism `GET /api/livekit/user-by-phone?phone=E164` (with `X-Agent-Secret`). If a Firestore user has a matching `phone` (E.164), the agent uses their **displayName** in the greeting and their **uid** for all tools (list workflows, run workflow, etc.). Users can set `phone` via the main backend `PUT /api/users/me` with `{ "phone": "+15551234567" }`. Ensure `LIVEKIT_AGENT_SECRET` and `ECHOPRISM_AGENT_URL` are set for the LiveKit worker so the lookup succeeds.
