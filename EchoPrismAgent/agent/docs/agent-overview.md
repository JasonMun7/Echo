# Echo Agent Package

This package contains the Echo workflow automation agent and related components.

## Structure

- **Echo Prism** (`echo_prism/`) — UI-TARS-style Observe → Think → Act agent
  - [alpha/](../echo_prism/alpha/) — Echo Prism Alpha (parent agent) — [docs](../echo_prism/docs/alpha.md)
  - [subagents/](../echo_prism/subagents/) — Chat, Voice, Synthesis (video + description) — [docs](../echo_prism/docs/subagents.md)
  - [training/](../echo_prism/training/) — Trace scoring, COCO export, Vertex fine-tuning — [docs](../echo_prism/docs/training.md)
  - [datasets/](../echo_prism/datasets/) — COCO4GUI schema and builders — [docs](../echo_prism/docs/datasets.md)
  - [utils/](../echo_prism/utils/) — Video frames, user MCP tools — [docs](../echo_prism/docs/utils.md)
- **integrations/** — App connectors (Slack, Gmail, GitHub, etc.) — [docs](integrations.md)

## Entrypoints

- `run_workflow_agent.py` — CLI entrypoint for Cloud Run; runs workflows via DirectExecutor + EchoPrism
- `direct_executor.py` — Deterministic step execution without Gemini
- `screenshot_stream.py` — GCS screenshot upload for frontend streaming

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — Full architecture
- [synthesis-flow.md](synthesis-flow.md) — Screen recording → workflow flow
