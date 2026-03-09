# EchoPrism Sub-agents

Sub-agents for chat, voice, synthesis, Locator, and Runner.

- **modalities/** — Chat and Voice (Alpha's text/audio modality layers)
- **synthesis_agent.py** — Workflow creation from video, images, or description
- **locator_agent.py** — Element localization: owns `ground_element` and `refine` (RegionFocus)
- **runner_agent.py** + **runner/** — Execution: PlaywrightOperator, ApiCallOperator; calls Locator when semantic actions need coords

**Documentation:** [../docs/subagents.md](../docs/subagents.md)
