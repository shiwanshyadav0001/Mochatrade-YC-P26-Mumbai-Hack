import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient

import main as main_module
from main import app


def _payload(text: str, from_number: str = "919999999999") -> dict:
    return {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "test_entry",
                "changes": [
                    {
                        "field": "messages",
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {"display_phone_number": "123", "phone_number_id": "test_phone_id"},
                            "messages": [
                                {
                                    "from": from_number,
                                    "id": "wamid.test123",
                                    "timestamp": "1234567890",
                                    "type": "text",
                                    "text": {"body": text},
                                }
                            ],
                        },
                    }
                ],
            }
        ],
    }


def _interactive_payload(title: str, reply_id: str, from_number: str = "919999999999") -> dict:
    return {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "test_entry",
                "changes": [
                    {
                        "field": "messages",
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {"display_phone_number": "123", "phone_number_id": "test_phone_id"},
                            "messages": [
                                {
                                    "from": from_number,
                                    "id": "wamid.test123",
                                    "timestamp": "1234567890",
                                    "type": "interactive",
                                    "interactive": {
                                        "type": "list_reply",
                                        "list_reply": {"id": reply_id, "title": title, "description": ""},
                                    },
                                }
                            ],
                        },
                    }
                ],
            }
        ],
    }


def test_webhook_verification_success(monkeypatch):
    monkeypatch.setenv("WHATSAPP_VERIFY_TOKEN", "test_verify_token")
    c = TestClient(app)
    resp = c.get("/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=test_verify_token&hub.challenge=12345")
    assert resp.status_code == 200
    assert resp.text == "12345"


def test_webhook_verification_failure(monkeypatch):
    monkeypatch.setenv("WHATSAPP_VERIFY_TOKEN", "correct_token")
    c = TestClient(app)
    resp = c.get("/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=12345")
    assert resp.status_code == 403


def test_webhook_verification_missing_token(monkeypatch):
    monkeypatch.delenv("WHATSAPP_VERIFY_TOKEN", raising=False)
    c = TestClient(app)
    resp = c.get("/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=any&hub.challenge=12345")
    # Should be 500 because not configured
    assert resp.status_code in (500, 403)


def test_webhook_health(monkeypatch):
    monkeypatch.setenv("WHATSAPP_VERIFY_TOKEN", "tok")
    monkeypatch.setenv("WHATSAPP_ACCESS_TOKEN", "acc")
    monkeypatch.setenv("WHATSAPP_PHONE_NUMBER_ID", "pid")
    c = TestClient(app)
    resp = c.get("/api/whatsapp/health")
    assert resp.status_code == 200
    data = resp.json()
    assert "configured" in data
    assert data["has_verify_token"] is True


def test_incoming_hi(monkeypatch):
    # Mock sending to avoid real HTTP
    calls = []

    async def mock_send(to, payload):
        calls.append((to, payload))
        return {"messages": [{"id": "wamid.mock"}]}

    monkeypatch.setattr("whatsapp._send_whatsapp_message", mock_send)
    monkeypatch.setenv("WHATSAPP_VERIFY_TOKEN", "tok")
    c = TestClient(app)
    resp = c.post("/api/whatsapp/webhook", json=_payload("Hi"))
    assert resp.status_code == 200
    import whatsapp as wa

    route = wa._route_message_text("Hi")
    assert route == "hi"
    intro = wa._format_intro()
    assert "NETRA" in intro
    assert "Run Flagship Demo" in intro


def test_route_flagship():
    import whatsapp as wa

    assert wa._route_message_text("1") == "1"
    assert wa._route_message_text("Run Flagship Demo") == "1"
    assert wa._route_message_text("flagship") == "1"


def test_route_attack():
    import whatsapp as wa

    assert wa._route_message_text("2") == "2"
    assert wa._route_message_text("Run Attack Scenario") == "2"


