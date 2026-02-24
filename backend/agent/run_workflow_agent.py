#!/usr/bin/env python3
"""
Echo Workflow Executor - runs via ADK Computer Use agent (Cloud Run Job).
Env: WORKFLOW_ID, RUN_ID, OWNER_UID, GEMINI_API_KEY
"""
import asyncio
import logging
import os
import sys

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s", stream=sys.stderr)
logger = logging.getLogger(__name__)

# Load .env from agent dir or parent (backend) for local dev
try:
    from dotenv import load_dotenv
    load_dotenv()
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
except ImportError:
    pass

import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore import SERVER_TIMESTAMP
from google.genai import types

from agent import root_agent


def log_message(run_ref, message: str):
    """Append log to runs/{run_id}/logs"""
    run_ref.collection("logs").add({
        "message": message,
        "timestamp": SERVER_TIMESTAMP,
        "level": "info",
    })


def _steps_to_prompt(steps: list[dict]) -> str:
    """Convert workflow steps to a natural-language prompt for the agent."""
    lines = [
        "Execute this workflow step by step using the browser. Complete each step before moving to the next:",
        "",
    ]
    for i, step in enumerate(steps, 1):
        action = step.get("action", "wait")
        params = step.get("params", {})
        context = step.get("context", "")
        if context:
            context = f" ({context})"
        if action == "navigate":
            url = params.get("url", "https://www.google.com")
            lines.append(f"{i}. Go to {url}")
        elif action == "open_web_browser":
            lines.append(f"{i}. Open a web browser and go to https://www.google.com")
        elif action == "click_at":
            sel = params.get("selector", "")
            desc = params.get("description", context or "the element")
            lines.append(f"{i}. Click {desc}{f' (selector: {sel})' if sel else ''}")
        elif action == "type_text_at":
            text = params.get("text", "")
            sel = params.get("selector", "")
            lines.append(f"{i}. Type '{text}' into the input{context}{f' (selector: {sel})' if sel else ''}")
        elif action == "scroll":
            direction = params.get("direction", "down")
            amount = params.get("amount", 500)
            lines.append(f"{i}. Scroll {direction} by {amount}px")
        elif action == "wait":
            secs = params.get("seconds", 2)
            lines.append(f"{i}. Wait {secs} seconds")
        elif action == "select_option":
            value = params.get("value", "")
            sel = params.get("selector", "")
            lines.append(f"{i}. Select option '{value}' in the dropdown{context}{f' (selector: {sel})' if sel else ''}")
        elif action == "press_key":
            key = params.get("key", "Enter")
            lines.append(f"{i}. Press the {key} key")
        elif action == "wait_for_element":
            sel = params.get("selector", "")
            lines.append(f"{i}. Wait for the element to appear{context}{f' (selector: {sel})' if sel else ''}")
        elif action == "close_web_browser":
            lines.append(f"{i}. Close the browser")
        else:
            lines.append(f"{i}. {action}{context}: {params}")
        lines.append("")
    lines.append("When you have completed all steps, respond with 'Workflow completed successfully.'")
    return "\n".join(lines)


async def _run_agent(run_ref, prompt: str) -> tuple[bool, str | None]:
    """Run the ADK agent with the workflow prompt. Returns (success, error_message)."""
    try:
        from google.adk.runners import InMemoryRunner

        runner = InMemoryRunner(agent=root_agent, app_name="echo_workflow_agent")
        try:
            session = await runner.session_service.create_session(
                app_name="echo_workflow_agent",
                user_id="workflow_run",
            )
            log_message(run_ref, "Computer Use agent started. Executing steps...")
            turn = 0

            async for event in runner.run_async(
                user_id="workflow_run",
                session_id=session.id,
                new_message=types.Content(
                    role="user",
                    parts=[types.Part.from_text(text=prompt)],
                ),
            ):
                if event.content and event.content.parts:
                    turn += 1
                    log_message(run_ref, f"--- Turn {turn} ---")
                    for part in event.content.parts:
                        if getattr(part, "text", None) and not getattr(part, "thought", False):
                            log_message(run_ref, part.text)
        finally:
            await runner.close()

        return True, None
    except Exception as e:
        return False, str(e)


def main():
    workflow_id = os.environ.get("WORKFLOW_ID")
    run_id = os.environ.get("RUN_ID")
    owner_uid = os.environ.get("OWNER_UID")
    if not all([workflow_id, run_id, owner_uid]):
        logger.error("Missing WORKFLOW_ID, RUN_ID, or OWNER_UID")
        return 1

    if not os.environ.get("GEMINI_API_KEY"):
        logger.error("GEMINI_API_KEY is required for Computer Use agent")
        return 1

    logger.info("Initializing Firebase...")
    firebase_project = os.environ.get("FIREBASE_PROJECT_ID", "")
    sa_path = os.environ.get("ECHO_GOOGLE_APPLICATION_CREDENTIALS") or os.environ.get(
        "GOOGLE_APPLICATION_CREDENTIALS"
    )
    cred = credentials.Certificate(sa_path) if sa_path else credentials.ApplicationDefault()
    opts = {"projectId": firebase_project} if firebase_project else {}
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred, opts)
    db = firestore.client()

    run_ref = db.collection("workflows").document(workflow_id).collection("runs").document(run_id)
    workflow_ref = db.collection("workflows").document(workflow_id)
    workflow_doc = workflow_ref.get()
    if not workflow_doc.exists or workflow_doc.to_dict().get("owner_uid") != owner_uid:
        logger.error("Workflow not found or access denied")
        run_ref.update({"status": "failed", "error": "Workflow not found or access denied"})
        return 1

    steps_snap = workflow_ref.collection("steps").order_by("order").stream()
    steps = [{"id": s.id, **s.to_dict()} for s in steps_snap]

    run_ref.update({"status": "running", "startedAt": SERVER_TIMESTAMP})
    log_message(run_ref, f"Starting workflow with {len(steps)} steps (Computer Use)")

    prompt = _steps_to_prompt(steps)
    success, error = asyncio.run(_run_agent(run_ref, prompt))

    if not success:
        logger.error("Workflow execution failed: %s", error)
        run_ref.update({
            "status": "failed",
            "error": error or "Unknown error",
            "completedAt": SERVER_TIMESTAMP,
        })
        log_message(run_ref, f"Workflow failed: {error}")
        return 1

    run_ref.update({
        "status": "completed",
        "completedAt": SERVER_TIMESTAMP,
    })
    log_message(run_ref, "Workflow completed successfully")
    return 0


if __name__ == "__main__":
    try:
        exit(main())
    except Exception as e:
        logger.exception("Unhandled error: %s", e)
        sys.exit(1)
