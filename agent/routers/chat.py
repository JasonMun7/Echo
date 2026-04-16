"""
EchoPrism tool execution for LiveKit and HTTP.

``_execute_tool`` backs ``POST /api/agent/tool`` (LiveKit agent). Mobile and web chat use
LiveKit (``sendText`` / voice); the legacy WebSocket text endpoint has been removed.
"""

import json
import logging
import os
import re
import sys
import uuid
from pathlib import Path
from typing import Any

import firebase_admin.firestore
from google.cloud.firestore import SERVER_TIMESTAMP, FieldFilter

logger = logging.getLogger(__name__)

ACTIVE_RUN_STATUSES = ("running", "pending", "awaiting_user")


def _is_composio_tool_router_slug(name: str) -> bool:
    """
    True when ``name`` looks like a Composio tool slug (not Echo chat tools).

    Avoids the old ``^[A-Z][A-Z0-9_]{2,}$`` pattern, which matched any UPPER_SNAKE string
    (e.g. internal names) and routed them into ``execute_composio_tool``.
    """
    n = (name or "").strip()
    if not n or n.startswith("COMPOSIO_"):
        return False
    if "_" not in n or not re.match(r"^[A-Z][A-Z0-9_]*_[A-Z0-9_]+$", n):
        return False
    from echo_prism_agent.composio_integration.slugs import toolkit_hint_from_slug

    return toolkit_hint_from_slug(n) != "integration"


def _cancel_other_active_runs_for_user(uid: str, db) -> None:
    """Cancel all runs owned by this user that are running, pending, or awaiting_user (one run at a time per user)."""
    try:
        active = (
            db.collection_group("runs")
            .where(filter=FieldFilter("owner_uid", "==", uid))
            .where(filter=FieldFilter("status", "in", list(ACTIVE_RUN_STATUSES)))
            .stream()
        )
        for doc in active:
            try:
                doc.reference.update(
                    {
                        "status": "cancelled",
                        "cancel_requested": True,
                        "completedAt": SERVER_TIMESTAMP,
                        "updatedAt": SERVER_TIMESTAMP,
                    }
                )
                logger.info("Cancelled prior active run %s for user %s", doc.id, uid)
            except Exception as e:
                logger.warning("Failed to cancel run %s: %s", doc.id, e)
    except Exception as e:
        logger.warning("Failed to cancel other active runs: %s", e)


def _ensure_agent_path() -> None:
    root = Path(__file__).resolve().parent.parent
    if root.exists() and str(root) not in sys.path:
        sys.path.insert(0, str(root))


def _sanitize(value):
    """Recursively convert Firestore-specific types to JSON-safe primitives."""

    if hasattr(value, "isoformat"):  # datetime / DatetimeWithNanoseconds
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _sanitize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_sanitize(v) for v in value]
    return value


