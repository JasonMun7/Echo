"""
LangGraph gate for api_call: human approval for sensitive Composio tools, then execute.

Uses ``interrupt()`` so the host can confirm dangerous calls; safe reads execute without approval.
https://docs.langchain.com/oss/python/langgraph/interrupts
"""

from __future__ import annotations

import json
import logging
from typing import Any, TypedDict

from echo_prism_agent.composio_integration.danger import is_dangerous_composio_slug
from echo_prism_agent.composio_integration.langfuse_tracing import trace_hitl_decision
from echo_prism_agent.composio_integration.slugs import resolve_composio_slug
from echo_prism_agent.execution.operator import execute_api_call
from langgraph.checkpoint.memory import MemorySaver
from langgraph.config import get_config
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt

logger = logging.getLogger(__name__)

_checkpointer: MemorySaver | None = None
_compiled: Any = None


class ApiCallGateState(TypedDict, total=False):
    """Checkpointed state (JSON-serializable)."""

    step: dict[str, Any]
    ok: bool
    error: str | None


def _args_preview(params: dict[str, Any], max_len: int = 500) -> str:
    raw = params.get("arguments")
    if raw is None:
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


def _short_description_for_slug(slug: str) -> str:
    s = (slug or "").replace("_", " ").strip()
    return f"Composio tool {s}"[:200]


async def api_call_gate_node(state: ApiCallGateState) -> dict[str, Any]:
    """
    Optionally ask the user to approve the api_call (dangerous Composio tools only), then run ``execute_api_call``.
    If integration OAuth is missing, ``interrupt`` again with integration_auth payload.
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
    slug, toolkit, rerr = resolve_composio_slug(params)
    if rerr or not slug:
        return {"ok": False, "error": rerr or "could not resolve Composio slug"}

    preview = _args_preview(params)
    tk = toolkit or ""
    integration = (params.get("integration") or "").strip() or tk
    method = (params.get("method") or "").strip() or slug

    dangerous = is_dangerous_composio_slug(slug)
    if dangerous:
        trace_hitl_decision(slug=slug, branch="dangerous_gate", uid=uid)
        approval = interrupt(
            {
                "kind": "api_call_approval",
                "composio_slug": slug,
                "toolkit": tk,
                "integration": integration,
                "method": method,
                "args_preview": preview,
                "short_description": _short_description_for_slug(slug),
                "requires_approval_reason": "sensitive_action",
                "message": f"Confirm sensitive action: {slug}",
            }
        )
        if not _approval_accepted(approval):
            trace_hitl_decision(slug=slug, branch="rejected", uid=uid)
            return {"ok": False, "error": "API call rejected by user"}
        trace_hitl_decision(slug=slug, branch="approved", uid=uid)
    else:
        trace_hitl_decision(slug=slug, branch="safe_skip_gate", uid=uid)

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
                "integration": meta.get("integration") or toolkit or "",
                "toolkit": meta.get("toolkit") or toolkit or "",
                "composio_slug": meta.get("composio_slug") or slug,
                "composio_connect_url": meta.get("composio_connect_url"),
                "connect_kind": meta.get("connect_kind") or "composio_oauth",
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
    Singleton compiled graph with in-memory checkpointer (per process).

    **Persistence note:** ``MemorySaver`` only survives process lifetime. For durable
    HITL resume across Cloud Run instance restarts, swap in a LangGraph checkpointer
    backed by Firestore, Redis, or another shared store—same graph definition, different
    checkpointer. That is a dedicated migration; do not enable lightly.
    """
    global _checkpointer, _compiled
    if _compiled is None:
        _checkpointer = MemorySaver()
        _compiled = build_api_call_gate_graph().compile(checkpointer=_checkpointer)
    return _compiled
