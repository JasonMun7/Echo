# Doppler Environment Variables Reference

Canonical list of environment variables for Echo. Use Doppler as the single source of truth.

## Shared (Backend + Echo Prism agent)

| Variable | Description |
|----------|-------------|
| `ECHO_GCS_BUCKET` | GCS bucket name |
| `ECHO_GCP_PROJECT_ID` | GCP project ID |
| `GEMINI_API_KEY` | Gemini API key |
| `ECHOPRISM_V15_COORD_STYLE` | `pixel` (default for UI-TARS 1.5): remap coords from VLM smart-resize canvas to 0–1000 executor space. `legacy`: old linear 0–1000 mapping. |
| `ECHOPRISM_DEBUG_VLM_DIMS` | Agent: if `1`/`true`, log when compressed VLM image decoded size ≠ `vlm_resize_dimensions` (coordinate sanity). |
| `ECHOPRISM_SMART_RESIZE_MAX_PIXELS` | Override max total pixels for UI-TARS `smartResizeForV15`-style resize (default follows `UI_TARS_MODEL_ID` profile). |
| `OPENROUTER_API_KEY` | OpenRouter API key (LangGraph / UI-Tars inference; optional if using Gemini-only `ECHOPRISM_INFERENCE_BACKEND=gemini`) |
| `OPENROUTER_BASE_URL` | OpenRouter API base (default: `https://openrouter.ai/api/v1`) |
| `UI_TARS_MODEL_ID` | OpenRouter model id for UI automation (default in app: `bytedance/ui-tars-1.5-7b`) |
| `ECHOPRISM_INFERENCE_BACKEND` | `openrouter` (default) or `gemini` for ambiguous step inference |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service account JSON (optional; leave unset on Cloud Run) |
| `ECHO_INTEGRATIONS_TOKEN_VAULT_ONLY` | Default `1`: integration tokens come from Auth0 Token Vault only (do not read legacy OAuth tokens from Firestore `users/.../integrations/*`). Set to `0` to allow Firestore fallback for migration. |

**Note:** OmniParser is not used. Remove any legacy `ECHOPRISM_OMNIPARSER_URL` / `OMNIPARSER_URL` values from config. Ambiguous-step coordinates come from the VLM (OpenRouter UI-Tars by default, or Gemini when `ECHOPRISM_INFERENCE_BACKEND=gemini`).

## Backend only

