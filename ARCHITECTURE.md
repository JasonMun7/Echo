# Echo Architecture – EchoPrism UI Navigator

Echo is a workflow automation platform powered by **EchoPrism**, a UI-TARS-style multimodal agent that records, synthesizes, and executes browser and desktop workflows. Built entirely on Google products: Gen AI SDK, Gemini, Vertex AI, Firestore, GCS, and Cloud Run.

---

## High-Level System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Echo Platform                                  │
│                                                                             │
│  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐   │
│  │  Web App          │     │  Desktop App      │     │  FastAPI Backend  │   │
│  │  (Next.js)        │────▶│  (Electron)       │────▶│  (Cloud Run)     │   │
│  └──────────────────┘     └──────────────────┘     └────────┬─────────┘   │
│                                                              │              │
│                    ┌─────────────────────────────────────────┤              │
│                    ▼                          ▼               ▼              │
│            ┌──────────────┐         ┌──────────────┐  ┌──────────────┐    │
│            │   Firestore   │         │     GCS       │  │  EchoPrism   │    │
│            │  (DB + Traces)│         │  (Recordings) │  │   (Agent)    │    │
│            └──────────────┘         └──────────────┘  └──────┬───────┘    │
│                                                               │             │
│                                               ┌───────────────┤             │
│                                               ▼               ▼             │
│                                       ┌──────────────┐ ┌──────────────┐   │
│                                       │  Playwright   │ │  Vertex AI   │   │
│                                       │  (Browser)    │ │  (Fine-tune) │   │
│                                       └──────────────┘ └──────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Breakdown

### 1. Web App (`apps/web`) — Next.js 15 + React 19

The web UI is the primary interface for workflow management, monitoring, and the EchoPrism learning dashboard.

**Key Pages:**
| Route | Purpose |
|-------|---------|
| `/dashboard` | Overview: workflow counts, recent activity |
| `/dashboard/workflows` | Workflow list with type badges (Browser/Desktop) and thumbnail previews |
| `/dashboard/workflows/[id]` | Workflow detail: run history, start/cancel runs |
| `/dashboard/workflows/[id]/edit` | Graph-based step editor (React Flow nodes, drag-and-drop, action dropdown) |
| `/dashboard/workflows/[id]/runs/[runId]` | Run detail: live purple haze while active; structured Firestore logs when complete |
| `/dashboard/traces` | EchoPrism learning dashboard: trace quality stats, Vertex AI export/model status |
| `/auth/desktop-success` | Post-sign-in redirect page that deep-links back to Electron via `echo-desktop://` |

**Design System** (`apps/web/app/globals.css`):
- Color palette: Cetacean Blue (`#150A35`), Lavender (`#A577FF`), Ghost White (`#F5F7FC`)
- CSS custom properties prefixed `--color-echo-*`
- Tailwind aliases: `text-echo-text`, `bg-echo-surface`, `text-echo-primary`, etc.
- shadcn/ui components (Card, Badge, DropdownMenu, Dialog, Select) — installed via MCP
- `.echo-run-haze`: border-only purple glow via `box-shadow: inset`, transparent center

**Auth:** Firebase Auth (email/password). The desktop app redirects to the web sign-in page with `?desktop=1`, which then opens `echo-desktop://auth?token={idToken}` after success.

---

### 2. Desktop App (`apps/desktop`) — Electron + electron-vite

The desktop app lets users capture screen recordings to create workflows, and monitors/runs them locally.

**Main Process (`apps/desktop/src/main/index.ts`):**
- On startup: checks macOS `Screen Recording` permission via `systemPreferences.getMediaAccessStatus` and polls until granted (no UI blocker once permission is confirmed)
- Registers `echo-desktop://` as a custom URL protocol to receive auth tokens from the web app
- IPC handlers: `list-workflows`, `open-web-ui`, recording state management

