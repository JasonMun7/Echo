import pytest

pytest.importorskip("echo_prism_agent.muscle")

from echo_prism_agent.muscle.muscle_output_mapper import muscle_step_to_parsed


def test_muscle_done_to_finished() -> None:
    p = muscle_step_to_parsed({"plan": "TOOL_USE name=done input={}"}, [])
    assert p.get("action") == "finished"


def test_muscle_click_parse() -> None:
    p = muscle_step_to_parsed({"plan": "x"}, ["pyautogui.click(100, 200)"])
    assert p.get("action") == "click"
    assert p.get("x") == 100


def test_muscle_openapp_parse() -> None:
    p = muscle_step_to_parsed({"plan": ""}, ['OpenApp("Messages")'])
    assert p.get("action") == "openapp"
    assert p.get("appName") == "Messages"


def test_muscle_sleep_fallback_wait() -> None:
    p = muscle_step_to_parsed({"plan": ""}, ["import time; time.sleep(1.333)"])
    assert p.get("action") == "wait"
    assert p.get("seconds") == 1.333
