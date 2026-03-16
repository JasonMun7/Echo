# Echo

<p align="center">
  <img src="apps/web/public/echo_logo.png" alt="Echo" width="120" />
</p>

**Echo** is an AI-powered workflow automation platform. Create and edit browser-based workflows (from recordings or AI synthesis), then run them via the **EchoPrism** vision-language agent—which executes steps (navigate, click, type, scroll) in a headless browser and streams live screenshots. Use the **web dashboard** to manage workflows and runs, or the **Electron desktop app** for voice-driven control and EchoPrism chat.

---

## Replicate this project (quick map)

To run the full stack locally or deploy from scratch:

1. **Prerequisites** — Install Node.js 18+, pnpm, Python 3.11+, Docker, gcloud CLI, Firebase CLI, and (optional) Doppler.
2. **Phase 1: GCP** — Create/enable a GCP project, enable APIs, create a GCS bucket.
3. **Phase 2: Firebase** — Create/link Firebase project, enable Auth (Email/Password + Google), create Firestore, register web app, deploy Firestore rules from `firebase/`.
4. **Phase 3: IAM** — Ensure the backend/agent service account has Firestore, Storage, and (for jobs) Cloud Run Jobs permissions.
5. **Phase 4: Gemini** — Create a Gemini API key in Google AI Studio.
6. **Phase 5: Local dev** — Clone repo, install deps (pnpm + Python), configure env (Doppler or `.env`), then run backend, web app, and (optional) EchoPrism agent.
7. **Phase 6: Deploy** — Use `pnpm run deploy` (with Doppler prd or env) to deploy to Cloud Run; optionally deploy LiveKit agent.

The sections below spell out each step in detail.

---

## Tech Stack

| Layer    | Stack |
| -------- | ----- |
| **Web** | Next.js 16, React 19, Tailwind CSS 4, Firebase Auth, Firestore, shadcn/ui |
| **Desktop** | Electron, Vite, LiveKit (voice), Playwright (local browser automation) |
| **Backend** | FastAPI, Firebase Admin, Google Cloud Storage, Cloud Scheduler |
| **Agent** | EchoPrism (vision-language), Playwright, Gemini; LiveKit voice agent; synthesis & chat APIs |
| **Vision** | OmniParser (UI grounding, GPU / Cloud Run) |
| **Deploy** | Cloud Run (services + jobs), gcloud, Docker |

## Project Structure

```
echo/
├── apps/
│   ├── web/                    # Next.js 16 web app
│   │   ├── app/                 # App Router (marketing, dashboard, auth)
│   │   ├── components/          # UI, marketing, dashboard components
│   │   ├── lib/                 # Firebase, API client, utils
│   │   └── public/              # Static assets (e.g. echo_logo.png)
│   └── desktop/                 # Electron + Vite desktop app (voice, workflows)
├── packages/
│   └── echo-types/              # Shared TypeScript types
├── backend/                     # FastAPI API (workflows, runs, storage, auth)
├── EchoPrismAgent/              # EchoPrism service: chat, LiveKit, synthesis, workflow execution
├── OmniParser/                  # UI element grounding (Cloud Run)
├── firebase/                    # Firestore & Storage rules, indexes, firebase.json
├── docs/                        # Architecture and reference docs (optional)
├── scripts/                     # deploy.sh, deploy/*, install-python-deps.sh
└── package.json                 # Root pnpm scripts (dev, build, deploy)
```

---

## Prerequisites

Install the following so you can replicate the project locally and deploy:

