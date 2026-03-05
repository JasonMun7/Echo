"""Health endpoint and connectivity tests."""
import pytest
from fastapi.testclient import TestClient


def test_health_returns_ok(client: TestClient) -> None:
    """GET /health returns 200 and status ok."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data == {"status": "ok"}


def test_health_no_auth_required(client: TestClient) -> None:
    """Health endpoint does not require authentication."""
    response = client.get("/health", headers={})
    assert response.status_code == 200
