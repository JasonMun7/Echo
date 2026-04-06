# EchoPrism Alpha

Parent agent: Observe → Think → Act loop. Alpha reasons and delegates; it does not execute actions or call Locator directly.

- **perception.py** — Tier 1 scene understanding (`perceive_scene`). Element grounding lives in Locator.
- **action_parser.py** — Parses `Action: <action>(<params>)` and `Thought:` from model output.
- **Operator** (PlaywrightOperator, ApiCallOperator) — Lives in `subagents/runner/operator.py`; Runner owns execution.

**Documentation:** [../docs/alpha.md](../docs/alpha.md)