**Renderer (`apps/desktop/src/renderer/App.tsx`):**
- Sign-in gate: if no token, shows "Sign in via Web" button opening the browser
- **Screen recording**: single "Start Capture" button → `getDisplayMedia` (native macOS picker for source selection) → inline recording bar with Pause/Resume, Stop, Discard controls
- Recording bar timer stops when paused (interval linked to `recordingPaused` state)
- On stop: uploads recording to GCS via signed URL → calls `/api/synthesize` → workflow created with descriptive title
- Workflow list: fetches from backend with auth token, displays titles (not IDs), supports manual refresh
- **Purple haze overlay**: border-only `box-shadow: inset` effect when a workflow run is `running`

**Protocol (`apps/desktop/src/preload/index.ts`):**
- Exposes: `listWorkflows`, `openWebUI`, and recording overlay state channels to renderer via `contextBridge`

---

### 3. Backend (`backend/`) — FastAPI on Cloud Run

Python FastAPI service. Deployed to Google Cloud Run (service). All endpoints require Firebase ID token authentication.

**Routers:**

| Router | Endpoints | Purpose |
|--------|-----------|---------|
| `synthesize.py` | `POST /api/synthesize` | Upload recording → Gemini Pro synthesis → Firestore workflow with title, steps, `workflow_type`, thumbnail |
| `workflows.py` | `GET/POST/PATCH/DELETE /api/workflows` | CRUD for workflows; `GET /api/workflows/{id}/thumbnail` returns signed GCS URL |
| `runs.py` | `POST /api/run/{workflow_id}` | Trigger a run: Cloud Run Job (prod) or background thread (dev); `POST /api/run/{workflow_id}/{run_id}/dismiss` for `awaiting_user` → `completed` |
| `storage.py` | `POST /api/storage/signed-upload-url` | Returns GCS v4 signed PUT URL for direct browser→GCS upload |
| `traces.py` | `POST /filter`, `GET /traces`, `POST /export`, `GET /model-status`, `POST /poll-model` | Trace scoring, Vertex AI fine-tuning pipeline |

**Environment Variables:**
```
GEMINI_API_KEY           # Gemini API key
FIREBASE_PROJECT_ID      # Firebase/GCP project ID
ECHO_GCS_BUCKET          # GCS bucket name
ECHO_GCP_PROJECT_ID      # GCP project (for Cloud Run + Vertex)
ECHO_CLOUD_RUN_REGION    # Cloud Run region
RUN_JOB_NAME             # Cloud Run Job name (unset = local dev fallback)
```

**Local Dev Fallback:** If `RUN_JOB_NAME` is not set, the agent runs in a daemon background thread within FastAPI instead of triggering Cloud Run.

---

### 4. EchoPrism Agent (`backend/agent/`) — Observe → Think → Act

EchoPrism is Echo's AI execution engine, architecturally inspired by UI-TARS. It uses the **Google Gen AI SDK** with **Gemini** for all vision and reasoning.

#### 4.1 Execution Modes

| Step Type | Path |
|-----------|------|
| **Deterministic** — has `selector`, `url`, or exact coordinates | `DirectStepExecutor` → Playwright/nut-js (0 Gemini calls) |
| **Ambiguous** — description-only step | `EchoPrism Observe→Think→Act loop` → Gemini → parse → operator |

#### 4.2 Observe → Think → Act Loop

```
┌─────────────────────────────────────────────────────┐
│              EchoPrism Agent Loop                    │
│                                                      │
│  ┌──────────┐    ┌──────────┐    ┌───────────────┐  │
│  │ Observe  │───▶│  Think   │───▶│     Act       │  │
│  │Screenshot│    │  Gemini  │    │ Operator exec │  │
│  └──────────┘    └──────────┘    └───────┬───────┘  │
│       ▲                                  │           │
│       └──────────────────────────────────┘           │
│                                                      │
│  Signals: Finished() → complete  CallUser() → pause  │
└─────────────────────────────────────────────────────┘
```

