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

from livekit import agents
from livekit.agents import AgentSession, room_io
from livekit.plugins import google

from agent.echo_prism.models_config import VOICE_MODEL
from agent.echo_prism.subagents.livekit.agent import LiveKitEchoPrismAgent

server = agents.AgentServer()


@server.rtc_session(agent_name="echoprism-agent")
async def entrypoint(ctx: agents.JobContext):
    import time

    t_entry = time.perf_counter()
    logging.debug("[EchoPrism] Agent dispatch -> entrypoint: job received")

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
    logging.debug(
        "[EchoPrism] session.start() completed in %.0fms",
        (t_session_started - t_entry) * 1000,
    )

    await ctx.connect()
    t_connected = time.perf_counter()
    logging.debug(
        "[EchoPrism] ctx.connect() completed in %.0fms (total since entry: %.0fms)",
        (t_connected - t_session_started) * 1000,
        (t_connected - t_entry) * 1000,
    )

    # RPC so the client can interrupt when user speaks during agent speech (barge-in)
    @ctx.room.local_participant.register_rpc_method("interrupt")
    async def _handle_interrupt(_data):
        session.interrupt()
        return "ok"
    # Greeting: generate_reply uses realtime LLM. Cached greeting would require
    # TTS plugin + session.say(text, audio=audio_frames_from_file(...)) to skip LLM latency.
    t_before_greeting = time.perf_counter()
    handle = session.generate_reply(
        instructions="Greet the user and offer your assistance with workflows and Echo.",
    )
    if handle:
        await handle.wait_for_playout()
        t_greeting_done = time.perf_counter()
        logging.debug(
            "[EchoPrism] Greeting playout done in %.0fms (total since entry: %.0fms)",
            (t_greeting_done - t_before_greeting) * 1000,
            (t_greeting_done - t_entry) * 1000,
        )


if __name__ == "__main__":
    agents.cli.run_app(server)
