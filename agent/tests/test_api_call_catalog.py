"""api_call synthesis catalog stays aligned with connector METHODS."""

from echo_prism_agent.integrations import github, google, slack
from echo_prism_agent.integrations.api_call_catalog import (
    API_CALL_SYNTHESIS_APPENDIX,
    build_api_call_reference_for_llm,
)


def test_catalog_lists_all_method_names() -> None:
    text = build_api_call_reference_for_llm()
    for name in slack.METHODS:
        assert f'method "{name}"' in text
    for name in github.METHODS:
        assert f'method "{name}"' in text
    for name in google.METHODS:
        assert f'method "{name}"' in text
    assert "slack" in text and "github" in text and "google" in text


def test_module_level_appendix_matches_builder() -> None:
    assert API_CALL_SYNTHESIS_APPENDIX == build_api_call_reference_for_llm()