**Per Step:**
1. **Observe**: Take screenshot (`operator.screenshot()`) → compress via Pillow (`image_utils.compress_screenshot`)
2. **Think**: Gemini generates `Thought: <reasoning>\nAction: <action(params)>`
3. **Act**: `action_parser.parse_action()` → `operator.execute(action)` → `True | False | "finished" | "calluser"`
4. **Reflect**: `_verify_action()` calls Gemini with before/after screenshots → `VERDICT: success/failed` → feeds back into retry if failed
5. **Retry**: Up to `MAX_RETRIES=2` on parse failure, operator `False`, or verification failure

#### 4.3 Action Spaces

**Desktop (`DESKTOP_ACTION_SPACE`)** — via `nut-js` (Electron IPC) or `PyAutoGUI`:
```
Click(x, y)              RightClick(x, y)         DoubleClick(x, y)
Drag(x1, y1, x2, y2)     Scroll(x, y, direction)  Type(content)
Hotkey(key1, key2, ...)  Wait(seconds)             PressKey(key)
OpenApp(appName)         FocusApp(appName)
Finished()               CallUser()
```

**Browser (`BROWSER_ACTION_SPACE`)** — via `Playwright`:
```
Click(x, y)              Scroll(x, y, direction)  Type(content)
Wait(seconds)            Navigate(url)            SelectOption(selector, value)
Hover(x, y)              WaitForElement(selector)
Finished()               CallUser()
```

Coordinates are normalized to a **0–1000** scale. `workflow_type` in Firestore (`"browser"` | `"desktop"`) selects the correct action space at runtime.

#### 4.4 Perception (UI-TARS-inspired, prompt-only)

All perception is implemented via Gemini prompts — no pre-trained Echo-specific data:

| Task | Prompt | Purpose |
|------|--------|---------|
| **Element Description** | `element_qa_prompt` | Identify type, visual appearance, position, function of specific elements |
| **Dense Captioning** | `dense_caption_prompt` | Full structured description of entire GUI screenshot |
| **State Transition** | `state_transition_prompt` | Detect changes between before/after screenshots; output `VERDICT: success/failed` |
| **QA** | `element_qa_prompt` | Answer questions about the interface for grounded reasoning |
| **System-2 Reasoning** | `system_prompt` | Explicit `Thought:` before every action — enables task decomposition, reflection, milestone recognition |

#### 4.5 Model Selection

```python
async def _resolve_model(db) -> str:
    # 1. Check global_model/current in Firestore
    # 2. If job_status == "ready" → use tuned_model_id (fine-tuned global model)
    # 3. Else → fallback to FALLBACK_MODEL = "gemini-2.5-flash"
```

**Models used:**
| Model | Purpose |
|-------|---------|
| `gemini-2.5-pro` | Workflow synthesis from screen recordings (high-quality one-shot) |
| `gemini-2.5-flash` | EchoPrism agent (real-time Observe→Think→Act, trace scoring) |
| Fine-tuned global model | Deployed after Vertex AI SFT — all users share one model |

#### 4.6 Token Optimization

| Strategy | Implementation |
|----------|----------------|
| **Resize + downscale** | Pillow: resize screenshot to ≤1280px width before sending |
| **JPEG/WebP compression** | `compress_screenshot()` outputs JPEG at quality=85 |
| **Observation window** | `build_context(n_images=3)` — only last 3 screenshots in full; older steps as text summaries |
| **Single current frame** | Deterministic steps skip screenshot entirely (no Gemini call) |
| **Video frame sampling** | Synthesis: sample N frames from recording, not full video stream |
| **Lazy image load** | Gemini vision called only when step is ambiguous |
| **Flash for vision** | `gemini-2.5-flash` for per-step inference (128k context, 64k output limit) |

---

### 5. Learning Pipeline — Global EchoPrism Model

EchoPrism implements the full UI-TARS §4.5 offline learning loop. All users' traces contribute to **one shared global model** (analogous to UI-TARS's foundation model), not per-user personalized models.

