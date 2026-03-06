# EchoPrism Sub-agents

Sub-agents handle user-facing interactions and workflow creation. They are invoked by the chat and synthesize routers.

## Agents

| Agent | Module | Purpose |
|-------|--------|---------|
| **Chat** | `chat_agent.py` | Text chat with function calling (list workflows, run, redirect, synthesize, integrations) |
| **Voice** | `voice_agent.py` | Real-time voice via Gemini Live API; WebSocket bridge for TTS/STT |
| **Synthesis** | `synthesis_agent.py` | Workflow synthesis from video frames — observe→think→act over frames |
| **Description Synthesis** | `description_synthesis_agent.py` | Workflow synthesis from natural language; JSON output with integration recognition |

## Routing

- **Chat router** (`/ws/chat`): Uses Chat for text mode, Voice for `mode=voice`
- **Synthesize router** (`/api/synthesize`): Uses Synthesis for video/screenshots, Description Synthesis for text description
