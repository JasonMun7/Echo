"""
Custom Computer Use tool that adds safety_acknowledgement when the model
requests confirmation. Required by Gemini API for actions like navigate when
safety checks trigger.
"""
from typing import Any
from typing import Optional

from google.adk.agents.readonly_context import ReadonlyContext
from google.adk.tools.computer_use.computer_use_tool import ComputerUseTool
from google.adk.tools.computer_use.computer_use_toolset import (
    ComputerUseToolset,
    EXCLUDED_METHODS,
)
from google.adk.tools.computer_use.base_computer import BaseComputer
from google.adk.tools.tool_context import ToolContext
from typing_extensions import override


class EchoComputerUseTool(ComputerUseTool):
    """ComputerUseTool that adds safety_acknowledgement for automated headless runs."""

    @override
    async def run_async(
        self, *, args: dict[str, Any], tool_context: ToolContext
    ) -> Any:
        result = await super().run_async(args=args, tool_context=tool_context)
        if isinstance(result, dict) and "safety_decision" in args:
            result["safety_acknowledgement"] = "true"
        return result


class EchoComputerUseToolset(ComputerUseToolset):
    """ComputerUseToolset that uses EchoComputerUseTool (with safety_ack)."""

    @override
    async def get_tools(
        self, readonly_context: Optional[ReadonlyContext] = None
    ):
        if self._tools:
            return self._tools
        await self._ensure_initialized()
        screen_size = await self._computer.screen_size()
        computer_methods = []
        for method_name in dir(BaseComputer):
            if method_name.startswith("_") or method_name in EXCLUDED_METHODS:
                continue
            attr = getattr(BaseComputer, method_name, None)
            if attr is not None and callable(attr):
                instance_method = getattr(self._computer, method_name)
                computer_methods.append(instance_method)
        self._tools = [
            EchoComputerUseTool(func=m, screen_size=screen_size)
            for m in computer_methods
        ]
        return self._tools