def test_incoming_trading_safety_quick_actions():
    import whatsapp as wa

    assert wa._route_message_text("Trade $2K") == "trade_2k"
    assert wa._route_message_text("Withdraw $25K") == "withdraw_25k"
    assert wa._route_message_text("Leverage 50x") == "leverage_50x"


def test_flagship_demo_reuses_engine(monkeypatch):
    import whatsapp as wa

    # Ensure demo uses real engine and returns 3 messages
    msgs = wa._format_flagship_demo()
    assert len(msgs) == 3
    assert any("EVENT" in m for m in msgs)
    assert any("AUDIT" in m for m in msgs)
    # Check that it used real trust values (94 -> low)
    assert any("94" in m for m in msgs)


def test_attack_scenario_reuses_engine():
    import whatsapp as wa

    msgs = wa._format_attack_scenario()
    assert len(msgs) == 3
    assert any("TRUST" in m for m in msgs)


def test_legitimate_travel_reuses_engine():
    import whatsapp as wa

    msg = wa._format_legitimate_travel()
    assert "Legitimate Travel" in msg or "Travel" in msg
    # Travel may be ALLOW or MONITOR depending on engine state, but should not be BLOCK/RESTRICT
    assert any(x in msg for x in ("ALLOW", "MONITOR"))


def test_trader_risk_reuses_engine():
    import whatsapp as wa

    msg = wa._format_trader_risk("7842")
    assert "Trader Risk" in msg
    assert "Trust" in msg
    # Check that it reflects actual trader state
    assert "#7842" in msg


def test_trading_safety_evaluates_via_engine():
    import whatsapp as wa

    msg = wa._handle_trading_action("Trade $2K")
    assert "Trading Safety" in msg
    assert "Trust" in msg
    # Test that different amounts produce different decisions
    msg_small = wa._handle_trading_action("Trade $2K")
    msg_large = wa._handle_trading_action("Withdraw $25K")
    assert msg_small != msg_large


def test_observatory_reuses_engine():
    import whatsapp as wa

    msg = wa._format_observatory()
    assert "Observatory" in msg
    assert "Surveillance" in msg


def test_protocols_reuses_engine():
    import whatsapp as wa

    msg = wa._format_protocols()
    assert "Protocols" in msg
    assert "P-01" in msg


def test_audit_reuses_engine():
    import whatsapp as wa

    msg = wa._format_audit()
    assert "Audit" in msg
    assert "SHA-256" in msg or "SHA" in msg


def test_incoming_invalid_returns_menu(monkeypatch):
    import whatsapp as wa

    calls = []

    async def mock_send(to, payload):
        calls.append(payload)
        return {"messages": [{"id": "wamid.mock"}]}

    monkeypatch.setattr("whatsapp._send_whatsapp_message", mock_send)
    route = wa._route_message_text("blablabla unknown command")
    assert route == "unknown"
    c = TestClient(app)
    resp = c.post("/api/whatsapp/webhook", json=_payload("blablabla"))
    assert resp.status_code == 200


def test_signature_verification(monkeypatch):
    import whatsapp as wa

    secret = "test_secret_123"
    payload = b'{"test": "data"}'
    correct_sig = "sha256=" + hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    assert wa._verify_signature(payload, correct_sig, secret) is True
    assert wa._verify_signature(payload, "sha256=wrong", secret) is False
    # No secret -> always true
    assert wa._verify_signature(payload, None, None) is True
    assert wa._verify_signature(payload, "sha256=anything", None) is True


def test_webhook_signature_invalid(monkeypatch):
    monkeypatch.setenv("WHATSAPP_APP_SECRET", "mysecret")
    payload = json.dumps(_payload("Hi")).encode()
    sig = "sha256=" + hmac.new(b"mysecret", payload, hashlib.sha256).hexdigest()
    c = TestClient(app)
    resp = c.post(
        "/api/whatsapp/webhook",
        content=payload,
        headers={"Content-Type": "application/json", "X-Hub-Signature-256": sig},
    )
    assert resp.status_code == 200
    resp2 = c.post(
        "/api/whatsapp/webhook",
        content=payload,
        headers={"Content-Type": "application/json", "X-Hub-Signature-256": "sha256=invalid"},
    )
    assert resp2.status_code == 403
    monkeypatch.delenv("WHATSAPP_APP_SECRET", raising=False)


