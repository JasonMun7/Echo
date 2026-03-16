# Echo — System Architecture

Echo is a **Live AI Agent + UI Navigator** platform. Users record or describe workflows once; EchoPrism executes them autonomously using Gemini vision, OmniParser element grounding, and LiveKit voice — all hosted on Google Cloud.

---

## Architecture Diagram

```mermaid
graph TB
    subgraph Clients["User Interfaces"]
        WEB["🌐 Next.js Web App\n(Cloud Run)"]
        DESK["🖥️ Electron Desktop App\n(macOS / Windows)"]
    end

    subgraph GCP["Google Cloud Platform"]
        API["⚙️ FastAPI Backend\n(Cloud Run)"]
        AGENT["🤖 EchoPrism Agent\n(Cloud Run)"]
        OMNI["👁️ OmniParser\n(Cloud Run · GPU)"]
        FS[("🔥 Firestore\nWorkflows · Runs · Logs")]
        GCS[("☁️ Cloud Storage\nScreenshots · Videos")]
        SCHED["⏰ Cloud Scheduler\nScheduled Runs"]
    end

    subgraph AI["AI & Voice Layer"]
        GEMINI["✨ Gemini 2.5 Pro\nVision · Synthesis · Verify"]
        LIVE["🎙️ Gemini Live\nNative Audio"]
        LK["📡 LiveKit\nVoice Rooms"]
    end

    %% Web App flows
    WEB -->|"REST + SSE\n(run status, logs)"| API
    WEB -->|"Firestore realtime\n(onSnapshot)"| FS

    %% Desktop flows
    DESK -->|"REST\n(create run, status)"| API
    DESK -->|"WebSocket\n(step inference)"| AGENT
    DESK -->|"LiveKit SDK\n(voice interrupt)"| LK

    %% Backend flows
    API --> FS
    API --> GCS

    %% Agent flows
    AGENT -->|"Gemini API\n(vision, verify)"| GEMINI
    AGENT -->|"Element grounding\n(bbox detection)"| OMNI
    AGENT -->|"Write logs\n(thought + action)"| FS
    AGENT --> GCS

    %% Voice flows
    LK -->|"Audio stream\n(16kHz PCM)"| LIVE
    LIVE -->|"Tool calls\n(run, redirect, cancel)"| AGENT

    %% Scheduler
    SCHED -->|"POST /api/run\n(cron trigger)"| API

    %% Styling
    classDef gcp fill:#4285f4,color:#fff,stroke:#2a5db0
    classDef ai fill:#9c27b0,color:#fff,stroke:#6a0080
    classDef client fill:#0f9d58,color:#fff,stroke:#0a7a45
    class API,AGENT,OMNI,FS,GCS,SCHED gcp
    class GEMINI,LIVE,LK ai
    class WEB,DESK client
```

---

## Component Descriptions

| Component | Technology | Role |
|---|---|---|
| **Web App** | Next.js 16, React 19, Tailwind | Dashboard: manage workflows, view run logs, share, voice agent |
| **Desktop App** | Electron + Vite | Capture screen, execute actions (Playwright/NutJS), connect to agent |
| **Backend API** | FastAPI, Firebase Admin | CRUD for workflows/runs, SSE streaming, scheduling, integrations |
| **EchoPrism Agent** | FastAPI, Gemini SDK | Step inference via vision, verification, Firestore log writes |
| **OmniParser** | YOLO + Florence-2, GPU | Detect UI elements with bounding boxes for precise grounding |
| **Firestore** | Google Cloud Firestore | Real-time sync for run status, thought/action logs, workflow data |
| **Cloud Storage** | Google Cloud Storage | Screenshots, synthesis videos, workflow thumbnails |
| **Gemini 2.5 Pro** | Google GenAI SDK | Vision inference, workflow synthesis from video, state verification |
| **Gemini Live** | LiveKit Agents + Gemini | Native audio voice agent: listen, respond, and call tools in real time |
| **LiveKit** | LiveKit Cloud | WebRTC rooms for low-latency voice interrupt sessions |
| **Cloud Scheduler** | Google Cloud Scheduler | OIDC-authenticated cron triggers for scheduled workflow runs |

---

## Key Data Flows

### Workflow Execution (Real-time)
```
Desktop App
  → captures screenshot
  → sends to EchoPrism Agent (WebSocket)
  → Agent calls Gemini 2.5 Pro (vision) + OmniParser (grounding)
  → Agent returns action (Click, Type, Navigate, etc.)
  → Agent writes {thought, action} to Firestore logs
  → Desktop executes action (Playwright/NutJS)
  → Web App receives log updates in real time (Firestore onSnapshot + SSE)
```

### Voice Interrupt
```
User speaks (mic)
  → LiveKit room captures audio
  → Gemini Live processes speech in real time
  → Tool call: redirect_run(instruction) or cancel_run()
  → EchoPrism Agent receives instruction
  → Desktop modifies current workflow steps
  → Run continues with updated context
```

### Workflow Synthesis
```
User records screen (video) or takes screenshots
  → Upload to Cloud Storage
  → Pass to Gemini Files API
  → synthesize_workflow_from_media() → JSON steps
  → Steps saved to Firestore
  → Workflow ready to run
```

---

## Google Cloud Services Used

- **Cloud Run** — Web App, Backend API, EchoPrism Agent, OmniParser (GPU)
- **Cloud Firestore** — Primary database (workflows, runs, logs, users, integrations)
- **Cloud Storage** — Media storage (screenshots, videos, thumbnails)
- **Cloud Scheduler** — Cron-based workflow execution
- **Vertex AI / Gemini API** — Vision, synthesis, audio models
- **Firebase Auth** — User authentication (Google OAuth + email)
- **Cloud Build** — CI/CD for parallel image builds and deployments
