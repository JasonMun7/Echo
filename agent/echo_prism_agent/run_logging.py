"""
Structured run context for log lines (workflow_id, run_id, step_index, uid hash).
"""

from __future__ import annotations

import hashlib


def _uid_tag(uid: str | None) -> str:
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
    """Prefix for filtering: ``[echo_run wf=... run=... step=N uid=abcd1234]``."""
    wf = (workflow_id or "-")[:12]
    rn = (run_id or "-")[:12]
    bits = [f"wf={wf}", f"run={rn}"]
    if step_index is not None:
        bits.append(f"step={step_index + 1}")
    bits.append(_uid_tag(uid))
    return "[echo_run " + " ".join(bits) + "]"