```
┌────────────────────────────────────────────────────────────────────┐
│                   EchoPrism Learning Loop                          │
│                                                                    │
│  Agent Run          Trace Filter         Vertex AI Pipeline        │
│  ─────────          ────────────         ──────────────────        │
│  Execute steps  →   Rule-based score  →  Export JSONL to GCS      │
│  Log to         →   VLM score (Gemini)→  Submit SupervisedTuningJob│
│  Firestore          T+ / T- labels    →  Poll job status           │
│                     corrected_thought →  Store tuned_model_id      │
│                     → filtered_traces    in global_model/current   │
│                                                                    │
│  Runtime Reflection:                                               │
│  _verify_action() → before/after screenshots → VERDICT feedback   │
│  → feeds into MAX_RETRIES retry loop (self-correction)            │
└────────────────────────────────────────────────────────────────────┘
```

**Step 1 — Runtime Reflection** (`echo_prism_agent.py`):
- After each action: `_verify_action(before, after)` → Gemini state-transition prompt → `VERDICT: success` or `VERDICT: failed`
- On failure: retry the step (up to `MAX_RETRIES`) with the failure context in the prompt

**Step 2 — Offline Trace Filtering** (`trace_filter.py`):
- Triggered automatically in a background thread after every run
- **Pass 1 (rule-based)**: flags `error` field, empty/unparseable actions, duplicate actions, excessive `Wait(>10s)` → mark as bad (T-)
- **Pass 2 (Gemini VLM)**: scores remaining steps; generates `corrected_thought` (T+) for bad steps
- Stored in `filtered_traces/{workflow_id}_{run_id}` in Firestore

**Step 3 — Vertex AI Export + Fine-tuning** (`vertex_export.py`):
- `export_training_data()`: reads ALL `filtered_traces` (no user filter), generates JSONL SFT examples, uploads to `gs://{bucket}/training/global/dataset.jsonl`
- `create_tuning_job()`: submits `SupervisedTuningJob` to Vertex AI; stores `job_name`, `job_status: "training"` in `global_model/current` Firestore doc
- `get_tuning_job_status()`: polls Vertex AI; on completion writes `tuned_model_id` + `job_status: "ready"` to `global_model/current`

**Step 4 — Model Resolution**: Next agent run reads `global_model/current` → uses fine-tuned endpoint if ready, else falls back to `gemini-2.5-flash`.

---

### 6. Firestore Data Model

```
users/{uid}                    # User profile
workflows/{workflowId}         # Workflow document
  name: string                 # Descriptive title (Gemini-generated)
  workflow_type: "browser" | "desktop"
  steps: Step[]                # Ordered step array
  thumbnail_gcs_path: string   # GCS path for workflow preview image
  owner_uid: string
  created_at: timestamp

workflows/{workflowId}/runs/{runId}    # Run document
  status: "pending" | "running" | "completed" | "failed" | "cancelled" | "awaiting_user"
  callUserReason: string?              # Populated when status = awaiting_user
  created_at: timestamp

workflows/{workflowId}/runs/{runId}/logs/{logId}    # Structured log entries
  message: string
  level: "info" | "warn" | "error"
  timestamp: timestamp
  metadata: object?            # Optional: thought, action, step_index

filtered_traces/{workflowId}_{runId}   # Scored trace document
  steps/ (subcollection)               # Per-step quality scores
    quality: "good" | "bad" | "unknown"
    reason: string
    corrected_thought: string?         # T+ for bad steps (Vertex AI training)
    thought: string
    action: string

global_model/current           # Single global fine-tuning state
  job_name: string             # Vertex AI tuning job resource name
  job_status: "training" | "ready" | "failed"
  tuned_model_id: string?      # Endpoint name when ready
  example_count: int
  created_at: timestamp
```

---

### 7. Monorepo Structure

