"""OpenRouter chat/completions (HTTP) for UI-Tars vision models."""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
from typing import Any

import requests

logger = logging.getLogger(__name__)


def system_prompt_suffix() -> str:
    """Append when `UI_TARS_PROVIDER_PROFILE` is set (e.g. ui-tars-1.5/v1_5)."""
    profile = (os.environ.get("UI_TARS_PROVIDER_PROFILE") or "").strip()
    if not profile:
        return ""
    return (
        f"\n\n## VLM provider profile\n"
        f"Follow UI-TARS conventions for profile `{profile}` "
        f"(coordinate frame 0–1000, Thought/Action lines).\n"
    )


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
    Call OpenRouter chat/completions with one primary screenshot + optional extra images.
    Returns (assistant_text, error_message).
    """
    api_key = (os.environ.get("OPENROUTER_API_KEY") or "").strip()
    if not api_key:
        return None, "OPENROUTER_API_KEY not set"

    system = system + system_prompt_suffix()

    model = os.environ.get("UI_TARS_MODEL_ID", "bytedance/ui-tars-1.5-7b")
    base = (os.environ.get("OPENROUTER_BASE_URL") or "https://openrouter.ai/api/v1").rstrip("/")
    chat_url = f"{base}/chat/completions"

    def _b64(data: bytes) -> str:
        return base64.standard_b64encode(data).decode("ascii")

    content: list[dict[str, Any]] = [
        {"type": "text", "text": user_text},
        {
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{_b64(image_png_bytes)}"},
        },
    ]
    if extra_image_parts:
        for img in extra_image_parts[:2]:
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{_b64(img)}"},
                }
            )

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": os.environ.get("OPENROUTER_HTTP_REFERER", "https://echo.local"),
        "X-OpenRouter-Title": os.environ.get("OPENROUTER_TITLE", "Echo Prism LangGraph"),
    }

    payload: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": content},
        ],
        "temperature": float(os.environ.get("ECHOPRISM_OPENROUTER_TEMPERATURE", "0.2")),
        "max_tokens": int(os.environ.get("ECHOPRISM_OPENROUTER_MAX_TOKENS", "1024")),
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
