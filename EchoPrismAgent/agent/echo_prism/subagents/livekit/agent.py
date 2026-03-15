"""
EchoPrism LiveKit Agent — Gemini Live API + EchoPrism tools via backend HTTP.

Agent joins LiveKit rooms, uses google.realtime.RealtimeModel for voice,
and executes EchoPrism tools by calling the backend /api/agent/tool endpoint.
Sends run_started data packets so the desktop can auto-start runs.
"""
import json
import logging
import os
from typing import Any

import httpx
from livekit.agents import Agent, RunContext, function_tool, get_job_context

logger = logging.getLogger(__name__)


INTERRUPTION_SYSTEM_PROMPT_PREFIX = """You are EchoPrism in Voice Interruption mode.

A workflow is currently PAUSED and the user wants to guide you before resuming.

Your job in this mode:
1. Listen to the user's guidance or concern.
2. Summarise what instruction you will inject into the running workflow (e.g. "I'll tell EchoPrism to skip the login step and go directly to the dashboard").
3. Ask for confirmation — the user can confirm vocally ("yes", "go ahead") or click Resume in the UI.
4. Once confirmed, call redirect_run with the instruction, then call resume_run to resume execution.
5. If the user just wants to resume without changing anything, call resume_run immediately.
6. If the user wants to cancel, call cancel_run.

Keep responses short and focused. Do not ask follow-up questions unless clarification is truly needed.
Do not reveal workflow IDs, run IDs, or internal identifiers in responses.

"""

ECHOPRISM_SYSTEM_PROMPT = """You are EchoPrism, an intelligent assistant for the Echo workflow automation platform.

Your capabilities:
- List, create, run, pause, and manage workflows
- Start screen recordings for workflow synthesis
- Create workflows from natural language descriptions
- Redirect running agents with new instructions
- Dismiss CallUser alerts when the user has resolved the issue
- Answer questions about EchoPrism's status and capabilities
- Execute connected app integrations (Slack, Gmail, etc.)

Be concise, helpful, and proactive. When a user asks to run something, confirm with the workflow name only — never mention IDs, UUIDs, or internal identifiers in your responses.
When a user asks to change what the agent is doing mid-run, use redirect_run with their exact instruction.
When synthesizing from description, use the synthesize_from_description tool immediately — do not ask for confirmation first.
When the user asks to navigate somewhere, do something on a site, or perform a task without explicitly asking for a workflow, use run_adhoc instead of synthesize_from_description.
After an ad-hoc run starts, say something like: "I've started that for you. You can track it in your dashboard. Would you like to save this as a reusable workflow?"
Differentiate: "create a workflow" → synthesize_from_description; "go to X and do Y" / "navigate to X" → run_adhoc.

IMPORTANT: Never reveal workflow IDs, run IDs, document IDs, or any internal identifier to the user in your text responses. Use only human-readable names. IDs are for tool calls only, not for conversation.

Format responses with clean markdown: use short bullets, avoid excessive asterisks. Structure replies for readability.

Current session context: you have access to the user's Firestore data via tool calls.
Always use tools to get real data — never make up workflow names."""


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
    """Get the first remote participant's identity (uid)."""
    job_ctx = get_job_context()
    room = job_ctx.room
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
    """EchoPrism voice agent with tools delegated to backend."""

    def __init__(self) -> None:
        super().__init__(instructions=ECHOPRISM_SYSTEM_PROMPT)

    @function_tool()
    async def list_workflows(self, context: RunContext) -> dict[str, Any]:
        """List the user's workflows. Returns names and IDs."""
        uid = _get_participant_uid(context)
        return await _call_tool(uid, "list_workflows", {})

    @function_tool()
    async def run_workflow(
        self,
        context: RunContext,
        workflow_id: str,
        workflow_name: str = "",
    ) -> dict[str, Any]:
        """Start running a workflow by ID."""
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
