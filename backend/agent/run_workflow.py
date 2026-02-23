#!/usr/bin/env python3
"""
Echo Workflow Executor - runs as Cloud Run Job.
Env: WORKFLOW_ID, RUN_ID, OWNER_UID
"""
import os
import uuid

import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore import SERVER_TIMESTAMP


def log_message(run_ref, message: str):
    """Append log to runs/{run_id}/logs"""
    run_ref.collection("logs").add({
        "message": message,
        "timestamp": SERVER_TIMESTAMP,
        "level": "info",
    })


def main():
    workflow_id = os.environ.get("WORKFLOW_ID")
    run_id = os.environ.get("RUN_ID")
    owner_uid = os.environ.get("OWNER_UID")
    if not all([workflow_id, run_id, owner_uid]):
        print("Missing WORKFLOW_ID, RUN_ID, or OWNER_UID")
        return 1

    cred = credentials.ApplicationDefault()
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    db = firestore.client()

    run_ref = db.collection("workflows").document(workflow_id).collection("runs").document(run_id)
    workflow_ref = db.collection("workflows").document(workflow_id)
    workflow_doc = workflow_ref.get()
    if not workflow_doc.exists or workflow_doc.to_dict().get("owner_uid") != owner_uid:
        run_ref.update({"status": "failed", "error": "Workflow not found or access denied"})
        return 1

    steps_snap = workflow_ref.collection("steps").order_by("order").stream()
    steps = [{"id": s.id, **s.to_dict()} for s in steps_snap]

    run_ref.update({"status": "running", "startedAt": SERVER_TIMESTAMP})
    log_message(run_ref, f"Starting workflow with {len(steps)} steps")

    # Execute steps via Playwright (direct execution, no ADK loop for simplicity)
    # ADK/Computer Use can be integrated for vision-based steps
    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.set_viewport_size({"width": 1280, "height": 936})

            for i, step in enumerate(steps):
                action = step.get("action", "wait")
                params = step.get("params", {})
                context = step.get("context", "")
                log_message(run_ref, f"Step {i + 1}/{len(steps)}: {action} - {context}")

                try:
                    if action == "open_web_browser":
                        page.goto("https://www.google.com")
                    elif action == "navigate":
                        url = params.get("url", "https://www.google.com")
                        page.goto(url)
                    elif action == "click_at":
                        selector = params.get("selector")
                        if selector:
                            page.click(selector, timeout=10000)
                    elif action == "type_text_at":
                        selector = params.get("selector")
                        text = params.get("text", "")
                        if selector:
                            page.fill(selector, text)
                    elif action == "scroll":
                        direction = params.get("direction", "down")
                        amount = params.get("amount", 500)
                        if direction == "down":
                            page.mouse.wheel(0, amount)
                        else:
                            page.mouse.wheel(0, -amount)
                    elif action == "wait":
                        secs = params.get("seconds", 2)
                        page.wait_for_timeout(secs * 1000)
                    elif action == "select_option":
                        selector = params.get("selector")
                        value = params.get("value")
                        if selector and value:
                            page.select_option(selector, value)
                    elif action == "press_key":
                        key = params.get("key", "Enter")
                        page.keyboard.press(key)
                    elif action == "wait_for_element":
                        selector = params.get("selector")
                        if selector:
                            page.wait_for_selector(selector, timeout=10000)
                    elif action == "close_web_browser":
                        pass  # closed at end
                except Exception as e:
                    log_message(run_ref, f"Step error: {e}")
                    run_ref.update({
                        "status": "failed",
                        "error": str(e),
                        "failedStepIndex": i,
                        "completedAt": SERVER_TIMESTAMP,
                    })
                    browser.close()
                    return 1

            browser.close()
    except Exception as e:
        run_ref.update({
            "status": "failed",
            "error": str(e),
            "completedAt": SERVER_TIMESTAMP,
        })
        log_message(run_ref, f"Workflow failed: {e}")
        return 1

    run_ref.update({
        "status": "completed",
        "completedAt": SERVER_TIMESTAMP,
    })
    log_message(run_ref, "Workflow completed successfully")
    return 0


if __name__ == "__main__":
    exit(main())
