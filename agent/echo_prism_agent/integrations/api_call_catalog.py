"""Stable reference text for synthesis prompts: api_call + Composio only."""

from __future__ import annotations


def build_api_call_reference_for_llm() -> str:
    """Human-readable block for ``api_call`` steps (Composio)."""
    return (
        'api_call step shape: action "api_call", params: {\n'
        '  "slug": "COMPOSIO_TOOL_SLUG",   /* required — e.g. GMAIL_SEND_EMAIL, SLACK_SEND_MESSAGE */\n'
        '  "arguments": { }  /* JSON per Composio tool schema; alias: args */\n'
        "}\n\n"
        "Execution uses Composio with Firebase uid as Composio user_id. Connect each toolkit in App Integrations.\n"
        "Sensitive tools may pause for human approval in the desktop Run HUD before executing.\n\n"
        "CRITICAL — messaging (Gmail, Slack, etc.): arguments body / text must be the FINAL text to send.\n"
        "Add prior steps to gather data before send.\n"
    )


API_CALL_SYNTHESIS_APPENDIX: str = build_api_call_reference_for_llm()
