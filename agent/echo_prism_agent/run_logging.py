"""
Structured run context for log lines (workflow_id, run_id, step_index, uid hash).
"""
from __future__ import annotations

import hashlib


def _uid_tag(uid: str | None) -> str:
    """
    Produce a stable 8-character UID tag suitable for inclusion in log prefixes.
    
    If `uid` is falsy (None or empty), returns "uid=-". Otherwise returns "uid=<8hex>" where `<8hex>` is the first eight hex characters of the SHA-256 hash of `uid`.
    
    Parameters:
        uid (str | None): Optional UID to encode into the tag.
    
    Returns:
        str: The UID tag string, either "uid=-" or "uid=<8hex>".
    """
    if not uid:
        return "uid=-"
    h = hashlib.sha256(uid.encode("utf-8")).hexdigest()[:8]
    return f"uid={h}"


def run_log_prefix(
    workflow_id: str | None,
    run_id: str | None,
    *,
    step_index: int | None = None,
    uid: str | None = None,
) -> str:
    """
    Builds a structured log prefix for a run in the form: [echo_run wf=<12chars|-> run=<12chars|-> (optional step=<1-based>) uid=<8hex|->].
    
    Parameters:
        workflow_id (str | None): Workflow identifier; treated as "-" when missing and truncated to the first 12 characters for display.
        run_id (str | None): Run identifier; treated as "-" when missing and truncated to the first 12 characters for display.
        step_index (int | None): Zero-based step index; when provided the prefix includes `step=<step_index + 1>` (one-based).
        uid (str | None): Optional UID; rendered as `uid=-` when missing or as `uid=<8-hex>` where the value is the first 8 hex characters of the SHA-256 hash of the UID.
    
    Returns:
        str: The formatted prefix string, e.g. "[echo_run wf=abcdef run=123456 step=2 uid=1a2b3c4d]".
    """
    wf = (workflow_id or "-")[:12]
    rn = (run_id or "-")[:12]
    bits = [f"wf={wf}", f"run={rn}"]
    if step_index is not None:
        bits.append(f"step={step_index + 1}")
    bits.append(_uid_tag(uid))
    return "[echo_run " + " ".join(bits) + "]"
