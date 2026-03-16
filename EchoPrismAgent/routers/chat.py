"""
EchoPrism WebSocket endpoint: /ws/chat
- mode=voice → Gemini Live API, gemini-live-2.5-flash-native-audio, AUDIO modality
              (EchoPrismVoice fullscreen modal — real-time mic streaming)
- mode=text  → Standard Gemini generate_content, gemini-3.1-flash-lite-preview, multi-turn chat
              (EchoPrism Chat page — text only, no Live API dependency)
"""
import asyncio
import json
import logging
import os
import sys
import uuid
from pathlib import Path

import firebase_admin.firestore
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from typing import Optional
from google import genai
from google.genai import types
from google.cloud.firestore import SERVER_TIMESTAMP, FieldFilter

from app.auth import get_firebase_app
from app.config import CHAT_MODEL, GEMINI_API_KEY

logger = logging.getLogger(__name__)
router = APIRouter(tags=["chat"])


def _ensure_agent_path() -> None:
    """Ensure agent (echo_prism, etc.) is on sys.path."""
    # Docker: base=/app, agent at /app/agent | Local: base=EchoPrismAgent, agent at base/agent or backend/agent
    base = Path(__file__).resolve().parent.parent
    agent_dir = base / "agent" if (base / "agent").exists() else base / "backend" / "agent"
    if not agent_dir.exists():
        agent_dir = base.parent.parent / "backend" / "agent"
    agent_dir = agent_dir.resolve()
    if agent_dir.exists() and str(agent_dir) not in sys.path:
        sys.path.insert(0, str(agent_dir))


async def _handle_tool_call(tool_call, uid: str, db, websocket: WebSocket) -> list[types.LiveClientToolResponse]:
    """Route Live API tool calls for the voice session. Delegates to _execute_tool."""
    responses = []
    for fc in tool_call.function_calls:
        name = fc.name
        args = dict(fc.args) if fc.args else {}

        # Signal frontend to show tool indicator
        try:
            await websocket.send_text(json.dumps({"type": "tool_call", "name": name}))
        except Exception:
            pass

        try:
            result = await _execute_tool(name, args, uid, db, websocket)
        except Exception as e:
            logger.error("Tool call %s failed: %s", name, e)
            result = {"ok": False, "error": str(e)}

        responses.append(
            types.LiveClientToolResponse(
                function_responses=[
                    types.FunctionResponse(name=name, id=fc.id, response=result)
                ]
            )
        )

    return responses


def _verify_token(token: str) -> str | None:
    """Verify Firebase ID token and return uid, or None if invalid."""
    try:
        from firebase_admin import auth as firebase_auth
        get_firebase_app()
        decoded = firebase_auth.verify_id_token(token)
        return decoded.get("uid")
    except Exception:
        return None


@router.websocket("/ws/chat")
async def echoprisim_ws(
    websocket: WebSocket,
    token: str = Query(...),
    mode: str = Query(default="voice"),
    workflow_id: str | None = Query(default=None),
    run_id: str | None = Query(default=None),
):
    """EchoPrism WebSocket — routes to the right backend based on mode.

    mode=voice → Gemini Live API (AUDIO) for EchoPrismVoice modal
    mode=text  → Standard gemini-3.1-flash-lite-preview chat for EchoPrism Chat page

    Optional workflow_id + run_id: when provided with mode=voice, the model is told
    there is an active run and can use redirect_run for mid-run voice interrupts.
    """
    uid = _verify_token(token)
    if not uid:
        await websocket.close(code=4001)
        return

    await websocket.accept()

    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)

    api_key = GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        await websocket.send_text(json.dumps({"type": "error", "text": "GEMINI_API_KEY not configured"}))
        await websocket.close()
        return

    client = genai.Client(api_key=api_key)

    if mode == "text":
        await _text_chat_session(websocket, uid, db, client)
    else:
        await _voice_live_session(websocket, uid, db, client, workflow_id, run_id)


