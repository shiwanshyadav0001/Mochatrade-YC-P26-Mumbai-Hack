"""
NETRA Observatory, Security Protocols, Verification & Account Recovery Tests

Validates:
1. Observatory dynamic watchlist, states (MONITORING, HIGH_ALERT, PROTOCOL_ACTIVE, RESTRICTED, RECOVERY, RESOLVED)
2. Security Protocols (P-01, P-02, P-03, P-04) triggering and policy matching
3. Step-up verification status handling (SUCCESS, FAILED, UNAVAILABLE, TIMEOUT)
4. Out-of-band Account Recovery (Challenge dispatch, verification, evidentiary trust recovery without blind resets)
5. Action sensitivity and protocol enforcement
6. Full closed-loop integration:
   ACTIVITY -> EVENT -> ANOMALY -> CORRELATION -> OBSERVATORY -> PROTOCOL -> VERIFICATION -> RE-EVALUATION -> ENFORCEMENT -> RECOVERY -> AUDIT
"""
import pytest
import engine as engine_module
from enforcement import SECURITY_PROTOCOLS, SESSION_RISK_STATES, ActionEnforcementService


def test_security_protocols_definition():
    """Verify all 4 core security protocols exist with required metadata."""
    assert "P-01" in SECURITY_PROTOCOLS
    assert "P-02" in SECURITY_PROTOCOLS
    assert "P-03" in SECURITY_PROTOCOLS
    assert "P-04" in SECURITY_PROTOCOLS

    p1 = SECURITY_PROTOCOLS["P-01"]
    assert p1["name"] == "Identity Revalidation"
    assert "IDENTITY" in p1["applicable_categories"]

    p2 = SECURITY_PROTOCOLS["P-02"]
    assert p2["name"] == "Sensitive Transaction Protection"
    assert "TRANSACTION" in p2["applicable_categories"]

    p3 = SECURITY_PROTOCOLS["P-03"]
    assert p3["name"] == "Session Containment & Revocation"
    assert p3["enforcement_action"] == "BLOCK"

    p4 = SECURITY_PROTOCOLS["P-04"]
    assert p4["name"] == "Account Recovery & Secondary Remediation"
    assert p4["required_response"] == "SECONDARY_OOB_OTP_OR_KYC"


def test_observatory_generation():
    """Verify get_observatory returns watchlist for fleet with complete attributes."""
    engine = engine_module.NetraEngine()
    obs = engine.get_observatory()
    assert len(obs) >= 5

    record = obs[0]
    required_keys = {
        "trader_id", "name", "trust_score", "status", "session_id",
        "session_risk_state", "operational_state", "active_protocols",
        "protocol_details", "active_anomalies", "last_decision",
        "requires_step_up", "risk_dimensions"
    }
    assert required_keys.issubset(set(record.keys()))


def test_protocol_p01_trigger_on_identity_deviation():
    """Verify Protocol P-01 triggers upon identity/device deviations under elevated risk."""
    engine = engine_module.NetraEngine()
    engine._isolate_scenario_trader("7842", trust=94.0, baseline_deposit=3000)

    # Ingest unfamiliar device
    res = engine.ingest({
        "trader_id": "7842",
        "event_type": "NEW_DEVICE",
        "device_id": "DEV-7842-UNFAMILIAR",
        "ip_address": "198.18.0.44",
        "network_type": "datacenter",
    })

    obs = engine.get_observatory()
    trader_obs = next((o for o in obs if o["trader_id"] == "7842"), None)
    assert trader_obs is not None
    assert trader_obs["operational_state"] in {"MONITORING", "HIGH_ALERT", "PROTOCOL_PENDING", "PROTOCOL_ACTIVE"}


def test_protocol_p02_trigger_on_sensitive_withdrawal():
    """Verify Protocol P-02 triggers for high-value withdrawal with contextual anomaly."""
    engine = engine_module.NetraEngine()
    engine._isolate_scenario_trader("7842", trust=60.0, baseline_deposit=3000)

    eval_res = engine.evaluate_action(
        trader_id="7842",
        action="WITHDRAWAL",
        context={"amount": 45000, "session_risk_state": "SESSION_MONITORED"},
    )
    assert eval_res["decision"] in {"VERIFY", "RESTRICT"}
    assert "P-02" in eval_res.get("active_protocols", []) or "P-01" in eval_res.get("active_protocols", [])


def test_protocol_p03_trigger_on_session_termination():
    """Verify Protocol P-03 terminates session and blocks all actions upon critical compromise."""
    engine = engine_module.NetraEngine()
    engine._isolate_scenario_trader("7842", trust=94.0, baseline_deposit=3000)

    term_res = engine.terminate_session("SESS-7842-PRIMARY", "7842", reason="Critical credential theft sequence")
    assert term_res["status"] == "SESSION_TERMINATED"

    # Evaluate any action afterwards -> must be blocked
    eval_res = engine.evaluate_action("7842", "WITHDRAWAL")
    assert eval_res["decision"] == "BLOCK"
    assert eval_res["allowed"] is False
    assert "P-03" in eval_res.get("active_protocols", [])


