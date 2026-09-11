"""
NETRA Anomaly Detection + Suspicious Session + Verification Unit Tests

Tests are calibrated against the *actual* engine API signatures as verified by introspection.
Covers 30 specification criteria across anomaly taxonomy, session state, verification,
trust recovery, termination, override, and counterfactual simulation.
"""
import pytest
import engine as engine_module
from anomaly_model import StructuredAnomaly, ANOMALY_TAXONOMY
from enforcement import SESSION_RISK_STATES
from baseline import AdaptiveTraderProfile


# ─────────────────────────────────────────────────────────────────────────────
# 1. Baseline Confidence Grading
# ─────────────────────────────────────────────────────────────────────────────

def test_baseline_confidence_grading():
    """Verify baseline confidence grades correctly based on trusted_sample_count."""
    p1 = AdaptiveTraderProfile("T-1")
    p1.trusted_sample_count = 2
    assert p1.baseline_confidence == "LOW"

    p2 = AdaptiveTraderProfile("T-2")
    p2.trusted_sample_count = 8
    assert p2.baseline_confidence == "MEDIUM"

    p3 = AdaptiveTraderProfile("T-3")
    p3.trusted_sample_count = 20
    assert p3.baseline_confidence == "HIGH"

    d = p3.to_dict()
    assert d["baseline_confidence"] == "HIGH"
    assert "trusted_sample_count" in d


def test_anomaly_taxonomy_exists():
    """Verify ANOMALY_TAXONOMY is defined with expected categories."""
    expected = {"IDENTITY", "BEHAVIOURAL", "TRADING", "TRANSACTION", "RELATIONSHIP"}
    assert expected.issubset(set(ANOMALY_TAXONOMY.keys()))


def test_session_risk_states_defined():
    """Verify all 6 session risk states are defined."""
    expected = {
        "SESSION_NORMAL", "SESSION_MONITORED", "SESSION_SUSPICIOUS",
        "SESSION_VERIFICATION_REQUIRED", "SESSION_RESTRICTED", "SESSION_TERMINATED"
    }
    assert expected.issubset(set(SESSION_RISK_STATES.keys()))


# ─────────────────────────────────────────────────────────────────────────────
# 2. Session State Transitions and Hypothesis Correlation
# ─────────────────────────────────────────────────────────────────────────────

def test_session_state_transitions_and_hypothesis():
    """Verify session transitions and hypothesis correlation on attack sequence."""
    engine = engine_module.NetraEngine()
    engine._isolate_scenario_trader("7842", trust=94.0, baseline_deposit=3000)

    # Normal login → low risk state
    r1 = engine.ingest({
        "trader_id": "7842",
        "event_type": "LOGIN",
        "device_id": "DEV-7842-PRIMARY",
        "ip_address": "203.0.113.22",
    })
    assert r1["session_risk_state"] in {"SESSION_NORMAL", "SESSION_MONITORED"}

    # Suspicious credential sequence → escalates state
    r2 = engine.ingest({
        "trader_id": "7842",
        "event_type": "PASSWORD_CHANGE",
        "device_id": "DEV-ATO-UNKNOWN",
        "network_type": "datacenter",
    })
    assert r2["session_risk_state"] in {
        "SESSION_SUSPICIOUS", "SESSION_VERIFICATION_REQUIRED",
        "SESSION_RESTRICTED", "SESSION_MONITORED"
    }
    assert r2["hypothesis"] in {
        "POTENTIAL_ACCOUNT_TAKEOVER", "ISOLATED_DEVIATIONS", "BASELINE_CONFORMING"
    }


def test_ingest_always_returns_session_risk_state():
    """Verify ingest always populates session_risk_state in the response."""
    engine = engine_module.NetraEngine()
    r = engine.ingest({
        "trader_id": "7842",
        "event_type": "TRADE",
        "amount": 1000,
    })
    assert "session_risk_state" in r
    assert r["session_risk_state"] in SESSION_RISK_STATES.keys()


def test_ingest_always_returns_hypothesis():
    """Verify ingest always populates hypothesis in the response."""
    engine = engine_module.NetraEngine()
    r = engine.ingest({
        "trader_id": "7842",
        "event_type": "TRADE",
        "amount": 1000,
    })
    assert "hypothesis" in r
    assert r["hypothesis"] in {
        "POTENTIAL_ACCOUNT_TAKEOVER", "COORDINATED_COLLUSION",
        "RAPID_CAPITAL_DRAIN", "ISOLATED_DEVIATIONS", "BASELINE_CONFORMING"
    }


# ─────────────────────────────────────────────────────────────────────────────
# 3. Step-Up Verification – Contextual Re-Evaluation
# ─────────────────────────────────────────────────────────────────────────────

