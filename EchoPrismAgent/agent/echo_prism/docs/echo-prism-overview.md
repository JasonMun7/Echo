# EchoPrism

EchoPrism is a UI-TARS-style Observe → Think → Act agent for workflow automation. It uses a pure Vision-Language Model (VLM) pipeline with Gemini for scene understanding, element localization (Locator), and action verification.

## Architecture

- **alpha/** — Echo Prism Alpha (brain): main Observe→Think→Act loop, reasons and delegates — [docs](alpha.md)
- **subagents/** — modalities/ (Chat, Voice), Synthesis, Locator, Runner — [docs](subagents.md)
- **training/** — Trace filtering, COCO export, Vertex AI fine-tuning — [docs](training.md)
- **datasets/** — COCO4GUI format for training data — [docs](datasets.md)
- **utils/** — Shared utilities (video frame extraction, user MCP) — [docs](utils.md)
- **docs/** — Documentation (voice subagent, fine-tuning)

## Key Concepts

- **Alpha (Brain)**: Reasons about screenshots, outputs semantic actions. Delegates to Runner for execution; Runner calls Locator for coords.
- **Chat / Voice**: Root agents — Alpha's text and voice modality layers. Same tools, different I/O.
- **Synthesis**: Workflow creation from video, images, or description.
- **Locator**: Element localization (screenshot + description → coords). Swappable model (e.g., UI-TARS).
- **Runner**: Executes UI steps (Playwright) and api_call steps (integrations). Calls Locator when semantic actions need coords.
