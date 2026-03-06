# Echo Agent Package

This package contains the Echo workflow automation agent and related components.

## Structure

- **Echo Prism** (`echo_prism/`) — UI-TARS-style Observe → Think → Act agent
  - [alpha/](echo_prism/alpha/) — Echo Prism Alpha (parent agent)
  - [subagents/](echo_prism/subagents/) — Chat, Voice, Synthesis, Description Synthesis
  - [training/](echo_prism/training/) — Trace scoring, COCO export, Vertex fine-tuning
  - [datasets/](echo_prism/datasets/) — COCO4GUI schema and builders
  - [utils/](echo_prism/utils/) — Video frames, user MCP tools
- **integrations/** — App connectors (Slack, Gmail, GitHub, etc.)

## Entrypoints

- `run_workflow_agent.py` — CLI entrypoint for Cloud Run; runs workflows via DirectExecutor + EchoPrism
- `direct_executor.py` — Deterministic step execution without Gemini
- `screenshot_stream.py` — GCS screenshot upload for frontend streaming
