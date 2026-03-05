"""Pytest fixtures for Echo backend tests."""
import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.fixture
def client() -> TestClient:
    """FastAPI TestClient for making requests to the app."""
    return TestClient(app)
