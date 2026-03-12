"""
EchoPrism LiveKit Agent — entrypoint.

Run from EchoPrismAgent/:  python -m agent.echo_prism.subagents.livekit.main dev
Or:  python -m agent.echo_prism.subagents.livekit.main start
"""
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
from livekit.agents import AgentSession
from livekit.plugins import google

from agent.echo_prism.subagents.livekit.agent import LiveKitEchoPrismAgent

server = agents.AgentServer()


@server.rtc_session(agent_name="echoprism-agent")
async def entrypoint(ctx: agents.JobContext):
    model = os.environ.get(
        "ECHOPRISM_VOICE_MODEL",
        "gemini-2.5-flash-native-audio-preview-12-2025",
    )
    session = AgentSession(
        llm=google.realtime.RealtimeModel(
            model=model,
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
    )
    await ctx.connect()

    # RPC so the client can interrupt when user speaks during agent speech (barge-in)
    @ctx.room.local_participant.register_rpc_method("interrupt")
    async def _handle_interrupt(_data):
        session.interrupt()
        return "ok"
    handle = session.generate_reply(
        instructions="Greet the user and offer your assistance with workflows and Echo.",
    )
    if handle:
        await handle.wait_for_playout()


if __name__ == "__main__":
    agents.cli.run_app(server)
