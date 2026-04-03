"""
EchoPrism execution: Playwright operators, deterministic steps, GCS uploads, API bridge.

Consolidates former `action_operators`, `deterministic_steps`, `step_bridge`, and `gcs_screenshots`.
"""
from __future__ import annotations

import asyncio
import importlib
import logging
import os
from abc import ABC, abstractmethod
from typing import Any, Literal

logger = logging.getLogger(__name__)

# --- Operators (Playwright / API) -------------------------------------------------

OperatorResult = bool | Literal["finished", "calluser"]


class BaseOperator(ABC):
    """Base class for action execution operators."""

    @abstractmethod
    async def execute(self, action: dict[str, Any]) -> OperatorResult:
        return False

    @abstractmethod
    async def screenshot(self) -> bytes:
        return b""


class PlaywrightOperator(BaseOperator):
    """Playwright-based operator for browser control."""

    def __init__(self, page: Any, screen_width: int = 1280, screen_height: int = 936):
        self._page = page
        self._coord_scale = 1000
        try:
            vp = page.viewport_size
            self._screen_width = (vp or {}).get("width", screen_width)
            self._screen_height = (vp or {}).get("height", screen_height)
        except Exception:
            self._screen_width = screen_width
            self._screen_height = screen_height

    def _scale(self, x: int, y: int) -> tuple[int, int]:
        wx = int(x * self._screen_width / self._coord_scale)
        wy = int(y * self._screen_height / self._coord_scale)
        return wx, wy

    async def execute(self, action: dict[str, Any]) -> OperatorResult:
        try:
            act = (action.get("action") or "").lower()

            if act == "finished":
                return "finished"

            if act == "calluser":
                return "calluser"

            if act == "click":
                x = action.get("x", 0)
                y = action.get("y", 0)
                wx, wy = self._scale(x, y)
                await self._page.mouse.click(wx, wy)
            elif act == "rightclick":
                x = action.get("x", 0)
                y = action.get("y", 0)
                wx, wy = self._scale(x, y)
                await self._page.mouse.click(wx, wy, button="right")
            elif act == "doubleclick":
                x = action.get("x", 0)
                y = action.get("y", 0)
                wx, wy = self._scale(x, y)
                await self._page.mouse.dblclick(wx, wy)
            elif act == "drag":
                x1, y1 = self._scale(action.get("x1", 0), action.get("y1", 0))
                x2, y2 = self._scale(action.get("x2", 0), action.get("y2", 0))
                await self._page.mouse.move(x1, y1)
                await self._page.mouse.down()
                await self._page.mouse.move(x2, y2)
                await self._page.mouse.up()
            elif act == "type":
                content = action.get("content", "")
                await self._page.keyboard.type(content)
            elif act == "navigate":
                url = action.get("url", "https://www.google.com")
                await self._page.goto(url, timeout=15000, wait_until="domcontentloaded")
            elif act == "wait":
                secs = action.get("seconds", 1)
                await asyncio.sleep(min(secs, 30))
            elif act == "scroll":
                direction = (action.get("direction") or "down").lower()
                x = action.get("x", self._screen_width // 2)
                y = action.get("y", self._screen_height // 2)
                distance = int(action.get("distance", action.get("amount", 300)))
                wx, wy = self._scale(x, y)
                await self._page.mouse.move(wx, wy)
                dy = distance if direction == "down" else (-distance if direction == "up" else 0)
                dx = distance if direction == "right" else (-distance if direction == "left" else 0)
                await self._page.mouse.wheel(dx, dy)
            elif act == "hover":
                x = action.get("x", self._screen_width // 2)
                y = action.get("y", self._screen_height // 2)
                wx, wy = self._scale(x, y)
                await self._page.mouse.move(wx, wy)
            elif act == "waitforelement":
                try:
                    await self._page.wait_for_load_state("domcontentloaded", timeout=10000)
                except Exception:
                    pass
                try:
                    await self._page.wait_for_load_state("networkidle", timeout=5000)
                except Exception:
                    pass
                await asyncio.sleep(0.5)
            elif act == "selectoption":
                value = action.get("value", "")
                if not value:
                    return False
                x = action.get("x")
                y = action.get("y")
                if x is not None and y is not None:
                    wx, wy = self._scale(int(x), int(y))
                    await self._page.mouse.click(wx, wy)
                    await asyncio.sleep(0.3)
                    try:
                        await self._page.evaluate(
                            f"""() => {{
                                const el = document.activeElement;
                                if (el && el.tagName === 'SELECT') {{
                                    el.value = {value!r};
                                    el.dispatchEvent(new Event('change', {{bubbles: true}}));
                                }}
                            }}"""
                        )
                    except Exception:
                        pass
                else:
                    selector = action.get("selector", "")
                    if selector:
                        await self._page.select_option(selector, value)
                    else:
                        return False
            elif act == "presskey":
                key = action.get("key", "enter")
                await self._page.keyboard.press(key)
            elif act == "hotkey":
                keys = action.get("keys", [])
                if not keys:
                    return False
                for k in keys[:-1]:
                    await self._page.keyboard.down(k)
                await self._page.keyboard.press(keys[-1])
                for k in reversed(keys[:-1]):
                    await self._page.keyboard.up(k)
            else:
                logging.getLogger(__name__).warning(
                    "PlaywrightOperator: unknown action '%s'", act
                )
                return False

            try:
                await self._page.wait_for_load_state("domcontentloaded", timeout=5000)
                await asyncio.sleep(0.5)
            except Exception:
                pass
            return True
        except Exception:
            return False

    async def screenshot(self) -> bytes:
        return await self._page.screenshot(type="png", full_page=False)


class ApiCallOperator(BaseOperator):
    """Executes api_call steps via integration connectors."""

    def __init__(self, uid: str, db: Any):
        self._uid = uid
        self._db = db

    async def execute(self, action: dict[str, Any]) -> OperatorResult:
        integration = action.get("integration") or action.get("params", {}).get("integration", "")
        method = action.get("method") or action.get("params", {}).get("method", "")
        args = action.get("args") or action.get("params", {}).get("args", {}) or {}

        if not integration or not method:
            return False

        try:
            token_doc = await asyncio.to_thread(
                lambda: self._db.collection("users")
                .document(self._uid)
                .collection("integrations")
                .document(integration)
                .get()
            )
            access_token = (token_doc.to_dict() or {}).get("access_token", "") if token_doc.exists else ""

            connector = importlib.import_module(f"integrations.{integration}")
            result = await connector.execute(method, args, access_token)
            return True if result.get("ok") else False
        except Exception:
            return False

    async def screenshot(self) -> bytes:
        return b""


# --- Deterministic steps ---------------------------------------------------------


def is_deterministic(step: dict[str, Any]) -> bool:
    params = step.get("params", {})
    action = (step.get("action") or "").lower().replace("_", "")

    if action == "apicall" or step.get("action") == "api_call":
        return True
    if action == "navigate" and params.get("url"):
        return True
    if action == "wait":
        return True
    if action == "presskey" and params.get("key"):
        return True
    if action == "hotkey":
        return True
    if action == "scroll" and params.get("direction"):
        return True
    if action == "openapp" and params.get("appName"):
        return True
    if action == "focusapp" and params.get("appName"):
        return True
    if action == "selectoption" and params.get("selector") and params.get("value"):
        return True
    if action == "waitforelement" and params.get("selector"):
        return True

    return False


def step_to_action(step: dict[str, Any]) -> dict[str, Any]:
    params = step.get("params", {})
    action = (step.get("action") or "wait").lower().replace("_", "")

    op_action = action
    if action == "clickat":
        op_action = "click"
    elif action == "typetextat":
        op_action = "type"
    elif action == "presskey":
        op_action = "presskey"
    elif action == "apicall":
        op_action = "apicall"

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
        result["keys"] = (
            list(params["keys"]) if isinstance(params["keys"], (list, tuple)) else [params["keys"]]
        )
    if "seconds" in params:
        result["seconds"] = min(int(params["seconds"]), 60)
    if "direction" in params:
        result["direction"] = str(params["direction"])
    if "distance" in params or "amount" in params:
        raw_dist = params.get("distance") or params.get("amount", 800)
        if isinstance(raw_dist, str):
            dist_lower = raw_dist.lower()
            if dist_lower == "short":
                result["distance"] = 300
            elif dist_lower == "medium":
                result["distance"] = 800
            elif dist_lower == "long":
                result["distance"] = 1500
            else:
                try:
                    result["distance"] = int(raw_dist)
                except ValueError:
                    result["distance"] = 800
        else:
            try:
                result["distance"] = int(raw_dist)
            except (ValueError, TypeError):
                result["distance"] = 800
    else:
        result["distance"] = 800
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
                logger.warning(
                    "wait_for_element timed out for selector %r: %s", selector, timeout_err
                )
                return True, ""
        elif action == "wait":
            secs = params.get("seconds", 2)
            await asyncio.sleep(min(secs, 60))
        elif action == "scroll":
            direction = (params.get("direction") or "down").lower()
            amount = params.get("amount", 800)
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


# --- GCS screenshots -------------------------------------------------------------


def _public_url(bucket_name: str, blob_name: str) -> str:
    return f"https://storage.googleapis.com/{bucket_name}/{blob_name}"


def upload_screenshot(screenshot_bytes: bytes, url: str) -> None:
    workflow_id = os.environ.get("WORKFLOW_ID")
    run_id = os.environ.get("RUN_ID")
    bucket_name = os.environ.get("ECHO_GCS_BUCKET")
    if not all((workflow_id, run_id, bucket_name)):
        return

    use_public = os.environ.get("GCS_PUBLIC_BUCKET", "").lower() in ("1", "true", "yes")

    try:
        from google.cloud import storage
        from firebase_admin import firestore
        from google.cloud.firestore import SERVER_TIMESTAMP

        client = storage.Client()
        bucket = client.bucket(bucket_name)
        blob_name = f"runs/{workflow_id}/{run_id}/latest.png"
        blob = bucket.blob(blob_name)
        blob.upload_from_string(
            screenshot_bytes,
            content_type="image/png",
        )

        if use_public:
            screenshot_ref = _public_url(bucket_name, blob_name)
            logger.debug("Using public GCS URL for screenshot")
        else:
            try:
                from datetime import timedelta

                screenshot_ref = blob.generate_signed_url(
                    version="v4",
                    expiration=timedelta(hours=2),
                    method="GET",
                )
            except Exception:
                screenshot_ref = _public_url(bucket_name, blob_name)
                logger.debug(
                    "Signed URL unavailable — using public URL (set GCS_PUBLIC_BUCKET=true "
                    "or GOOGLE_APPLICATION_CREDENTIALS for signed URLs)"
                )

        db = firestore.client()
        run_ref = (
            db.collection("workflows")
            .document(workflow_id)
            .collection("runs")
            .document(run_id)
        )
        run_ref.update(
            {
                "lastScreenshotUrl": screenshot_ref,
                "lastScreenshotAt": SERVER_TIMESTAMP,
            }
        )
    except Exception as e:
        logger.warning("Failed to upload screenshot: %s", e)


def upload_step_screenshot(
    workflow_id: str,
    run_id: str,
    step_index: int,
    screenshot_bytes: bytes,
) -> str | None:
    bucket_name = os.environ.get("ECHO_GCS_BUCKET")
    if not bucket_name:
        return None
    use_public = os.environ.get("GCS_PUBLIC_BUCKET", "").lower() in ("1", "true", "yes")
    blob_name = f"runs/{workflow_id}/{run_id}/step_{step_index}.png"
    try:
        from google.cloud import storage

        client = storage.Client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(blob_name)
        blob.upload_from_string(
            screenshot_bytes,
            content_type="image/png",
        )
        if use_public:
            return _public_url(bucket_name, blob_name)
        try:
            from datetime import timedelta

            return blob.generate_signed_url(
                version="v4",
                expiration=timedelta(hours=24),
                method="GET",
            )
        except Exception:
            return _public_url(bucket_name, blob_name)
    except Exception as e:
        logger.warning("Failed to upload step screenshot: %s", e)
        return None


def get_step_screenshot_bytes(
    workflow_id: str,
    run_id: str,
    step_index: int,
) -> bytes | None:
    bucket_name = os.environ.get("ECHO_GCS_BUCKET")
    if not bucket_name:
        return None
    blob_name = f"runs/{workflow_id}/{run_id}/step_{step_index}.png"
    try:
        from google.cloud import storage

        client = storage.Client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(blob_name)
        if not blob.exists():
            return None
        return blob.download_as_bytes()
    except Exception as e:
        logger.warning("Failed to get step screenshot: %s", e)
        return None


# --- Step bridge (coords, deterministic runner, API calls) ------------------------

_GROUNDING_ACTIONS = {"click", "doubleclick", "rightclick", "hover", "drag", "clickandtype"}


async def resolve_coords_for_action(
    parsed: dict[str, Any],
    screenshot: bytes,
    client: Any,
    step_data: dict[str, Any],
) -> tuple[dict[str, Any], None]:
    parsed_action_name = (parsed.get("action") or "").lower()
    if parsed_action_name not in _GROUNDING_ACTIONS:
        return parsed, None

    has_coords = ("x" in parsed and "y" in parsed) or ("x1" in parsed and "y1" in parsed)
    if has_coords:
        return parsed, None

    logger.warning(
        "No coordinates in VLM output for action %s; UI-Tars should emit x,y or x1,y1",
        parsed_action_name,
    )
    return parsed, None


async def execute_api_call(step: dict[str, Any], uid: str, db: Any) -> tuple[bool, str]:
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
        access_token = (
            (token_doc.to_dict() or {}).get("access_token", "") if token_doc.exists else ""
        )

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


async def execute_deterministic_step(
    step: dict[str, Any],
    page: Any,
    uid: str,
    db: Any,
) -> tuple[bool, str]:
    action = (step.get("action") or "").lower().replace("_", "")
    if action == "apicall" or step.get("action") == "api_call":
        return await execute_api_call(step, uid, db)

    return await execute_step(page, step)