| Variable | Description |
|----------|-------------|
| `AUTH0_DOMAIN` | Auth0 tenant domain, e.g. `your-tenant.us.auth0.com` (no `https://`) |
| `AUTH0_CLIENT_ID` | Regular Web Application client ID |
| `AUTH0_CLIENT_SECRET` | Application client secret (server-side only) |
| `AUTH0_AUDIENCE` | Auth0 API identifier (audience) for access tokens — required for many Token Vault flows |
| `AUTH0_CALLBACK_URL` | Optional fixed callback URL, e.g. `https://<echo-backend>/api/auth0/callback` (must match Auth0 Application settings) |
| `AUTH0_LINK_CONNECTION` | Optional. Auth0 connection name sent as `connection=` on **Link Auth0** (`GET /api/auth0/link-url`) only — e.g. `Username-Password-Authentication` when **Social → Google** is **Connected Accounts for Token Vault** only (Google must not be used for Universal Login). Google stays for **Connect Google** via `vault-url`. Query `?connection=` on `link-url` overrides this for one request. |
| `AUTH0_VAULT_VERIFY_ATTEMPTS` | Optional. After Connect (vault) OAuth, Echo verifies Token Vault with repeated federated exchanges (default `4`, max `12`) with 0.5s delay — reduces false “not connected” if Auth0 commits vault state slightly late. |
| `AUTH0_VAULT_AUTHORIZE_OMIT_AUDIENCE` | Optional. If `1`/`true`, **Connect** (`GET /api/auth0/vault-url`) omits the `audience` query param on Auth0 `/authorize` (Link Auth0 still uses `AUTH0_AUDIENCE`). Try when `vault_probe` returns `federated_connection_refresh_token_not_found` after a successful Connect redirect but Dashboard still shows no connected account / federated token. |
| `AUTH0_VAULT_CALLBACK_URL` | Optional. Full **Connect** OAuth redirect URI (must match Auth0 Application → Allowed Callback URLs). If unset, Connect uses the same URL as Link (`AUTH0_CALLBACK_URL` or `…/api/auth0/callback`) — same idea as Auth0’s **preferred** Token Vault sample (`mount_connected_account_routes`, see `call-others-apis-on-users-behalf-langchain-fastapi-py-sample/ECHO-PARITY.md`). Set to e.g. `https://<backend>/api/auth0/connect/callback` only if you want parity with the **legacy** `mount_connect_routes` sample (`authenticate-users-langchain-fastapi-py-sample/ECHO-PARITY.md`); Echo exposes `GET /api/auth0/connect/callback` for that. |
| `AUTH0_TOKEN_VAULT` | Set to `0` to disable the Auth0 federated exchange path in the agent (default: enabled). Pair with `ECHO_INTEGRATIONS_TOKEN_VAULT_ONLY=0` if you need legacy Firestore-stored OAuth tokens. |
| `AUTH0_CONNECTION_SLACK` | Override Auth0 connection name for Slack (default: `slack`) |
| `AUTH0_CONNECTION_GITHUB` | Override for GitHub (default: `github`) |
| `AUTH0_CONNECTION_GOOGLE` | Override for Google (default: `google-oauth2`; Echo integration id remains `google`) |
| `AUTH0_MGMT_CLIENT_ID` | Optional. Machine-to-Machine application client ID for Auth0 Management API (backend only). Enables Integrations debug button “Connected accounts (Management API)”. Grant scopes for `GET .../users/{id}/connected-accounts` and `GET .../users/{id}/federated-connections-tokensets` (often `read:users`; if 403, add the scope Auth0 documents for that endpoint). |
| `AUTH0_MGMT_CLIENT_SECRET` | M2M client secret (server-side only; never `NEXT_PUBLIC_`). |
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
| `NEXT_PUBLIC_AUTH0_LINK_CONNECTION` | Optional. Same as backend `AUTH0_LINK_CONNECTION`: passed as `?connection=` on Link Auth0 (`/api/auth0/link-url`). Example: `Username-Password-Authentication`. Prefer setting `AUTH0_LINK_CONNECTION` on the backend only; use this when the web app must override without redeploying the API. |
| `NEXT_PUBLIC_ECHO_AGENT_URL` | Echo Prism agent URL (chat WebSocket `/ws/chat`, voice, synthesis). **Local `next dev`:** defaults to `http://127.0.0.1:8083` when unset so chat targets `pnpm dev:agent`. Set explicitly if the agent runs on another host/port. |
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
| `ECHO_DEBUG_COORDS` | Electron **main** process: log `scaleCoords` (0–1000 → pixels) and `captureScreen` dimensions (UI-TARS / NutJS parity). |
| `ECHO_DEBUG_SCREENSHOTS` | Optional directory path; saves each captured JPEG for debugging. |
| `VITE_API_URL` | Backend API URL |
| `VITE_AUTH0_LINK_CONNECTION` | Optional. Same as `AUTH0_LINK_CONNECTION` / `NEXT_PUBLIC_AUTH0_LINK_CONNECTION`: appended to desktop `GET /api/auth0/link-url` when opening Auth0 from the Electron app (email/password when Google is vault-only). |
| `VITE_ECHO_AGENT_URL` | Echo Prism agent URL |
| `VITE_APP_URL` | Web app URL (default: http://localhost:3000). **Production:** set to your deployed web app URL (e.g. https://app.echo.ai) so "Sign in" opens the real site. |
| `VITE_LIVEKIT_SANDBOX_ID` | (Optional) LiveKit Cloud sandbox token server ID; when set, skips backend token fetch for dev |
| `GH_TOKEN` or `GITHUB_TOKEN` | (Optional) For `pnpm desktop:dist`: when set, electron-builder publishes the build to GitHub Releases so existing users receive the update. |

LiveKit token is fetched from `VITE_ECHO_AGENT_URL` (Echo Prism agent). Use `VITE_API_URL` = main backend (8000), `VITE_ECHO_AGENT_URL` = agent service (8083) for dual-backend setup.

## Configs

- **dev** — local development; set `NEXT_PUBLIC_API_URL`, `VITE_API_URL` to `http://localhost:8000`, `NEXT_PUBLIC_ECHO_AGENT_URL`, `VITE_ECHO_AGENT_URL` to `http://localhost:8083` when running the Echo Prism agent (`pnpm run dev:agent`); use `NEXT_PUBLIC_FIREBASE_PROJECT_ID` for Firebase
- **prd** — production; deploy script injects Cloud Run URLs at build time

---

## Dev vs production (Voice / LiveKit)

| Context | Variable | Dev | Production |
|--------|----------|-----|------------|
| **Desktop app** | `VITE_API_URL` | `http://localhost:8000` | Set at **build time** to backend Cloud Run URL (e.g. `https://echo-backend-{PROJECT_NUMBER}.{REGION}.run.app`) |
| **Desktop app** | `VITE_ECHO_AGENT_URL` | `http://localhost:8083` | Set at **build time** to Echo Prism agent Cloud Run URL (e.g. `https://echo-prism-agent-{PROJECT_NUMBER}.{REGION}.run.app`) |
| **Desktop app** | `VITE_LIVEKIT_SANDBOX_ID` | Optional; when set, desktop uses LiveKit Cloud sandbox for tokens and does not call your backend | Leave **unset** so the desktop fetches the token from EchoPrism (`/api/livekit/token`) |
| **Echo Prism agent** (Cloud Run) | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Not needed if you only run chat/synthesis locally | **Required** for voice; set in Cloud Run (e.g. via Doppler secrets or `gcloud run services update --set-env-vars`) so `/api/livekit/token` can issue tokens |
| **Echo Prism agent** (Cloud Run) | `GEMINI_API_KEY`, `ECHO_GCS_BUCKET`, `OPENROUTER_API_KEY` | From Doppler/local env when running locally | Injected by deploy script from your Doppler **prd** (or shell) when you run `pnpm run deploy:agent` |
| **LiveKit worker** (Cloud Run) | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | From Doppler when running `pnpm run dev:livekit-agent` (repo root; `PYTHONPATH` set in the npm script) | Set by `deploy-livekit-agent.sh` from your shell/Doppler (same values as LiveKit Cloud project) |
| **LiveKit Agent** (worker) | `ECHOPRISM_AGENT_URL` | `http://localhost:8083` (local agent) | Set by deploy script to **Echo Prism agent Cloud Run URL** so the worker can call `/api/agent/tool` |
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
