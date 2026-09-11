import json
import pytest
from datetime import datetime, timezone

from engine import NetraEngine


def test_single_event_propagation_from_ingest_to_audit():
    """Authoritative integration-level test proving single-event causal propagation:

    event ingestion
    -> event record in store
    -> risk evaluation (signals & baseline deviation)
    -> trust impact (trust delta & state transition)
    -> policy decision (enforcement action)
    -> cryptographic SHA-256 audit ledger verification
    -> graph topology linkage.
    """
    engine = NetraEngine()
    engine.reset()

    trader_id = "7842"
    initial_trader = engine.get_trader(trader_id)
    initial_trust = initial_trader["trust_score"]
    assert initial_trust >= 90.0, f"Expected trusted baseline, got {initial_trust}"
    initial_audit_count = len(engine.audit)

    # 1. Event Observation (Anomalous withdrawal from fresh wallet and unrecognized datacenter device)
    event_payload = {
        "trader_id": trader_id,
        "event_type": "WITHDRAWAL",
        "amount": 48000.0,
        "currency": "USD",
        "wallet_address": "WALLET-FOREIGN-DRAIN-99",
        "device_id": "DEV-7842-ATTACKER",
        "ip_address": "198.18.0.88",
        "network_type": "datacenter",
        "source": "propagation-test",
    }

    # 2. Ingest through runtime intelligence engine
    result = engine.ingest(event_payload, actor="analyst")

    # Verify Event Record
    event_data = result["event"]
    assert event_data["event_id"], "Event must have a non-empty event_id"
    assert event_data["trader_id"] == trader_id
    assert event_data["event_type"] == "WITHDRAWAL"
    assert event_data["amount"] == 48000.0
    assert any(e["event_id"] == event_data["event_id"] for e in engine.events)

    # 3. Verify Risk Evaluation (Baseline comparison & risk signals)
    decision = result["decision"]
    assert decision["event_id"] == event_data["event_id"]
    signals = decision.get("signals", [])
    assert len(signals) > 0, "Risk signals must be attributed"
    signal_categories = {s["category"] for s in signals}
    assert signal_categories.intersection({"device", "network", "wallet", "money", "behaviour"})

    # 4. Verify Trust Impact
    new_trust = result["trust_score"]
    trust_delta = new_trust - initial_trust
    assert trust_delta < -15.0, f"Expected significant trust reduction, got delta {trust_delta}"
    assert engine.traders[trader_id]["trust_score"] == new_trust

    # Verify State Transition recorded
    transition = result.get("transition")
    assert transition is not None
    assert transition["event_id"] == event_data["event_id"]
    assert transition["delta"] < 0

    # 5. Verify Policy Decision & Action Enforcement
    assert decision["decision"] in {"VERIFY", "RESTRICT", "BLOCK"}
    enforcement = result["enforcement"]
    assert enforcement["decision"] == decision["decision"]
    assert enforcement["allowed"] is False, "Severe anomalous withdrawal must not be allowed unconditionally"

    # 6. Verify SHA-256 Audit Ledger Chain
    assert len(engine.audit) > initial_audit_count
    latest_audit = engine.audit[-1]
    assert latest_audit["event"] in {"EVENT_INGESTED", "EVENT_EVALUATED"}
    assert latest_audit["subject"] == trader_id
    assert latest_audit["details"]["event_id"] == event_data["event_id"]
    assert latest_audit["details"]["decision_id"] == decision["decision_id"]
    assert "current_hash" in latest_audit
    assert "previous_hash" in latest_audit

    # Cryptographically verify the entire chain from genesis
    verification = engine.verify_audit_chain()
    assert verification["valid"] is True, f"Audit chain verification failed: {verification}"
    assert verification["checked_records"] == len(engine.audit)

    # 7. Verify Graph Topology Linkage
    graph_res = engine.trader_graph(trader_id)
    node_ids = {n["id"] for n in graph_res["nodes"]}
    assert f"TRADER-{trader_id}" in node_ids
    assert any("WALLET-FOREIGN-DRAIN-99" in nid for nid in node_ids)
    assert any("DEV-7842-ATTACKER" in nid for nid in node_ids)
    assert any("198.18.0.88" in nid for nid in node_ids)


