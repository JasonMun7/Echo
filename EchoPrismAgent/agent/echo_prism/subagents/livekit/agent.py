"""
EchoPrism LiveKit Agent — Gemini Live API + EchoPrism tools via backend HTTP.

Agent joins LiveKit rooms, uses google.realtime.RealtimeModel for voice,
and executes EchoPrism tools by calling the backend /api/agent/tool endpoint.
Sends run_started data packets so the desktop can auto-start runs.

Telephony: EndCallTool for graceful hang-up when user says goodbye.
"""
import json
import logging
import os
from typing import Any

import httpx
from livekit.agents import Agent, RunContext, function_tool, get_job_context

logger = logging.getLogger(__name__)

# EndCallTool: graceful hang-up for telephony (Python only)
try:
    from livekit.agents.beta.tools import EndCallTool as _EndCallTool

    _end_call_tool_instance = _EndCallTool(
        extra_description="End the call when the user says goodbye, thanks, or asks to hang up.",
        delete_room=True,
        end_instructions="Say a brief goodbye and thank them for calling.",
    )
    _END_CALL_TOOLS = _end_call_tool_instance.tools
except Exception as e:
    logger.debug("EndCallTool not available: %s", e)
    _END_CALL_TOOLS = []


INTERRUPTION_SYSTEM_PROMPT_PREFIX = """You are EchoPrism in Voice Interruption mode.

A workflow is currently PAUSED. The user has interrupted to guide you.

Greet them briefly: "I've paused. What would you like to change, or should I continue?"

Your job:
1. Listen to their guidance.
2. Repeat back what you'll do in one plain sentence ("I'll skip the login step and go straight to the dashboard").
3. Call redirect_run with the instruction, then resume_run to continue.
4. If they just say "continue" or "yes", call resume_run immediately without redirect.
5. If they want to cancel, call cancel_run.

Keep responses short and natural. Never ask follow-up questions unless the instruction is completely unclear.
Do not mention workflow IDs, run IDs, or internal identifiers.

"""

ECHOPRISM_SYSTEM_PROMPT = """You are EchoPrism, the voice assistant for Echo — an AI workflow automation platform that lets anyone automate repetitive computer tasks just by showing Echo what to do once.

Your personality: warm, efficient, and empowering. You speak like a helpful colleague, not a robot. You're especially valuable to users who find repetitive computer tasks difficult — whether due to disability, limited technical background, or just being busy.

Your capabilities:
- List, create, run, pause, and manage workflows
- Start screen recordings for workflow synthesis
- Create workflows from natural language descriptions
- Redirect running agents with new instructions mid-run
- Dismiss CallUser alerts when the user has resolved the issue
- Answer questions about what a workflow does and its run history
- Execute connected app integrations (Slack, Gmail, etc.)

On first connection, proactively greet the user and offer to list their workflows:
"Hi, I'm EchoPrism. I can run your workflows, create new ones, or help you manage what you have. Want me to show you your current workflows?"

When a user asks what a workflow does, use list_workflows to find it, then describe it in plain language based on the name.
When a user asks to run something, call list_workflows first to find the right workflow, then run it — confirm with the workflow name only.
When run_workflow succeeds, if the result includes run_dashboard_url, tell the user they can open their Echo dashboard (or the link if you can share it) to see and track the run.
When synthesizing from description, use synthesize_from_description immediately — do not ask for confirmation first.
When the user asks to navigate somewhere, do something on a site, or perform a task without explicitly asking for a workflow, use run_adhoc.
After an ad-hoc run starts, say: "I've started that for you. You can track it in your dashboard. Would you like to save this as a reusable workflow?"

Differentiate clearly: "create a workflow for X" → synthesize_from_description; "go to X and do Y" / "navigate to X" → run_adhoc.

When pausing mid-run for interruption:
"I've paused the run. You can tell me to change something, skip a step, or I can continue as planned — or cancel if you'd like."

IMPORTANT: Never reveal workflow IDs, run IDs, document IDs, or any internal identifier in your spoken responses. Use only human-readable names.

Keep responses short and natural for voice. Avoid long lists unless asked. Use "and" instead of bullet points in speech."""


def _get_backend_url() -> str:
    return (
        os.environ.get("VITE_ECHO_AGENT_URL")
        or os.environ.get("ECHOPRISM_AGENT_URL")
        or "http://localhost:8081"
    ).rstrip("/")