def test_missing_credentials_graceful(monkeypatch):
    # When not configured, _send should return None gracefully
    monkeypatch.delenv("WHATSAPP_ACCESS_TOKEN", raising=False)
    monkeypatch.delenv("WHATSAPP_PHONE_NUMBER_ID", raising=False)
    import whatsapp as wa
    import asyncio

    # Should not raise, just return None
    result = asyncio.run(wa._send_whatsapp_message("123", {"type": "text", "text": {"body": "hi"}}))
    assert result is None


def test_api_failure_handling(monkeypatch):
    # Mock httpx to simulate API failure
    monkeypatch.setenv("WHATSAPP_ACCESS_TOKEN", "fake_token")
    monkeypatch.setenv("WHATSAPP_PHONE_NUMBER_ID", "123")
    import whatsapp as wa

    class MockResp:
        status_code = 500
        text = "Internal Server Error"

        def json(self):
            return {}

    class MockClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def post(self, *args, **kwargs):
            return MockResp()

    monkeypatch.setattr("whatsapp.httpx.AsyncClient", lambda timeout=10: MockClient())
    import asyncio

    result = asyncio.run(wa._send_whatsapp_message("123", {"type": "text", "text": {"body": "hi"}}))
    assert result is None


def test_webhook_handles_non_message_events():
    c = TestClient(app)
    payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "test",
                "changes": [
                    {
                        "field": "messages",
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {"display_phone_number": "123", "phone_number_id": "pid"},
                            "statuses": [{"id": "wamid.status", "status": "delivered"}],
                        },
                    }
                ],
            }
        ],
    }
    resp = c.post("/api/whatsapp/webhook", json=payload)
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_interactive_message_parsing():
    import whatsapp as wa

    payload = _interactive_payload("Run Flagship Demo", "1")
    from_num, text = wa._get_user_text(payload)
    assert from_num == "919999999999"
    assert text == "1"
    # Also test button title fallback
    assert wa._route_message_text(text) == "1"


def test_operator_notify_endpoint():
    c = TestClient(app)
    # 1. Security Alert
    resp = c.post(
        "/api/whatsapp/notify",
        json={"trader_id": "7842", "notification_type": "SECURITY_ALERT", "details": "Elevated test risk"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "SENT"
    assert data["notification_type"] == "SECURITY_ALERT"
    assert data["trader_id"] == "7842"

    # 2. Protocol activation
    resp = c.post(
        "/api/whatsapp/notify",
        json={"trader_id": "7842", "notification_type": "PROTOCOL_ACTIVATION", "protocol_id": "P-03"},
    )
    assert resp.status_code == 200
    assert resp.json()["notification_type"] == "PROTOCOL_ACTIVATION"

    # 3. Recovery instructions
    resp = c.post(
        "/api/whatsapp/notify",
        json={"trader_id": "7842", "notification_type": "RECOVERY", "recovery_code": "849201"},
    )
    assert resp.status_code == 200
    assert resp.json()["notification_type"] == "RECOVERY"


def test_recovery_verification_via_whatsapp():
    import whatsapp as wa

    # Valid demo recovery challenge code
    res_valid = wa._handle_recovery_verification("verify 849201", trader_id="7842")
    assert "Verification Successful" in res_valid
    assert "SESSION_MONITORED" in res_valid

    # Invalid code
    res_invalid = wa._handle_recovery_verification("verify 000000", trader_id="7842")
    assert "Verification Failed" in res_invalid