def test_progressive_attack_causal_propagation_and_case_escalation():
    """Verifies multi-event progressive causal attack propagation, policy escalation, and case linkage."""
    engine = NetraEngine()
    engine.reset()

    initial_cases = len(engine.cases)
    trader_id, scenario_events = engine.prepare_scenario("ATTACK_SURGE")

    decisions = []
    for ev in scenario_events:
        res = engine.ingest(ev, actor="analyst")
        decisions.append(res["decision"])

    # Trust must monotonically degrade during sustained anomalous attack
    trust_scores = [d["trust_score"] for d in decisions]
    assert trust_scores[0] > trust_scores[-1]
    assert trust_scores[-1] < 20.0, f"Final trust must be critical, got {trust_scores[-1]}"

    # Policy decision must escalate to RESTRICT or BLOCK
    final_decision = decisions[-1]["decision"]
    assert final_decision in {"RESTRICT", "BLOCK"}

    # Automatic case must be created and linked to the critical trigger event
    assert len(engine.cases) > initial_cases
    trader_cases = [c for c in engine.cases.values() if c["trader_id"] == trader_id]
    assert len(trader_cases) >= 1
    active_case = trader_cases[0]
    assert active_case["status"] in {"OPEN", "INVESTIGATING", "ESCALATED"}
    assert active_case["trigger_event_id"] is not None

    # Full audit ledger integrity verified from genesis
    verification = engine.verify_audit_chain()
    assert verification["valid"] is True


def test_scenario_generation_produces_structured_traceable_events():
    """Verifies that all 10 scenario keys produce structured, non-empty event payloads."""
    engine = NetraEngine()

    scenario_keys = [
        "NORMAL_ACTIVITY",
        "NEW_DEVICE",
        "IMPOSSIBLE_TRAVEL",
        "TWO_FACTOR_CHANGE",
        "LEVERAGE_SPIKE",
        "ABNORMAL_WITHDRAWAL",
        "COLLUSION_CLUSTER",
        "ACCOUNT_TAKEOVER",
        "ATTACK_SURGE",
        "LEGITIMATE_HIGH_VALUE_ACTIVITY",
    ]

    for key in scenario_keys:
        trader_id, events = engine.prepare_scenario(key)
        assert trader_id in engine.traders, f"Scenario {key} targeted unknown trader {trader_id}"
        assert len(events) >= 2, f"Scenario {key} must have at least 2 events, got {len(events)}"
        for ev in events:
            assert "trader_id" in ev
            assert "event_type" in ev
            assert "source" in ev


def test_attack_surge_simulator_step_execution_and_propagation():
    """Verifies that ATTACK_SURGE executes cleanly step-by-step through engine ingestion,

    progressively elevating signals, dropping trust, altering policy action to BLOCK,
    creating an automatic investigation case, and committing to the SHA-256 audit ledger.
    """
    engine = NetraEngine()
    engine.reset()

    trader_id, events = engine.prepare_scenario("ATTACK_SURGE")
    assert trader_id == "7842"
    assert len(events) == 4

    step_results = []
    for ev in events:
        res = engine.ingest(ev, actor="test-operator")
        step_results.append(res)

    # Step 1: NEW_DEVICE
    assert step_results[0]["event"]["event_type"] == "NEW_DEVICE"
    assert step_results[0]["decision"]["trust_score"] < 94.0

    # Step 2: PASSWORD_CHANGE
    assert step_results[1]["event"]["event_type"] == "PASSWORD_CHANGE"

    # Step 3: LEVERAGE_CHANGE
    assert step_results[2]["event"]["event_type"] == "LEVERAGE_CHANGE"

    # Step 4: WITHDRAWAL - Trust drops to critical and policy enforces BLOCK
    final_step = step_results[3]
    assert final_step["event"]["event_type"] == "WITHDRAWAL"
    assert final_step["decision"]["decision"] in {"RESTRICT", "BLOCK"}
    assert final_step["trust_score"] < 25.0

    # Case verification
    active_cases = [c for c in engine.cases.values() if c["trader_id"] == "7842"]
    assert len(active_cases) >= 1
    assert active_cases[0]["trigger_event_id"] is not None

    # Audit chain verification
    audit_res = engine.verify_audit_chain()
    assert audit_res["valid"] is True
    assert audit_res["checked_records"] == len(engine.audit)

    # Topology linkage verification
    graph = engine.trader_graph("7842")
    node_ids = {n["id"] for n in graph["nodes"]}
    assert "DEV-SURGE-1" in node_ids
    assert "WALLET-SURGE-DRAIN" in node_ids
