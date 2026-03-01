"""
EchoPrism WebSocket endpoint: /ws/chat
- mode=voice → Gemini Live API, gemini-2.5-flash-native-audio-preview-12-2025, AUDIO modality
              (EchoPrismVoice fullscreen modal — real-time mic streaming)
- mode=text  → Standard Gemini generate_content, gemini-2.5-flash, multi-turn chat
              (EchoPrism Chat page — text only, no Live API dependency)
"""
import asyncio
import json
import logging
import os
import sys
import threading
import uuid

import firebase_admin.firestore
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from google import genai
from google.genai import types
from google.cloud.firestore import SERVER_TIMESTAMP, FieldFilter

from app.auth import get_firebase_app
from app.config import GEMINI_API_KEY

logger = logging.getLogger(__name__)
router = APIRouter(tags=["chat"])

# Live API model for EchoPrismVoice modal (AUDIO modality only)
LIVE_MODEL_VOICE = "gemini-2.5-flash-native-audio-preview-12-2025"
# Standard model for EchoPrism Chat text sessions (same as agent/synthesis)
CHAT_MODEL = "gemini-2.5-flash"

SYSTEM_PROMPT = """You are EchoPrism, an intelligent assistant for the Echo workflow automation platform.

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

IMPORTANT: Never reveal workflow IDs, run IDs, document IDs, or any internal identifier to the user in your text responses. Use only human-readable names. IDs are for tool calls only, not for conversation.

Current session context: you have access to the user's Firestore data via tool calls.
Always use tools to get real data — never make up workflow names."""

TOOLS = [
    types.Tool(function_declarations=[
        types.FunctionDeclaration(
            name="list_workflows",
            description="List the user's workflows. Returns names and IDs.",
            parameters=types.Schema(type="OBJECT", properties={}, required=[]),
        ),
        types.FunctionDeclaration(
            name="run_workflow",
            description="Start running a workflow by ID. Actually triggers the EchoPrism agent.",
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "workflow_id": types.Schema(type="STRING", description="The workflow ID to run"),
                    "workflow_name": types.Schema(type="STRING", description="Human-readable name for confirmation"),
                },
                required=["workflow_id"],
            ),
        ),
        types.FunctionDeclaration(
            name="redirect_run",
            description="Inject a mid-run instruction for EchoPrism to follow on its next step.",
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "workflow_id": types.Schema(type="STRING"),
                    "run_id": types.Schema(type="STRING"),
                    "instruction": types.Schema(type="STRING"),
                },
                required=["workflow_id", "run_id", "instruction"],
            ),
        ),
        types.FunctionDeclaration(
            name="cancel_run",
            description="Cancel a running workflow execution.",
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "workflow_id": types.Schema(type="STRING"),
                    "run_id": types.Schema(type="STRING"),
                },
                required=["workflow_id", "run_id"],
            ),
        ),
        types.FunctionDeclaration(
            name="dismiss_calluser",
            description="Dismiss a workflow run that is awaiting user input (status=awaiting_user).",
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "workflow_id": types.Schema(type="STRING"),
                    "run_id": types.Schema(type="STRING"),
                },
                required=["workflow_id", "run_id"],
            ),
        ),
        types.FunctionDeclaration(
            name="synthesize_from_description",
            description="Create a new workflow from a natural language description. Generates steps using Gemini 2.5 Pro.",
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "description": types.Schema(type="STRING", description="What the workflow should do"),
                    "workflow_name": types.Schema(type="STRING", description="Name for the new workflow"),
                    "workflow_type": types.Schema(type="STRING", description="'browser' or 'desktop'"),
                },
                required=["description", "workflow_name"],
            ),
        ),
        types.FunctionDeclaration(
            name="start_screen_recording",
            description="Tell the frontend to start a screen recording for workflow synthesis.",
            parameters=types.Schema(type="OBJECT", properties={}, required=[]),
        ),
        types.FunctionDeclaration(
            name="list_integrations",
            description="List the user's connected app integrations (Slack, Gmail, etc.)",
            parameters=types.Schema(type="OBJECT", properties={}, required=[]),
        ),
        types.FunctionDeclaration(
            name="call_integration",
            description="Execute a connected app integration action (send Slack message, create GitHub issue, etc.).",
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "integration": types.Schema(type="STRING"),
                    "method": types.Schema(type="STRING"),
                    "args": types.Schema(type="OBJECT"),
                },
                required=["integration", "method"],
            ),
        ),
    ])
]