async def _text_chat_session(websocket: WebSocket, uid: str, db, client: genai.Client) -> None:
    """EchoPrism Chat: standard gemini-3.1-flash-lite-preview multi-turn chat over WebSocket.

    Delegates generate_content to EchoPrism chat_agent; router handles WebSocket and tool execution.
    """
    _ensure_agent_path()
    from echo_prism.subagents.modalities.chat_agent import process_chat_turn

    history: list[types.Content] = []

    try:
        while True:
            msg = await websocket.receive()
            if msg["type"] == "websocket.disconnect":
                break
            if msg["type"] != "websocket.receive" or not msg.get("text"):
                continue

            try:
                data = json.loads(msg["text"])
            except Exception:
                continue

            if data.get("type") != "text":
                continue

            user_text = data.get("text", "").strip()
            if not user_text:
                continue

            history.append(types.Content(role="user", parts=[types.Part(text=user_text)]))

            # Agentic loop: delegate to chat_agent until no more tool calls
            while True:
                text_resp, fn_calls, model_content = await process_chat_turn(
                    history, client, CHAT_MODEL
                )
                if model_content:
                    history.append(model_content)

                if fn_calls:
                    for fc in fn_calls:
                        try:
                            await websocket.send_text(json.dumps({"type": "tool_call", "name": fc.name}))
                        except Exception:
                            pass
                        if fc.name == "synthesize_from_description":
                            try:
                                await websocket.send_text(
                                    json.dumps({"type": "tool_call", "name": "synthesize_from_description"})
                                )
                            except Exception:
                                pass

                    tool_parts: list[types.Part] = []
                    for fc in fn_calls:
                        args = dict(fc.args) if fc.args else {}
                        result: dict = {}
                        try:
                            result = await _execute_tool(fc.name, args, uid, db, websocket)
                        except Exception as e:
                            logger.error("Tool %s failed: %s", fc.name, e)
                            result = {"ok": False, "error": str(e)}
                        tool_parts.append(types.Part(
                            function_response=types.FunctionResponse(
                                name=fc.name,
                                id=getattr(fc, "id", None),
                                response=result,
                            )
                        ))
                    history.append(types.Content(role="tool", parts=tool_parts))
                    continue

                if text_resp:
                    await websocket.send_text(json.dumps({"type": "text", "text": text_resp}))
                break

    except WebSocketDisconnect:
        logger.info("EchoPrism text chat disconnected uid=%s", uid)
    except Exception as e:
        logger.error("EchoPrism text chat error: %s", e)
        try:
            await websocket.send_text(json.dumps({"type": "error", "text": str(e)}))
        except Exception:
            pass


def _sanitize(value):
    """Recursively convert Firestore-specific types to JSON-safe primitives."""
    from datetime import datetime
    if hasattr(value, "isoformat"):  # datetime / DatetimeWithNanoseconds
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _sanitize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_sanitize(v) for v in value]
    return value


async def _execute_tool(
    name: str, args: dict, uid: str, db, websocket: Optional[WebSocket] = None
) -> dict:
    """Execute a single named tool and return its result dict.
    When websocket is None (e.g. /api/agent/tool), side-channel notifications are skipped.
    """
    if name == "list_workflows":
        docs = (
            db.collection("workflows")
            .where(filter=FieldFilter("owner_uid", "==", uid))
            .order_by("createdAt", direction="DESCENDING")
            .limit(20)
            .stream()
        )
        workflows = [
            _sanitize({"id": d.id, **{k: v for k, v in (d.to_dict() or {}).items() if k != "steps"}})
            for d in docs
        ]
        return {"workflows": workflows}

    elif name == "run_workflow":
        workflow_id = args.get("workflow_id", "").strip()
        workflow_name = (args.get("workflow_name", "") or "").strip()
        if not workflow_id and workflow_name:
            # Resolve workflow by name so the LLM can call with workflow_name only
            name_docs = (
                db.collection("workflows")
                .where(filter=FieldFilter("owner_uid", "==", uid))
                .where(filter=FieldFilter("name", "==", workflow_name))
                .limit(1)
                .stream()
            )
            name_docs = list(name_docs)
            if name_docs:
                workflow_id = name_docs[0].id
            else:
                return {"ok": False, "error": f"No workflow found with name \"{workflow_name}\". Use list_workflows to see names and IDs."}
        if not workflow_id:
            return {"ok": False, "error": "Provide workflow_id or workflow_name to run a workflow."}
        run_id = str(uuid.uuid4())
        run_ref = db.collection("workflows").document(workflow_id).collection("runs").document(run_id)
        run_ref.set({
            "status": "pending",
            "owner_uid": uid,
            "createdAt": SERVER_TIMESTAMP,
            "confirmation_status": None,
            "source": "desktop",
        })
        if websocket:
            try:
                await websocket.send_text(json.dumps({
                    "type": "run_started",
                    "runLink": {
                        "workflowId": workflow_id,
                        "runId": run_id,
                        "name": workflow_name or "Workflow",
                    },
                }))
            except Exception:
                pass
        result = {"ok": True, "run_id": run_id, "workflow_id": workflow_id, "workflow_name": workflow_name}
        app_url = (os.environ.get("ECHO_APP_URL") or os.environ.get("FRONTEND_URL") or "").rstrip("/")
        if app_url:
            result["run_dashboard_url"] = f"{app_url}/dashboard/workflows/{workflow_id}/runs/{run_id}"
        return result

    elif name == "run_adhoc":
        instruction = args.get("instruction", "")
        workflow_type = args.get("workflow_type", "browser")
        workflow_name = args.get("workflow_name", "") or instruction[:50] or "Ad-hoc run"
        from routers.synthesize import synthesize_from_description_impl
        workflow_id = await synthesize_from_description_impl(
            uid=uid,
            name=workflow_name,
            description=instruction,
            workflow_type=workflow_type,
            db=db,
            ephemeral=True,
        )
        run_id = str(uuid.uuid4())
        run_ref = db.collection("workflows").document(workflow_id).collection("runs").document(run_id)
        run_ref.set({
            "status": "pending",
            "owner_uid": uid,
            "createdAt": SERVER_TIMESTAMP,
            "confirmation_status": None,
            "source": "desktop",
        })
        if websocket:
            try:
                await websocket.send_text(json.dumps({
                    "type": "run_started",
                    "runLink": {
                        "workflowId": workflow_id,
                        "runId": run_id,
                        "name": workflow_name,
                        "ephemeral": True,
                    },
                }))
            except Exception:
                pass
        return {
            "ok": True,
            "run_id": run_id,
            "workflow_id": workflow_id,
            "workflow_name": workflow_name,
            "ephemeral": True,
        }

    elif name == "synthesize_from_description":
        description = args.get("description", "")
        workflow_name = args.get("workflow_name", "New Workflow")
        workflow_type = args.get("workflow_type", "browser")
        from routers.synthesize import synthesize_from_description_impl
        wf_id = await synthesize_from_description_impl(
            uid=uid, name=workflow_name, description=description, workflow_type=workflow_type, db=db,
        )
        if websocket:
            try:
                await websocket.send_text(json.dumps({
                    "type": "synthesis_complete",
                    "workflow_id": wf_id,
                    "workflow_name": workflow_name,
                }))
            except Exception:
                pass
        return {"ok": True, "workflow_id": wf_id, "workflow_name": workflow_name}

    elif name == "redirect_run":
        workflow_id = args.get("workflow_id", "")
        run_id = args.get("run_id", "")
        instruction = args.get("instruction", "")
        run_ref = db.collection("workflows").document(workflow_id).collection("runs").document(run_id)
        run_ref.update({"redirect_instruction": instruction, "redirect_at": SERVER_TIMESTAMP})
        return {"ok": True}

    elif name == "cancel_run":
        workflow_id = args.get("workflow_id", "")
        run_id = args.get("run_id", "")
        run_ref = db.collection("workflows").document(workflow_id).collection("runs").document(run_id)
        run_ref.update({"status": "cancelled", "cancel_requested": True})
        return {"ok": True}

    elif name == "dismiss_calluser":
        workflow_id = args.get("workflow_id", "")
        run_id = args.get("run_id", "")
        run_ref = db.collection("workflows").document(workflow_id).collection("runs").document(run_id)
        run_ref.update({"status": "cancelled", "dismissedAt": SERVER_TIMESTAMP})
        return {"ok": True}

    elif name == "start_screen_recording":
        if websocket:
            try:
                await websocket.send_text(json.dumps({"type": "control", "action": "start_screen_recording"}))
            except Exception:
                pass
        return {"control": "start_screen_recording"}

    elif name == "list_integrations":
        docs = db.collection("users").document(uid).collection("integrations").stream()
        integrations = [
            _sanitize({"name": d.id, **{k: v for k, v in (d.to_dict() or {}).items() if k != "access_token"}})
            for d in docs
        ]
        return {"integrations": integrations}

    elif name == "call_integration":
        integration = args.get("integration", "")
        method = args.get("method", "")
        call_args = args.get("args", {})
        token_doc = db.collection("users").document(uid).collection("integrations").document(integration).get()
        if not token_doc.exists:
            return {"ok": False, "error": f"Integration '{integration}' not connected"}
        token_data = token_doc.to_dict() or {}
        try:
            mod = __import__(f"agent.integrations.{integration}", fromlist=["call"])
            result = await mod.call(method=method, access_token=token_data.get("access_token", ""), args=call_args)
            return {"ok": True, "result": result}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    return {"ok": False, "error": f"Unknown tool: {name}"}


