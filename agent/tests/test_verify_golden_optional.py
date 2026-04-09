"""
Optional golden assets for GUI verify regression (disabled until fixtures are committed).

Enable by adding ``agent/tests/fixtures/verify_before.png`` and ``verify_after.png``.
"""
from __future__ import annotations

from pathlib import Path

import pytest

_FIX = Path(__file__).resolve().parent / "fixtures"


@pytest.mark.skipif(
    not (_FIX / "verify_before.png").is_file() or not (_FIX / "verify_after.png").is_file(),
    reason="Golden PNG fixtures not present",
)
@pytest.mark.asyncio
async def test_verify_state_transition_with_golden_pair() -> None:
    """When fixtures exist, ensure verify pipeline runs without raising."""
    before = (_FIX / "verify_before.png").read_bytes()
    after = (_FIX / "verify_after.png").read_bytes()
    from echo_prism_agent.agent import verify_state_transition

    _desc, ok = await verify_state_transition(
        before_bytes=before,
        after_bytes=after,
        action_str="click",
        expected_outcome="",
        api_key="",
    )
    assert isinstance(ok, bool)
