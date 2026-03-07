# EchoPrism

EchoPrism is a UI-TARS-style Observe → Think → Act agent for workflow automation. It uses a pure Vision-Language Model (VLM) pipeline with Gemini for scene understanding, element grounding, and action verification.

## Architecture

- **alpha/** — Echo Prism Alpha (parent agent): main Observe→Think→Act loop, grounding, verification — [docs](alpha.md)
- **subagents/** — Specialized agents for chat, voice, and synthesis (video/images + description) — [docs](subagents.md)
- **training/** — Trace filtering, COCO export, Vertex AI fine-tuning — [docs](training.md)
- **datasets/** — COCO4GUI format for training data — [docs](datasets.md)
- **utils/** — Shared utilities (video frame extraction, user MCP) — [docs](utils.md)
- **docs/** — Documentation (voice subagent, fine-tuning)

## Key Concepts

- **Parent Agent**: Runs the main workflow execution loop. Uses Gemini to interpret screenshots and output actions (Click, Type, Navigate, etc.).
- **Sub-agents**: Handle user-facing interactions (chat, voice) and workflow creation (synthesis from video or description).
- **Grounding**: Element location is implemented in `alpha/perception.py` — scene understanding (Tier 1) and structured element grounding (Tier 2).
