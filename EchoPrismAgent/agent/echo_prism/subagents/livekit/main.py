"""
EchoPrism LiveKit Agent — entrypoint.

Run from EchoPrismAgent/:  python -m agent.echo_prism.subagents.livekit.main dev
Or:  python -m agent.echo_prism.subagents.livekit.main start
"""
import logging
import os
import sys
from pathlib import Path

# Ensure EchoPrismAgent is on path when run as -m
_root = Path(__file__).resolve().parents[4]  # agent/echo_prism/subagents/livekit -> EchoPrismAgent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

from dotenv import load_dotenv

load_dotenv(_root / ".env")
load_dotenv()

# So Cloud Run and local dev show logs; set ECHO_LOG_LEVEL=INFO or DEBUG (default INFO)
_log_level = getattr(
    logging, os.environ.get("ECHO_LOG_LEVEL", "INFO").upper(), logging.INFO
)
logging.basicConfig(
    level=_log_level,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stderr,
)

from livekit import agents
from livekit.agents import AgentSession, room_io
from livekit.plugins import google

from agent.echo_prism.models_config import VOICE_MODEL
from agent.echo_prism.subagents.livekit.agent import (
    LiveKitEchoPrismAgent,
    INTERRUPTION_SYSTEM_PROMPT_PREFIX,
    ECHOPRISM_SYSTEM_PROMPT,
)

server = agents.AgentServer()


@server.rtc_session(agent_name="echoprism-agent")
async def entrypoint(ctx: agents.JobContext):
    import time

    t_entry = time.perf_counter()
    logging.info("[EchoPrism] Agent dispatch -> entrypoint: job received")

    session = AgentSession(
        llm=google.realtime.RealtimeModel(
            model=VOICE_MODEL,
            voice=os.environ.get("ECHOPRISM_VOICE", "Puck"),
            temperature=0.8,
        ),
        # Treat every interrupt as final — never resume old speech.
        # Prevents agent from staying "in phase of answering" and going quiet.
        resume_false_interruption=False,
        false_interruption_timeout=None,
    )
    await session.start(
        room=ctx.room,
        agent=LiveKitEchoPrismAgent(),
        room_options=room_io.RoomOptions(
            video_input=True,
            audio_input=room_io.AudioInputOptions(
                pre_connect_audio=True,
                pre_connect_audio_timeout=10.0,
            ),
        ),
    )
    t_session_started = time.perf_counter()
    logging.info(
        "[EchoPrism] session.start() completed in %.0fms",
        (t_session_started - t_entry) * 1000,
    )

    await ctx.connect()
    t_connected = time.perf_counter()
    logging.info(
        "[EchoPrism] ctx.connect() completed in %.0fms (total since entry: %.0fms)",
        (t_connected - t_session_started) * 1000,
        (t_connected - t_entry) * 1000,
    )

    # Check if this is a voice interruption session and adjust accordingly
    interruption_attrs: dict[str, str] = {}
    for p in ctx.room.remote_participants.values():
        attrs = p.attributes or {}
        if attrs.get("mode") == "voice-interruption":
            interruption_attrs = dict(attrs)
            break

    if interruption_attrs:
        recent_context = interruption_attrs.get("recent_context", "")
        interruption_instructions = (
            INTERRUPTION_SYSTEM_PROMPT_PREFIX + ECHOPRISM_SYSTEM_PROMPT
        )
        try:
            await session.update_instructions(interruption_instructions)
        except Exception:
            pass  # Not all SDK versions expose this; graceful fallback

    # RPC so the client can interrupt when user speaks during agent speech (barge-in)
    @ctx.room.local_participant.register_rpc_method("interrupt")
    async def _handle_interrupt(_data):
        session.interrupt()
        return "ok"

    # Greeting: generate_reply uses realtime LLM. Cached greeting would require
    # TTS plugin + session.say(text, audio=audio_frames_from_file(...)) to skip LLM latency.
    t_before_greeting = time.perf_counter()

    if interruption_attrs:
        recent_context = interruption_attrs.get("recent_context", "")
        greeting_instructions = (
            "Greet the user very briefly. Acknowledge that the workflow is paused. "
            + (f"The most recent activity was: {recent_context}. " if recent_context else "")
            + "Ask what guidance they'd like to give or if they just want to resume."
        )
    else:
        greeting_instructions = "Greet the user and offer your assistance with workflows and Echo."

    handle = session.generate_reply(instructions=greeting_instructions)
    if handle:
        await handle.wait_for_playout()
        t_greeting_done = time.perf_counter()
        logging.info(
            "[EchoPrism] Greeting playout done in %.0fms (total since entry: %.0fms)",
            (t_greeting_done - t_before_greeting) * 1000,
            (t_greeting_done - t_entry) * 1000,
        )


if __name__ == "__main__":
    agents.cli.run_app(server)
