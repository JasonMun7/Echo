"""Gmail send guard: prompt-like bodies without data."""

from echo_prism_agent.integrations.gmail_content_guard import (
    gmail_send_body_likely_missing_requested_data,
)


def test_blocks_prompt_only_stock_email() -> None:
    body = "Please find the top 5 performing stocks today based on the latest market data:\n\n"
    assert gmail_send_body_likely_missing_requested_data(body, "Stocks") is True


def test_allows_when_digits_present() -> None:
    body = "Top picks: AAPL +2.3%, MSFT +1.1%"
    assert gmail_send_body_likely_missing_requested_data(body, "Hi") is False


def test_allows_non_data_email() -> None:
    assert gmail_send_body_likely_missing_requested_data("See you Friday.", "Lunch") is False


def test_allows_multiline_list_without_digits() -> None:
    body = "- Apple\n- Banana\n- Cherry\n- Date\n- Elderberry"
    assert gmail_send_body_likely_missing_requested_data(body, "Groceries") is False
