"""
EchoPrism Runner Agent — executor for UI and API steps.

Owns all execution: deterministic UI steps (Playwright), api_call steps (integrations).
Calls Locator when semantic actions need coordinates. Used by run_workflow_agent and Alpha.
"""
from __future__ import annotations

import asyncio
import importlib
import logging
from typing import Any

from direct_executor import execute_step as direct_execute_step, is_deterministic
from echo_prism.alpha.image_utils import compress_screenshot
from echo_prism.subagents.locator_agent import locate as locator_locate, refine as locator_refine

logger = logging.getLogger(__name__)

# Actions that need coord resolution via Locator
_GROUNDING_ACTIONS = {"click", "doubleclick", "rightclick", "hover", "drag"}


async def resolve_coords_for_action(
    parsed: dict[str, Any],
    screenshot: bytes,
    client: Any,
    step_data: dict[str, Any],
) -> tuple[dict[str, Any], Any]:
    """
    Resolve coordinates for click-type actions via Locator. Runner owns Locator calls.
    Alpha (brain) outputs semantic actions; Runner calls Locator to get coords.
    Returns (parsed_with_coords, location_or_none).
    """
    from echo_prism.models_config import LOCATOR_MODEL

    parsed_action_name = parsed.get("action", "")
    if parsed_action_name not in _GROUNDING_ACTIONS:
        return parsed, None

    target_desc = (
        step_data.get("params", {}).get("description")
        or step_data.get("context", "")
        or parsed_action_name
    )
    compressed = compress_screenshot(screenshot)
    location = await locator_locate(client, compressed, target_desc, LOCATOR_MODEL)

    if location and location.confidence == "medium" and location.box_2d:
        refined = await locator_refine(client, screenshot, location.box_2d, target_desc, LOCATOR_MODEL)
        if refined:
            location = refined

    if location and location.confidence in ("high", "medium"):
        if "x1" in parsed:
            parsed = {**parsed, "x1": location.center_x, "y1": location.center_y}
        else:
            parsed = {**parsed, "x": location.center_x, "y": location.center_y}
    return parsed, location


async def execute_deterministic_step(
    step: dict[str, Any],
    page: Any,
    uid: str,
    db: Any,
) -> tuple[bool, str]:
    """
    Execute a deterministic step (UI or api_call).

    For api_call: routes to integration connectors. For UI: delegates to direct_executor.
    Returns (success, error_message). error_message is empty on success.
    """
    action = (step.get("action") or "").lower().replace("_", "")
    params = step.get("params", {})

    if action == "apicall" or step.get("action") == "api_call":
        return await _execute_api_call(step, uid, db)

    return await direct_execute_step(page, step)


async def _execute_api_call(step: dict[str, Any], uid: str, db: Any) -> tuple[bool, str]:
    """Execute an api_call step via integration connectors. Runner owns integrations."""
    params = step.get("params", {})
    integration = params.get("integration", "")
    method = params.get("method", "")
    args = params.get("args", {}) or {}

    if not integration or not method:
        return False, "api_call requires integration and method"

    try:
        token_doc = await asyncio.to_thread(
            lambda: db.collection("users")
            .document(uid)
            .collection("integrations")
            .document(integration)
            .get()
        )
        access_token = (token_doc.to_dict() or {}).get("access_token", "") if token_doc.exists else ""

        connector = importlib.import_module(f"integrations.{integration}")
        result = await connector.execute(method, args, access_token)
        ok = result.get("ok", False)
        if not ok:
            err = result.get("error", "Integration returned ok=False")
            return False, str(err)
        return True, ""
    except Exception as e:
        logger.exception("api_call failed for %s.%s: %s", integration, method, e)
        return False, str(e)
