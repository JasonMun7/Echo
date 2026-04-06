"""OpenRouter chat/completions (HTTP) for UI-TARS vision models — mirrors UI-TARS-desktop ``UITarsModel`` + OpenRouter."""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
from typing import Any

import requests

from echo_prism_agent.constants import (
    OPENROUTER_BASE_URL_DEFAULT,
    effective_ui_tars_model_id,
    OPENROUTER_HTTP_REFERER_DEFAULT,
    OPENROUTER_TITLE_DEFAULT,
)

logger = logging.getLogger(__name__)


def system_prompt_suffix() -> str:
    """Append when ``ECHOPRISM_VLM_SYSTEM_SUFFIX`` or legacy ``UI_TARS_PROVIDER_PROFILE`` is set."""
    extra = (os.environ.get("ECHOPRISM_VLM_SYSTEM_SUFFIX") or "").strip()
    if extra:
        return f"\n\n{extra}"
    profile = (os.environ.get("UI_TARS_PROVIDER_PROFILE") or "").strip()
    if not profile:
        return ""
    return (
        f"\n\n## VLM provider profile\n"
        f"Follow UI-TARS conventions for profile `{profile}` "
        f"(coordinate frame 0–1000, Thought/Action lines).\n"
    )


def _data_url_for_image(data: bytes) -> str:
    b64 = base64.standard_b64encode(data).decode("ascii")
    if len(data) >= 8 and data[:8] == b"\x89PNG\r\n\x1a\n":
        mime = "image/png"
    elif len(data) >= 2 and data[:2] == b"\xff\xd8":
        mime = "image/jpeg"
    elif len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        mime = "image/webp"
    else:
        mime = "image/png"
    return f"data:{mime};base64,{b64}"


def _post_chat_completions(
    *,
    url: str,
    headers: dict[str, str],
    payload: dict[str, Any],
    timeout: float,
) -> requests.Response:
    return requests.post(
        url,
        headers=headers,
        data=json.dumps(payload),
        timeout=timeout,
    )


async def chat_completions_vision(
    *,
    system: str,
    user_text: str,
    image_png_bytes: bytes,
    extra_image_parts: list[bytes] | None = None,
) -> tuple[str | None, str | None]:
    """
    Call OpenRouter ``/chat/completions`` with one primary screenshot + optional extras.

    Defaults follow UI-TARS-desktop ``UITarsModel`` / ``Model.ts`` (temperature 0, top_p 0.7,
    OpenAI-compatible client pointed at OpenRouter).
    """
    api_key = (os.environ.get("OPENROUTER_API_KEY") or "").strip()
    if not api_key:
        return None, "OPENROUTER_API_KEY not set"

    system = system + system_prompt_suffix()

    model = effective_ui_tars_model_id()
    base = (os.environ.get("OPENROUTER_BASE_URL") or OPENROUTER_BASE_URL_DEFAULT).rstrip("/")
    chat_url = f"{base}/chat/completions"

    content: list[dict[str, Any]] = [
        {"type": "text", "text": user_text},
        {"type": "image_url", "image_url": {"url": _data_url_for_image(image_png_bytes)}},
    ]
    if extra_image_parts:
        for img in extra_image_parts[: max(0, int(os.environ.get("ECHOPRISM_OPENROUTER_EXTRA_IMAGES_MAX", "4") or 4))]:
            content.append({"type": "image_url", "image_url": {"url": _data_url_for_image(img)}})

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": os.environ.get("OPENROUTER_HTTP_REFERER", OPENROUTER_HTTP_REFERER_DEFAULT),
        "X-Title": os.environ.get("OPENROUTER_TITLE", OPENROUTER_TITLE_DEFAULT),
        "X-OpenRouter-Title": os.environ.get("OPENROUTER_TITLE", OPENROUTER_TITLE_DEFAULT),
    }

    # UI-TARS-desktop ``UITarsModel`` uses temperature=0, top_p=0.7 by default.
    temperature = float(os.environ.get("ECHOPRISM_OPENROUTER_TEMPERATURE", "0"))
    top_p = float(os.environ.get("ECHOPRISM_OPENROUTER_TOP_P", "0.7"))
    max_tokens = int(
        os.environ.get(
            "ECHOPRISM_OPENROUTER_MAX_TOKENS",
            os.environ.get("ECHOPRISM_OPENROUTER_MAX_TOKENS_1_5", "2048"),
        )
        or 2048
    )

    payload: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": content},
        ],
        "temperature": temperature,
        "top_p": top_p,
        "max_tokens": max_tokens,
    }

    timeout = float(os.environ.get("ECHOPRISM_OPENROUTER_TIMEOUT_S", "120"))

    try:
        r = await asyncio.to_thread(
            _post_chat_completions,
            url=chat_url,
            headers=headers,
            payload=payload,
            timeout=timeout,
        )
    except requests.RequestException as e:
        logger.exception("OpenRouter request failed")
        return None, str(e)
    except Exception as e:
        logger.exception("OpenRouter request failed")
        return None, str(e)

    if not r.ok:
        logger.warning("OpenRouter HTTP error: %s %s", r.status_code, (r.text or "")[:500])
        return None, f"OpenRouter HTTP {r.status_code}: {(r.text or '')[:200]}"

    try:
        data = r.json()
    except json.JSONDecodeError as e:
        return None, f"OpenRouter: invalid JSON: {e}"

    try:
        choices = data.get("choices") or []
        if not choices:
            return None, "OpenRouter: empty choices"
        msg = choices[0].get("message") or {}
        text = msg.get("content")
        if isinstance(text, list):
            text = "".join(
                p.get("text", "") if isinstance(p, dict) else str(p) for p in text
            )
        if not text:
            return None, "OpenRouter: no assistant text"
        return str(text).strip(), None
    except Exception as e:
        return None, f"OpenRouter parse error: {e}"
