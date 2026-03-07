# EchoPrism Sub-agents

Sub-agents handle user-facing interactions and workflow creation. They are invoked by the chat and synthesize routers.

## Agents

| Agent | Module | Purpose |
|-------|--------|---------|
| **Chat** | `chat_agent.py` | Text chat with function calling (list workflows, run, redirect, synthesize, integrations) |
| **Voice** | `voice_agent.py` | Real-time voice via Gemini Live API; WebSocket bridge for TTS/STT |
| **Synthesis** | `synthesis_agent.py` | All workflow synthesis: (1) one-shot video/images → JSON via `synthesize_workflow_from_media` (uses `SYNTHESIS_MODEL`), (2) frame-by-frame observe→think→act via `synthesize_workflow_from_frames`, (3) natural language description → steps via `synthesize_workflow_from_description` |

## Routing

- **Chat router** (`/ws/chat`): Uses Chat for text mode, Voice for `mode=voice`
- **Synthesize router** (`/api/synthesize`): Thin HTTP layer; handles auth, GCS, Firestore. Delegates to Synthesis for:
  - Video/screenshots → `synthesize_workflow_from_media` (one-shot multimodal, uses `ECHOPRISM_SYNTHESIS_MODEL`)
  - Description → `synthesize_workflow_from_description`

See [synthesis-flow.md](../../docs/synthesis-flow.md) for the full recording → synthesis flow and traceability (`source_recording_id`).
