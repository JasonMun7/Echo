"""
DirectStepExecutor: Execute deterministic steps without Gemini, via Playwright (browser).

Determinism rules for browser:
  - navigate with url → deterministic
  - selector-based steps → deterministic (Playwright can find DOM elements directly)
  - explicit (x, y) coords → deterministic
  - wait, press_key, scroll, select_option → deterministic
  - hover with coords or selector → deterministic
  - wait_for_element with selector → deterministic
"""
import asyncio
import logging
from typing import Any

logger = logging.getLogger(__name__)


def is_deterministic(step: dict[str, Any]) -> bool:
    """
    Returns True if step can be executed directly (no Gemini needed).

    Click/pointer actions are NEVER deterministic — even when they carry
    synthesised (x, y) coordinates the VLM should visually verify them.
    Only purely mechanical/non-visual actions are deterministic.
    """
    params = step.get("params", {})
    action = (step.get("action") or "").lower().replace("_", "")

    # API integrations — no visual reasoning needed
    if action == "apicall" or step.get("action") == "api_call":
        return True
    # Navigation with explicit URL — no visual reasoning needed
    if action == "navigate" and params.get("url"):
        return True
    # Keyboard-only actions
    if action == "wait":
        return True
    if action == "presskey" and params.get("key"):
        return True
    if action == "hotkey":
        return True
    if action == "scroll" and params.get("direction"):
        return True
    # App launch / focus (OS-level, no coords)
    if action == "openapp" and params.get("appName"):
        return True
    if action == "focusapp" and params.get("appName"):
        return True
    # Selector-based browser actions (Playwright can handle directly)
    if action == "selectoption" and params.get("selector") and params.get("value"):
        return True
    if action == "waitforelement" and params.get("selector"):
        return True

    # Everything else (click, doubleclick, rightclick, hover, drag, type_text_at
    # with coords, etc.) goes through VLM reasoning so the agent can visually
    # verify the target before acting.
    return False


def step_to_action(step: dict[str, Any]) -> dict[str, Any]:
    """
    Convert a deterministic step to OperatorAction dict (0-1000 coords).
    Used by WebSocket agent API so clients get consistent action format.
    Returns shape compatible with PlaywrightOperator and desktop NutJS operator.
    """
    params = step.get("params", {})
    action = (step.get("action") or "wait").lower().replace("_", "")

    # Map step action names to operator action names
    op_action = action
    if action == "clickat":
        op_action = "click"
    elif action == "typetextat":
        op_action = "type"
    elif action == "presskey":
        op_action = "presskey"  # same
    elif action == "apicall":
        op_action = "apicall"  # handled by runner; return for consistency

    result: dict[str, Any] = {"action": op_action}

    if "x" in params and params.get("x") is not None:
        result["x"] = int(params["x"])
    if "y" in params and params.get("y") is not None:
        result["y"] = int(params["y"])
    if "x1" in params and params.get("x1") is not None:
        result["x1"] = int(params["x1"])
    if "y1" in params and params.get("y1") is not None:
        result["y1"] = int(params["y1"])
    if "x2" in params and params.get("x2") is not None:
        result["x2"] = int(params["x2"])
    if "y2" in params and params.get("y2") is not None:
        result["y2"] = int(params["y2"])
    if "content" in params or "text" in params:
        result["content"] = str(params.get("content") or params.get("text", ""))
    if "url" in params:
        result["url"] = str(params["url"])
    if "key" in params:
        result["key"] = str(params["key"])
    if "keys" in params:
        result["keys"] = list(params["keys"]) if isinstance(params["keys"], (list, tuple)) else [params["keys"]]
    if "seconds" in params:
        result["seconds"] = min(int(params["seconds"]), 60)
    if "direction" in params:
        result["direction"] = str(params["direction"])
    if "distance" in params or "amount" in params:
        result["distance"] = int(params.get("distance") or params.get("amount", 300))
    if "selector" in params:
        result["selector"] = str(params["selector"])
    if "value" in params:
        result["value"] = str(params["value"])
    if "integration" in params:
        result["integration"] = str(params["integration"])
    if "method" in params:
        result["method"] = str(params["method"])
    if "args" in params:
        result["args"] = params["args"]

    return result


async def execute_step(page: Any, step: dict[str, Any]) -> tuple[bool, str]:
    """
    Execute a deterministic browser step via Playwright.
    Returns (success, error_message). error_message is empty string on success.
    """
    action = (step.get("action") or "wait").lower().replace("_", "")
    params = step.get("params", {})

    try:
        if action == "navigate":
            url = params.get("url", "https://www.google.com")
            await page.goto(url)
        elif action == "clickat":
            selector = params.get("selector")
            if selector:
                await page.click(selector, timeout=20000)
            else:
                x, y = params.get("x", 0), params.get("y", 0)
                await page.mouse.click(x, y)
        elif action == "typetextat":
            text = str(params.get("text", ""))
            selector = params.get("selector")
            if selector:
                await page.fill(selector, text)
            else:
                x, y = params.get("x", 0), params.get("y", 0)
                await page.mouse.click(x, y)
                await page.keyboard.type(text)
        elif action == "hover":
            selector = params.get("selector")
            if selector:
                await page.hover(selector, timeout=20000)
            else:
                x, y = params.get("x", 0), params.get("y", 0)
                await page.mouse.move(x, y)
        elif action == "waitforelement":
            selector = params.get("selector", "body")
            try:
                await page.wait_for_selector(selector, timeout=15000)
            except Exception as timeout_err:
                # Non-fatal: element not found within timeout. EchoPrism will
                # verify the page state on the next observation.
                logger.warning("wait_for_element timed out for selector %r: %s", selector, timeout_err)
                return True, ""
        elif action == "wait":
            secs = params.get("seconds", 2)
            await asyncio.sleep(min(secs, 60))
        elif action == "scroll":
            direction = (params.get("direction") or "down").lower()
            amount = params.get("amount", 500)
            dx = 0
            dy = amount if direction == "down" else -amount
            if direction in ("left", "right"):
                dx = amount if direction == "right" else -amount
                dy = 0
            await page.mouse.wheel(dx, dy)
        elif action == "presskey":
            key = params.get("key", "Enter")
            await page.keyboard.press(key)
        elif action == "selectoption":
            selector = params.get("selector")
            value = params.get("value", "")
            if selector:
                await page.select_option(selector, value)
        else:
            logger.warning("Unknown deterministic action: %s", action)
            return False, f"Unknown action: {action}"

        await page.wait_for_load_state("domcontentloaded", timeout=5000)
        return True, ""
    except Exception as e:
        logger.exception("Direct execution failed for %s: %s", action, e)
        return False, str(e)
