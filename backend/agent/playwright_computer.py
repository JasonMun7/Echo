# Copyright 2026 Google LLC - Adapted from ADK computer_use sample
# Minimal Playwright computer for Echo workflow execution
import asyncio
import time
from urllib.parse import quote_plus
from typing import Literal

from google.adk.tools.computer_use.base_computer import BaseComputer
from google.adk.tools.computer_use.base_computer import ComputerEnvironment
from google.adk.tools.computer_use.base_computer import ComputerState
from playwright.async_api import async_playwright

PLAYWRIGHT_KEY_MAP = {
    "backspace": "Backspace",
    "tab": "Tab",
    "return": "Enter",
    "enter": "Enter",
    "shift": "Shift",
    "control": "Control",
    "alt": "Alt",
    "escape": "Escape",
    "space": "Space",
    "pageup": "PageUp",
    "pagedown": "PageDown",
    "end": "End",
    "home": "Home",
    "left": "ArrowLeft",
    "up": "ArrowUp",
    "right": "ArrowRight",
    "down": "ArrowDown",
    "insert": "Insert",
    "delete": "Delete",
    "f1": "F1",
    "f2": "F2",
    "f3": "F3",
    "command": "Meta",
}


class PlaywrightComputer(BaseComputer):
    """Computer that controls Chromium via Playwright for Echo workflows."""

    def __init__(self, screen_size: tuple[int, int] = (1280, 936), headless: bool = True):
        self._screen_size = screen_size
        self._headless = headless
        self._playwright = None
        self._browser = None
        self._context = None
        self._page = None

    async def screen_size(self) -> tuple[int, int]:
        """Return (width, height). ADK awaits this."""
        return self._screen_size

    async def initialize(self):
        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(
            headless=self._headless,
            args=["--disable-blink-features=AutomationControlled", "--disable-gpu"],
        )
        self._context = await self._browser.new_context()
        self._page = await self._context.new_page()
        await self._page.set_viewport_size({"width": self._screen_size[0], "height": self._screen_size[1]})
        await self._page.goto("https://www.google.com")

    async def environment(self):
        return ComputerEnvironment.ENVIRONMENT_BROWSER

    async def close(self, exc_type=None, exc_val=None, exc_tb=None):
        if self._context:
            await self._context.close()
        if self._browser:
            await self._browser.close()
        if self._playwright:
            await self._playwright.stop()

    async def open_web_browser(self) -> ComputerState:
        return await self.current_state()

    async def click_at(self, x: int, y: int) -> ComputerState:
        await self._page.mouse.click(x, y)
        await self._page.wait_for_load_state()
        return await self.current_state()

    async def hover_at(self, x: int, y: int) -> ComputerState:
        await self._page.mouse.move(x, y)
        await self._page.wait_for_load_state()
        return await self.current_state()

    async def type_text_at(
        self,
        x: int,
        y: int,
        text: str,
        press_enter: bool = True,
        clear_before_typing: bool = True,
    ) -> ComputerState:
        await self._page.mouse.click(x, y)
        await self._page.wait_for_load_state()
        if clear_before_typing:
            await self.key_combination(["Control", "a"])
            await self.key_combination(["Delete"])
        await self._page.keyboard.type(text)
        if press_enter:
            await self.key_combination(["Enter"])
        await self._page.wait_for_load_state()
        return await self.current_state()

    async def scroll_document(self, direction: Literal["up", "down", "left", "right"]) -> ComputerState:
        if direction == "down":
            return await self.key_combination(["PageDown"])
        if direction == "up":
            return await self.key_combination(["PageUp"])
        amount = self._screen_size[0] // 2
        sign = "" if direction == "right" else "-"
        await self._page.evaluate(f"window.scrollBy({sign}{amount}, 0);")
        await self._page.wait_for_load_state()
        return await self.current_state()

    async def scroll_at(
        self,
        x: int,
        y: int,
        direction: Literal["up", "down", "left", "right"],
        magnitude: int,
    ) -> ComputerState:
        await self._page.mouse.move(x, y)
        dx = dy = 0
        if direction == "up":
            dy = -magnitude
        elif direction == "down":
            dy = magnitude
        elif direction == "left":
            dx = -magnitude
        else:
            dx = magnitude
        await self._page.mouse.wheel(dx, dy)
        await self._page.wait_for_load_state()
        return await self.current_state()

    async def wait(self, seconds: int) -> ComputerState:
        await asyncio.sleep(seconds)
        return await self.current_state()

    async def navigate(self, url: str) -> ComputerState:
        await self._page.goto(url)
        await self._page.wait_for_load_state()
        return await self.current_state()

    async def go_back(self) -> ComputerState:
        await self._page.go_back()
        await self._page.wait_for_load_state()
        return await self.current_state()

    async def go_forward(self) -> ComputerState:
        await self._page.go_forward()
        await self._page.wait_for_load_state()
        return await self.current_state()

    async def search(self, query: str = "") -> ComputerState:
        """Navigate to Google; if query given, go to search results. Base class uses search() with no args."""
        if query:
            url = f"https://www.google.com/search?q={quote_plus(query)}"
        else:
            url = "https://www.google.com"
        await self._page.goto(url)
        await self._page.wait_for_load_state()
        return await self.current_state()

    async def key_combination(self, keys: list[str]) -> ComputerState:
        normalized = [PLAYWRIGHT_KEY_MAP.get(k.lower(), k) for k in keys]
        for k in normalized[:-1]:
            await self._page.keyboard.down(k)
        await self._page.keyboard.press(normalized[-1])
        for k in reversed(normalized[:-1]):
            await self._page.keyboard.up(k)
        return await self.current_state()

    async def drag_and_drop(
        self, x: int, y: int, destination_x: int, destination_y: int
    ) -> ComputerState:
        await self._page.mouse.move(x, y)
        await self._page.mouse.down()
        await self._page.mouse.move(destination_x, destination_y)
        await self._page.mouse.up()
        await self._page.wait_for_load_state()
        return await self.current_state()

    async def current_state(self) -> ComputerState:
        await self._page.wait_for_load_state()
        time.sleep(0.5)
        screenshot_bytes = await self._page.screenshot(type="png", full_page=False)
        url = self._page.url or "about:blank"
        try:
            from screenshot_stream import upload_screenshot
            upload_screenshot(screenshot_bytes, url)
        except Exception:
            pass
        return ComputerState(screenshot=screenshot_bytes, url=url)

    async def highlight_mouse(self, x: int, y: int):
        pass