def _trigger_run_inline(workflow_id: str, run_id: str, uid: str, run_ref) -> None:
    """Invoke the agent via Cloud Run Job (prod) or in-process thread (local dev)."""
    job_name = os.environ.get("RUN_JOB_NAME", "")
    project = (
        os.environ.get("GOOGLE_CLOUD_PROJECT")
        or os.environ.get("GCP_PROJECT")
        or os.environ.get("ECHO_GCP_PROJECT_ID")
    )
    region = os.environ.get("CLOUD_RUN_REGION") or os.environ.get("ECHO_CLOUD_RUN_REGION") or "us-central1"

    if project and job_name:
        try:
            from google.cloud.run_v2 import JobsClient
            from google.cloud.run_v2.types import EnvVar, RunJobRequest
            client = JobsClient()
            job_path = f"projects/{project}/locations/{region}/jobs/{job_name}"
            overrides = RunJobRequest.Overrides(container_overrides=[
                RunJobRequest.Overrides.ContainerOverride(env=[
                    EnvVar(name="WORKFLOW_ID", value=workflow_id),
                    EnvVar(name="RUN_ID", value=run_id),
                    EnvVar(name="OWNER_UID", value=uid),
                ])
            ])
            client.run_job(request=RunJobRequest(name=job_path, overrides=overrides))
            run_ref.update({"status": "running"})
        except Exception as e:
            logger.exception("chat.py: Cloud Run Job invocation failed: %s", e)
            run_ref.update({"status": "failed", "error": str(e)})
    else:
        # Local dev: run in background thread
        _wf = workflow_id
        _run = run_id
        _uid = uid

        def _thread():
            os.environ["WORKFLOW_ID"] = _wf
            os.environ["RUN_ID"] = _run
            os.environ["OWNER_UID"] = _uid
            agent_dir = os.path.normpath(
                os.path.join(os.path.dirname(__file__), "..", "..", "agent")
            )
            if agent_dir not in sys.path:
                sys.path.insert(0, agent_dir)
            try:
                from run_workflow_agent import main as agent_main  # type: ignore
                agent_main()
            except Exception as exc:
                logger.exception("In-process agent failed: %s", exc)
                try:
                    run_ref.update({"status": "failed", "error": str(exc)})
                except Exception:
                    pass

        t = threading.Thread(target=_thread, daemon=True, name=f"agent-{run_id[:8]}")
        t.start()
        run_ref.update({"status": "running"})


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
):
    """EchoPrism WebSocket — routes to the right backend based on mode.

    mode=voice → Gemini Live API (AUDIO) for EchoPrismVoice modal
    mode=text  → Standard gemini-2.5-flash chat for EchoPrism Chat page
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
        await _voice_live_session(websocket, uid, db, client)


async def _text_chat_session(websocket: WebSocket, uid: str, db, client: genai.Client) -> None:
    """EchoPrism Chat: standard gemini-2.5-flash multi-turn chat over WebSocket.

    Each message from the browser triggers a generate_content call with the full
    conversation history and function-calling support. No Live API involved.
    """
    # Build the function declarations list for standard generate_content
    fn_decls = TOOLS[0].function_declarations

    gen_config = types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
        tools=[types.Tool(function_declarations=fn_decls)],
        temperature=0.4,
    )

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

            # Agentic loop: keep calling generate_content until no more tool calls
            while True:
                response = await client.aio.models.generate_content(
                    model=CHAT_MODEL,
                    contents=history,
                    config=gen_config,
                )

                candidate = response.candidates[0] if response.candidates else None
                if not candidate:
                    break

                # Add the model turn to history
                history.append(candidate.content)

                # Check if there are function calls to handle
                fn_calls = [
                    p.function_call
                    for p in (candidate.content.parts or [])
                    if p.function_call
                ]

                if fn_calls:
                    # Signal the frontend for each tool being invoked
                    for fc in fn_calls:
                        try:
                            await websocket.send_text(json.dumps({"type": "tool_call", "name": fc.name}))
                        except Exception:
                            pass

                        if fc.name == "synthesize_from_description":
                            try:
                                await websocket.send_text(json.dumps({"type": "tool_call", "name": "synthesize_from_description"}))
                            except Exception:
                                pass

                    # Execute all tool calls and collect results
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
                                response=result,
                            )
                        ))

                    # Add tool results to history and loop again
                    history.append(types.Content(role="tool", parts=tool_parts))
                    continue

                # No function calls — extract and send text response
                text_parts = [
                    p.text for p in (candidate.content.parts or []) if p.text
                ]
                full_text = "".join(text_parts).strip()
                if full_text:
                    await websocket.send_text(json.dumps({"type": "text", "text": full_text}))
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


async def _execute_tool(name: str, args: dict, uid: str, db, websocket: WebSocket) -> dict:
    """Execute a single named tool and return its result dict."""
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
        workflow_id = args.get("workflow_id", "")
        workflow_name = args.get("workflow_name", "")
        run_id = str(uuid.uuid4())
        run_ref = db.collection("workflows").document(workflow_id).collection("runs").document(run_id)
        run_ref.set({"status": "pending", "owner_uid": uid, "createdAt": SERVER_TIMESTAMP, "confirmation_status": None})
        _trigger_run_inline(workflow_id, run_id, uid, run_ref)
        return {"ok": True, "run_id": run_id, "workflow_id": workflow_id, "workflow_name": workflow_name}

    elif name == "synthesize_from_description":
        description = args.get("description", "")
        workflow_name = args.get("workflow_name", "New Workflow")
        workflow_type = args.get("workflow_type", "browser")
        from app.routers.synthesize import synthesize_from_description_impl
        wf_id = await synthesize_from_description_impl(
            uid=uid, name=workflow_name, description=description, workflow_type=workflow_type, db=db,
        )
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
        try:
            await websocket.send_text(json.dumps({"type": "control", "action": "start_screen_recording"}))
        except Exception:
            pass
        return {"control": "start_screen_recording"}

    elif name == "list_integrations":
        docs = db.collection("users").document(uid).collection("integrations").stream()
        integrations = [
            _sanitize({"name": d.id, **{k: v for k, v in d.to_dict().items() if k != "access_token"}})
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
            mod = __import__(f"app.integrations.{integration}", fromlist=["call"])
            result = await mod.call(method=method, access_token=token_data.get("access_token", ""), args=call_args)
            return {"ok": True, "result": result}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    return {"ok": False, "error": f"Unknown tool: {name}"}


async def _voice_live_session(websocket: WebSocket, uid: str, db, client: genai.Client) -> None:
    """EchoPrismVoice: Gemini Live API with AUDIO modality and real-time mic streaming."""
    config = types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        output_audio_transcription={},
        system_instruction=SYSTEM_PROMPT,
        tools=TOOLS,
    )

    try:
        async with client.aio.live.connect(model=LIVE_MODEL_VOICE, config=config) as live_session:

            async def recv_from_client():
                try:
                    while True:
                        msg = await websocket.receive()
                        if msg["type"] == "websocket.disconnect":
                            break
                        if msg["type"] == "websocket.receive":
                            if msg.get("bytes") is not None:
                                await live_session.send_realtime_input(
                                    audio=types.Blob(data=msg["bytes"], mime_type="audio/pcm;rate=16000")
                                )
                            elif msg.get("text") is not None:
                                try:
                                    data = json.loads(msg["text"])
                                    if data.get("type") == "text":
                                        await live_session.send_client_content(
                                            turns=types.Content(
                                                role="user",
                                                parts=[types.Part(text=data.get("text", ""))],
                                            ),
                                            turn_complete=True,
                                        )
                                except Exception as e:
                                    logger.warning("voice recv_from_client parse error: %s", e)
                except WebSocketDisconnect:
                    pass
                except Exception as e:
                    logger.warning("voice recv_from_client error: %s", e)

            async def recv_from_gemini():
                while True:
                    try:
                        async for response in live_session.receive():
                            if response.server_content:
                                sc = response.server_content

                                if sc.model_turn:
                                    for part in sc.model_turn.parts:
                                        if getattr(part, "thought", False):
                                            continue
                                        if part.inline_data and part.inline_data.data:
                                            await websocket.send_bytes(part.inline_data.data)
                                        if part.text:
                                            await websocket.send_text(
                                                json.dumps({"type": "text", "text": part.text})
                                            )

                                if getattr(sc, "output_transcription", None):
                                    t = sc.output_transcription
                                    if getattr(t, "text", None):
                                        await websocket.send_text(
                                            json.dumps({"type": "transcript", "text": t.text})
                                        )

                                if sc.turn_complete:
                                    await websocket.send_text(json.dumps({"type": "turn_complete"}))

                            if response.tool_call:
                                tool_responses = await _handle_tool_call(
                                    response.tool_call, uid, db, websocket
                                )
                                for tr in tool_responses:
                                    await live_session.send_tool_response(
                                        function_responses=tr.function_responses
                                    )

                    except WebSocketDisconnect:
                        break
                    except Exception as e:
                        logger.warning("voice recv_from_gemini error: %s", e)
                        break

            await asyncio.gather(
                recv_from_client(),
                recv_from_gemini(),
                return_exceptions=True,
            )

    except WebSocketDisconnect:
        logger.info("EchoPrismVoice disconnected uid=%s", uid)
    except Exception as e:
        logger.error("EchoPrismVoice session error: %s", e)
        try:
            await websocket.send_text(json.dumps({"type": "error", "text": str(e)}))
        except Exception:
            pass
