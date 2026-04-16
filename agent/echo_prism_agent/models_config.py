"""
EchoPrism model configuration.

Environment variables allow override of defaults. Used by agent modules and routers.
"""

import os

from echo_prism_agent.constants import (
    DEFAULT_CHAT_MODEL,
    DEFAULT_SYNTHESIS_MODEL,
    DEFAULT_VOICE_MODEL,
)

# Synthesis
SYNTHESIS_MODEL = os.environ.get("ECHOPRISM_SYNTHESIS_MODEL", DEFAULT_SYNTHESIS_MODEL)

# Text / tool helpers (Gemini generate_content + tools; used by agent utilities)
CHAT_MODEL = os.environ.get("ECHOPRISM_CHAT_MODEL", DEFAULT_CHAT_MODEL)

# Voice
VOICE_MODEL = os.environ.get("ECHOPRISM_VOICE_MODEL", DEFAULT_VOICE_MODEL)
