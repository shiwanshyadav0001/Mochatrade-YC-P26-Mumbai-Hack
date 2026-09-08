import json
import time

import pytest
from fastapi.testclient import TestClient

import auth
import main


USERS = {
    "admin": {"role": "ADMIN", "password_hash": auth.hash_password("admin-pass", salt=b"admin-salt-123456")},
    "viewer": {"role": "VIEWER", "password_hash": auth.hash_password("viewer-pass", salt=b"viewer-salt-12345")},
}


def has_auth_dependency(dependency) -> bool:
    return dependency.call is auth.get_current_actor or any(
        has_auth_dependency(child) for child in dependency.dependencies
    )


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("NETRA_JWT_SECRET", "test-only-signing-secret")
    monkeypatch.setenv("NETRA_AUTH_USERS_JSON", json.dumps(USERS))
    return TestClient(main.app)


def token(client: TestClient, username: str = "admin", password: str = "admin-pass") -> str:
    response = client.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def test_login_issues_signed_token_and_health_reports_authentication(client):
    response = client.post("/api/auth/login", json={"username": "admin", "password": "admin-pass"})

    assert response.status_code == 200
    assert response.json()["token_type"] == "bearer"
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["authentication_enabled"] is True
    assert health.json()["rbac_enabled"] is True


def test_role_header_cannot_spoof_authentication(client):
    response = client.get("/api/policies", headers={"X-Actor-Role": "ADMIN", "X-Actor-Id": "attacker"})

    assert response.status_code == 401


def test_invalid_and_expired_tokens_are_rejected(client):
    invalid = client.get("/api/policies", headers={"Authorization": "Bearer invalid"})
    assert invalid.status_code == 401

    expired, _ = auth.create_access_token({"actor_id": "admin", "role": "ADMIN"}, now=int(time.time()) - auth.TOKEN_TTL_SECONDS - 1)
    expired_response = client.get("/api/policies", headers={"Authorization": f"Bearer {expired}"})
    assert expired_response.status_code == 401


def test_tampered_signature_is_rejected(client):
    signed = token(client)
    tampered = f"{signed[:-1]}{'A' if signed[-1] != 'A' else 'B'}"

    response = client.get("/api/policies", headers={"Authorization": f"Bearer {tampered}"})

    assert response.status_code == 401


def test_authenticated_role_controls_protected_write(client):
    viewer_response = client.put(
        "/api/policies",
        headers={"Authorization": f"Bearer {token(client, 'viewer', 'viewer-pass')}"},
        json={"trust_bands": {"allow": 90}},
    )
    assert viewer_response.status_code == 403

    admin_response = client.get(
        "/api/policies",
        headers={"Authorization": f"Bearer {token(client)}"},
    )
    assert admin_response.status_code == 200


def test_all_sensitive_routes_have_authentication_dependency():
    protected_paths = {
        "/api/events",
        "/api/traders",
        "/api/traders/{trader_id}",
        "/api/traders/{trader_id}/risk",
        "/api/traders/{trader_id}/timeline",
        "/api/traders/{trader_id}/events",
        "/api/traders/{trader_id}/graph",
        "/api/traders/{trader_id}/step-up",
        "/api/risk-events",
        "/api/decisions",
        "/api/decisions/{decision_id}",
        "/api/cases",
        "/api/cases/{case_id}",
        "/api/cases/{case_id}/dossier",
        "/api/audit",
        "/api/policies",
        "/api/policy/simulate",
        "/api/search",
        "/api/sequences",
        "/api/simulator/step",
        "/api/simulator/run",
        "/api/simulator/reset",
        "/api/analytics",
    }

    route_paths = {route.path for route in main.app.routes}
    assert protected_paths <= route_paths

    for route in main.app.routes:
        if route.path not in protected_paths:
            continue
        assert has_auth_dependency(route.dependant), route.path
