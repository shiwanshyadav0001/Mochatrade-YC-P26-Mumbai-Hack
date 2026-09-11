import json
import time

import pytest
from fastapi.testclient import TestClient

import auth
import main


USERS = {
    "admin": {"role": "ADMIN", "password_hash": auth.hash_password("admin-pass", salt=b"admin-salt-123456")},
    "analyst": {"role": "RISK_ANALYST", "password_hash": auth.hash_password("analyst-pass", salt=b"analyst-salt-123456")},
    "investigator": {"role": "INVESTIGATOR", "password_hash": auth.hash_password("investigator-pass", salt=b"invest-salt-123456")},
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
    assert response.status_code == 200, f"Login failed for {username}: {response.text}"
    return response.json()["access_token"]


def test_login_issues_signed_token_and_health_reports_authentication(client):
    for username, password, expected_role in [
        ("admin", "admin-pass", "ADMIN"),
        ("analyst", "analyst-pass", "RISK_ANALYST"),
        ("investigator", "investigator-pass", "INVESTIGATOR"),
        ("viewer", "viewer-pass", "VIEWER"),
    ]:
        response = client.post("/api/auth/login", json={"username": username, "password": password})
        assert response.status_code == 200
        data = response.json()
        assert data["token_type"] == "bearer"
        assert data["role"] == expected_role
        assert data["actor_id"] == username
        assert "access_token" in data
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


def test_all_roles_can_access_primary_intelligence_endpoint_groups(client):
    """Verifies that ADMIN, RISK_ANALYST, INVESTIGATOR, and VIEWER can each access the required endpoints:

    /api/traders, /api/analytics, /api/cases, /api/audit, /api/policies, /api/decisions, /api/events, /api/risk-events, /api/graph/system.
    """
    required_paths = [
        "/api/traders",
        "/api/analytics",
        "/api/cases",
        "/api/audit",
        "/api/policies",
        "/api/decisions",
        "/api/events",
        "/api/risk-events",
        "/api/graph/system",
    ]
    for username, password, role in [
        ("admin", "admin-pass", "ADMIN"),
        ("analyst", "analyst-pass", "RISK_ANALYST"),
        ("investigator", "investigator-pass", "INVESTIGATOR"),
        ("viewer", "viewer-pass", "VIEWER"),
    ]:
        tok = token(client, username, password)
        headers = {"Authorization": f"Bearer {tok}"}
        for path in required_paths:
            res = client.get(path, headers=headers)
            assert res.status_code == 200, f"Role {role} failed GET {path}: {res.status_code} {res.text}"


def test_role_switching_and_session_continuity(client):
    """Verifies that an operator can switch between roles and have distinct permissions applied."""
    # 1. Login as RISK_ANALYST and verify token works
    analyst_tok = token(client, "analyst", "analyst-pass")
    analyst_headers = {"Authorization": f"Bearer {analyst_tok}"}
    r = client.get("/api/traders", headers=analyst_headers)
    assert r.status_code == 200

    # RISK_ANALYST cannot modify policy
    policy_res = client.put("/api/policies", headers=analyst_headers, json={"trust_bands": {"allow": 95}})
    assert policy_res.status_code == 403

    # 2. Switch session to ADMIN and verify policy modification succeeds
    admin_tok = token(client, "admin", "admin-pass")
    admin_headers = {"Authorization": f"Bearer {admin_tok}"}
    policy_admin_res = client.put("/api/policies", headers=admin_headers, json={"trust_bands": {"allow": 90}})
    assert policy_admin_res.status_code == 200

    # 3. Switch session to VIEWER and verify all mutation endpoints are blocked
    viewer_tok = token(client, "viewer", "viewer-pass")
    viewer_headers = {"Authorization": f"Bearer {viewer_tok}"}
    ev_res = client.post("/api/events", headers=viewer_headers, json={"trader_id": "7842", "event_type": "TRADE"})
    assert ev_res.status_code == 403
    case_res = client.post("/api/cases", headers=viewer_headers, json={"trader_id": "7842", "reason": "Test"})
    assert case_res.status_code == 403


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
