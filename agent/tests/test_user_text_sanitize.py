"""VLM placeholder stripping for API payloads."""

from echo_prism_agent.integrations.user_text_sanitize import (
    sanitize_api_call_string_args,
    strip_vlm_placeholders,
)


def test_strip_vlm_placeholders_removes_bracket_block() -> None:
    raw = (
        "Please find the top 5 stocks.\n\n"
        "[VLM: Extract the top 5 stock tickers, names, and % change from the screen and list them here]"
    )
    out = strip_vlm_placeholders(raw)
    assert "[VLM:" not in out
    assert "top 5 stocks" in out.lower() or "Please find" in out


def test_strip_vlm_case_insensitive() -> None:
    assert "[vlm: x]" not in strip_vlm_placeholders("Hello [vLm: do thing]")


def test_sanitize_api_call_args_targets_content_keys() -> None:
    args = {
        "to": "a@b.com",
        "body": "Hi [VLM: ignore me]",
        "subject": "Subj [VLM: x]",
    }
    s = sanitize_api_call_string_args(args)
    assert s["to"] == "a@b.com"
    assert "[VLM:" not in s["body"]
    assert "[VLM:" not in s["subject"]
