"""Tests for Anthropic ↔ OpenAI tool schema mapping (OpenRouter / Kimi path)."""

from __future__ import annotations

import pytest

pytest.importorskip("echo_prism_agent.muscle")

from echo_prism_agent.muscle.kimi_openrouter_adapter import (
    anthropic_messages_to_openai,
    anthropic_tools_to_openai,
    messages_contain_anthropic_api_shapes,
    normalize_tool_choice_for_openai,
    openai_assistant_message_to_anthropic_style_dict,
)


def test_anthropic_tools_to_openai() -> None:
    tools = [
        {
            "name": "click",
            "description": "Click",
            "input_schema": {"type": "object", "properties": {"x": {"type": "integer"}}},
        }
    ]
    out = anthropic_tools_to_openai(tools)
    assert out is not None
    assert out[0]["type"] == "function"
    assert out[0]["function"]["name"] == "click"
    assert out[0]["function"]["parameters"]["type"] == "object"


def test_normalize_tool_choice() -> None:
    assert normalize_tool_choice_for_openai({"type": "any"}) == "required"
    assert normalize_tool_choice_for_openai(None) == "auto"


class _Msg:
    def __init__(self, content: str | None, tool_calls: list | None = None) -> None:
        self.content = content
        self.tool_calls = tool_calls or []


class _TC:
    def __init__(self, id: str, name: str, arguments: str) -> None:
        self.id = id
        self.function = type("fn", (), {"name": name, "arguments": arguments})()


def test_openai_to_anthropic_style_tool_use() -> None:
    msg = _Msg(
        None,
        tool_calls=[_TC("call_1", "done", "{}")],
    )
    d = openai_assistant_message_to_anthropic_style_dict(msg)
    assert d["content"][0]["type"] == "tool_use"
    assert d["content"][0]["name"] == "done"


def test_messages_contain_anthropic_shapes() -> None:
    assert not messages_contain_anthropic_api_shapes([{"role": "user", "content": "hi"}])
    assert messages_contain_anthropic_api_shapes(
        [
            {
                "role": "system",
                "content": [{"type": "text", "text": "sys"}],
            }
        ]
    )
    assert messages_contain_anthropic_api_shapes(
        [
            {
                "role": "user",
                "content": [
                    {"type": "tool_result", "tool_use_id": "x", "content": "ok"},
                ],
            }
        ]
    )


def test_anthropic_messages_to_openai_tool_round() -> None:
    msgs = [
        {"role": "system", "content": [{"type": "text", "text": "You verify."}]},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Task"},
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": "AAA",
                    },
                },
            ],
        },
        {
            "role": "assistant",
            "content": [
                {"type": "text", "text": "ok"},
                {
                    "type": "tool_use",
                    "id": "call_abc",
                    "name": "report_verification_result",
                    "input": {"conclusion": "SUCCESS", "explanation": "done"},
                },
            ],
        },
        {
            "role": "user",
            "content": [
                {
                    "type": "tool_result",
                    "tool_use_id": "call_abc",
                    "content": '{"conclusion": "SUCCESS"}',
                }
            ],
        },
    ]
    oa = anthropic_messages_to_openai(msgs)
    assert oa[0]["role"] == "system" and isinstance(oa[0]["content"], str)
    assert oa[1]["role"] == "user" and isinstance(oa[1]["content"], list)
    assert oa[1]["content"][1]["type"] == "image_url"
    assert oa[2]["role"] == "assistant" and "tool_calls" in oa[2]
    assert oa[3]["role"] == "tool" and oa[3]["tool_call_id"] == "call_abc"