async def _execute_tool(
    name: str,
    args: dict,
    uid: str,
    db,
    websocket: Any = None,
    *,
    connection_id: str,
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
            _sanitize({"id": d.id, **{k: v for k, v in (d.to_dict() or {}).items() if k != "steps"}}) for d in docs
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
                return {
                    "ok": False,
                    "error": f'No workflow found with name "{workflow_name}". Use list_workflows to see names and IDs.',
                }
        if not workflow_id:
            return {"ok": False, "error": "Provide workflow_id or workflow_name to run a workflow."}
        wf_snap = db.collection("workflows").document(workflow_id).get()
        if not wf_snap.exists:
            return {"ok": False, "error": "Workflow not found."}
        if (wf_snap.to_dict() or {}).get("owner_uid") != uid:
            return {"ok": False, "error": "Not authorized to run this workflow."}
        # Extract workflow name from document if not provided
        if not workflow_name:
            workflow_name = (wf_snap.to_dict() or {}).get("name", "")

        # Wrap cancel + create in a transaction to prevent race conditions
        run_id = str(uuid.uuid4())

        @firebase_admin.firestore.transactional
        def cancel_and_create_run(transaction, uid, workflow_id, run_id):
            # Cancel all active runs for this user
            active = (
                db.collection_group("runs")
                .where(filter=FieldFilter("owner_uid", "==", uid))
                .where(filter=FieldFilter("status", "in", list(ACTIVE_RUN_STATUSES)))
                .stream()
            )
            for doc in active:
                try:
                    transaction.update(
                        doc.reference,
                        {
                            "status": "cancelled",
                            "cancel_requested": True,
                            "completedAt": SERVER_TIMESTAMP,
                            "updatedAt": SERVER_TIMESTAMP,
                        },
                    )
                except Exception as e:
                    logger.warning("Failed to cancel run %s: %s", doc.id, e)
            # Create the new run
            run_ref = db.collection("workflows").document(workflow_id).collection("runs").document(run_id)
            transaction.set(
                run_ref,
                {
                    "status": "pending",
                    "owner_uid": uid,
                    "createdAt": SERVER_TIMESTAMP,
                    "confirmation_status": None,
                    "source": "desktop",
                },
            )

        transaction = db.transaction()
        cancel_and_create_run(transaction, uid, workflow_id, run_id)
        if websocket:
            try:
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "run_started",
                            "runLink": {
                                "workflowId": workflow_id,
                                "runId": run_id,
                                "name": workflow_name or "Workflow",
                            },
                        }
                    )
                )
            except Exception:
                logger.debug("Failed to send run_started websocket message", exc_info=True)
        result = {
            "ok": True,
            "run_id": run_id,
            "workflow_id": workflow_id,
            "workflow_name": workflow_name,
        }
        app_url = (os.environ.get("ECHO_APP_URL") or os.environ.get("FRONTEND_URL") or "").rstrip("/")
        if app_url:
            result["run_dashboard_url"] = f"{app_url}/dashboard/workflows/{workflow_id}/runs/{run_id}"
        return result

    elif name == "run_adhoc":
        instruction = (args.get("instruction", "") or "").strip()
        workflow_type = args.get("workflow_type", "browser")
        workflow_name = args.get("workflow_name", "") or instruction[:50] or "Ad-hoc run"
        if not instruction:
            logger.warning("run_adhoc: missing instruction")
            return {"ok": False, "error": "instruction is required for run_adhoc"}

        logger.info(
            "run_adhoc (goal-only): instruction=%s workflow_type=%s uid=%s",
            instruction[:80],
            workflow_type,
            uid,
        )
        # Goal-only run: no step synthesis; create minimal ephemeral workflow and run with goal
        # Wrap cancel + create in a transaction to prevent race conditions
        workflow_id = str(uuid.uuid4())
        run_id = str(uuid.uuid4())

        @firebase_admin.firestore.transactional
        def cancel_and_create_adhoc_run(
            transaction, uid, workflow_id, run_id, workflow_name, workflow_type, instruction
        ):
            # Cancel all active runs for this user
            active = (
                db.collection_group("runs")
                .where(filter=FieldFilter("owner_uid", "==", uid))
                .where(filter=FieldFilter("status", "in", list(ACTIVE_RUN_STATUSES)))
                .stream()
            )
            for doc in active:
                try:
                    transaction.update(
                        doc.reference,
                        {
                            "status": "cancelled",
                            "cancel_requested": True,
                            "completedAt": SERVER_TIMESTAMP,
                            "updatedAt": SERVER_TIMESTAMP,
                        },
                    )
                except Exception as e:
                    logger.warning("Failed to cancel run %s: %s", doc.id, e)
            # Create the ephemeral workflow
            workflow_ref = db.collection("workflows").document(workflow_id)
            transaction.set(
                workflow_ref,
                {
                    "name": workflow_name,
                    "status": "ready",
                    "owner_uid": uid,
                    "workflow_type": workflow_type if workflow_type in ("browser", "desktop") else "browser",
                    "ephemeral": True,
                    "createdAt": SERVER_TIMESTAMP,
                    "updatedAt": SERVER_TIMESTAMP,
                },
            )
            # Create the new run
            run_ref = workflow_ref.collection("runs").document(run_id)
            transaction.set(
                run_ref,
                {
                    "status": "pending",
                    "owner_uid": uid,
                    "createdAt": SERVER_TIMESTAMP,
                    "confirmation_status": None,
                    "source": "desktop",
                    "goal": instruction,
                    "run_mode": "goal_only",
                },
            )

        transaction = db.transaction()
        cancel_and_create_adhoc_run(transaction, uid, workflow_id, run_id, workflow_name, workflow_type, instruction)
        run_link = {
            "workflowId": workflow_id,
            "runId": run_id,
            "name": workflow_name,
            "ephemeral": True,
            "goalOnly": True,
            "goal": instruction,
        }
        if websocket:
            try:
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "run_started",
                            "runLink": run_link,
                        }
                    )
                )
            except Exception:
                logger.debug(
                    "Failed to send run_started websocket message (run_adhoc workflow_id=%s run_id=%s)",
                    workflow_id,
                    run_id,
                    exc_info=True,
                )
        logger.info(
            "run_adhoc created goal-only run: workflow_id=%s run_id=%s goal=%s",
            workflow_id,
            run_id,
            instruction[:60],
        )
        return {
            "ok": True,
            "run_id": run_id,
            "workflow_id": workflow_id,
            "workflow_name": workflow_name,
            "ephemeral": True,
            "goal_only": True,
            "goal": instruction,
        }

    elif name == "synthesize_from_description":
        description = args.get("description", "")
        workflow_name = args.get("workflow_name", "New Workflow")
        workflow_type = args.get("workflow_type", "browser")
        from routers.synthesize import synthesize_from_description_impl

        wf_id = await synthesize_from_description_impl(
            uid=uid,
            name=workflow_name,
            description=description,
            workflow_type=workflow_type,
            db=db,
        )
        if websocket:
            try:
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "synthesis_complete",
                            "workflow_id": wf_id,
                            "workflow_name": workflow_name,
                        }
                    )
                )
            except Exception:
                logger.debug(
                    "Failed to send synthesis_complete websocket message (workflow_id=%s)",
                    wf_id,
                    exc_info=True,
                )
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
            _sanitize(
                {
                    "name": d.id,
                    **{k: v for k, v in (d.to_dict() or {}).items() if k != "access_token"},
                }
            )
            for d in docs
        ]
        return {"integrations": integrations}

    elif name == "call_integration":
        from echo_prism_agent.composio_integration.client import composio_configured, execute_composio_tool
        from echo_prism_agent.composio_integration.danger import is_dangerous_composio_slug
        from echo_prism_agent.composio_integration.slugs import resolve_composio_slug

        raw_args = args.get("arguments")
        if raw_args is None:
            call_args = args.get("args", {})
        else:
            call_args = raw_args
        if not isinstance(call_args, dict):
            call_args = {}

        raw_slug = args.get("slug")
        slug_in = raw_slug.strip() if isinstance(raw_slug, str) else ""
        if not slug_in:
            return {
                "ok": False,
                "error": "slug is required (Composio tool slug, e.g. GMAIL_SEND_EMAIL).",
            }
        params = {"slug": slug_in, "arguments": call_args}
        if not composio_configured():
            return {"ok": False, "error": "Composio is not configured (set COMPOSIO_API_KEY on the agent)."}
        slug, _, rerr = resolve_composio_slug(params)
        if rerr or not slug:
            return {"ok": False, "error": rerr or "Could not resolve Composio tool"}
        if is_dangerous_composio_slug(slug):
            return {
                "ok": False,
                "error": (
                    "This action is sensitive. Use a workflow with an api_call step so you can approve it in the Run HUD."
                ),
                "requires_workflow": True,
            }
        from echo_prism_agent.composio_integration.chat_tool_payloads import merge_composio_execute_result

        out = await execute_composio_tool(uid, slug, call_args)
        return merge_composio_execute_result(out)

    if (name or "").startswith("COMPOSIO_"):
        from echo_prism_agent.composio_integration.chat_session import invoke_composio_meta_tool
        from echo_prism_agent.composio_integration.chat_tool_payloads import merge_composio_execute_result
        from echo_prism_agent.composio_integration.client import composio_configured as cc_ok
        from echo_prism_agent.composio_integration.langfuse_tracing import trace_composio_meta_path

        if not cc_ok():
            return {
                "ok": False,
                "error": "Composio integration not configured; enable Composio to use this tool.",
            }
        trace_composio_meta_path(uid=uid, tool_name=name)
        out = await invoke_composio_meta_tool(uid, name, dict(args or {}), connection_id=connection_id)
        return merge_composio_execute_result(out)

    if _is_composio_tool_router_slug(name or ""):
        from echo_prism_agent.composio_integration.client import composio_configured as cc_ok
        from echo_prism_agent.composio_integration.client import execute_composio_tool
        from echo_prism_agent.composio_integration.danger import is_dangerous_composio_slug

        if not cc_ok():
            return {
                "ok": False,
                "error": "Composio integration not configured; enable Composio to use this tool.",
            }
        if is_dangerous_composio_slug(name):
            return {
                "ok": False,
                "error": ("Sensitive Composio tools must run from a workflow api_call step with Run HUD approval."),
                "requires_workflow": True,
            }
        from echo_prism_agent.composio_integration.chat_tool_payloads import merge_composio_execute_result

        out = await execute_composio_tool(uid, name, dict(args or {}))
        return merge_composio_execute_result(out)

    return {"ok": False, "error": f"Unknown tool: {name}"}
