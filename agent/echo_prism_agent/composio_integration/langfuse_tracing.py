"""Optional Langfuse tracing for Composio, chat turns, HITL, scores, and prompt management."""

from __future__ import annotations

import hashlib
import logging
import os
import random
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

logger = logging.getLogger(__name__)

_langfuse: Any = None


def _env_flag(name: str, default: str = "1") -> bool:
    v = (os.getenv(name) if os.getenv(name) is not None else default).strip().lower()
    return v not in ("0", "false", "no", "")


def langfuse_enabled() -> bool:
    """True when Langfuse should emit events (master switch + secret key)."""
    if not _env_flag("LANGFUSE_ENABLED", "1"):
        return False
    return bool((os.getenv("LANGFUSE_SECRET_KEY") or "").strip())


def _sample_allow() -> bool:
    try:
        rate = float((os.getenv("LANGFUSE_SAMPLE_RATE") or "1").strip())
    except ValueError:
        rate = 1.0
    rate = max(0.0, min(1.0, rate))
    if rate >= 1.0:
        return True
    return random.random() < rate


def _get_langfuse() -> Any:
    global _langfuse
    if not langfuse_enabled():
        return None
    if _langfuse is not None:
        return _langfuse if _langfuse is not False else None
    try:
        from langfuse import Langfuse

        _host = (
            (os.getenv("LANGFUSE_BASE_URL") or os.getenv("LANGFUSE_HOST") or "https://cloud.langfuse.com")
            .strip()
            .rstrip("/")
        )
        _langfuse = Langfuse(
            public_key=(os.getenv("LANGFUSE_PUBLIC_KEY") or "").strip() or None,
            secret_key=(os.getenv("LANGFUSE_SECRET_KEY") or "").strip(),
            host=_host,
        )
    except Exception as e:
        logger.debug("Langfuse init skipped: %s", e)
        _langfuse = False  # type: ignore[assignment]
    return _langfuse if _langfuse is not False else None


def _prompt_debug_payload(text: str) -> dict[str, Any]:
    """Structured summary for Langfuse (avoid logging full prompts unless debug)."""
    raw = text or ""
    if _env_flag("LANGFUSE_DEBUG_PROMPTS", "0"):
        return {"chars": len(raw), "sha256_16": hashlib.sha256(raw.encode()).hexdigest()[:16], "preview": raw[:500]}
    return {"chars": len(raw), "sha256_16": hashlib.sha256(raw.encode()).hexdigest()[:16]}


def get_chat_system_instruction() -> str:
    """
    Chat system prompt: Langfuse Prompt Management when configured, else ``model_prompts.CHAT_SYSTEM_PROMPT``.

    Env:
    - ``LANGFUSE_CHAT_SYSTEM_PROMPT_NAME`` (default ``echo-chat-system``)
    - ``LANGFUSE_PROMPT_LABEL`` (default ``production``)
    """
    from echo_prism_agent.model_prompts import CHAT_SYSTEM_PROMPT

    lf = _get_langfuse()
    if not lf:
        return CHAT_SYSTEM_PROMPT
    name = (os.getenv("LANGFUSE_CHAT_SYSTEM_PROMPT_NAME") or "echo-chat-system").strip()
    label = (os.getenv("LANGFUSE_PROMPT_LABEL") or "production").strip()
    try:
        p = lf.get_prompt(name, label=label, type="text", fallback=CHAT_SYSTEM_PROMPT)
        text = getattr(p, "prompt", None) or str(p)
        return str(text)
    except Exception as e:
        logger.debug("Langfuse get_prompt failed: %s", e)
        return CHAT_SYSTEM_PROMPT


@contextmanager
def chat_turn_span(*, uid: str, model: str) -> Iterator[Any]:
    """Parent span for one user-message / tool loop (nests Composio child observations when active)."""
    from echo_prism_agent.model_prompts import CHAT_SYSTEM_PROMPT

    lf = _get_langfuse()
    if not lf or not _env_flag("LANGFUSE_TRACE_CHAT", "1"):
        yield None
        return
    if not _sample_allow():
        yield None
        return
    try:
        with lf.start_as_current_observation(
            name="echo.chat_turn",
            as_type="span",
            input={
                "model": model,
                "uid_prefix": (uid or "")[:8],
                "prompt_summary": _prompt_debug_payload(CHAT_SYSTEM_PROMPT),
            },
        ) as obs:
            yield obs
    except Exception as e:
        logger.debug("Langfuse chat span failed: %s", e)
        yield None


def maybe_score_tool_result(*, tool_name: str, ok: bool, latency_ms: float | None = None) -> None:
    """Attach a numeric score to the current trace (tool success / latency bucket)."""
    lf = _get_langfuse()
    if not lf:
        return
    try:
        lf.score_current_trace(
            name="tool_success",
            value=1.0 if ok else 0.0,
            data_type="NUMERIC",
            metadata={"tool": tool_name, "latency_ms": latency_ms},
        )
    except Exception as e:
        logger.debug("Langfuse score failed: %s", e)


@contextmanager
def composio_span(*, uid: str, slug: str, hitl: str | None = None) -> Iterator[Any]:
    """Observation around Composio execution (``tools.execute`` or meta-tool invoke)."""
    lf = _get_langfuse()
    if not lf:
        yield None
        return
    try:
        with lf.start_as_current_observation(
            name="composio.execute",
            as_type="tool",
            input={"slug": slug, "uid_prefix": (uid or "")[:8], "hitl": hitl},
        ) as obs:
            yield obs
    except Exception as e:
        logger.debug("Langfuse observation failed: %s", e)
        yield None


def trace_hitl_decision(*, slug: str, branch: str, uid: str) -> None:
    lf = _get_langfuse()
    if not lf:
        return
    try:
        lf.create_event(
            name="hitl.branch",
            input={"slug": slug, "branch": branch, "uid_prefix": (uid or "")[:8]},
        )
    except Exception as e:
        logger.debug("Langfuse event failed: %s", e)


def trace_composio_meta_path(*, uid: str, tool_name: str) -> None:
    """Lightweight breadcrumb when the chat path uses Composio Tool Router meta tools."""
    lf = _get_langfuse()
    if not lf:
        return
    try:
        lf.create_event(
            name="composio.meta_tool",
            input={"tool": tool_name, "uid_prefix": (uid or "")[:8]},
        )
    except Exception as e:
        logger.debug("Langfuse meta path event failed: %s", e)
