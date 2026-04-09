"""LangGraph thread_id helpers for inference tracing."""

from echo_prism_agent.agent import _inference_thread_id


def test_inference_thread_id_unique_per_run():
    assert _inference_thread_id("wf", "run-a", 1) != _inference_thread_id("wf", "run-b", 1)
    assert _inference_thread_id("wf", "run-a", 1).endswith("-s1")
    assert "-typetext-retry" in _inference_thread_id(
        "wf", "run-a", 1, retry_suffix="-typetext-retry"
    )
