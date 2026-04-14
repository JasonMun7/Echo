# Cloud Run deployment scripts

Scripts under this directory build Docker images with **Google Cloud Build** and deploy services to **Cloud Run**.

## Requirements

- [gcloud CLI](https://cloud.google.com/sdk/docs/install) authenticated to your GCP project (`gcloud auth login`, `gcloud auth application-default login` as needed).
- `ECHO_GCP_PROJECT_ID` and optionally `ECHO_CLOUD_RUN_REGION` (default `us-central1`).
- For **`pnpm run deploy`** from the repo root, use Doppler **`prd`** so secrets and **Next.js public env** are available when submitting builds:
  - `NEXT_PUBLIC_FIREBASE_*` (required for a working web app build).
  - Optional: `NEXT_PUBLIC_DESKTOP_DOWNLOAD_MAC_URL`, `NEXT_PUBLIC_DESKTOP_DOWNLOAD_WIN_URL` for the marketing download page.
  - Optional: `NEXT_PUBLIC_BRANDFETCH_CLIENT_ID` for integration logos on the dashboard (passed through Cloud Build as `_BRANDFETCH_CLIENT_ID`).

Shared substitution values for the **frontend** Docker build are built in `echo_frontend_cloudbuild_substitutions` in [`common.sh`](./common.sh). Keep that helper in sync with [`cloudbuild.frontend.yaml`](./cloudbuild.frontend.yaml) and the frontend section of [`cloudbuild.yaml`](./cloudbuild.yaml).

## Entry points

| Command                         | What it runs                                                                                                                                                                                                                |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run deploy`               | [`deploy.sh`](./../deploy.sh) → [`build.sh`](./build.sh) (all images) then deploy frontend, backend, Echo Prism agent                                                                                                       |
| `pnpm run deploy:build`         | [`build.sh`](./build.sh) only                                                                                                                                                                                               |
| `pnpm run deploy:frontend`      | [`deploy-frontend.sh`](./deploy-frontend.sh) `--build` then deploy                                                                                                                                                          |
| `pnpm run deploy:backend`       | [`deploy-backend.sh`](./deploy-backend.sh) `--build` then deploy (env from [`backend_env_to_yaml.py`](./backend_env_to_yaml.py); set `COMPOSIO_*` in Doppler **prd** for Integrations connect links)                        |
| `pnpm run deploy:agent`         | [`deploy-echo-prism-agent.sh`](./deploy-echo-prism-agent.sh) `--build` then deploy (env from [`agent_env_to_yaml.py`](./agent_env_to_yaml.py); include **`COMPOSIO_API_KEY`** in Doppler **prd** for Composio / `api_call`) |
| `pnpm run deploy:livekit-agent` | [`deploy-livekit-agent.sh`](./deploy-livekit-agent.sh) optional voice worker                                                                                                                                                |

See [`../doppler-env-reference.md`](../doppler-env-reference.md) for environment variables and the **Fork / alternate GitHub** section for forks.

## Apply config to production (fix Composio / 401 / stale web)

Doppler **`prd`** must include secrets and `NEXT_PUBLIC_*` used at **build** (frontend) and **deploy** (backend YAML). Changing Doppler alone does not update Cloud Run until you redeploy.

**1. Confirm Doppler `prd`** (minimum):

- **Web build:** `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_FIREBASE_*`, `NEXT_PUBLIC_ECHO_AGENT_URL` (and any other `NEXT_PUBLIC_*` you use, e.g. `NEXT_PUBLIC_BRANDFETCH_CLIENT_ID` for Brandfetch logos).
- **Backend deploy:** `COMPOSIO_API_KEY` (and optional `COMPOSIO_OAUTH_CALLBACK_URL` / `FRONTEND_ORIGIN`), plus LiveKit keys from [`doppler-env-reference.md`](../doppler-env-reference.md).
- **Echo Prism agent deploy:** **`COMPOSIO_API_KEY`** (same as backend). Workflow `api_call` runs Composio tools on the agent; without Composio env there, runs fail while the UI may still list integrations.

**2. Redeploy in this order** (from repo root, authenticated `gcloud`):

```bash
pnpm run deploy:backend
pnpm run deploy:frontend
pnpm run deploy:agent
```

Or one shot (builds all images, deploys all services):

```bash
pnpm run deploy
```

**3. Browser:** disable ad blockers for your app origin if you see `ERR_BLOCKED_BY_CLIENT` on Firestore, or test in a clean/incognito profile.

**4. Optional:** `pnpm run deploy:livekit-agent` if you use the LiveKit voice worker.

## Post-deploy verification

After services are up, smoke-check HTTP health (adjust URLs for your Cloud Run hosts):

```bash
chmod +x scripts/deploy/post-deploy-smoke.sh
BACKEND_URL=https://your-echo-backend-xxx.run.app \
  AGENT_URL=wss://your-echo-prism-agent-xxx.run.app \
  ./scripts/deploy/post-deploy-smoke.sh
```

- **Backend:** `GET /health` and `GET /health/echo` must return 200.
- **Echo Prism agent:** `GET https://<agent-host>/health` (same host as `NEXT_PUBLIC_ECHO_AGENT_URL` with `https`) must return 200.
- **Composio on agent:** Doppler **prd** must include **`COMPOSIO_API_KEY`** so `api_call` works on the agent (see Entry points table above).

Optional: with a Firebase ID token, `GET /api/integrations` confirms authenticated routing.