- **Node.js** 18+ — [nodejs.org](https://nodejs.org) or `nvm install 18`
- **pnpm** — `npm install -g pnpm` (project uses `packageManager: pnpm@9.0.0`)
- **Python** 3.11+ — [python.org](https://www.python.org) or `pyenv install 3.11`
- **Docker** — for building and deploying images
- **gcloud** CLI — [Install](https://cloud.google.com/sdk/docs/install); `gcloud auth login` and `gcloud auth application-default login`
- **Firebase CLI** — `npm install -g firebase-tools`; `firebase login`
- **Firebase** project — create or link at [Firebase Console](https://console.firebase.google.com)
- **Google Cloud** project — same as or linked to Firebase; billing enabled
- **Doppler** (optional but recommended) — `brew install dopplerhq/cli/doppler` for secrets; otherwise use `.env` files

---

## Phase 1: GCP Setup

### 1.1 Create a GCP project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create or select a project with billing enabled

### 1.2 Enable APIs

In **APIs & Services → Enable APIs**, enable:

- Cloud Run API
- Cloud Scheduler API
- Firestore API
- Cloud Storage API
- Gemini API

### 1.3 Create a GCS bucket

1. Go to **Cloud Storage → Buckets**
2. Create a bucket with **Uniform bucket-level access**
3. Note the bucket name (e.g. `echo-assets-prod`)

This bucket stores workflow assets (video, screenshots) and agent screenshots for live streaming.

---

## Phase 2: Firebase Setup

### 2.1 Create or link Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project or add Firebase to your existing GCP project

### 2.2 Authentication

1. **Authentication → Sign-in method**
2. Enable **Email/Password**
3. Enable **Google** (add OAuth client IDs if needed)

### 2.3 Firestore

1. **Firestore Database → Create database**
2. Choose **Native mode**
3. Pick a location (e.g. `us-central1`)

### 2.4 Register web app

1. **Project Settings (gear) → Your apps**
2. Add a web app (</>)
3. Copy the config object (e.g. `apiKey`, `authDomain`, `projectId`, etc.)

### 2.5 Deploy Firestore rules

From the project root:

```bash
cd firebase && firebase deploy --only firestore:rules
```

Or run `pnpm firebase:deploy` (see package.json scripts). Alternatively, paste the rules in **Firestore → Rules** and publish.

### 2.6 Firebase and GCP in same project

Use the same GCP project for both Firebase and Cloud Run. The default compute service account will access Firebase (Auth, Firestore) and GCS via Application Default Credentials.

---

## Phase 3: Service accounts & IAM

### 3.1 Backend / Agent service account

For Cloud Run, you typically use the default compute service account or a custom one.

Use the default compute SA. Ensure it has:

- **Firestore**: Cloud Datastore User (or Firestore roles)
- **Storage**: Storage Object Admin (for GCS upload and signed URLs)
- **Cloud Run Jobs**: Run Jobs Executor (for agent job execution)

---

## Phase 4: Gemini API key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Sign in and create an API key (select your GCP project)
3. Copy the key

Used for:

- Workflow synthesis (video/screenshots → steps)
- EchoPrism agent (workflow execution)

---

## Phase 5: Local development

### 5.1 Clone and install

```bash
git clone <your-repo>
cd echo
pnpm install
```

Then install backend and agent Python dependencies:

```bash
pnpm run install:backend
```

This runs `scripts/install-python-deps.sh` (backend and EchoPrismAgent venv/pip). You may also need `playwright install chromium` inside the agent env if you run workflows locally.

### 5.2 Option A: Doppler (recommended for teams)

**You do not need `.env` or `.env.local` files** when using Doppler. Secrets live in [Doppler](https://doppler.com) and are injected at runtime.

**Setup (one-time):**

1. Install Doppler CLI: `brew install dopplerhq/cli/doppler`
2. Log in: `doppler login`
3. Link the project: `doppler setup` (select project and `dev` config)
4. Add all env vars in the Doppler dashboard (backend + frontend; see Environment variables reference below)
5. For local GCP access, run `gcloud auth application-default login`

**Run:**

```bash
# Terminal 1 – backend
pnpm run dev:backend

# Terminal 2 – frontend
pnpm run dev
# or desktop app:
pnpm run dev:desktop

# Terminal 3 (optional) – EchoPrism Agent (chat, voice, synthesis)
pnpm run dev:agent
```

When running EchoPrism Agent locally, set `NEXT_PUBLIC_ECHO_AGENT_URL` (web) and `VITE_ECHO_AGENT_URL` (desktop) to `http://localhost:8081` in Doppler.

**For teammates:** Invite them in Doppler → Members. They run `doppler setup` once and `gcloud auth application-default login`, then use the scripts above. No `.env` copying.

### 5.3 Option B: .env files

If you prefer local env files instead of Doppler:

**Web app (Next.js)**

```bash
cd apps/web
cp .env.local.example .env.local
```

Edit `apps/web/.env.local` with your Firebase config and `NEXT_PUBLIC_API_URL=http://localhost:8000`. From repo root:

```bash
pnpm run dev
```

**Backend (FastAPI)**

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` with `ECHO_GCP_PROJECT_ID`, `ECHO_GCS_BUCKET`, `GEMINI_API_KEY`. From repo root:

```bash
pnpm run dev:backend
```

**URLs**

- Web: [http://localhost:3000](http://localhost:3000)
- Backend: [http://localhost:8000](http://localhost:8000)
- Health: [http://localhost:8000/health](http://localhost:8000/health)

### 5.4 EchoPrism Agent (optional, local runs)

From repo root:

```bash
pnpm run dev:agent
```

(Uses Doppler; ensure `GEMINI_API_KEY`, `ECHO_GCS_BUCKET`, etc. are set.) The agent runs as a FastAPI app on port 8081. For workflow execution, the deploy pipeline uses a Cloud Run Job; see [EchoPrismAgent/agent/docs](EchoPrismAgent/agent/docs) for architecture. Install Playwright browsers if needed: `playwright install chromium`.

---

## Phase 6: Deploy to Cloud Run

### 6.1 Prepare backend/.env

Ensure these are set in `backend/.env`:

| Variable                | Required | Description           |
| ----------------------- | -------- | --------------------- |
| `ECHO_GCP_PROJECT_ID`   | Yes      | GCP project ID        |
| `ECHO_GCS_BUCKET`       | Yes      | GCS bucket name       |
| `GEMINI_API_KEY`        | Yes      | Gemini API key        |
| `ECHO_CLOUD_RUN_REGION` | No       | Default `us-central1` |

### 6.2 Deploy

```bash
pnpm run deploy
# or with backend/.env:
doppler run --config prd -- ./scripts/deploy.sh
# or
GEMINI_API_KEY=your-key ECHO_GCS_BUCKET=your-bucket \
  ./scripts/deploy.sh YOUR_GCP_PROJECT_ID us-central1
```

The script will:

1. Build frontend, backend, and agent Docker images
2. Push to `gcr.io/YOUR_PROJECT/...`
3. Deploy `echo-frontend` and `echo-backend` as Cloud Run services
4. Deploy `echo-agent` as a Cloud Run Job
5. Configure env vars and CORS
6. Grant agent execution permissions

### 6.3 Post-deploy

- Frontend URL: `https://echo-frontend-{PROJECT_NUMBER}.{REGION}.run.app`
- Backend URL: `https://echo-backend-{PROJECT_NUMBER}.{REGION}.run.app`

The deploy script injects `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_ECHO_AGENT_URL` into the frontend build. No extra config needed for production.

### 6.4 LiveKit Agent (optional — EchoPrism Voice)

The main `pnpm run deploy` deploys frontend, backend, echo-prism-agent, and omniparser. The **LiveKit voice agent** is a separate Cloud Run service deployed only when EchoPrism Voice is required.

- **Desktop app**: It _does_ call the hosted EchoPrism agent (Cloud Run): the app fetches a LiveKit room token from `VITE_ECHO_AGENT_URL/api/livekit/token`. For production desktop builds, set `VITE_ECHO_AGENT_URL` to your EchoPrism Cloud Run URL (e.g. `https://echo-prism-agent-{PROJECT_NUMBER}.us-central1.run.app`).
- **Voice in room**: For EchoPrism Voice to work, you must deploy the LiveKit agent so a worker joins the room. Without it, the desktop gets a token and connects, but no voice agent will be present.

To deploy the LiveKit agent:

```bash
pnpm run deploy:livekit-agent
```

Requires Doppler prd config with: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_AGENT_SECRET`, `ECHOPRISM_AGENT_URL`, `GEMINI_API_KEY`. The **EchoPrism** Cloud Run service must also have `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` set so `/api/livekit/token` can issue tokens. See [EchoPrism LiveKit README](EchoPrismAgent/agent/echo_prism/subagents/livekit/README.md).

---

## Environment variables reference

See [scripts/doppler-env-reference.md](scripts/doppler-env-reference.md) for the canonical list. Summary:

- **Shared (Backend + EchoPrism):** `ECHO_GCS_BUCKET`, `ECHO_GCP_PROJECT_ID`, `GEMINI_API_KEY`, `ECHOPRISM_OMNIPARSER_URL`, `GOOGLE_APPLICATION_CREDENTIALS`
- **Frontend (web):** `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_ECHO_AGENT_URL`, `NEXT_PUBLIC_FIREBASE_*`
- **Desktop:** `VITE_API_URL`, `VITE_ECHO_AGENT_URL`

### LiveKit (EchoPrism Voice + Chat)

EchoPrism Voice uses LiveKit + Gemini. Configure these for the backend and [LiveKit agent](EchoPrismAgent/agent/echo_prism/subagents/livekit/README.md):

- **Backend (EchoPrismAgent):** `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_AGENT_SECRET`
- **Desktop (dev):** `VITE_LIVEKIT_SANDBOX_ID` — optional; use LiveKit Cloud sandbox token server to skip backend token endpoint during development
- **Desktop:** `VITE_API_URL` = main backend; `VITE_ECHO_AGENT_URL` = EchoPrismAgent (8081). LiveKit token is fetched from EchoPrismAgent.

Create a project at [cloud.livekit.io](https://cloud.livekit.io), copy API key/secret/URL, then run the LiveKit agent (`pnpm run dev:livekit-agent` or see [livekit README](EchoPrismAgent/agent/echo_prism/subagents/livekit/README.md)) alongside the EchoPrism backend.

---

## Firestore data model

- `users/{userId}` – User profiles (synced on sign-in). Optional `phone` (E.164) for telephony personalization: when a caller’s SIP number matches, the LiveKit agent greets by name and runs tools for that user.
- `workflows/{workflowId}` – Workflow metadata (name, status)
- `workflows/{workflowId}/steps/{stepId}` – Workflow steps (order, action, params)
- `workflows/{workflowId}/runs/{runId}` – Run metadata (status, lastScreenshotUrl, etc.)
- `workflows/{workflowId}/runs/{runId}/logs/{logId}` – Run logs

The backend and agent use Firebase Admin SDK and bypass Firestore rules. The frontend reads/writes via rules defined in `firebase/firestore.rules`.

---

## Scripts

| Script                          | Description                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run dev`                  | Start Next.js frontend (Doppler env)                                                                                            |
| `pnpm run dev:desktop`          | Start Electron desktop app (Doppler env)                                                                                        |
| `pnpm run dev:backend`          | Start FastAPI backend (Doppler env)                                                                                             |
| `pnpm run dev:agent`            | Start EchoPrism Agent locally (port 8081, Doppler env)                                                                          |
| `pnpm run dev:livekit-agent`    | Start EchoPrism LiveKit voice agent (Doppler env)                                                                               |
| `pnpm run version:desktop`      | Bump desktop patch version only (0.1.1 → 0.1.2); optional if you use `desktop:dist`                                               |
| `pnpm run desktop:dist`         | Bump patch version, then build and **publish to GitHub Releases** (set `GH_TOKEN`); existing users get the update via in-app updater |
| `pnpm run deploy`               | Deploy to Cloud Run — frontend, backend, echo-prism-agent, omniparser                                                           |
| `pnpm run deploy:livekit-agent` | Deploy LiveKit voice agent only (optional; requires LiveKit Cloud)                                                              |

---

## Troubleshooting

### 500 on `/api/users/init` or `/api/workflows`

Ensure Firebase and GCP use the same project. Verify `ECHO_GCP_PROJECT_ID` is set correctly.

### Workflow runs never start

- Confirm `GEMINI_API_KEY` and `ECHO_GCS_BUCKET` are set for the agent
- Verify the backend SA can execute the agent job (`roles/run.jobsExecutorWithOverrides` or `run.invoker`)
- Check Cloud Run Job logs for the agent

### EchoPrism Voice doesn’t connect (desktop)

- **Desktop build**: Ensure `VITE_ECHO_AGENT_URL` is set to the EchoPrism Cloud Run URL when building the desktop app for production.
- **Token**: EchoPrism Cloud Run must have `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` set; otherwise `/api/livekit/token` returns 503.
- **No agent in room**: Deploy the LiveKit agent (`pnpm run deploy:livekit-agent`) and set `LIVEKIT_AGENT_SECRET` and `ECHOPRISM_AGENT_URL`; otherwise the room has no voice worker.

### 500 on `/api/synthesize` (echo-prism-agent)

- Set **`GEMINI_API_KEY`** and **`ECHO_GCS_BUCKET`** in the EchoPrism Agent Cloud Run service (or in Doppler prd used at deploy). Missing either yields a 500.
- Check Cloud Run logs for the echo-prism-agent revision; the handler now logs the full exception (`Synthesis failed: ...`) so you can see the exact error.

### No live screenshots

- Ensure `ECHO_GCS_BUCKET` is set for the agent
- Ensure the agent’s service account has **Storage Object Admin** on the bucket
- Redeploy after changing env vars

### CORS errors

`FRONTEND_ORIGIN` is set from the Cloud Run frontend URL during deploy. If you use a custom domain, update CORS in the backend.

### Google “sorry” / CAPTCHA pages

Google often blocks automated traffic. Consider starting on a different site (e.g. DuckDuckGo) or using the `search` action instead of navigating directly to google.com.