def _get_agent_secret() -> str:
    return os.environ.get("LIVEKIT_AGENT_SECRET", "")


async def _call_tool(uid: str, name: str, args: dict[str, Any]) -> dict[str, Any]:
    """Call backend /api/agent/tool and return the result."""
    url = f"{_get_backend_url()}/api/agent/tool"
    secret = _get_agent_secret()
    if not secret:
        return {"ok": False, "error": "LIVEKIT_AGENT_SECRET not configured"}
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            url,
            json={"uid": uid, "name": name, "args": args},
            headers={"X-Agent-Secret": secret},
        )
        resp.raise_for_status()
        return resp.json()


def _get_participant_uid(ctx: RunContext) -> str:
    """Get uid for tool calls: resolved from phone lookup (SIP) when set, else participant identity."""
    from agent.echo_prism.subagents.livekit import phone_lookup

    job_ctx = get_job_context()
    room = job_ctx.room
    resolved = phone_lookup.get_resolved_uid(room.name)
    if resolved:
        return resolved
    for p in room.remote_participants.values():
        return p.identity or "unknown"
    return "unknown"


def _get_interruption_context() -> dict[str, str]:
    """Return {workflow_id, run_id} from participant attributes if in interruption mode."""
    try:
        job_ctx = get_job_context()
        for p in job_ctx.room.remote_participants.values():
            attrs = p.attributes or {}
            if attrs.get("mode") == "voice-interruption":
                return {
                    "workflow_id": attrs.get("workflow_id", ""),
                    "run_id": attrs.get("run_id", ""),
                }
    except Exception:
        pass
    return {"workflow_id": "", "run_id": ""}


async def _publish_run_started(workflow_id: str, run_id: str) -> None:
    """Notify the desktop to start the run via LiveKit data packet."""
    try:
        job_ctx = get_job_context()
        room = job_ctx.room
        payload = json.dumps({
            "type": "run_started",
            "workflowId": workflow_id,
            "runId": run_id,
        })
        await room.local_participant.publish_data(
            payload.encode("utf-8"),
            reliable=True,
            topic="echoprism",
        )
    except Exception as e:
        logger.warning("Failed to publish run_started: %s", e)


async def _publish_run_control(event_type: str, workflow_id: str = "", run_id: str = "") -> None:
    """Publish a run-control event (resume_run, cancel_run) so the voice overlay can act."""
    try:
        job_ctx = get_job_context()
        room = job_ctx.room
        payload = json.dumps({
            "type": event_type,
            "workflowId": workflow_id,
            "runId": run_id,
        })
        await room.local_participant.publish_data(
            payload.encode("utf-8"),
            reliable=True,
            topic="echoprism",
        )
    except Exception as e:
        logger.warning("Failed to publish %s: %s", event_type, e)


