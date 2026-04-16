"""
EchoPrism LiveKit Agent — entrypoint.

Run with agent on PYTHONPATH (e.g. from agent/: PYTHONPATH=. python -m echo_prism_agent.voice.livekit.main dev)
Or repo root: PYTHONPATH=agent python -m echo_prism_agent.voice.livekit.main start

Telephony: SIP participant detection, job metadata, tailored greeting,
DTMF handling, phone→user lookup for personalization, and log context.

To see [EchoPrism] logs in dev when you call in: scale the deployed LiveKit agent
(Cloud Run) to 0 so only your local worker is registered; otherwise the call
goes to the deployed worker and logs appear only in Cloud Run.

Worker subprocess init: if you see ``TimeoutError`` / "error initializing process", imports may be
slow (e.g. conda + ``livekit.plugins.google``). Heavy imports run at job start (inside ``entrypoint``),
and ``AgentServer`` uses ``initialize_process_timeout`` **90s** by default. Override with
``LIVEKIT_AGENT_INIT_TIMEOUT`` or ``ECHO_LIVEKIT_AGENT_INIT_TIMEOUT`` (seconds).
"""

import asyncio
import hashlib
import json
import logging
import os
import sys
from pathlib import Path

import httpx

# Repo root (…/echo) for .env; agent/ must be on PYTHONPATH for echo_prism_agent imports
_root = Path(__file__).resolve().parents[4]  # .../echo (repo root)
_agent_parent = Path(__file__).resolve().parents[3]  # .../echo/agent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))
if str(_agent_parent) not in sys.path:
    sys.path.insert(0, str(_agent_parent))

from dotenv import load_dotenv

load_dotenv(_root / ".env")
load_dotenv()

# So Cloud Run and local dev show logs; set ECHO_LOG_LEVEL=INFO or DEBUG (default INFO)
_log_level = getattr(logging, os.environ.get("ECHO_LOG_LEVEL", "INFO").upper(), logging.INFO)
logging.basicConfig(
    level=_log_level,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stderr,
)
# Dedicated logger so EchoPrism logs show in dev when livekit-agents reconfigures root logger
_logger = logging.getLogger("echoprism.livekit")
_logger.setLevel(_log_level)
if not _logger.handlers:
    _h = logging.StreamHandler(sys.stderr)
    _h.setFormatter(logging.Formatter("%(asctime)s [%(name)s] %(levelname)s: %(message)s", datefmt="%H:%M:%S"))
    _logger.addHandler(_h)

from echo_prism_agent.constants import (
    DEFAULT_AGENT_BACKEND_URL,
    DEFAULT_ECHOPRISM_VOICE,
    LIVEKIT_REALTIME_TEMPERATURE,
    PRE_CONNECT_AUDIO_TIMEOUT_S,
    USER_BY_PHONE_HTTP_TIMEOUT_S,
)
from echo_prism_agent.models_config import VOICE_MODEL
from livekit import agents, rtc
from livekit.agents import AgentSession, room_io

# Heavy plugins (e.g. google.realtime) are imported inside `entrypoint` so the worker
# subprocess can complete IPC bootstrap before the default init timeout.

# Telephony: per-participant noise cancellation (BVCTelephony for SIP)
try:
    from livekit.plugins import noise_cancellation

    def _noise_cancellation_for_participant(params):
        if _is_sip_participant(getattr(params, "participant", None)):
            return noise_cancellation.BVCTelephony()
        return noise_cancellation.BVC()

except ImportError:
    noise_cancellation = None
    _noise_cancellation_for_participant = None

from echo_prism_agent.model_prompts import (
    ECHOPRISM_SYSTEM_PROMPT,
    INTERRUPTION_SYSTEM_PROMPT_PREFIX,
)
from echo_prism_agent.voice.livekit import phone_lookup

server = agents.AgentServer(
    # Subprocess must import this module + finish setup; cold conda + google.genai often exceeds 10s.
    initialize_process_timeout=float(
        os.environ.get("LIVEKIT_AGENT_INIT_TIMEOUT", os.environ.get("ECHO_LIVEKIT_AGENT_INIT_TIMEOUT", "90"))
    ),
)


def _is_sip_participant(p) -> bool:
    """True if participant is SIP (phone caller). Works across SDK versions."""
    if p is None:
        return False
    try:
        kind = getattr(p, "kind", None)
        sip_kind = getattr(
            getattr(rtc, "ParticipantKind", None),
            "PARTICIPANT_KIND_SIP",
            None,
        )
        if sip_kind is not None and kind == sip_kind:
            return True
        # Fallback: SIP participants have sip.callID attribute
        if (p.attributes or {}).get("sip.callID"):
            return True
    except Exception:
        pass
    return False


