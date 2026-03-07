# Echo Prism Alpha — Parent Agent

Echo Prism Alpha is the core Observe → Think → Act agent that executes workflow steps in a browser.

## Modules

- **agent.py** — Main agent loop: `run_ambiguous_step()`, Gemini calls, retries, state verification
- **action_parser.py** — Parses `Action: <action>(<params>)` and `Thought:` from model output
- **operator.py** — PlaywrightOperator (browser) and ApiCallOperator (integrations)
- **perception.py** — 3-tier VLM: `perceive_scene`, `ground_element`, `zoom_and_reground` (RegionFocus)
- **prompts.py** — System prompt, action spaces (browser/desktop), adaptability, step instructions
- **image_utils.py** — Screenshot compression, context building, coordinate scaling

## Grounding

Element grounding lives in `perception.py`:
- **Tier 1** (`perceive_scene`): Dense caption of the full UI
- **Tier 2** (`ground_element`): Structured coordinates for a described element
- **RegionFocus** (`zoom_and_reground`): Zoom into uncertain regions and re-ground at higher detail (ICCV 2025)
