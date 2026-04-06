"""LangGraph api_call gate: approval interrupt, then OAuth interrupt, resume retries execute_api_call."""

from __future__ import annotations

from typing import Any

import pytest
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import Command

from echo_prism_agent.hitl.api_call_gate import build_api_call_gate_graph


@pytest.mark.asyncio
async def test_api_call_gate_approval_then_oauth_then_succeeds(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[int] = []

    async def execute_twice(
        step: dict[str, Any], uid: str, db: Any
    ) -> tuple[bool, str, dict[str, Any] | None]:
        calls.append(1)
        if len(calls) == 1:
            return (
                False,
                "not connected",
                {
                    "integration_auth_required": True,
                    "integration": "slack",
                    "auth0_linked": True,
                    "connect_kind": "connect_integration",
                },
            )
        return True, "", None

    monkeypatch.setattr(
        "echo_prism_agent.hitl.api_call_gate.execute_api_call",
        execute_twice,
    )

    g = build_api_call_gate_graph().compile(checkpointer=MemorySaver())
    cfg = {
        "configurable": {
            "thread_id": "test-thread-api-gate",
            "uid": "u1",
            "db": object(),
        }
    }
    step = {"params": {"integration": "slack", "method": "post_message", "args": {}}}

    r1 = await g.ainvoke({"step": step}, config=cfg)
    assert r1.get("__interrupt__")
    assert calls == []

    r2 = await g.ainvoke(Command(resume=True), config=cfg)
    assert r2.get("__interrupt__")
    assert calls == [1]

    r3 = await g.ainvoke(Command(resume=True), config=cfg)
    assert r3.get("ok") is True
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_api_call_gate_rejects_on_approval_false(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def never_called(
        step: dict[str, Any], uid: str, db: Any
    ) -> tuple[bool, str, dict[str, Any] | None]:
        raise AssertionError("execute_api_call should not run after reject")

    monkeypatch.setattr(
        "echo_prism_agent.hitl.api_call_gate.execute_api_call",
        never_called,
    )

    g = build_api_call_gate_graph().compile(checkpointer=MemorySaver())
    cfg = {
        "configurable": {
            "thread_id": "test-thread-reject",
            "uid": "u1",
            "db": object(),
        }
    }
    step = {"params": {"integration": "slack", "method": "post_message", "args": {}}}

    r1 = await g.ainvoke({"step": step}, config=cfg)
    assert r1.get("__interrupt__")

    r2 = await g.ainvoke(Command(resume={"approved": False}), config=cfg)
    assert r2.get("ok") is False
    assert "rejected" in (r2.get("error") or "").lower()
