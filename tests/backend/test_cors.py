"""CORS policy tests - verify allowed origins and preflight."""
import pytest
from fastapi.testclient import TestClient


ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]


@pytest.mark.parametrize("origin", ALLOWED_ORIGINS)
def test_cors_allows_origin_on_get(origin: str, client: TestClient) -> None:
    """CORS allows GET requests from localhost:3000 and localhost:5173."""
    response = client.get("/health", headers={"Origin": origin})
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == origin


@pytest.mark.parametrize("origin", ALLOWED_ORIGINS)
def test_cors_allows_origin_on_options_preflight(origin: str, client: TestClient) -> None:
    """CORS OPTIONS preflight returns Access-Control-Allow-Origin for allowed origins."""
    response = client.options(
        "/health",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.headers.get("access-control-allow-origin") == origin
    assert "access-control-allow-credentials" in [
        h.lower() for h in response.headers
    ] or "access-control-allow-credentials" in response.headers


def test_cors_credentials_allowed(client: TestClient) -> None:
    """CORS allows credentials (allow_credentials=True)."""
    response = client.get(
        "/health",
        headers={"Origin": "http://localhost:3000"},
    )
    assert response.headers.get("access-control-allow-credentials") == "true"


def test_cors_api_endpoint_has_cors_headers(client: TestClient) -> None:
    """API endpoints receive CORS headers (401 expected without auth)."""
    response = client.get(
        "/api/workflows",
        headers={"Origin": "http://localhost:3000"},
    )
    assert "access-control-allow-origin" in [
        h.lower() for h in response.headers
    ] or "access-control-allow-origin" in response.headers
