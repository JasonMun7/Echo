"""Single-node media → workflow synthesis."""

from __future__ import annotations

import logging
from typing import Any

from echo_prism_agent.langgraph.state.schemas import SynthesisGraphState
from echo_prism_agent.synthesis.pipeline import synthesize_workflow_from_media

logger = logging.getLogger(__name__)


async def synthesis_node(state: SynthesisGraphState) -> dict[str, Any]:
    client = state["client"]
    parts = state["parts"]
    try:
        result = await synthesize_workflow_from_media(client, parts)
        return {
            "steps_data": result["steps"],
            "variables": result.get("variables", []),
            "title": result.get("title"),
            "workflow_type": result.get("workflow_type", "browser"),
            "error": None,
        }
    except Exception as e:
        logger.exception("synthesis node failed")
        return {"error": str(e)}
