"""Workflow API tests with mocked auth and Firestore."""
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from main import app
from app.auth import get_current_uid, get_current_user


def mock_get_current_uid() -> str:
    return "test-uid-123"


def mock_get_current_user() -> dict:
    return {"uid": "test-uid-123"}


@pytest.fixture
def mock_firestore():
    """Mock Firestore to avoid real Firebase/Firestore connection."""
    mock_doc = MagicMock()
    mock_doc.id = "wf-1"
    mock_doc.to_dict.return_value = {
        "owner_uid": "test-uid-123",
        "name": "Test Workflow",
        "status": "draft",
    }
    mock_stream = MagicMock(return_value=iter([mock_doc]))
    mock_query = MagicMock()
    mock_query.stream = mock_stream
    mock_collection = MagicMock()
    mock_collection.where.return_value = mock_query
    mock_db = MagicMock()
    mock_db.collection.return_value = mock_collection
    return mock_db


@pytest.fixture
def client_with_auth(mock_firestore):
    """TestClient with overridden auth and mocked Firestore."""
    app.dependency_overrides[get_current_user] = mock_get_current_user
    app.dependency_overrides[get_current_uid] = mock_get_current_uid
    with patch("app.routers.workflows.firebase_admin.firestore.client", return_value=mock_firestore):
        with patch("app.routers.workflows.get_firebase_app"):
            with TestClient(app) as c:
                yield c
    app.dependency_overrides.clear()


def test_list_workflows_returns_200_with_mock_auth(client_with_auth: TestClient) -> None:
    """GET /api/workflows returns 200 and workflows list when auth is mocked."""
    response = client_with_auth.get(
        "/api/workflows",
        headers={"Authorization": "Bearer fake-token"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "workflows" in data
    assert isinstance(data["workflows"], list)


def test_workflows_requires_auth(client: TestClient) -> None:
    """GET /api/workflows returns 401 without Authorization header."""
    response = client.get("/api/workflows")
    assert response.status_code == 401
