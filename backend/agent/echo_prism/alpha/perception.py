"""
EchoPrism Tier 1 Scene Understanding — dense caption of the full UI screenshot.

Tier 2 (Element Grounding) and RegionFocus refinement live in the Locator agent
(subagents/locator_agent.py). This module keeps only perceive_scene for Alpha.

Tier 3 — State Verification: handled in agent.py via _verify_action().

MEDIUM media_resolution (560 tokens vs 1120), max_output_tokens=384.
"""
import asyncio
import logging
from typing import Any

logger = logging.getLogger(__name__)

try:
    from pydantic import BaseModel
    from google.genai import types as gtypes
    HAS_DEPS = True
except ImportError:
    HAS_DEPS = False
    BaseModel = object  # type: ignore


async def perceive_scene(client: Any, img_bytes: bytes, model: str) -> str:
    """
    Tier 1: Dense caption of the full UI screenshot.

    Called at the start of each new step (attempt==0) to give the agent
    a structured understanding of the current screen before it decides what to do.

    Returns a text description. Returns "" on any failure (fail-safe).
    """
    if not HAS_DEPS or not img_bytes:
        return ""

    prompt = (
        "Provide a dense caption of this GUI screenshot. Include:\n"
        "(a) overall layout and structure,\n"
        "(b) main regions (header, sidebar, content area, footer),\n"
        "(c) key interactive elements and their spatial relationships,\n"
        "(d) any embedded images, icons, or badges and their apparent roles.\n"
        "Be comprehensive but do not hallucinate elements that are not clearly visible."
    )

    try:
        response = await asyncio.wait_for(
            asyncio.to_thread(
                client.models.generate_content,
                model=model,
                contents=[gtypes.Content(role="user", parts=[
                    gtypes.Part.from_text(text=prompt),
                    gtypes.Part.from_bytes(data=img_bytes, mime_type="image/jpeg"),
                ])],
                config=gtypes.GenerateContentConfig(
                    # MEDIUM resolution: 560 tokens vs 1120 for HIGH — scene layout
                    # doesn't need pixel-perfect detail, halving the token cost here.
                    media_resolution=gtypes.MediaResolution.MEDIA_RESOLUTION_MEDIUM,
                    temperature=0.2,
                    max_output_tokens=384,
                ),
            ),
            timeout=20.0,
        )
        text = ""
        if response and response.candidates:
            for c in response.candidates:
                if c.content and c.content.parts:
                    for p in c.content.parts:
                        if hasattr(p, "text") and p.text:
                            text += p.text
        return text.strip()
    except Exception as e:
        logger.warning("perceive_scene failed: %s", e)
        return ""