def _voice_system_prompt(workflow_id: str | None, run_id: str | None) -> str:
    _ensure_agent_path()
    from echo_prism.subagents.modalities.chat_agent import SYSTEM_PROMPT
    base = SYSTEM_PROMPT
    if workflow_id and run_id:
        base += f"\n\nACTIVE RUN: There is currently an active workflow run (workflow_id={workflow_id}, run_id={run_id}). When the user gives mid-run instructions (e.g. pause, stop, change what to click, do something different), immediately use redirect_run with workflow_id={workflow_id}, run_id={run_id}, and instruction set to the user's exact words."
    return base


async def _voice_live_session(
    websocket: WebSocket, uid: str, db, client: genai.Client,
    workflow_id: str | None = None, run_id: str | None = None,
) -> None:
    """EchoPrismVoice: Gemini Live API with AUDIO modality. Delegates to voice_agent."""
    _ensure_agent_path()
    from echo_prism.subagents.modalities.chat_agent import get_tools
    from echo_prism.subagents.modalities.voice_agent import run_voice_session, LIVE_MODEL_VOICE

    system_prompt = _voice_system_prompt(workflow_id, run_id)
    config = types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        output_audio_transcription={},
        system_instruction=system_prompt,
        tools=get_tools(),
    )

    try:
        await run_voice_session(
            client, LIVE_MODEL_VOICE, config,
            websocket, uid, db,
            _handle_tool_call,
        )
    except WebSocketDisconnect:
        logger.info("EchoPrismVoice disconnected uid=%s", uid)
    except Exception as e:
        logger.error("EchoPrismVoice session error: %s", e)
        try:
            await websocket.send_text(json.dumps({"type": "error", "text": str(e)}))
        except Exception:
            pass
