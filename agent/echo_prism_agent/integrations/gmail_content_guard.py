"""
Heuristic guard: block ``gmail_send`` when the body looks like a *task prompt* without concrete data.

Workflow ``api_call`` steps are deterministic — the VLM does not fill ``args.body`` at send time.
Users often synthesize \"Please find the top 5 stocks…\" without prior steps that embed the list.
"""
from __future__ import annotations

import re

# Requests for figures/lists/facts (broad but avoids blocking \"Happy birthday\").
_DATA_INTENT = re.compile(
    r"\b("
    r"stock|stocks|ticker|tickers|performing|portfolio|market\s+data|ranking|rankings|"
    r"quotes?|indices?|crypto|bitcoin|dividend|earnings|metrics?|figures?|statistics|"
    r"top\s+\d+|latest\s+data|based\s+on\s+the\s+latest"
    r")\b",
    re.IGNORECASE,
)

# Looks like a prompt to the assistant, not user-facing copy.
_PROMPTY = re.compile(
    r"(please\s+find|find\s+the\s+top|based\s+on\s+the\s+latest\s+market|"
    r"extract\s+the|list\s+them\s+here|according\s+to\s+the\s+latest)",
    re.IGNORECASE,
)


def _scrub_ranking_phrase_digits(s: str) -> str:
    """
    Remove ranking/count phrases like "top 5", "first 3", or "last 2" from the input string.
    
    Parameters:
        s (str): Text to process.
    
    Returns:
        str: The input text with case-insensitive occurrences of "top|first|last <number>" removed.
    """
    return re.sub(r"\b(?:top|first|last)\s+\d+\b", "", s, flags=re.IGNORECASE)


def gmail_send_body_likely_missing_requested_data(body: str, subject: str) -> bool:
    """
    Decides whether an email send should be blocked because the message appears to request data but lacks concrete figures or list structure.
    
    Flags short, prompt-like messages that match data-intent keywords (subject or body) but do not contain percentages, decimal numbers, currency amounts, ticker-like uppercase tokens, other digits, or enough list-like lines to indicate substantive data.
    
    Returns:
        True if the message should be blocked because it likely still looks like a prompt requesting data, False otherwise.
    """
    text = f"{subject or ''}\n{body or ''}".strip()
    if not _DATA_INTENT.search(text):
        return False
    b = (body or "").strip()
    if not b:
        return True
    b2 = _scrub_ranking_phrase_digits(b)
    # Substantive figures: percentages, decimals, currency, or multiple ticker-like tokens
    if re.search(r"\d+\s*%|\d+[.,]\d+|[\$€£]\s*\d", b2):
        return False
    if re.search(r"\b[A-Z]{2,5}(?:\s*[, ]\s*[A-Z]{2,5})+", b2):
        return False
    if re.search(r"\d", b2):
        return False
    lines = [ln.strip() for ln in b.splitlines() if ln.strip()]
    if len(lines) >= 4:
        return False
    # Several short lines often = list items with symbols/dashes
    if len(lines) >= 3 and any(re.search(r"^[-*•\d]+", ln) for ln in lines):
        return False
    if _PROMPTY.search(b) and len(b) < 1200 and len(lines) <= 3:
        return True
    return False


def gmail_data_guard_error_message() -> str:
    """
    Provide the user-facing error message shown when a gmail_send is blocked because the message body appears to be a prompt requesting data without concrete facts.
    
    The message explains that the agent does not populate data at send time, suggests gathering and merging concrete data into `params.args.body` (or splitting into multiple runs), and notes that the guard can be bypassed by setting `params.args.skip_data_guard` to true after review.
    
    Returns:
        str: The formatted error message to display to the user.
    """
    return (
        "gmail_send blocked: the message body still looks like a **prompt** (asking for data) without "
        "**concrete facts** (numbers, tickers, bullet list). `api_call` uses workflow args as-is—the agent "
        "does not fill in stock prices at send time. **Fix:** add earlier steps (browser, scroll, read screen) "
        "to gather data, merge the text into `params.args.body`, or split into multiple runs. "
        "**If this draft is intentional,** set `params.args.skip_data_guard` to true on the `gmail_send` step "
        "(only after you have reviewed the text)."
    )
