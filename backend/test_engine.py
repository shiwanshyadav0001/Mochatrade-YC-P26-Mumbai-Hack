from engine import NetraEngine


def test_flagship_is_contextual_and_proportional():
    engine = NetraEngine()
    engine.reset()
    _, events = engine.prepare_scenario("FLAGSHIP")
    results = [engine.ingest(event) for event in events]
    trust = [item["trust"] for item in results]
    assert trust == [94.0, 82.0, 61.0, 48.0, 31.0, 14.0]
    assert results[-1]["decision"]["decision"] == "RESTRICT"
    assert results[-1]["explanation"]["evidence"]
    assert engine.cases


def test_travel_is_not_blocked_for_an_isolated_geo_change():
    engine = NetraEngine()
    engine.reset()
    _, events = engine.prepare_scenario("TRAVEL")
    results = [engine.ingest(event) for event in events]
    assert results[-1]["decision"]["decision"] in {"MONITOR", "VERIFY"}
    assert results[-1]["trust"] >= 70.0


def test_shared_ring_produces_relationship_evidence():
    engine = NetraEngine()
    engine.reset()
    _, events = engine.prepare_scenario("FRAUD_RING")
    result = engine.ingest(events[0])
    assert "SHARED_INFRASTRUCTURE_CLUSTER" in result["triggered_rules"]
    assert any(item["type"] == "RELATIONSHIP" for item in result["explanation"]["evidence"])


def test_step_up_verification_restores_trust():
    engine = NetraEngine()
    engine.reset()
    # Bring trader 7842 down
    _, events = engine.prepare_scenario("FLAGSHIP")
    for event in events:
        engine.ingest(event)
    assert engine.traders["7842"]["trust_score"] == 14.0

    # Step-up verification
    recovery = engine.step_up_verify("7842", "2FA_BIOMETRIC")
    assert recovery["new_trust"] > recovery["previous_trust"]
    assert recovery["new_trust"] == 49.0
    assert engine.traders["7842"]["trust_score"] == 49.0


def test_policy_simulation_detects_impact():
    engine = NetraEngine()
    engine.reset()
    _, events = engine.prepare_scenario("FLAGSHIP")
    for event in events:
        engine.ingest(event)

    # Candidate policy with very lenient bands
    candidate = {
        "weights": engine.policy["weights"],
        "action_sensitivity": {"WITHDRAWAL": 20},
        "trust_bands": {"allow": 50, "monitor": 40, "verify": 30, "restrict": 10},
    }
    sim = engine.simulate_policy(candidate)
    assert "current_distribution" in sim
    assert "simulated_distribution" in sim
    assert sim["evaluated_events"] > 0


def test_universal_search():
    engine = NetraEngine()
    res = engine.search("7842")
    assert any(t["trader_id"] == "7842" for t in res["traders"])