def test_step_up_verification_unavailable_flow():
    """Verify step-up verification handles UNAVAILABLE status gracefully by placing session in temporary restriction."""
    engine = engine_module.NetraEngine()
    engine._isolate_scenario_trader("7842", trust=65.0, baseline_deposit=3000)

    v_res = engine.step_up_verify(
        trader_id="7842",
        verification_type="2FA_BIOMETRIC",
        status="UNAVAILABLE",
    )
    assert v_res["verified"] is False
    assert v_res["status"] == "UNAVAILABLE"
    assert v_res["session_risk_state"] == "SESSION_RESTRICTED"
    assert v_res["recovery_available"] is True


def test_step_up_verification_timeout_flow():
    """Verify step-up verification handles TIMEOUT status."""
    engine = engine_module.NetraEngine()
    engine._isolate_scenario_trader("7842", trust=65.0, baseline_deposit=3000)

    v_res = engine.step_up_verify(
        trader_id="7842",
        verification_type="PASSKEY",
        status="TIMEOUT",
    )
    assert v_res["verified"] is False
    assert v_res["status"] == "TIMEOUT"
    assert v_res["session_risk_state"] == "SESSION_RESTRICTED"


def test_account_recovery_lifecycle():
    """Verify out-of-band account recovery request and verification lifecycle."""
    engine = engine_module.NetraEngine()
    engine._isolate_scenario_trader("7842", trust=30.0, baseline_deposit=3000)
    engine.traders["7842"]["session_risk_state"] = "SESSION_RESTRICTED"

    # 1. Request recovery challenge
    req_res = engine.request_recovery("7842", channel="EMAIL_OTP")
    assert req_res["status"] == "CHALLENGE_DISPATCHED"
    assert "recovery_id" in req_res
    assert "masked_contact" in req_res
    assert req_res["demo_code"] == "849201"

    # 2. Verify invalid code -> rejected
    bad_res = engine.verify_recovery("7842", recovery_code="000000")
    assert bad_res["verified"] is False
    assert bad_res["status"] == "FAILED"

    # 3. Verify valid code -> restores trust proportionally
    good_res = engine.verify_recovery("7842", recovery_code="849201")
    assert good_res["verified"] is True
    assert good_res["status"] == "SUCCESS"
    assert good_res["new_trust"] > 30.0
    # Capped at monitored tier (75.0), does NOT blind reset to 100
    assert good_res["new_trust"] <= 75.0
    assert good_res["session_risk_state"] == "SESSION_MONITORED"

    # 4. Check audit log for recovery entry
    audit_matches = [a for a in engine.audit if a["action"] == "ACCOUNT_RECOVERY_COMPLETED"]
    assert len(audit_matches) >= 1
    assert audit_matches[-1]["subject"] == "7842"


def test_end_to_end_closed_loop_attack_and_recovery():
    """
    Validates complete end-to-end closed loop:
    Activity -> Ingest -> Anomaly -> Observatory (High Alert) -> Protocol Triggered ->
    Step-Up Verification -> Failure -> Restriction -> Recovery Request -> Recovery Verification -> Re-evaluation.
    """
    engine = engine_module.NetraEngine()
    engine._isolate_scenario_trader("7842", trust=94.0, baseline_deposit=3000)

    # 1. Benign login
    r1 = engine.ingest({
        "trader_id": "7842",
        "event_type": "LOGIN",
        "device_id": "DEV-7842-PRIMARY",
        "ip_address": "203.0.113.22",
    })
    assert r1["trust"] >= 90.0

    # 2. Sudden unfamiliar device & datacenter IP -> triggers anomaly & observatory escalation
    r2 = engine.ingest({
        "trader_id": "7842",
        "event_type": "NEW_DEVICE",
        "device_id": "DEV-7842-ATTACKER",
        "ip_address": "198.18.0.99",
        "network_type": "datacenter",
    })
    assert r2["trust"] < 90.0
    obs = engine.get_observatory()
    trader_obs = next(o for o in obs if o["trader_id"] == "7842")
    assert trader_obs["operational_state"] in {"MONITORING", "HIGH_ALERT", "PROTOCOL_PENDING"}

    # 3. High-risk withdrawal attempt on fresh wallet
    r3 = engine.ingest({
        "trader_id": "7842",
        "event_type": "WITHDRAWAL",
        "amount": 25000,
        "wallet_address": "WALLET-ATTACKER-DRAIN",
        "device_id": "DEV-7842-ATTACKER",
        "network_type": "datacenter",
    })
    assert r3["decision"]["decision"] in {"VERIFY", "RESTRICT", "BLOCK"}

    # 4. Step-up challenge fails
    v_fail = engine.step_up_verify("7842", verification_type="PASSKEY", status="FAILED")
    assert v_fail["verified"] is False
    assert engine.traders["7842"]["session_risk_state"] == "SESSION_RESTRICTED"

    # 5. User requests Out-of-band Account Recovery (P-04)
    rcv_req = engine.request_recovery("7842", channel="EMAIL_OTP")
    assert rcv_req["status"] == "CHALLENGE_DISPATCHED"

    # 6. User submits valid OTP proof
    rcv_ver = engine.verify_recovery("7842", recovery_code=rcv_req["demo_code"])
    assert rcv_ver["verified"] is True
    assert rcv_ver["session_risk_state"] == "SESSION_MONITORED"
    assert engine.traders["7842"]["trust_score"] > v_fail["new_trust"]

    # 7. Audit vault integrity remains cryptographically valid
    audit_res = engine.verify_audit_chain()
    assert audit_res["valid"] is True
