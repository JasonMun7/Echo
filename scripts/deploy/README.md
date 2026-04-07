# Cloud Run deployment scripts

Scripts under this directory build Docker images with **Google Cloud Build** and deploy services to **Cloud Run**.

## Requirements

- [gcloud CLI](https://cloud.google.com/sdk/docs/install) authenticated to your GCP project (`gcloud auth login`, `gcloud auth application-default login` as needed).
- `ECHO_GCP_PROJECT_ID` and optionally `ECHO_CLOUD_RUN_REGION` (default `us-central1`).
- For **`pnpm run deploy`** from the repo root, use Doppler **`prd`** so secrets and **Next.js public env** are available when submitting builds:
  - `NEXT_PUBLIC_FIREBASE_*` (required for a working web app build).
  - Optional: `NEXT_PUBLIC_DESKTOP_DOWNLOAD_MAC_URL`, `NEXT_PUBLIC_DESKTOP_DOWNLOAD_WIN_URL` for the marketing download page.

Shared substitution values for the **frontend** Docker build are built in `echo_frontend_cloudbuild_substitutions` in [`common.sh`](./common.sh). Keep that helper in sync with [`cloudbuild.frontend.yaml`](./cloudbuild.frontend.yaml) and the frontend section of [`cloudbuild.yaml`](./cloudbuild.yaml).

## Entry points

| Command | What it runs |
|--------|----------------|
| `pnpm run deploy` | [`deploy.sh`](./../deploy.sh) → [`build.sh`](./build.sh) (all images) then deploy frontend, backend, Echo Prism agent |
| `pnpm run deploy:build` | [`build.sh`](./build.sh) only |
| `pnpm run deploy:frontend` | [`deploy-frontend.sh`](./deploy-frontend.sh) `--build` then deploy |
| `pnpm run deploy:backend` | [`deploy-backend.sh`](./deploy-backend.sh) `--build` then deploy |
| `pnpm run deploy:agent` | [`deploy-echo-prism-agent.sh`](./deploy-echo-prism-agent.sh) `--build` then deploy |
| `pnpm run deploy:livekit-agent` | [`deploy-livekit-agent.sh`](./deploy-livekit-agent.sh) optional voice worker |

See [`../doppler-env-reference.md`](../doppler-env-reference.md) for environment variables and the **Fork / alternate GitHub** section for forks.
