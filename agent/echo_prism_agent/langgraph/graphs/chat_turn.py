"""Chat turn graph builder."""

from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from echo_prism_agent.langgraph.nodes.chat_turn import chat_turn_node
from echo_prism_agent.langgraph.state.schemas import ChatTurnState


def build_chat_turn_graph() -> StateGraph:
    g = StateGraph(ChatTurnState)
    g.add_node("turn", chat_turn_node)
    g.add_edge(START, "turn")
    g.add_edge("turn", END)
    return g
