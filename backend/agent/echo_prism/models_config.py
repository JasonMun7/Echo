"""
EchoPrism model configuration.

Environment variables allow override of defaults. Used by agent, subagents, and routers.
"""
import os

# Main Agent (Alpha) orchestration — Adaptive Thinking for sub-agents
ORCHESTRATION_MODEL = os.environ.get("ECHOPRISM_ORCHESTRATION_MODEL", "gemini-3.1-pro-preview")

# Grounding — stable for SFT with GroundCUA
GROUNDING_MODEL = os.environ.get("ECHOPRISM_GROUNDING_MODEL", "gemini-2.5-flash-001")

# Description Synthesis — NL → workflow
DESCRIPTION_MODEL = os.environ.get("ECHOPRISM_DESCRIPTION_MODEL", "gemini-3.1-pro-preview")

# Trace Scoring — T+ generation for fine-tuning
TRACE_SCORING_MODEL = os.environ.get("ECHOPRISM_TRACE_SCORING_MODEL", "gemini-3.1-pro-preview")

# Synthesis (Video → JSON) — multimodal for seeing UI changes
SYNTHESIS_MODEL = os.environ.get("ECHOPRISM_SYNTHESIS_MODEL", "gemini-2.5-flash")

# Synthesis title generation — set to "1" to generate descriptive title from steps (adds latency)
SYNTHESIS_GENERATE_TITLE = os.environ.get("ECHOPRISM_SYNTHESIS_GENERATE_TITLE", "").lower() in ("1", "true", "yes")

# Voice — low-latency native audio
VOICE_MODEL = os.environ.get("ECHOPRISM_VOICE_MODEL", "gemini-2.5-flash-native-audio-preview-12-2025")
