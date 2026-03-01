# Echo

**Echo** is a workflow automation platform that lets you create, edit, and run browser-based workflows. The agent uses **Gemini 2.5 Computer Use** to execute steps (navigate, click, type, scroll) in a headless browser. You can stream live screenshots while a run executes.

## Tech Stack

| Layer | Stack |
|-------|-------|
| Frontend | Next.js 16, React 19, Tailwind CSS, Firebase Auth, Firestore |
| Backend | FastAPI, Firebase Admin, Google Cloud Storage |
| Agent | Google ADK, Playwright, Gemini 2.5 Computer Use (Cloud Run Job) |
| Deploy | Cloud Run (services + job), gcloud, Docker |

## Project Structure

```
echo/
├── frontend/              # Next.js app
│   ├── app/               # App router pages
│   ├── components/        # UI components
│   └── DESIGN_SYSTEM.md   # Design tokens (Cetacean Blue, Lavender, Ghost White)
├── backend/               # FastAPI app
│   ├── app/               # Routers, auth, services
│   └── agent/             # ADK workflow executor (Cloud Run Job)
│       ├── run_workflow_agent.py
│       ├── playwright_computer.py
│       └── screenshot_stream.py
├── deploy.sh              # Deploys frontend, backend, agent to Cloud Run
├── firestore.rules        # Firestore security rules
└── package.json           # Root scripts (dev, deploy)
```

---

## Prerequisites

- **Node.js** 18+
- **Python** 3.11+
- **Docker** (for deployment)
- **gcloud** CLI (for deployment)
- **Firebase** project
- **Google Cloud** project (same as or linked to Firebase)

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
firebase deploy --only firestore:rules
```

Or paste the rules in **Firestore → Rules** and publish.

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
- Computer Use agent (workflow execution)

---

## Phase 5: Local development

### 5.1 Clone and install

```bash
git clone <your-repo>
cd echo
npm install
```

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
pnpm run backend:dev

# Terminal 2 – frontend
pnpm run dev
# or web + backend together:
pnpm run dev:all
# or desktop app:
pnpm run dev:desktop
```

**For teammates:** Invite them in Doppler → Members. They run `doppler setup` once and `gcloud auth application-default login`, then use the scripts above. No `.env` copying.

### 5.3 Option B: .env files

If you prefer local env files instead of Doppler:

**Frontend**

```bash
cd frontend
cp .env.local.example .env.local
```

Edit `.env.local` with your Firebase config and `NEXT_PUBLIC_API_URL=http://localhost:8000`.

```bash
pnpm install
pnpm run dev
```

**Backend**

```bash
cd backend
cp .env.example .env
```

Edit `.env` with `ECHO_GCP_PROJECT_ID`, `ECHO_GCS_BUCKET`, `GEMINI_API_KEY`, `FIREBASE_PROJECT_ID`.

```bash
pip install -r requirements.txt
uvicorn main:app --reload
```