```
echo/
├── apps/
│   ├── web/                    # Next.js web app
│   │   ├── app/
│   │   │   ├── dashboard/      # All dashboard routes
│   │   │   │   ├── page.tsx           # Home dashboard
│   │   │   │   ├── workflows/         # Workflow list + detail + edit + run
│   │   │   │   └── traces/            # EchoPrism learning dashboard
│   │   │   ├── auth/desktop-success/  # Desktop auth callback
│   │   │   └── globals.css            # Echo design system tokens
│   │   ├── components/         # Shared components (dashboard-layout, sign-in-form)
│   │   └── DESIGN_SYSTEM.md    # Design system documentation
│   └── desktop/                # Electron desktop app
│       └── src/
│           ├── main/index.ts   # Main process: IPC, protocol, permissions
│           ├── preload/index.ts # contextBridge API surface
│           └── renderer/       # React UI (App.tsx, index.css)
├── packages/
│   └── echo-types/             # Shared TypeScript types
│       └── src/index.ts        # Workflow, Step, Run, WorkflowType interfaces
├── backend/                    # FastAPI service
│   ├── main.py                 # App entrypoint + router registration
│   ├── app/
│   │   ├── routers/            # synthesize, workflows, runs, storage, traces
│   │   └── services/gcs.py     # GCS signed URL utilities
│   └── agent/
│       ├── run_workflow_agent.py      # Top-level orchestrator
│       ├── direct_executor.py         # Deterministic step executor (Playwright/nut-js)
│       └── echo_prism/
│           ├── echo_prism_agent.py    # Observe→Think→Act loop
│           ├── prompts.py             # System prompt, action spaces, perception prompts
│           ├── action_parser.py       # Gemini output → structured action dict
│           ├── operator.py            # BaseOperator, PlaywrightOperator
│           ├── image_utils.py         # Screenshot compression + context builder
│           ├── trace_filter.py        # Offline trace scoring (rule-based + Gemini VLM)
│           └── vertex_export.py       # Vertex AI SFT export + job submission
├── firestore.rules             # Firestore security rules
├── pnpm-workspace.yaml
└── ARCHITECTURE.md
```

---

### 8. Deployment

| Component | Deploy Target | Notes |
|-----------|--------------|-------|
| Web App | Firebase Hosting / Cloud Run Service | Next.js SSR |
| Backend API | Google Cloud Run (Service) | FastAPI, Docker |
| Agent (browser) | Google Cloud Run (Job) | Triggered by backend; headless=False |
| Agent (desktop) | In-process (Electron / local dev thread) | nut-js for native control |
| Firestore | Firebase / GCP | Rules enforced |
| GCS | Google Cloud Storage | CORS configured for `localhost:5173` + production origin |

---

### 9. Auth & Security Flow

```
Desktop App ──(open browser)──▶ Web App /sign-in?desktop=1
                                    │ (Firebase sign-in)
                                    ▼
                              /auth/desktop-success
                                    │ (open echo-desktop://auth?token=...)
                                    ▼
Desktop App ◀──(deep link)── Electron protocol handler
                (stores ID token, calls backend with Bearer token)
```

All backend endpoints verify `Authorization: Bearer {idToken}` via Firebase Admin SDK.

---

### 10. Hackathon Compliance — Gemini Live Agent Challenge (UI Navigator)

| Requirement | Implementation |
|-------------|---------------|
| Multimodal inputs | Screenshots (PNG/JPEG), screen recordings (WebM/MP4), video frames |
| Multimodal outputs | Structured executable actions (Click, Type, Navigate, Hotkey, etc.) |
| Gemini multimodal | Perception: screenshots → actions; state-transition verification; trace scoring |
| Google Gen AI SDK | `from google import genai` — all Gemini calls go through Gen AI SDK |
| Google Cloud | Cloud Run (service + job), Firestore, GCS, Vertex AI |
| Backend on GCP | FastAPI on Cloud Run |
| Self-improving agent | Offline trace filtering → Vertex AI SFT → global model → EchoPrism uses fine-tuned endpoint |
| UI Navigator category | Observe→Think→Act on real browser/desktop UIs; nut-js + Playwright operators |
