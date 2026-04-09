"""
LangGraph gate for api_call: human approval, then Auth0 Token Vault / OAuth if needed.

Uses ``interrupt()`` so the host can confirm the API call, open Universal Login when
necessary, then ``Command(resume=...)`` to continue. See LangGraph interrupt docs:
https://docs.langchain.com/oss/python/langgraph/interrupts
"""
from __future__ import annotations

import json
import logging
from typing import Any, TypedDict

from langgraph.checkpoint.memory import MemorySaver
from langgraph.config import get_config
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt

from echo_prism_agent.auth0_token_vault import normalize_integration_id
from echo_prism_agent.execution.operator import execute_api_call

logger = logging.getLogger(__name__)

_checkpointer: MemorySaver | None = None
_compiled: Any = None


class ApiCallGateState(TypedDict, total=False):
    """Checkpointed state (JSON-serializable)."""

    step: dict[str, Any]
    ok: bool
    error: str | None


def _args_preview(params: dict[str, Any], max_len: int = 500) -> str:
    raw = params.get("args", {}) or {}
    try:
        s = json.dumps(raw, indent=None, default=str, ensure_ascii=False)
    except Exception:
        s = str(raw)
    if len(s) > max_len:
        return s[: max_len - 3] + "..."
    return s


def _approval_accepted(approval: Any) -> bool:
    """Resume value from client: truthy / {approved: true} proceeds; False / {approved: false} rejects."""
    if approval is False:
        return False
    if isinstance(approval, dict):
        if approval.get("approved") is False:
            return False
        if approval.get("rejected") is True:
            return False
    return True


async def api_call_gate_node(state: ApiCallGateState) -> dict[str, Any]:
    """
    Ask the user to approve an API call, execute the call if approved, and trigger an integration-auth interrupt when the execution reports missing OAuth credentials.
    
    Parameters:
        state (ApiCallGateState): Checkpointed node state containing an optional `step` dict with `params` for the API call.
    
    Returns:
        dict[str, Any]: Result object with keys:
            - `ok` (bool): `True` when the API call succeeded, `False` otherwise.
            - `error` (str | None): `None` on success; an error message describing the failure on `False`.
    """
    try:
        raw = get_config()
    except Exception:
        raw = {}
    cfg = raw.get("configurable") or {}
    graph_meta = raw.get("metadata") or {}
    uid_raw = cfg.get("uid") or graph_meta.get("uid")
    uid = (uid_raw or "").strip() if isinstance(uid_raw, str) else str(uid_raw or "").strip()
    db = cfg.get("db")
    wf_id = (cfg.get("workflow_id") or "").strip() if isinstance(cfg.get("workflow_id"), str) else ""
    rn_id = (cfg.get("run_id") or "").strip() if isinstance(cfg.get("run_id"), str) else ""
    step = state.get("step") or {}
    if not isinstance(uid, str) or not uid.strip():
        return {"ok": False, "error": "missing uid in config.configurable"}
    if db is None:
        return {"ok": False, "error": "missing db in config.configurable"}

    params = step.get("params", {}) or {}
    integration = normalize_integration_id(params.get("integration") or "")
    method = (params.get("method") or "").strip()
    preview = _args_preview(params)

    approval = interrupt(
        {
            "kind": "api_call_approval",
            "integration": integration or (params.get("integration") or ""),
            "method": method,
            "args_preview": preview,
            "message": f"Approve API call: {integration}.{method}" if integration and method else "Approve API call",
        }
    )
    if not _approval_accepted(approval):
        return {"ok": False, "error": "API call rejected by user"}

    ok, err, meta = await execute_api_call(
        step,
        uid,
        db,
        workflow_id=wf_id or None,
        run_id=rn_id or None,
    )
    if ok:
        return {"ok": True, "error": None}

    if meta and meta.get("integration_auth_required"):
        interrupt(
            {
                "kind": "integration_auth",
                "integration": meta.get("integration"),
                "auth0_linked": meta.get("auth0_linked"),
                "connect_kind": meta.get("connect_kind"),
                "message": err or "",
            }
        )
    return {"ok": False, "error": err or "api_call failed"}


def build_api_call_gate_graph() -> StateGraph:
    g = StateGraph(ApiCallGateState)
    g.add_node("gate", api_call_gate_node)
    g.add_edge(START, "gate")
    g.add_edge("gate", END)
    return g


def get_api_call_gate_graph() -> Any:
    """
    Provide a singleton compiled StateGraph configured with an in-memory checkpointer.
    
    Persistence note: The checkpointer is a process-lifetime MemorySaver. For durable human-in-the-loop resume across instance restarts, replace the checkpointer with a LangGraph-backed persistent store (e.g., Firestore or Redis) when compiling the same graph definition.
    
    Returns:
        The compiled StateGraph instance for the API call gate.
    """
    global _checkpointer, _compiled
    if _compiled is None:
        _checkpointer = MemorySaver()
        _compiled = build_api_call_gate_graph().compile(checkpointer=_checkpointer)
    return _compiled
