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
    Browser context: selectors ARE usable; coords are also accepted.
    api_call steps are always deterministic — they execute integrations directly.
    """
    params = step.get("params", {})
    action = (step.get("action") or "").lower().replace("_", "")

    if action == "apicall" or step.get("action") == "api_call":
        return True
    if action == "navigate" and params.get("url"):
        return True
    if params.get("selector"):
        return True
    if "x" in params and "y" in params:
        return True
    if action == "wait":
        return True
    if action == "presskey" and params.get("key"):
        return True
    if action == "scroll" and params.get("direction"):
        return True
    if action == "selectoption" and params.get("selector") and params.get("value"):
        return True
    if action == "hover" and (params.get("selector") or ("x" in params and "y" in params)):
        return True
    if action == "waitforelement" and params.get("selector"):
        return True
    return False


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
