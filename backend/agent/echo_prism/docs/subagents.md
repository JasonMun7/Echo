# EchoPrism Sub-agents

Sub-agents handle user-facing interactions, workflow creation, element localization, and execution.

## Agents

| Agent | Module | Purpose |
|-------|--------|---------|
| **Chat** | `modalities/chat_agent.py` | Alpha's text modality. Function calling (list workflows, run, redirect, synthesize, integrations). |
| **Voice** | `modalities/voice_agent.py` | Alpha's voice modality. Gemini Live API; WebSocket bridge for TTS/STT. |
| **Synthesis** | `synthesis_agent.py` | Workflow creation: video/images → JSON, description → steps. |
| **Locator** | `locator_agent.py` | Element localization: screenshot + description → coords. Owns `ground_element` and `refine` (RegionFocus). Swappable model (e.g., UI-TARS). |
| **Runner** | `runner_agent.py` + `runner/operator.py` | Executes UI steps via PlaywrightOperator and api_call via integration connectors. Calls Locator when semantic actions need coords. |

## Routing

- **Chat router** (`/ws/chat`): Chat for text mode, Voice for `mode=voice`. Tools delegate to Synthesis or Runner.
- **Synthesize router** (`/api/synthesize`): Thin HTTP layer; handles auth, GCS, Firestore. Delegates to Synthesis for:
  - Video/screenshots → `synthesize_workflow_from_media` (one-shot multimodal, uses `ECHOPRISM_SYNTHESIS_MODEL`)
  - Description → `synthesize_workflow_from_description`

See [synthesis-flow.md](../../docs/synthesis-flow.md) for the full recording → synthesis flow and traceability (`source_recording_id`).