def _get_sip_context(room: rtc.Room) -> dict:
    """Detect SIP caller and return sip.phoneNumber, sip.callID, sip.trunkPhoneNumber, etc."""
    for p in room.remote_participants.values():
        if _is_sip_participant(p):
            attrs = p.attributes or {}
            return {
                "sip_phone_number": attrs.get("sip.phoneNumber", ""),
                "sip_call_id": attrs.get("sip.callID", ""),
                "sip_trunk_phone_number": attrs.get("sip.trunkPhoneNumber", ""),
                "sip_call_status": attrs.get("sip.callStatus", ""),
            }
    return {}


def _parse_job_metadata(metadata_str: str) -> dict:
    """Parse job metadata JSON from dispatch rule. Returns {} on empty or invalid."""
    if not (metadata_str or metadata_str.strip()):
        return {}
    try:
        return json.loads(metadata_str)
    except (json.JSONDecodeError, TypeError):
        return {}


def _get_backend_url() -> str:
    return (
        os.environ.get("VITE_ECHO_AGENT_URL") or os.environ.get("ECHOPRISM_AGENT_URL") or DEFAULT_AGENT_BACKEND_URL
    ).rstrip("/")


def _phone_log_token(phone: str) -> str:
    """Avoid raw phone numbers in central logs; keep last digits for support correlation."""
    p = (phone or "").strip()
    digits = "".join(c for c in p if c.isdigit())
    if len(digits) < 4:
        return "redacted-phone"
    return f"phone_last4={digits[-4:]}"


def _uid_log_token(uid: str) -> str:
    if not uid:
        return "(none)"
    digest = hashlib.sha256(uid.encode("utf-8")).hexdigest()
    return f"uid_hash={digest[:16]}"


async def _lookup_user_by_phone(phone: str) -> tuple[dict | None, str]:
    """Call EchoPrism GET /api/livekit/user-by-phone. Returns (user_dict or None, status_for_logging)."""
    phone = (phone or "").strip()
    if not phone:
        return None, "no_phone"
    url = f"{_get_backend_url()}/api/livekit/user-by-phone"
    secret = os.environ.get("LIVEKIT_AGENT_SECRET", "")
    if not secret:
        _logger.info("[EchoPrism] user-by-phone skipped: LIVEKIT_AGENT_SECRET not set")
        return None, "no_secret"
    try:
        async with httpx.AsyncClient(timeout=USER_BY_PHONE_HTTP_TIMEOUT_S) as client:
            resp = await client.get(
                url,
                params={"phone": phone},
                headers={"X-Agent-Secret": secret},
            )
            if resp.status_code == 200:
                return resp.json(), "ok"
            _logger.info(
                "[EchoPrism] user-by-phone lookup returned %s for %s (no match in Firestore?)",
                resp.status_code,
                _phone_log_token(phone),
            )
            return None, f"http_{resp.status_code}"
    except Exception as e:
        _logger.info(
            "[EchoPrism] user-by-phone lookup error for %s: %s",
            _phone_log_token(phone),
            e,
        )
        return None, "error"


