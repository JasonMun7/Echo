"""
EchoPrism model configuration.

Environment variables allow override of defaults. Used by agent, subagents, and routers.
"""

import os

# Main Agent (Alpha) orchestration — fast model for real-time UI automation
ORCHESTRATION_MODEL = os.environ.get(
    "ECHOPRISM_ORCHESTRATION_MODEL", "gemini-3-flash-preview"
)

# Locator — element localization (Gemini VLM when OmniParser unavailable)
LOCATOR_MODEL = os.environ.get("ECHOPRISM_LOCATOR_MODEL", "gemini-3-flash-preview")

# Synthesis (Video → JSON) — multimodal for seeing UI changes
SYNTHESIS_MODEL = os.environ.get("ECHOPRISM_SYNTHESIS_MODEL", "gemini-3.1-pro-preview")

# Voice — low-latency native audio
VOICE_MODEL = os.environ.get(
    "ECHOPRISM_VOICE_MODEL", "gemini-2.5-flash-native-audio-preview-12-2025"
)

# OmniParser — element grounding service URL (empty = disabled, falls back to Gemini VLM)
OMNIPARSER_URL = os.environ.get("ECHOPRISM_OMNIPARSER_URL", "")