class LiveKitEchoPrismAgent(Agent):
    """EchoPrism voice agent with tools delegated to backend. Includes EndCallTool for telephony."""

    def __init__(self) -> None:
        super().__init__(
            instructions=ECHOPRISM_SYSTEM_PROMPT,
            tools=_END_CALL_TOOLS,
        )

    @function_tool()
    async def list_workflows(self, context: RunContext) -> dict[str, Any]:
        """List the user's workflows. Returns names and IDs."""
        uid = _get_participant_uid(context)
        return await _call_tool(uid, "list_workflows", {})

    @function_tool()
    async def run_workflow(
        self,
        context: RunContext,
        workflow_name: str = "",
        workflow_id: str = "",
    ) -> dict[str, Any]:
        """Start a workflow by name or by ID. Prefer workflow_name when the user says a name (e.g. 'run Research New Fighting Games'); use workflow_id when you have it from list_workflows. At least one of workflow_name or workflow_id is required."""
        uid = _get_participant_uid(context)
        result = await _call_tool(uid, "run_workflow", {
            "workflow_id": workflow_id,
            "workflow_name": workflow_name,
        })
        if result.get("ok") and result.get("run_id") and result.get("workflow_id"):
            await _publish_run_started(result["workflow_id"], result["run_id"])
        return result

    @function_tool()
    async def redirect_run(
        self,
        context: RunContext,
        instruction: str,
        workflow_id: str = "",
        run_id: str = "",
    ) -> dict[str, Any]:
        """Inject a mid-run instruction for EchoPrism to follow. During voice interruption, workflow_id and run_id can be omitted — they are inferred automatically."""
        uid = _get_participant_uid(context)
        if not workflow_id or not run_id:
            ctx = _get_interruption_context()
            workflow_id = workflow_id or ctx["workflow_id"]
            run_id = run_id or ctx["run_id"]
        return await _call_tool(uid, "redirect_run", {
            "workflow_id": workflow_id,
            "run_id": run_id,
            "instruction": instruction,
        })

    @function_tool()
    async def cancel_run(
        self,
        context: RunContext,
        workflow_id: str = "",
        run_id: str = "",
    ) -> dict[str, Any]:
        """Cancel a running workflow execution."""
        uid = _get_participant_uid(context)
        # Fall back to participant attributes when called during voice interruption
        if not workflow_id or not run_id:
            ctx = _get_interruption_context()
            workflow_id = workflow_id or ctx["workflow_id"]
            run_id = run_id or ctx["run_id"]
        result = await _call_tool(uid, "cancel_run", {
            "workflow_id": workflow_id,
            "run_id": run_id,
        })
        # Signal the voice overlay to close and cancel
        await _publish_run_control("cancel_run", workflow_id, run_id)
        return result

    @function_tool()
    async def resume_run(
        self,
        context: RunContext,
        workflow_id: str = "",
        run_id: str = "",
    ) -> dict[str, Any]:
        """Resume the paused workflow after the user has given guidance. Call this after redirect_run (if redirecting) or on its own to simply continue."""
        # Fall back to participant attributes when IDs are not provided
        if not workflow_id or not run_id:
            ctx = _get_interruption_context()
            workflow_id = workflow_id or ctx["workflow_id"]
            run_id = run_id or ctx["run_id"]
        await _publish_run_control("resume_run", workflow_id, run_id)
        return {"ok": True, "message": "Resuming workflow"}

    @function_tool()
    async def dismiss_calluser(
        self,
        context: RunContext,
        workflow_id: str,
        run_id: str,
    ) -> dict[str, Any]:
        """Dismiss a workflow run awaiting user input."""
        uid = _get_participant_uid(context)
        return await _call_tool(uid, "dismiss_calluser", {
            "workflow_id": workflow_id,
            "run_id": run_id,
        })

    @function_tool()
    async def run_adhoc(
        self,
        context: RunContext,
        instruction: str,
        workflow_type: str = "browser",
        workflow_name: str = "",
    ) -> dict[str, Any]:
        """Execute a one-off task immediately without saving a workflow."""
        uid = _get_participant_uid(context)
        result = await _call_tool(uid, "run_adhoc", {
            "instruction": instruction,
            "workflow_type": workflow_type,
            "workflow_name": workflow_name or instruction[:50] or "Ad-hoc run",
        })
        if result.get("ok") and result.get("run_id") and result.get("workflow_id"):
            await _publish_run_started(result["workflow_id"], result["run_id"])
        return result

    @function_tool()
    async def synthesize_from_description(
        self,
        context: RunContext,
        description: str,
        workflow_name: str,
        workflow_type: str = "browser",
    ) -> dict[str, Any]:
        """Create a new workflow from a natural language description."""
        uid = _get_participant_uid(context)
        return await _call_tool(uid, "synthesize_from_description", {
            "description": description,
            "workflow_name": workflow_name,
            "workflow_type": workflow_type,
        })

    @function_tool()
    async def start_screen_recording(self, context: RunContext) -> dict[str, Any]:
        """Tell the frontend to start a screen recording for workflow synthesis."""
        uid = _get_participant_uid(context)
        return await _call_tool(uid, "start_screen_recording", {})

    @function_tool()
    async def list_integrations(self, context: RunContext) -> dict[str, Any]:
        """List the user's connected app integrations (Slack, Gmail, etc.)."""
        uid = _get_participant_uid(context)
        return await _call_tool(uid, "list_integrations", {})

    @function_tool()
    async def call_integration(
        self,
        context: RunContext,
        integration: str,
        method: str,
        args: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Execute a connected app integration action."""
        uid = _get_participant_uid(context)
        return await _call_tool(uid, "call_integration", {
            "integration": integration,
            "method": method,
            "args": args or {},
        })