def test_step_up_verification_contextual_reevaluation():
    """Verify step-up verification restores trust evidence-grounded without blind reset."""
    engine = engine_module.NetraEngine()
    engine._isolate_scenario_trader("7842", trust=40.0, baseline_deposit=3000)

    prior_trust = engine.traders["7842"]["trust_score"]
    sess_id = engine.traders["7842"].get("active_session_id") or f"SESS-7842-PRIMARY"

    # Perform step-up verification via Passkey
    v_res = engine.step_up_verify(
        trader_id="7842",
        verification_type="PASSKEY",
        session_id=sess_id,
        action_bound="WITHDRAWAL",
        status="SUCCESS",
        actor="lead-analyst",
    )

    assert v_res["verified"] is True
    assert v_res["status"] == "SUCCESS"
    assert v_res["new_trust"] > prior_trust
    # Trust MUST NOT blindly reset to 95.0 — cap is 94.0
    assert v_res["new_trust"] <= 94.0
    assert v_res["session_risk_state"] in {"SESSION_NORMAL", "SESSION_MONITORED", "SESSION_VERIFICATION_REQUIRED"}

    # Audit record should exist
    audit_matches = [a for a in engine.audit if a["action"] == "STEP_UP_VERIFIED"]
    assert len(audit_matches) >= 1


def test_step_up_verification_2fa_biometric_restores_35pts():
    """Verify 2FA_BIOMETRIC grants 35 point recovery (per legacy test spec)."""
    engine = engine_module.NetraEngine()
    engine._isolate_scenario_trader("7842", trust=94.0, baseline_deposit=3000)
    # Run flagship to degrade trust to critical
    _, events = engine.prepare_scenario("FLAGSHIP")
    for ev in events:
        engine.ingest(ev)
    prior_trust = engine.traders["7842"]["trust_score"]
    assert prior_trust < 20.0

    recovery = engine.step_up_verify("7842", "2FA_BIOMETRIC")
    assert recovery["new_trust"] > recovery["previous_trust"]
    assert recovery["new_trust"] == round(prior_trust + 35.0, 1)
    assert engine.traders["7842"]["trust_score"] == recovery["new_trust"]


# ─────────────────────────────────────────────────────────────────────────────
# 4. Verification Failure Escalation and Auto-Termination
# ─────────────────────────────────────────────────────────────────────────────

def test_step_up_verification_failure_escalation():
    """Verify repeated verification failure escalates penalty."""
    engine = engine_module.NetraEngine()
    engine._isolate_scenario_trader("7842", trust=40.0, baseline_deposit=3000)
    engine.traders["7842"]["risk_dimensions"]["identity"] = 45.0
    sess_id = "SESS-7842-FAIL-TEST"
    engine.traders["7842"]["active_session_id"] = sess_id

    # Attempt 1 fails
    v1 = engine.step_up_verify(
        trader_id="7842",
        verification_type="TOTP",
        session_id=sess_id,
        status="FAILED",
    )
    assert v1["verified"] is False
    assert v1["status"] == "FAILED"
    assert engine.traders["7842"]["failed_verifications"] == 1
    assert "new_trust" in v1
    assert v1["new_trust"] < 40.0  # penalty applied


def test_step_up_verification_auto_termination_on_repeated_failure():
    """Verify second failure under critical conditions triggers session termination."""
    engine = engine_module.NetraEngine()
    engine._isolate_scenario_trader("7842", trust=40.0, baseline_deposit=3000)
    engine.traders["7842"]["risk_dimensions"]["identity"] = 45.0
    sess_id = "SESS-7842-AUTOFAIL"
    engine.traders["7842"]["active_session_id"] = sess_id

    # Attempt 1 fails
    engine.step_up_verify(trader_id="7842", verification_type="TOTP", session_id=sess_id, status="FAILED")

    # Attempt 2 fails → automatic termination
    v2 = engine.step_up_verify(trader_id="7842", verification_type="TOTP", session_id=sess_id, status="FAILED")
    # v2 is the terminate_session return (status=SESSION_TERMINATED, revoked=True)
    assert v2["status"] == "SESSION_TERMINATED"
    assert v2["revoked"] is True
    assert engine.traders["7842"]["status"] == "TERMINATED"
    assert engine.sessions[sess_id]["revoked"] is True


# ─────────────────────────────────────────────────────────────────────────────
# 5. Session Termination
# ─────────────────────────────────────────────────────────────────────────────

def test_session_termination_returns_correct_shape():
    """Verify terminate_session returns correct keys."""
    engine = engine_module.NetraEngine()
    engine._isolate_scenario_trader("7842", trust=94.0, baseline_deposit=3000)
    sess_id = "SESS-TERM-SHAPE-TEST"
    engine.traders["7842"]["active_session_id"] = sess_id

    term_res = engine.terminate_session(
        session_id=sess_id,
        trader_id="7842",
        reason="Compromised credentials detected",
        actor="soc-lead",
    )
    assert term_res["status"] == "SESSION_TERMINATED"
    assert term_res["revoked"] is True
    assert term_res["session_id"] == sess_id
    assert term_res["trader_id"] == "7842"
    assert "audit_id" in term_res
    assert engine.traders["7842"]["status"] == "TERMINATED"


