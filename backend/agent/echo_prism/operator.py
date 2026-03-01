"""
Operator abstraction for EchoPrism: Playwright (browser), PyAutoGUI (desktop).
Each operator implements the same interface: execute(action_dict) -> result.

execute() return values:
  True          - action succeeded, continue loop
  False         - action failed, trigger retry
  "finished"    - agent declared task complete, break loop
  "calluser"    - agent needs human intervention, break loop with awaiting_user status
"""
import asyncio
from abc import ABC, abstractmethod
from typing import Any, Literal

# Sentinel type for terminal actions
OperatorResult = bool | Literal["finished", "calluser"]


class BaseOperator(ABC):
    """Base class for action execution operators."""

    @abstractmethod
    async def execute(self, action: dict[str, Any]) -> OperatorResult:
        """
        Execute action. Returns:
          True        - success, continue
          False       - failure, trigger retry
          "finished"  - task complete, stop loop
          "calluser"  - needs human help, stop loop
        """
        return False

    @abstractmethod
    async def screenshot(self) -> bytes:
        """Capture current screen state. Returns bytes"""
        return b""


class PlaywrightOperator(BaseOperator):
    """Playwright-based operator for browser control. Used by Cloud Run Job."""

    def __init__(self, page: Any, screen_width: int = 1280, screen_height: int = 936):
        self._page = page
        self._coord_scale = 1000  # EchoPrism outputs 0-1000
        # Prefer reading viewport from the live page; fall back to constructor args
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
                # Pure VLM system — no DOM selectors. Wait for page to settle
                # (domcontentloaded + networkidle), then return True so EchoPrism
                # verifies visually on the next observation.
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
                    # Pure VLM: click the dropdown by coordinate, then set value on
                    # whichever <select> element gains focus.
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
                    # Fallback: DOM selector if somehow still present (legacy data)
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
                import logging as _log
                _log.getLogger(__name__).warning("PlaywrightOperator: unknown action '%s'", act)
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
        """Returns screenshot_bytes"""
        return await self._page.screenshot(type="png", full_page=False)


class ApiCallOperator(BaseOperator):
    """Executes api_call steps by routing to the correct integration connector.
    No screenshot or VLM needed — deterministic API execution.
    """

    def __init__(self, uid: str, db: Any):
        self._uid = uid
        self._db = db

    async def execute(self, action: dict[str, Any]) -> OperatorResult:
        """Execute an api_call step against a connected integration."""
        import importlib

        integration = action.get("integration") or action.get("params", {}).get("integration", "")
        method = action.get("method") or action.get("params", {}).get("method", "")
        args = action.get("args") or action.get("params", {}).get("args", {}) or {}

        if not integration or not method:
            return False

        try:
            token_doc = (
                await asyncio.to_thread(
                    lambda: self._db.collection("users")
                    .document(self._uid)
                    .collection("integrations")
                    .document(integration)
                    .get()
                )
            )
            access_token = (token_doc.to_dict() or {}).get("access_token", "") if token_doc.exists else ""

            connector = importlib.import_module(f"integrations.{integration}")
            result = await connector.execute(method, args, access_token)
            return True if result.get("ok") else False
        except Exception:
            return False

    async def screenshot(self) -> bytes:
        """API call steps have no screenshot."""
        return b""
