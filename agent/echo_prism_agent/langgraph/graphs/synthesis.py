"""Synthesis graph builder."""

from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from echo_prism_agent.langgraph.nodes.synthesis import synthesis_node
from echo_prism_agent.langgraph.state.schemas import SynthesisGraphState


def build_synthesis_graph() -> StateGraph:
    g = StateGraph(SynthesisGraphState)
    g.add_node("synthesize", synthesis_node)
    g.add_edge(START, "synthesize")
    g.add_edge("synthesize", END)
    return g
