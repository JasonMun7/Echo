"""
EchoPrism Voice — Alpha's voice modality layer.

Voice is the root agent for audio; it IS Alpha for the voice interface.
Uses same tools as Chat (via get_tools). Router provides WebSocket bridge and tool execution.
"""
import asyncio
import json
import logging
from typing import Any, Awaitable, Callable

try:
    from google.genai import types
except ImportError:
    types = None  # type: ignore[assignment]

from echo_prism.models_config import VOICE_MODEL

logger = logging.getLogger(__name__)

LIVE_MODEL_VOICE = VOICE_MODEL


async def run_voice_session(
    client: Any,
    model: str,
    config: Any,
    websocket: Any,
    uid: str,
    db: Any,
    handle_tool_call: Callable[[Any, str, Any, Any], Awaitable[list]],
) -> None:
    """
    Run EchoPrism-Voice Live API session.

    Subagent owns the Live API connection. Router provides websocket and handle_tool_call
    for WebSocket bridging and tool execution.
    """
    if not types:
        logger.error("EchoPrism-Voice requires google-genai")
        return

    try:
        async with client.aio.live.connect(model=model, config=config) as live_session:
            disconnected = asyncio.Event()

            async def recv_from_client():
                try:
                    while True:
                        msg = await websocket.receive()
                        if msg["type"] == "websocket.disconnect":
                            disconnected.set()
                            break
                        if msg["type"] == "websocket.receive":
                            if msg.get("bytes") is not None:
                                await live_session.send_realtime_input(
                                    audio=types.Blob(
                                        data=msg["bytes"],
                                        mime_type="audio/pcm;rate=16000",
                                    )
                                )
                            elif msg.get("text") is not None:
                                try:
                                    data = json.loads(msg["text"])
                                    if data.get("type") == "text":
                                        await live_session.send_client_content(
                                            turns=types.Content(
                                                role="user",
                                                parts=[types.Part(text=data.get("text", ""))],
                                            ),
                                            turn_complete=True,
                                        )
                                except Exception as e:
                                    logger.warning(
                                        "voice recv_from_client parse error: %s", e
                                    )
                except Exception as e:
                    disconnected.set()
                    if "disconnect" not in str(e).lower():
                        logger.warning("voice recv_from_client error: %s", e)

            async def _send_bytes(data: bytes) -> bool:
                if disconnected.is_set():
                    return False
                try:
                    await websocket.send_bytes(data)
                    return True
                except Exception:
                    disconnected.set()
                    return False

            async def _send_text(text: str) -> bool:
                if disconnected.is_set():
                    return False
                try:
                    await websocket.send_text(text)
                    return True
                except Exception:
                    disconnected.set()
                    return False

            async def recv_from_gemini():
                while True:
                    try:
                        async for response in live_session.receive():
                            if disconnected.is_set():
                                return
                            if response.server_content:
                                sc = response.server_content
                                if sc.model_turn:
                                    for part in sc.model_turn.parts:
                                        if getattr(part, "thought", False):
                                            continue
                                        if part.inline_data and part.inline_data.data:
                                            if not await _send_bytes(part.inline_data.data):
                                                return
                                        if part.text:
                                            if not await _send_text(
                                                json.dumps({"type": "text", "text": part.text})
                                            ):
                                                return
                                if getattr(sc, "output_transcription", None):
                                    t = sc.output_transcription
                                    if getattr(t, "text", None):
                                        if not await _send_text(
                                            json.dumps({"type": "transcript", "text": t.text})
                                        ):
                                            return
                                if sc.turn_complete:
                                    if not await _send_text(
                                        json.dumps({"type": "turn_complete"})
                                    ):
                                        return
                            if response.tool_call:
                                tool_responses = await handle_tool_call(
                                    response.tool_call, uid, db, websocket
                                )
                                for tr in tool_responses:
                                    await live_session.send_tool_response(
                                        function_responses=tr.function_responses
                                    )
                    except Exception as e:
                        if not disconnected.is_set():
                            logger.warning("voice recv_from_gemini error: %s", e)
                            retry_count = getattr(recv_from_gemini, "_retry_count", 0) + 1
                            recv_from_gemini._retry_count = retry_count  # type: ignore[attr-defined]
                            if retry_count < 3:
                                await asyncio.sleep(1.0 * retry_count)
                                continue
                        break

            await asyncio.gather(
                recv_from_client(),
                recv_from_gemini(),
                return_exceptions=True,
            )

    except Exception as e:
        logger.error("EchoPrism-Voice session error: %s", e)
        raise