Frontend: [http://localhost:3000](http://localhost:3000)  
Backend: [http://localhost:8000](http://localhost:8000)  
Health: [http://localhost:8000/health](http://localhost:8000/health)

### 5.4 Agent (optional, local runs)

```bash
cd backend/agent
pip install -r requirements.txt
playwright install chromium
```

Run manually (for debugging):

```bash
WORKFLOW_ID=xxx RUN_ID=yyy OWNER_UID=zzz GEMINI_API_KEY=your-key \
  GCS_BUCKET=your-bucket python run_workflow_agent.py
```

Set `HEADLESS=false` to see the browser.

---

## Phase 6: Deploy to Cloud Run

### 6.1 Prepare backend/.env

Ensure these are set in `backend/.env`:

| Variable | Required | Description |
|----------|----------|-------------|
| `ECHO_GCP_PROJECT_ID` | Yes | GCP project ID |
| `ECHO_GCS_BUCKET` | Yes | GCS bucket name |
| `GEMINI_API_KEY` | Yes | Gemini API key |
| `FIREBASE_PROJECT_ID` | No | Firebase project ID (optional if same as GCP) |
| `ECHO_CLOUD_RUN_REGION` | No | Default `us-central1` |

### 6.2 Deploy

```bash
pnpm run deploy
# or with backend/.env:
doppler run --config prd -- ./scripts/deploy.sh
# or
GEMINI_API_KEY=your-key GCS_BUCKET=your-bucket \
  FIREBASE_PROJECT_ID=your-firebase-id \
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

The deploy script injects `NEXT_PUBLIC_API_URL` into the frontend build. No extra config needed for production.

---

## Environment variables reference

### Frontend (`.env.local`)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase config |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase app ID |
| `NEXT_PUBLIC_API_URL` | Backend API URL (e.g. `http://localhost:8000` or Cloud Run URL) |

### Backend (`.env`)

| Variable | Description |
|----------|-------------|
| `ECHO_GCP_PROJECT_ID` | GCP project ID (for deploy) |
| `ECHO_GCS_BUCKET` | GCS bucket name |
| `ECHO_CLOUD_RUN_REGION` | Cloud Run region (default `us-central1`) |
| `FIREBASE_PROJECT_ID` | Firebase project ID (optional if same as GCP) |
| `GEMINI_API_KEY` | Gemini API key |

### Agent (Cloud Run Job)

Set automatically by deploy script; overrides passed at execution time:

| Variable | Description |
|----------|-------------|
| `WORKFLOW_ID` | Set by backend when triggering run |
| `RUN_ID` | Set by backend when triggering run |
| `OWNER_UID` | Set by backend when triggering run |
| `GEMINI_API_KEY` | Required for Computer Use model |
| `ECHO_GCS_BUCKET` | For live screenshot streaming |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `HEADLESS` | `true` in Cloud Run, `false` for local debugging |

---

## Firestore data model

- `users/{userId}` – User profiles (synced on sign-in)
- `workflows/{workflowId}` – Workflow metadata (name, status)
- `workflows/{workflowId}/steps/{stepId}` – Workflow steps (order, action, params)
- `workflows/{workflowId}/runs/{runId}` – Run metadata (status, lastScreenshotUrl, etc.)
- `workflows/{workflowId}/runs/{runId}/logs/{logId}` – Run logs

The backend and agent use Firebase Admin SDK and bypass Firestore rules. The frontend reads/writes via rules defined in `firestore.rules`.

---

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm run dev` | Start Next.js frontend (Doppler env) |
| `pnpm run dev:web` | Same as dev |
| `pnpm run dev:desktop` | Start Electron desktop app (Doppler env) |
| `pnpm run dev:all` | Start web + backend together (Doppler env) |
| `pnpm run backend:dev` | Start FastAPI backend (Doppler env) |
| `pnpm run backend:docker` | Build and run backend in Docker |
| `pnpm run deploy` | Deploy to Cloud Run (uses Doppler prd) |

---

## Troubleshooting

### 500 on `/api/users/init` or `/api/workflows`

Ensure Firebase and GCP use the same project. Verify `FIREBASE_PROJECT_ID` matches your GCP project ID.

### Workflow runs never start

- Confirm `GEMINI_API_KEY` and `GCS_BUCKET` are set for the agent
- Verify the backend SA can execute the agent job (`roles/run.jobsExecutorWithOverrides` or `run.invoker`)
- Check Cloud Run Job logs for the agent

### No live screenshots

- Ensure `GCS_BUCKET` is set for the agent
- Ensure the agent’s service account has **Storage Object Admin** on the bucket
- Redeploy after changing env vars

### CORS errors

`FRONTEND_ORIGIN` is set from the Cloud Run frontend URL during deploy. If you use a custom domain, update CORS in the backend.

### Google “sorry” / CAPTCHA pages

Google often blocks automated traffic. Consider starting on a different site (e.g. DuckDuckGo) or using the `search` action instead of navigating directly to google.com.
