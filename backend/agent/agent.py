# Echo Workflow Executor Agent - ADK + Computer Use
import os

from google.adk import Agent

from computer_use_tool_safe import EchoComputerUseToolset
from playwright_computer import PlaywrightComputer

_headless = os.getenv("HEADLESS", "true").lower() == "true"
_computer = PlaywrightComputer(screen_size=(1280, 936), headless=_headless)

root_agent = Agent(
    model="gemini-2.5-computer-use-preview-10-2025",
    name="echo_workflow_agent",
    description="Executes workflow steps by operating a browser via Computer Use.",
    instruction="""You are a workflow automation agent. Execute each step precisely:
- For 'navigate': go to the given URL
- For 'click_at': click the element described
- For 'type_text_at': type the text into the element
- For 'scroll': scroll the page
- For 'wait': wait the specified seconds
- For 'select_option': select the option in the dropdown
- For 'press_key': press the key
- For 'wait_for_element': wait until the element appears
Use the computer use tools to interact with the browser. Complete each step before proceeding.""",
    tools=[EchoComputerUseToolset(computer=_computer)],
)
