# Echo Prism Alpha — Brain

Alpha is the core Observe → Think → Act agent. It reasons about screenshots and outputs semantic actions. Runner resolves coords via Locator and executes.

## Modules

- **agent.py** — Main loop: `run_ambiguous_step()`, Gemini calls, retries, state verification. Delegates coord resolution to Runner.
- **action_parser.py** — Parses `Action: <action>(<params>)` and `Thought:` from model output
- **Operator** — PlaywrightOperator, ApiCallOperator live in `subagents/runner/operator.py` (Runner owns execution)
- **perception.py** — `perceive_scene` (Tier 1); Locator agent wraps `ground_element` / `zoom_and_reground`
- **prompts.py** — System prompt, action spaces (browser/desktop), adaptability, step instructions
- **image_utils.py** — Screenshot compression, context building, coordinate scaling

## Element Localization (Locator)

Element localization is handled by the Locator subagent (`subagents/locator_agent.py`). Runner calls Locator when semantic actions need coordinates. Locator owns `ground_element` and `refine` (RegionFocus) — all grounding logic lives in Locator.
