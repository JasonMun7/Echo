# EchoPrism Utils

Shared utilities used by EchoPrism sub-agents and other components.

## Modules

- **video_frames.py** — Extracts frames from video (e.g. 1 FPS) as JPEG bytes. Used by synthesis agent's frame-by-frame flow (`synthesize_workflow_from_frames`). The main synthesize router uses one-shot mode (`synthesize_workflow_from_media`) with raw video.
- **user_mcp_server.py** — Loads user-registered MCP tools from Firestore; executes HTTP calls to user webhooks (not yet wired into routers)
