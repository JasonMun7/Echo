"""Langfuse helpers must no-op without credentials."""

import echo_prism_agent.composio_integration.langfuse_tracing as lf_mod


def test_langfuse_disabled_without_secret(monkeypatch) -> None:
    monkeypatch.delenv("LANGFUSE_SECRET_KEY", raising=False)
    monkeypatch.setenv("LANGFUSE_ENABLED", "1")
    lf_mod._langfuse = None  # type: ignore[attr-defined]
    assert lf_mod.langfuse_enabled() is False
    assert lf_mod._get_langfuse() is None  # type: ignore[attr-defined]
    assert lf_mod.get_chat_system_instruction().startswith("You are EchoPrism")


def test_chat_turn_span_noops_when_disabled(monkeypatch) -> None:
    monkeypatch.delenv("LANGFUSE_SECRET_KEY", raising=False)
    lf_mod._langfuse = None  # type: ignore[attr-defined]
    with lf_mod.chat_turn_span(uid="u1", model="m") as span:
        assert span is None
