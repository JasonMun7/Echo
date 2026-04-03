"""Workflow synthesis (Gemini) — media / description → workflow JSON."""

from echo_prism_agent.synthesis.pipeline import (
    synthesize_workflow_from_description,
    synthesize_workflow_from_media,
)

__all__ = [
    "synthesize_workflow_from_description",
    "synthesize_workflow_from_media",
]