@server.rtc_session(agent_name="echoprism-agent")
async def entrypoint(ctx: agents.JobContext):
    import time

    from echo_prism_agent.voice.livekit.agent import LiveKitEchoPrismAgent

    # Deferred imports — keep worker IPC init under timeout on slow machines (see AgentServer above).
    from livekit.plugins import google

    t_entry = time.perf_counter()
    # Each new call is fresh: clear any resolved user for this room (in case of reuse or stale state)
    phone_lookup.clear_resolved_user(ctx.room.name)
    # Unconditional stderr print so we always see something in dev when this worker gets a job
    print(
        "[EchoPrism] Agent dispatch -> entrypoint: job received",
        flush=True,
        file=sys.stderr,
    )
    _logger.info("[EchoPrism] Agent dispatch -> entrypoint: job received")

    # Observability: set log context early (room name; SIP call ID added after connect)
    ctx.log_context_fields = {"room_name": ctx.room.name}

    session = AgentSession(
        llm=google.realtime.RealtimeModel(
            model=VOICE_MODEL,
            voice=os.environ.get("ECHOPRISM_VOICE", DEFAULT_ECHOPRISM_VOICE),
            temperature=LIVEKIT_REALTIME_TEMPERATURE,
        ),
        # Treat every interrupt as final — never resume old speech.
        resume_false_interruption=False,
        false_interruption_timeout=None,
    )
    # Audio input: pre-connect for low latency; telephony noise cancellation when available
    audio_input_kw: dict = {
        "pre_connect_audio": True,
        "pre_connect_audio_timeout": PRE_CONNECT_AUDIO_TIMEOUT_S,
    }
    if _noise_cancellation_for_participant is not None:
        audio_input_kw["noise_cancellation"] = _noise_cancellation_for_participant
    await session.start(
        room=ctx.room,
        agent=LiveKitEchoPrismAgent(),
        room_options=room_io.RoomOptions(
            video_input=True,
            audio_input=room_io.AudioInputOptions(**audio_input_kw),
        ),
    )
    t_session_started = time.perf_counter()
    _logger.info(
        "[EchoPrism] session.start() completed in %.0fms",
        (t_session_started - t_entry) * 1000,
    )

    await ctx.connect()
    t_connected = time.perf_counter()
    _logger.info(
        "[EchoPrism] ctx.connect() completed in %.0fms (total since entry: %.0fms)",
        (t_connected - t_session_started) * 1000,
        (t_connected - t_entry) * 1000,
    )

    # Telephony: SIP caller context and job metadata from dispatch rule
    sip_ctx = _get_sip_context(ctx.room)
    job_metadata = _parse_job_metadata(getattr(ctx.job, "metadata", "") or "")
    sip_phone = sip_ctx.get("sip_phone_number", "")
    sip_phone_log = _phone_log_token(sip_phone) if sip_phone else "(empty)"
    sip_call = sip_ctx.get("sip_call_id") or "(none)"
    sip_msg = f"[EchoPrism] SIP context: sip_call_id={sip_call} caller_phone={sip_phone_log}"
    print(sip_msg, flush=True, file=sys.stderr)
    _logger.info(
        "[EchoPrism] SIP context: sip_call_id=%s caller_phone=%s (match Firestore users/{uid}.phone to this caller)",
        sip_ctx.get("sip_call_id") or "(none)",
        sip_phone_log,
    )
    if sip_ctx.get("sip_call_id"):
        ctx.log_context_fields = {
            **ctx.log_context_fields,
            "sip_call_id": sip_ctx["sip_call_id"],
        }
        # Optional: last-4 of caller for support (avoid full PII in logs)
        phone = sip_ctx.get("sip_phone_number", "")
        if len(phone) >= 4:
            ctx.log_context_fields["caller_phone_last4"] = phone[-4:]
        trunk_raw = sip_ctx.get("sip_trunk_phone_number", "")
        _logger.info(
            "[EchoPrism] SIP call sip_call_id=%s trunk_phone=%s",
            sip_ctx.get("sip_call_id", ""),
            _phone_log_token(trunk_raw) if trunk_raw else "(empty)",
        )
        # Phone → user lookup for personalization (greeting + tools use resolved uid)
        if phone:
            user, status = await _lookup_user_by_phone(phone)
            if not user and status not in ("no_phone", "no_secret"):
                await asyncio.sleep(0.5)
                user, status = await _lookup_user_by_phone(phone)
            if user:
                uid = user.get("uid", "")
                display_name = user.get("displayName") or ""
                if uid:
                    phone_lookup.set_resolved_user(ctx.room.name, uid, display_name)
                    _logger.info(
                        "[EchoPrism] Resolved caller to user %s",
                        _uid_log_token(uid),
                    )
            else:
                _logger.info(
                    "[EchoPrism] Caller not recognized (user-by-phone %s). Ensure Firestore users/{uid}.phone matches the caller number.",
                    status,
                )

    # DTMF: log keypad input for observability and future IVR
    try:

        @ctx.room.on("sip_dtmf_received")
        def _on_dtmf(dtmf):
            participant_identity = getattr(getattr(dtmf, "participant", None), "identity", "")
            code = getattr(dtmf, "code", "")
            _logger.info(
                "[EchoPrism] DTMF from %s: code=%s digit=<redacted>",
                participant_identity,
                code,
            )

    except Exception as e:
        _logger.debug("[EchoPrism] DTMF handler not registered: %s", e)

    # Check if this is a voice interruption session and adjust accordingly
    interruption_attrs: dict[str, str] = {}
    for p in ctx.room.remote_participants.values():
        attrs = p.attributes or {}
        if attrs.get("mode") == "voice-interruption":
            interruption_attrs = dict(attrs)
            break

    if interruption_attrs:
        recent_context = interruption_attrs.get("recent_context", "")
        interruption_instructions = INTERRUPTION_SYSTEM_PROMPT_PREFIX + ECHOPRISM_SYSTEM_PROMPT
        try:
            await session.update_instructions(interruption_instructions)
        except Exception:
            pass  # Not all SDK versions expose this; graceful fallback

    # RPC so the client can interrupt when user speaks during agent speech (barge-in)
    @ctx.room.local_participant.register_rpc_method("interrupt")
    async def _handle_interrupt(_data):
        session.interrupt()
        return "ok"

    # Server-side barge-in for telephony: when a remote participant (SIP caller) is active speaker, interrupt agent
    # so the caller can talk over the agent without needing a desktop client to send the RPC.
    _barge_in_cooldown_until = [0.0]
    _greeting_playout_until = [0.0]  # no barge-in before this time (so greeting isn't cut off at the start)

    def _on_active_speakers_changed(speakers: list) -> None:
        try:
            now = time.monotonic()
            if now < _greeting_playout_until[0] or now < _barge_in_cooldown_until[0]:
                return
            remote = set(ctx.room.remote_participants.values())
            for p in speakers:
                if p in remote:
                    session.interrupt()
                    _barge_in_cooldown_until[0] = now + 1.5
                    _logger.debug("[EchoPrism] Barge-in: remote participant speaking, interrupted")
                    break
        except Exception as e:
            _logger.debug("[EchoPrism] Barge-in handler error: %s", e)

    try:
        ctx.room.on("active_speakers_changed", _on_active_speakers_changed)
    except Exception as e:
        _logger.debug("[EchoPrism] active_speakers_changed not registered: %s", e)

    def _on_room_disconnected(_reason: str = "") -> None:
        room_name = getattr(ctx.room, "name", None)
        if room_name:
            phone_lookup.clear_resolved_user(room_name)
            _logger.debug("[EchoPrism] Cleared resolved user for room %s on disconnect", room_name)

    try:
        ctx.room.on("disconnected", _on_room_disconnected)
    except Exception as e:
        _logger.debug("[EchoPrism] disconnected handler not registered: %s", e)

    # Greeting: tailored for SIP (telephony), voice-interruption, or web/desktop
    t_before_greeting = time.perf_counter()
    if interruption_attrs:
        recent_context = interruption_attrs.get("recent_context", "")
        greeting_instructions = (
            "Greet the user very briefly. Acknowledge that the workflow is paused. "
            + (f"The most recent activity was: {recent_context}. " if recent_context else "")
            + "Ask what guidance they'd like to give or if they just want to resume."
        )
    elif sip_ctx:
        # Telephony: personalized greeting when caller is resolved, else concise generic
        display_name = phone_lookup.get_resolved_display_name(ctx.room.name)
        phone = sip_ctx.get("sip_phone_number", "")
        area_code = ""
        if len(phone) >= 10 and phone.startswith("+1"):
            area_code = phone[2:5]  # US +1 XXX
        campaign = job_metadata.get("campaign", "") or job_metadata.get("source", "")
        if display_name:
            greeting_instructions = (
                f"Say briefly: Hi {display_name}, thanks for calling Echo. I'm EchoPrism. "
                "How can I help you with your workflows today?"
            )
        elif area_code:
            greeting_instructions = (
                "Say briefly: Thanks for calling Echo. I'm EchoPrism. "
                f"You're calling from area code {area_code}. "
                "How can I help you with workflows today?"
            )
        elif campaign:
            greeting_instructions = (
                f"Say briefly: Thanks for calling Echo. I'm EchoPrism (campaign: {campaign}). "
                "How can I help you with workflows today?"
            )
        else:
            greeting_instructions = (
                "Say briefly: Thanks for calling Echo. I'm EchoPrism. How can I help you with workflows today?"
            )
    else:
        greeting_instructions = "Greet the user and offer your assistance with workflows and Echo."

    # Don't barge-in during the first few seconds of greeting so the full sentence plays
    _greeting_playout_until[0] = time.monotonic() + 4.0
    handle = session.generate_reply(instructions=greeting_instructions)
    if handle:
        await handle.wait_for_playout()
        t_greeting_done = time.perf_counter()
        _logger.info(
            "[EchoPrism] Greeting playout done in %.0fms (total since entry: %.0fms)",
            (t_greeting_done - t_before_greeting) * 1000,
            (t_greeting_done - t_entry) * 1000,
        )


if __name__ == "__main__":
    agents.cli.run_app(server)
