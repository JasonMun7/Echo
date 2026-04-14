"""api_call synthesis appendix documents Composio slug + arguments."""

from echo_prism_agent.integrations.api_call_catalog import (
    API_CALL_SYNTHESIS_APPENDIX,
    build_api_call_reference_for_llm,
)


def test_catalog_describes_composio_slug_shape() -> None:
    text = build_api_call_reference_for_llm()
    assert '"slug"' in text
    assert "COMPOSIO_TOOL_SLUG" in text
    assert '"arguments"' in text
    assert "Composio" in text


def test_module_level_appendix_matches_builder() -> None:
    assert API_CALL_SYNTHESIS_APPENDIX == build_api_call_reference_for_llm()