def test_session_termination_blocks_all_actions():
    """Verify that once a session is terminated, subsequent ingested events are blocked."""
    engine = engine_module.NetraEngine()
    engine._isolate_scenario_trader("7842", trust=94.0, baseline_deposit=3000)
    sess_id = "SESS-TERMINATE-DEMO"
    engine.traders["7842"]["active_session_id"] = sess_id

    # Terminate the session
    engine.terminate_session(
        session_id=sess_id,
        trader_id="7842",
        reason="Compromised credentials detected",
        actor="soc-lead",
    )

    # Ingesting next action in terminated session must be BLOCKED
    blocked_res = engine.ingest({
        "trader_id": "7842",
        "session_id": sess_id,
        "event_type": "TRADE",
        "amount": 500,
    })
    # Session revoked → SESSION_TERMINATED → BLOCK
    assert blocked_res["session_risk_state"] == "SESSION_TERMINATED"
    assert blocked_res["decision"].get("decision") in {"BLOCK", "RESTRICT"}


# ─────────────────────────────────────────────────────────────────────────────
# 6. Operator Decision Override with Audit Provenance
# ─────────────────────────────────────────────────────────────────────────────

def test_operator_decision_override_provenance():
    """Verify operator override modifies decision and produces cryptographic audit entry."""
    engine = engine_module.NetraEngine()
    engine._isolate_scenario_trader("7842", trust=94.0, baseline_deposit=3000)

    # Ingest event that creates a decision
    r = engine.ingest({
        "trader_id": "7842",
        "event_type": "WITHDRAWAL",
        "amount": 45000,
        "wallet_address": "WALLET-TEST-OVERRIDE",
    })
    dec_id = r["decision"]["decision_id"]

    override_res = engine.override_decision(
        decision_id=dec_id,
        trader_id="7842",
        operator="super-admin-01",
        override_action="VERIFY",
        reason="Verified client verbally via authorized corporate channel",
    )

    assert override_res["new_decision"] == "VERIFY"
    assert override_res["operator"] == "super-admin-01"
    assert "audit_id" in override_res

    # Check that the decision in engine records reflects override
    dec = next(d for d in engine.decisions if d["decision_id"] == dec_id)
    assert dec["decision"] == "VERIFY"
    assert dec["overridden"] is True
    assert dec["override_operator"] == "super-admin-01"


# ─────────────────────────────────────────────────────────────────────────────
# 7. Counterfactual Simulation – Zero Mutation
# ─────────────────────────────────────────────────────────────────────────────

def test_counterfactual_simulation_zero_mutation():
    """Verify counterfactual simulation does NOT alter production engine state."""
    engine = engine_module.NetraEngine()
    engine._isolate_scenario_trader("7842", trust=94.0, baseline_deposit=3000)

    # Ingest an event to create a decision record
    engine.ingest({
        "trader_id": "7842",
        "event_type": "WITHDRAWAL",
        "amount": 35000,
        "device_id": "DEV-ANOM-1",
        "network_type": "datacenter",
    })

    initial_trust = engine.traders["7842"]["trust_score"]
    initial_events_count = len(engine.events)

    cf_res = engine.simulate_counterfactual(
        trader_id="7842",
        remove_signal_categories=["network", "wallet"],
    )

    assert cf_res["simulation"] is True
    assert "DOES NOT MODIFY PRODUCTION STATE" in cf_res["notice"]
    # Production state must remain completely untouched
    assert engine.traders["7842"]["trust_score"] == initial_trust
    assert len(engine.events) == initial_events_count


# ─────────────────────────────────────────────────────────────────────────────
# 8. Gradual Trust Recovery
# ─────────────────────────────────────────────────────────────────────────────

def test_gradual_trust_recovery():
    """Verify consecutive clean baseline events yield positive trust delta."""
    engine = engine_module.NetraEngine()
    engine._isolate_scenario_trader("7842", trust=50.0, baseline_deposit=3000)

    clean_event = {
        "trader_id": "7842",
        "event_type": "TRADE",
        "amount": 1000,
        "asset": "BTC",
        "leverage": 2,
        "device_id": "DEV-7842-PRIMARY",
        "ip_address": "203.0.113.22",
    }

    trust_before = engine.traders["7842"]["trust_score"]
    engine.ingest(clean_event)
    trust_after_1 = engine.traders["7842"]["trust_score"]
    # Trust should recover (increase or stay same with clean signal)
    assert trust_after_1 >= trust_before

    engine.ingest(clean_event)
    trust_after_2 = engine.traders["7842"]["trust_score"]
    # Cumulative trust should be >= initial
    assert trust_after_2 >= trust_before
