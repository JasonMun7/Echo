# EchoPrism-Voice

Voice sub-agent for status updates and barge-in kill switch.

## Status Feed

The Executor (run_workflow_agent) writes `current_step`, `current_step_thought`, and `current_step_action` to the run document after each EchoPrism step completes. The Voice agent can subscribe to the run document and speak status updates, e.g.:

> "I've completed step 3. I'm now navigating to your settings."

**Firestore path**: `workflows/{workflow_id}/runs/{run_id}`

**Fields**:
- `current_step` (number): Last completed step index
- `current_step_thought` (string): Agent's thought for that step
- `current_step_action` (string): Action executed

## Barge-In Kill Switch

When the user says **"Stop"**, **"Wait"**, or **"No"**, the Voice agent should invoke the `cancel_run` tool (or equivalent API) to set `cancel_requested: true` on the run document. The Executor polls this between steps and exits cleanly when set.

**API**: `POST /api/workflows/{workflow_id}/runs/{run_id}/cancel`

**Contract**: Map user phrases "Stop", "Wait", "No" to high-priority interrupt that triggers cancel.

## Integration

- **EchoPrismVoiceModal** (apps/web): Uses Live API and tool-calling. Ensure `cancel_run` is triggered for barge-in phrases.
- **Desktop agent**: Polls backend for `cancel_requested` and exits when true.
