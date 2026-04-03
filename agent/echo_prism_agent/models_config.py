"""
EchoPrism model configuration.

Environment variables allow override of defaults. Used by agent modules and routers.
"""

import os

# Synthesis (Video → JSON) — multimodal for seeing UI changes
SYNTHESIS_MODEL = os.environ.get("ECHOPRISM_SYNTHESIS_MODEL", "gemini-3.1-pro-preview")

# Voice — low-latency native audio
VOICE_MODEL = os.environ.get(
    "ECHOPRISM_VOICE_MODEL", "gemini-2.5-flash-native-audio-preview-12-2025"
)
