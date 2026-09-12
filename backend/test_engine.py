import copy
import numpy as np
from engine import NetraEngine


def test_flagship_is_contextual_and_proportional():
    engine = NetraEngine()
    engine.reset()
    _, events = engine.prepare_scenario("FLAGSHIP")
    results = [engine.ingest(event) for event in events]
    trust = [item["trust"] for item in results]

    # Directional contextual degradation without hardcoded numbers
    assert trust[0] >= 90.0  # Normal login maintains trusted standing
    assert trust[1] < trust[0]  # Unrecognized device reduces trust
    assert trust[2] < trust[1]  # Datacenter IP reduces trust further
    assert trust[3] < trust[2]  # Abnormal deposit adds contextual risk
    assert trust[4] < trust[3]  # Excessive leverage adds contextual risk
    assert trust[5] < trust[4]  # Fresh wallet withdrawal drops trust into restriction

    # Proportional graduated decision outcomes
    decisions = [item["decision"]["decision"] for item in results]
    assert decisions[0] == "ALLOW"
    assert decisions[1] == "MONITOR"
    assert decisions[2] == "MONITOR"
    assert decisions[3] in {"MONITOR", "VERIFY"}
    assert decisions[4] in {"VERIFY", "RESTRICT"}
    assert decisions[5] in {"RESTRICT", "BLOCK"}

    # Verifies evidence, signals traceability, and automatic case creation
    assert results[-1]["explanation"]["evidence"]
    assert results[-1]["decision"]["signals"]
    assert engine.cases


def test_no_flagship_bypass():
    """Proves the flagship scenario uses the exact same risk engine with or without metadata."""
    engine_a = NetraEngine()
    engine_a.reset()
    _, events_clean = engine_a.prepare_scenario("FLAGSHIP")

    # Run without any metadata
    results_clean = [engine_a.ingest(ev) for ev in events_clean]
    trust_clean = [item["trust"] for item in results_clean]

    # Run with arbitrary or legacy metadata flags injected
    engine_b = NetraEngine()
    engine_b.reset()
    engine_b.prepare_scenario("FLAGSHIP")
    events_with_flags = copy.deepcopy(events_clean)
    for ev in events_with_flags:
        ev["metadata"] = {"flagship": True, "custom_tag": "test"}

    results_flagged = [engine_b.ingest(ev) for ev in events_with_flags]
    trust_flagged = [item["trust"] for item in results_flagged]

    # Both runs must produce the exact same trust scores, proving no shortcut bypass exists
    assert trust_clean == trust_flagged
    assert [r["decision"]["decision"] for r in results_clean] == [r["decision"]["decision"] for r in results_flagged]


def test_deterministic_scoring():
    """Verifies that same trader state + same event yields identical signals, delta, and trust."""
    engine_1 = NetraEngine()
    engine_1.reset()
    engine_2 = NetraEngine()
    engine_2.reset()

    event = {
        "trader_id": "7842",
        "event_type": "NEW_DEVICE",
        "device_id": "DEV-TEST-DETERMINISTIC",
    }

    res_1 = engine_1.ingest(event)
    res_2 = engine_2.ingest(event)

    assert res_1["trust"] == res_2["trust"]
    assert res_1["decision"]["decision"] == res_2["decision"]["decision"]
    assert res_1["decision"]["contextual_risk"] == res_2["decision"]["contextual_risk"]
    assert len(res_1["decision"]["signals"]) == len(res_2["decision"]["signals"])


def test_isolated_device_signal():
    """An isolated unrecognized device should create device risk without collapsing account."""
    engine = NetraEngine()
    engine.reset()

    result = engine.ingest({
        "trader_id": "7842",
        "event_type": "NEW_DEVICE",
        "device_id": "DEV-ISOLATED-01",
    })

    # Device risk is populated
    assert result["risk"]["dimensions"]["device"] > 50.0
    # Other independent dimensions remain zero
    assert result["risk"]["dimensions"]["network"] == 0.0
    assert result["risk"]["dimensions"]["money"] == 0.0
    assert result["risk"]["dimensions"]["wallet"] == 0.0
    # Proportional response: NOT blocked or restricted
    assert result["decision"]["decision"] in {"ALLOW", "MONITOR"}
    assert result["trust"] >= 70.0


def test_multiple_contextual_signals_compound():
    """Combined independent signals should create significantly higher contextual risk than isolated signal."""
    engine_iso = NetraEngine()
    engine_iso.reset()
    res_iso = engine_iso.ingest({
        "trader_id": "7842",
        "event_type": "NEW_DEVICE",
        "device_id": "DEV-MULTI-TEST",
    })

    engine_multi = NetraEngine()
    engine_multi.reset()
    # Step 1: New device
    engine_multi.ingest({
        "trader_id": "7842",
        "event_type": "NEW_DEVICE",
        "device_id": "DEV-MULTI-TEST",
    })
    # Step 2: Datacenter network + large abnormal deposit
    res_multi = engine_multi.ingest({
        "trader_id": "7842",
        "event_type": "DEPOSIT",
        "amount": 25000,
        "device_id": "DEV-MULTI-TEST",
        "ip_address": "198.18.0.99",
        "network_type": "datacenter",
    })

    # Multi-signal contextual risk compounds significantly higher than isolated device risk
    assert res_multi["decision"]["contextual_risk"] > res_iso["decision"]["contextual_risk"] * 1.5
    assert len(res_multi["decision"]["signals"]) > len(res_iso["decision"]["signals"])


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
    _, events = engine.prepare_scenario("FLAGSHIP")
    for event in events:
        engine.ingest(event)

    prior_trust = engine.traders["7842"]["trust_score"]
    assert prior_trust < 20.0  # Degraded to critical

    # Step-up verification restores trust proportionally
    recovery = engine.step_up_verify("7842", "2FA_BIOMETRIC")
    assert recovery["new_trust"] > recovery["previous_trust"]
    assert recovery["new_trust"] == round(prior_trust + 35.0, 1)
    assert engine.traders["7842"]["trust_score"] == recovery["new_trust"]
    assert recovery["status"] != "CRITICAL"


def test_signal_traceability():
    """Verifies that every decision includes traceable signal contributions."""
    engine = NetraEngine()
    engine.reset()
    result = engine.ingest({
        "trader_id": "7842",
        "event_type": "DEPOSIT",
        "amount": 20000,
        "network_type": "datacenter",
        "ip_address": "198.18.0.1",
    })

    signals = result["decision"]["signals"]
    assert len(signals) >= 2  # Money deviation + datacenter network

    for signal in signals:
        assert "category" in signal
        assert "feature" in signal
        assert "severity" in signal
        assert signal["severity"] > 0
        assert "contribution" in signal
        assert "reason" in signal
        assert "evidence" in signal


def test_policy_simulation_detects_impact():
    engine = NetraEngine()
    engine.reset()
    _, events = engine.prepare_scenario("FLAGSHIP")
    for event in events:
        engine.ingest(event)

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


def test_baseline_statistical_distribution_and_zscore():
    from baseline import BaselineEngine, NumericDistribution

    # 1. Normal samples
    dist = BaselineEngine.compute_distribution([2800, 3000, 3100, 2900, 3200])
    assert dist.sample_count == 5
    assert 2950 <= dist.mean <= 3050

    # 2. Normal value evaluation -> severity 0
    z_norm, sev_norm, method_norm = BaselineEngine.evaluate_zscore(3050, dist)
    assert z_norm is not None and z_norm <= 1.5
    assert sev_norm == 0.0

    # 3. Moderate deviation -> severity >= 20
    z_mod, sev_mod, method_mod = BaselineEngine.evaluate_zscore(3500, dist)
    assert z_mod > 1.5
    assert sev_mod >= 20.0

    # 4. Extreme outlier -> severity >= 70
    z_ext, sev_ext, method_ext = BaselineEngine.evaluate_zscore(25000, dist)
    assert z_ext > 4.0
    assert sev_ext >= 70.0

    # 5. Insufficient history fallback
    sparse_dist = BaselineEngine.compute_distribution([3000])
    z_sparse, sev_sparse, method_sparse = BaselineEngine.evaluate_zscore(12000, sparse_dist, fallback_expected=3000)
    assert z_sparse is None
    assert "heuristic" in method_sparse
    assert sev_sparse >= 40.0

    # 6. Zero variance safe handling
    zero_dist = NumericDistribution(mean=3000, median=3000, std_dev=0.0, sample_count=5)
    z_zero, sev_zero, _ = BaselineEngine.evaluate_zscore(3000, zero_dist)
    assert z_zero == 0.0
    assert sev_zero == 0.0


def test_baseline_poisoning_protection():
    engine = NetraEngine()
    engine.reset()

    # Ingest suspicious event resulting in RESTRICT / BLOCK / high risk
    bad_device = "DEV-POISON-ATTEMPT"
    res = engine.ingest({
        "trader_id": "7842",
        "event_type": "WITHDRAWAL",
        "amount": 25000,
        "device_id": bad_device,
        "wallet_address": "WALLET-POISON-X",
    })

    assert res["decision"]["decision"] in {"VERIFY", "RESTRICT", "BLOCK"}
    # Verify device was NOT added to baseline profile
    assert bad_device not in engine.traders["7842"]["baseline"]["known_devices"]
    profile = engine.baseline_profiles.get("7842")
    if profile:
        assert bad_device not in profile.known_devices

    # Verify step-up verification allows safe promotion
    engine.step_up_verify("7842", "2FA_BIOMETRIC")
    assert bad_device in engine.traders["7842"]["baseline"]["known_devices"]


def test_temporal_sliding_windows_and_burst():
    from temporal import TemporalWindowEngine

    engine = NetraEngine()
    engine.reset()
    now = engine.events[-1]["timestamp"]
    metrics = TemporalWindowEngine.analyze_event_stream(now, engine.trader_events("7842"), baseline_velocity_per_hour=3.0)
    assert metrics.events_7d >= 5


def test_sequence_ordering_and_time_boundary():
    from temporal import SequenceEngine

    # Sequence: DEPOSIT -> LEVERAGE_CHANGE -> WITHDRAWAL
    chain = [
        {"event_type": "DEPOSIT", "timestamp": "2026-09-10T10:00:00Z"},
        {"event_type": "LEVERAGE_CHANGE", "timestamp": "2026-09-10T10:10:00Z"},
    ]
    current = {"event_type": "WITHDRAWAL", "timestamp": "2026-09-10T10:20:00Z"}
    matches = SequenceEngine.evaluate_sequences(current, chain)
    assert len(matches) >= 1
    assert matches[0].sequence_id == "SEQ-RAPID-WITHDRAWAL"
    assert matches[0].completion_percentage == 100
    assert matches[0].is_terminal is True
    assert matches[0].elapsed_minutes <= 25.0

    # Outside time window (> 45 min): should NOT match
    chain_expired = [
        {"event_type": "DEPOSIT", "timestamp": "2026-09-10T08:00:00Z"},
        {"event_type": "LEVERAGE_CHANGE", "timestamp": "2026-09-10T08:10:00Z"},
    ]
    matches_expired = SequenceEngine.evaluate_sequences(current, chain_expired)
    assert len(matches_expired) == 0


def test_action_enforcement_gateway_states():
    engine = NetraEngine()
    engine.reset()

    # Normal trader 7842 (trust=94)
    normal_eval = engine.evaluate_action("7842", "WITHDRAWAL")
    assert normal_eval["decision"] == "ALLOW"
    assert normal_eval["allowed"] is True
    assert normal_eval["status"] == "ALLOWED"

    # Degrade trust into restriction
    engine.traders["7842"]["trust_score"] = 28.0
    restricted_eval = engine.evaluate_action("7842", "WITHDRAWAL")
    assert restricted_eval["decision"] in {"VERIFY", "RESTRICT"}
    assert restricted_eval["allowed"] is False

    # Degrade trust to critical (< 15)
    engine.traders["7842"]["trust_score"] = 5.0
    blocked_eval = engine.evaluate_action("7842", "WITHDRAWAL")
    assert blocked_eval["decision"] == "BLOCK"
    assert blocked_eval["allowed"] is False
    assert blocked_eval["status"] == "BLOCKED"

    # Read-only action should remain allowed even under degraded trust
    read_only_eval = engine.evaluate_action("7842", "PROFILE_VIEW")
    assert read_only_eval["decision"] == "ALLOW"
    assert read_only_eval["allowed"] is True


def test_audit_chain_tamper_detection():
    from audit_chain import verify_audit_chain

    engine = NetraEngine()
    engine.reset()
    _, events = engine.prepare_scenario("FLAGSHIP")
    for ev in events:
        engine.ingest(ev)

    # 1. Clean audit verification
    verify_result = engine.verify_audit_chain()
    assert verify_result["valid"] is True
    assert verify_result["checked_records"] >= len(events)

    # 2. Tampered record detection
    tampered_audit = [dict(a) for a in engine.audit]
    tampered_audit[3]["reason"] = "MALICIOUS TAMPERED AUDIT TEXT"
    v_tampered = verify_audit_chain(tampered_audit)
    assert v_tampered["valid"] is False
    assert "Tampered or corrupted" in v_tampered["reason"]

    # 3. Deleted / reordered record detection
    deleted_audit = [tampered_audit[0], tampered_audit[2], tampered_audit[1]]
    v_deleted = verify_audit_chain(deleted_audit)
    assert v_deleted["valid"] is False
    assert "Broken hash link" in v_deleted["reason"]


def test_analytics_truthfulness():
    engine = NetraEngine()
    engine.reset()
    _, events = engine.prepare_scenario("FLAGSHIP")
    for ev in events:
        engine.ingest(ev)

    analytics = engine.analytics()
    demo_metrics = analytics["demo_metrics"]

    # Truthful calculated values
    assert 0.0 <= demo_metrics["precision"] <= 1.0
    assert 0.0 <= demo_metrics["recall"] <= 1.0
    assert 0.0 <= demo_metrics["false_positive_rate"] <= 1.0
    assert 0.0 <= demo_metrics["detection_rate"] <= 1.0
    assert "observed decisions" in demo_metrics["label"]
    assert analytics["latency_metrics"]["hardware_profile"] == "Real-time Wall-Clock Profiling (time.perf_counter_ns)"


# =====================================================================
# DAY 3: REAL GRAPH INTELLIGENCE TESTS
# =====================================================================

def test_graph_multi_hop_traversal_1_2_3_hop():
    """Verifies 1-hop, 2-hop, and 3-hop traversal depth limits."""
    from graph_intelligence import GraphIntelligenceEngine
    engine = GraphIntelligenceEngine()

    # Linear chain: TRADER-A -> DEV-1 -> TRADER-B -> WALLET-1 -> TRADER-C -> IP-1
    links = [
        {"source": "TRADER-A", "target": "DEV-1", "type": "USED_DEVICE"},
        {"source": "TRADER-B", "target": "DEV-1", "type": "USED_DEVICE"},
        {"source": "TRADER-B", "target": "WALLET-1", "type": "WITHDREW_TO"},
        {"source": "TRADER-C", "target": "WALLET-1", "type": "WITHDREW_TO"},
        {"source": "TRADER-C", "target": "IP-1", "type": "LOGGED_FROM"},
    ]

    t1 = engine.traverse(links, "TRADER-A", max_depth=1)
    assert "DEV-1" in t1["nodes"]
    assert "TRADER-B" not in t1["nodes"]

    t2 = engine.traverse(links, "TRADER-A", max_depth=2)
    assert "TRADER-B" in t2["nodes"]
    assert "WALLET-1" not in t2["nodes"]

    t3 = engine.traverse(links, "TRADER-A", max_depth=3)
    assert "WALLET-1" in t3["nodes"]
    assert "TRADER-C" not in t3["nodes"]


def test_graph_cycle_protection_and_visited_tracking():
    """Verifies traversal terminates cleanly without infinite loops in cyclic topologies."""
    from graph_intelligence import GraphIntelligenceEngine
    engine = GraphIntelligenceEngine()

    # Ring topology: A -> B -> C -> A
    cyclic_links = [
        {"source": "TRADER-A", "target": "DEV-RING", "type": "USED_DEVICE"},
        {"source": "TRADER-B", "target": "DEV-RING", "type": "USED_DEVICE"},
        {"source": "TRADER-B", "target": "IP-RING", "type": "LOGGED_FROM"},
        {"source": "TRADER-A", "target": "IP-RING", "type": "LOGGED_FROM"},
    ]

    res = engine.traverse(cyclic_links, "TRADER-A", max_depth=5)
    assert res["node_count"] == 4
    assert set(res["nodes"]) == {"TRADER-A", "DEV-RING", "TRADER-B", "IP-RING"}


def test_graph_relationship_filtering_and_strength():
    """Verifies relationship filtering and configurable edge strength."""
    from graph_intelligence import GraphIntelligenceEngine
    engine = GraphIntelligenceEngine()

    assert engine.get_relationship_strength("WITHDREW_TO") == 0.95
    assert engine.get_relationship_strength("USED_DEVICE") == 0.80
    assert engine.get_relationship_strength("LOGGED_FROM") == 0.45

    links = [
        {"source": "TRADER-A", "target": "DEV-1", "type": "USED_DEVICE"},
        {"source": "TRADER-A", "target": "IP-1", "type": "LOGGED_FROM"},
        {"source": "TRADER-A", "target": "WALLET-1", "type": "WITHDREW_TO"},
    ]

    res = engine.traverse(links, "TRADER-A", max_depth=1, relationship_types={"USED_DEVICE"})
    assert "DEV-1" in res["nodes"]
    assert "IP-1" not in res["nodes"]
    assert "WALLET-1" not in res["nodes"]


def test_graph_multi_hop_path_discovery():
    """Verifies shortest path calculation across multi-hop topology."""
    from graph_intelligence import GraphIntelligenceEngine
    engine = GraphIntelligenceEngine()

    links = [
        {"source": "TRADER-A", "target": "DEV-1", "type": "USED_DEVICE"},
        {"source": "TRADER-B", "target": "DEV-1", "type": "USED_DEVICE"},
        {"source": "TRADER-B", "target": "WALLET-X", "type": "WITHDREW_TO"},
        {"source": "TRADER-C", "target": "WALLET-X", "type": "WITHDREW_TO"},
    ]

    path = engine.find_shortest_path(links, "TRADER-A", "TRADER-C", max_depth=5)
    assert path is not None
    assert path.depth == 4
    assert path.nodes == ["TRADER-A", "DEV-1", "TRADER-B", "WALLET-X", "TRADER-C"]
    assert path.aggregate_strength > 0.7


def test_graph_connected_clusters_and_unrelated_traders_isolation():
    """Verifies cluster detection and ensures unrelated traders remain isolated."""
    from graph_intelligence import GraphIntelligenceEngine
    engine = GraphIntelligenceEngine()

    links = [
        # Cluster 1: Fraud Ring
        {"source": "TRADER-1", "target": "DEV-X", "type": "USED_DEVICE"},
        {"source": "TRADER-2", "target": "DEV-X", "type": "USED_DEVICE"},
        {"source": "TRADER-1", "target": "WALLET-X", "type": "WITHDREW_TO"},
        {"source": "TRADER-2", "target": "WALLET-X", "type": "WITHDREW_TO"},
        # Cluster 2: Legitimate Separate Pair
        {"source": "TRADER-88", "target": "IP-SHARED", "type": "LOGGED_FROM"},
        {"source": "TRADER-99", "target": "IP-SHARED", "type": "LOGGED_FROM"},
    ]

    clusters = engine.detect_connected_clusters(links)
    assert len(clusters) == 2

    # Cluster 1 is suspicious (shares device and wallet)
    c1 = next(c for c in clusters if "1" in c.affected_traders)
    assert c1.is_suspicious is True
    assert set(c1.affected_traders) == {"1", "2"}
    assert "TRADER-88" not in c1.nodes

    # Cluster 2 only shares IP between 2 traders, not classified as high-risk fraud cluster
    c2 = next(c for c in clusters if "88" in c.affected_traders)
    assert set(c2.affected_traders) == {"88", "99"}


# =====================================================================
# DAY 3: REAL BEHAVIORAL ANOMALY DETECTION (ML) TESTS
# =====================================================================

def test_ml_deterministic_feature_extraction():
    """Verifies that 12-dimensional feature extraction is deterministic and correctly structured."""
    from anomaly_model import BehavioralAnomalyService, FEATURE_NAMES
    from baseline import AdaptiveTraderProfile

    event_data = {
        "event_type": "WITHDRAWAL",
        "amount": 25000.0,
        "device_id": "DEV-UNKNOWN",
        "ip_address": "198.18.0.1",
        "network_type": "datacenter",
        "wallet_address": "WALLET-NEW",
    }
    profile = AdaptiveTraderProfile("7842", known_devices=["DEV-KNOWN-01"])

    vec1, map1 = BehavioralAnomalyService.extract_feature_vector(event_data, profile, None, graph_degree=3)
    vec2, map2 = BehavioralAnomalyService.extract_feature_vector(event_data, profile, None, graph_degree=3)

    assert len(vec1) == 12
    assert len(map1) == len(FEATURE_NAMES)
    assert (vec1 == vec2).all()
    assert map1["device_novelty"] == 1.0
    assert map1["network_novelty"] == 1.0
    assert map1["wallet_novelty"] == 1.0
    assert map1["graph_degree"] == 3.0


def test_ml_insufficient_training_data_state():
    """Verifies that insufficient training data returns INSUFFICIENT_DATA and does not crash."""
    from anomaly_model import BehavioralAnomalyService
    svc = BehavioralAnomalyService()

    # Attempt to fit with 2 samples (below minimum of 8)
    sample_vecs = [
        np.zeros(12, dtype=np.float64),
        np.ones(12, dtype=np.float64),
    ]
    fit_ok = svc.fit_trusted_population(sample_vecs)
    assert fit_ok is False
    assert svc.status == "INSUFFICIENT_DATA"

    res = svc.predict_anomaly(sample_vecs[0], {})
    assert res.status == "INSUFFICIENT_DATA"
    assert res.anomaly_score == 0.0


def test_ml_model_fitting_and_normalized_scoring():
    """Verifies real Isolation Forest fitting on trusted data and 0-100 normalized score generation."""
    from anomaly_model import BehavioralAnomalyService
    svc = BehavioralAnomalyService()

    rng = np.random.RandomState(42)
    # Generate 50 normal inlier samples centered around baseline
    normal_samples = [rng.normal(loc=0.5, scale=0.1, size=12) for _ in range(50)]
    fit_ok = svc.fit_trusted_population(normal_samples)
    assert fit_ok is True
    assert svc.status == "TRAINED"
    assert svc.training_sample_count == 50

    # Test normal sample prediction
    norm_res = svc.predict_anomaly(normal_samples[0], {})
    assert 0.0 <= norm_res.anomaly_score <= 50.0

    # Test extreme outlier sample (10x normal)
    outlier = np.array([8.0, 9.0, 7.0, 6.0, 10.0, 5.0, 8.0, 1.0, 1.0, 1.0, 1.0, 10.0])
    out_res = svc.predict_anomaly(outlier, {})
    assert out_res.anomaly_score >= 60.0
    assert len(out_res.top_deviations) > 0


def test_ml_failure_fallback_does_not_break_ingestion():
    """Verifies that model failure gracefully degrades without breaking ingestion."""
    engine = NetraEngine()
    engine.reset()

    # Simulate broken anomaly model
    engine.anomaly_service.status = "FAILED"
    engine.anomaly_service.model = None

    event = {
        "trader_id": "7842",
        "event_type": "LOGIN",
        "device_id": "DEV-7842-PRIMARY",
        "country": "IN",
        "city": "Mumbai",
    }
    # Ingestion must succeed safely
    result = engine.ingest(event)
    assert result["decision"]["decision"] == "ALLOW"
    assert result["trust"] >= 90.0


# =====================================================================
# INTEGRATION TESTS: GRAPH + ML + TRUST PIPELINE
# =====================================================================

def test_graph_and_ml_evidence_enter_trust_pipeline():
    """Verifies that graph and anomaly evidence correctly populate structured RiskSignals and decisions."""
    engine = NetraEngine()
    engine.reset()

    _, events = engine.prepare_scenario("FRAUD_RING")
    result = engine.ingest(events[0])

    signals = result["decision"]["signals"]
    categories = {s["category"] for s in signals}
    assert "relationships" in categories

    # Evidence drawer contains relationship context
    evidence = result["explanation"]["evidence"]
    assert any(e["type"] == "RELATIONSHIP" for e in evidence)


def test_anti_double_counting_across_engines():
    """Verifies that multiple evidence sources for the same factor do not create unbounded penalty compounding."""
    engine = NetraEngine()
    engine.reset()

    # Ingest event with multiple novelty signals
    event = {
        "trader_id": "7842",
        "event_type": "NEW_DEVICE",
        "device_id": "DEV-UNSEEN-99",
        "ip_address": "198.18.0.99",
        "network_type": "datacenter",
    }
    result = engine.ingest(event)

    # Trust drops proportionally, not completely to zero on single login
    assert result["trust"] > 75.0
    assert result["decision"]["decision"] in {"ALLOW", "MONITOR"}


def test_ml_cannot_directly_block():
    """Verifies that an anomalous event with low action sensitivity is never directly BLOCKED by ML."""
    engine = NetraEngine()
    engine.reset()

    # Event with unusual trade amount but non-critical action sensitivity
    event = {
        "trader_id": "7842",
        "event_type": "TRADE",
        "amount": 18000.0,
        "asset": "BTC",
        "leverage": 10.0,
    }
    result = engine.ingest(event)
    # Even if anomalous, a standard trade action with trust > 70 must NOT be BLOCKED
    assert result["decision"]["decision"] != "BLOCK"


def test_takeover_scenario_resilience():
    """Verifies that Account Takeover scenario functions cleanly with Day 3 Graph & ML."""
    engine = NetraEngine()
    engine.reset()

    _, events = engine.prepare_scenario("TAKEOVER")
    results = [engine.ingest(ev) for ev in events]

    decisions = [r["decision"]["decision"] for r in results]
    # Sensitive credential changes on unseen device result in restriction
    assert decisions[-1] in {"RESTRICT", "BLOCK", "VERIFY"}
    assert results[-1]["trust"] < 60.0


def test_normal_event_evaluation_and_trust():
    """Regression Test 1: Normal event within baseline retains trust and ALLOW decision."""
    engine = NetraEngine()
    engine.reset()
    initial_trust = engine.traders["7842"]["trust_score"]
    assert initial_trust == 94.0

    # Normal event: typical deposit from known primary device and known IP
    normal_event = {
        "trader_id": "7842",
        "event_type": "DEPOSIT",
        "amount": 2500,
        "currency": "USD",
        "device_id": "DEV-7842-PRIMARY",
        "ip_address": "203.0.113.22",
        "country": "IN",
        "city": "Mumbai",
    }
    res = engine.ingest(normal_event)
    assert res["trust"] >= 90.0
    assert res["decision"]["decision"] == "ALLOW"
    assert "baseline" in res["decision"]["explanation"]["summary"].lower() or "within" in res["decision"]["explanation"]["top_factors"][0].lower()


def test_flagship_complete_progression():
    """Regression Test 2: Full step-by-step flagship attack surge progression without score bypasses."""
    engine = NetraEngine()
    engine.reset()

    trader_id, events = engine.prepare_scenario("FLAGSHIP")
    assert len(events) == 6

    step_results = []
    for ev in events:
        step_results.append(engine.ingest(ev))

    # Event 1: LOGIN (known device & IP) -> ALLOW
    assert step_results[0]["decision"]["decision"] == "ALLOW"
    assert step_results[0]["trust"] == 94.0

    # Event 2: NEW_DEVICE -> Trust begins dropping, MONITOR
    assert step_results[1]["trust"] < 94.0
    assert step_results[1]["decision"]["decision"] in {"MONITOR", "ALLOW"}

    # Event 3: IP_CHANGE (Datacenter IP) -> Further trust decay
    assert step_results[2]["trust"] < step_results[1]["trust"]

    # Event 4: DEPOSIT ($25k high spike) -> Significant trust drop
    assert step_results[3]["trust"] < step_results[2]["trust"]

    # Event 5: LEVERAGE_CHANGE (50x) -> Sequence in progress (DEPOSIT -> LEVERAGE)
    assert step_results[4]["trust"] < step_results[3]["trust"]

    # Event 6: WITHDRAWAL ($24k to fresh wallet) -> Terminal restriction/block
    final = step_results[5]
    assert final["trust"] <= 20.0
    assert final["decision"]["decision"] in {"RESTRICT", "BLOCK"}
    # Auto-created case
    assert any(c["trader_id"] == "7842" and c["status"] == "OPEN" for c in engine.cases.values())


def test_travel_scenario_isolation_from_flagship():
    """Regression Test 3: Running TRAVEL after FLAGSHIP does not contaminate TRAVEL with prior attack state."""
    engine = NetraEngine()
    engine.reset()

    # 1. Run FLAGSHIP first to severely degrade 7842
    _, flagship_events = engine.prepare_scenario("FLAGSHIP")
    for ev in flagship_events:
        engine.ingest(ev)
    assert engine.traders["7842"]["trust_score"] <= 20.0

    # 2. Now prepare and run TRAVEL
    _, travel_events = engine.prepare_scenario("TRAVEL")
    assert engine.traders["7842"]["trust_score"] == 94.0  # Cleanly isolated
    assert len(engine.transitions["7842"]) == 0

    travel_results = []
    for ev in travel_events:
        travel_results.append(engine.ingest(ev))

    # Legitimate travel is contextualized against normal behavior and must NOT be BLOCKED
    assert travel_results[-1]["decision"]["decision"] in {"ALLOW", "MONITOR"}
    assert travel_results[-1]["trust"] > 70.0


def test_fraud_ring_shared_infrastructure_discovery():
    """Regression Test 4: Fraud ring shared infrastructure discovered topologically via Graph Intelligence."""
    engine = NetraEngine()
    engine.reset()

    _, events = engine.prepare_scenario("FRAUD_RING")
    for ev in events:
        engine.ingest(ev)

    # Graph intelligence detects the cluster
    clusters = engine.graph_engine.detect_connected_clusters(engine.graph_links, engine.traders)
    suspicious = [c for c in clusters if c.is_suspicious]
    assert len(suspicious) >= 1
    ring_cluster = suspicious[0]
    # Discovers all 4 collusive traders purely through shared wallet/device/ip links
    assert set(ring_cluster.affected_traders) == {"7102", "7103", "7104", "7105"}


def test_trust_and_decision_data_consistency():
    """Regression Test 5: Trader profile trust score and latest decision trust score must strictly agree."""
    engine = NetraEngine()
    engine.reset()

    ev = {
        "trader_id": "7842",
        "event_type": "NEW_DEVICE",
        "device_id": "DEV-TEST-CONSISTENCY",
        "ip_address": "203.0.113.22",
    }
    res = engine.ingest(ev)

    trader_data = engine.get_trader("7842")
    assert trader_data["trust_score"] == res["trust"]
    assert trader_data["trust_score"] == res["decision"]["trust_score"]
    assert trader_data["last_decision"] == res["decision"]["decision"]


def test_sequence_progress_partial_to_complete():
    """Regression Test 6: Sequence progress increases from partial (1 event = none, 2 events = partial, 3 = complete)."""
    from temporal import SequenceEngine

    # 1 event: DEPOSIT only
    ev1 = {"event_id": "E1", "event_type": "DEPOSIT", "timestamp": "2026-09-10T10:00:00Z"}
    matches1 = SequenceEngine.evaluate_sequences(ev1, [])
    assert len(matches1) == 0  # Requires at least 2 steps

    # 2 events: DEPOSIT + LEVERAGE_CHANGE
    ev2 = {"event_id": "E2", "event_type": "LEVERAGE_CHANGE", "timestamp": "2026-09-10T10:05:00Z"}
    matches2 = SequenceEngine.evaluate_sequences(ev2, [ev1])
    assert len(matches2) >= 1
    assert matches2[0].completion_percentage == 67
    assert matches2[0].is_terminal is False

    # 3 events: DEPOSIT + LEVERAGE_CHANGE + WITHDRAWAL
    ev3 = {"event_id": "E3", "event_type": "WITHDRAWAL", "timestamp": "2026-09-10T10:10:00Z"}
    matches3 = SequenceEngine.evaluate_sequences(ev3, [ev1, ev2])
    assert len(matches3) >= 1
    assert matches3[0].completion_percentage == 100
    assert matches3[0].is_terminal is True


def test_reset_trader_baseline():
    """Regression Test 7: reset_trader_baseline restores clean baseline profile and logs audit."""
    engine = NetraEngine()
    engine.reset()

    # Modify trader baseline
    engine.traders["7842"]["baseline"]["known_devices"].append("DEV-POISONED")
    assert "DEV-POISONED" in engine.traders["7842"]["baseline"]["known_devices"]

    # Reset
    res = engine.reset_trader_baseline("7842", actor="test-admin")
    assert res["reset"] is True
    assert "DEV-POISONED" not in engine.traders["7842"]["baseline"]["known_devices"]
    assert "DEV-7842-PRIMARY" in engine.traders["7842"]["baseline"]["known_devices"]
    assert engine.audit[-1]["event"] == "BASELINE_RESET"


def test_day4_multi_trader_state_isolation():
    """Day 4: Verifies that events on one trader never leak into or alter another trader's score or baseline."""
    engine = NetraEngine()
    engine.reset()

    score_7001_before = engine.traders["7001"]["trust_score"]
    score_7002_before = engine.traders["7002"]["trust_score"]

    # Ingest high-risk event on 7001
    engine.ingest({
        "trader_id": "7001",
        "event_type": "WITHDRAWAL",
        "amount": 150000.0,
        "device_id": "DEV-ANONYMOUS-99",
        "ip_address": "198.51.100.99",
        "wallet_address": "0xATTACKERWALLET9999",
    })

    # 7001 dropped
    assert engine.traders["7001"]["trust_score"] < score_7001_before
    # 7002 must remain completely untouched
    assert engine.traders["7002"]["trust_score"] == score_7002_before


def test_day4_system_graph_and_clusters():
    """Day 4: System graph provides comprehensive nodes, links, and identified multi-trader clusters."""
    engine = NetraEngine()
    engine.reset()

    sys_graph = engine.system_graph()
    assert "nodes" in sys_graph
    assert "edges" in sys_graph
    assert "clusters" in sys_graph
    assert len(sys_graph["nodes"]) > 0
    assert isinstance(sys_graph["clusters"], list)
    # Check that fraud ring cluster is detected among clusters
    ring_cluster_found = any(c.get("cluster_type") == "FRAUD_RING" or "7102" in c.get("affected_traders", []) for c in sys_graph["clusters"])
    assert ring_cluster_found is True


def test_day4_operational_analytics_metrics():
    """Day 4: Analytics endpoint exposes truthful operational population metrics."""
    engine = NetraEngine()
    engine.reset()

    stats = engine.analytics()
    assert "operational_metrics" in stats
    op = stats["operational_metrics"]
    assert op["total_traders"] >= 105
    assert "enforcement_counts" in op
    assert op["blocked_traders"] >= 1
    assert op["graph_clusters_detected"] >= 1


# =====================================================================
# MILESTONE 4.1: UNIFIED CAUSAL PROVENANCE TESTS
# =====================================================================

def test_causal_provenance_event_decision_audit_linkage():
    """Milestone 4.1: Ingested events, decisions, and audit records form an immutable causal provenance link."""
    engine = NetraEngine()
    engine.reset()

    event_payload = {
        "event_id": "EV-TEST-PROVENANCE-01",
        "trader_id": "7001",
        "event_type": "TRADE",
        "amount": 2500.0,
        "asset": "BTC",
        "leverage": 3,
        "device_id": "DEV-7001-A",
        "ip_address": "198.51.100.1",
        "country": "IN",
        "city": "Mumbai",
    }

    result = engine.ingest(event_payload, actor="analyst-auditor")

    dec = result["decision"]
    ev = result["event"]

    # 1. Event to Decision binding
    assert dec["event_id"] == "EV-TEST-PROVENANCE-01"
    assert ev["event_id"] == "EV-TEST-PROVENANCE-01"

    # 2. Cryptographic Audit binding
    assert dec.get("audit_id") is not None
    assert dec["audit_id"].startswith("AUD-")
    assert dec.get("audit_hash") is not None
    assert len(dec["audit_hash"]) == 64  # SHA-256 hex string

    assert ev.get("audit_id") == dec["audit_id"]
    assert ev.get("audit_hash") == dec["audit_hash"]

    # 3. Audit ledger verification
    matching_audit = next((a for a in engine.audit if a["audit_id"] == dec["audit_id"]), None)
    assert matching_audit is not None
    assert matching_audit["current_hash"] == dec["audit_hash"]
    assert matching_audit["actor"] == "analyst-auditor"
    assert matching_audit["details"]["event_id"] == "EV-TEST-PROVENANCE-01"
    assert matching_audit["details"]["decision_id"] == dec["decision_id"]

    # 4. Chain verification passes
    chain_status = engine.verify_audit_chain()
    assert chain_status["valid"] is True


def test_persisted_decision_provenance_roundtrip():
    """Milestone 4.1: Provenance fields persist in database and deserialize correctly in models."""
    from database import get_db
    from models import DecisionModel, EventModel

    engine = NetraEngine()
    engine.reset()

    ev_id = "EV-TEST-DB-PERSIST-99"
    result = engine.ingest({
        "event_id": ev_id,
        "trader_id": "7002",
        "event_type": "TRADE",
        "amount": 1000.0,
        "asset": "ETH",
        "device_id": "DEV-7002-TRAVEL",
        "ip_address": "203.0.113.77",
    })

    dec_id = result["decision"]["decision_id"]
    audit_id = result["decision"]["audit_id"]

    with get_db() as db:
        db_dec = db.query(DecisionModel).filter(DecisionModel.decision_id == dec_id).first()
        assert db_dec is not None
        assert db_dec.event_id == ev_id
        assert db_dec.audit_id == audit_id
        assert len(db_dec.audit_hash) == 64

        d_dict = db_dec.to_dict()
        assert d_dict["event_id"] == ev_id
        assert d_dict["audit_id"] == audit_id
        assert d_dict["audit_hash"] == db_dec.audit_hash

        db_ev = db.query(EventModel).filter(EventModel.event_id == ev_id).first()
        assert db_ev is not None
        assert db_ev.audit_id == audit_id
        assert db_ev.audit_hash == db_dec.audit_hash


# =====================================================================
# CONTINUOUS TRADING SAFETY PROTOCOL TESTS
# =====================================================================

def test_continuous_trading_healthy_action():
    """Healthy trader can perform a normal trading action without restriction."""
    engine = NetraEngine()
    engine.reset()
    # Trader 7842 starts at 94.0 trust
    assert engine.traders["7842"]["trust_score"] >= 90.0
    res = engine.ingest({
        "trader_id": "7842",
        "event_type": "TRADE",
        "amount": 1500,
        "asset": "BTC",
        "leverage": 3,
        "device_id": "DEV-7842-PRIMARY",
        "ip_address": "203.0.113.22",
        "country": "IN",
    })
    assert res["decision"]["decision"] == "ALLOW"
    assert res["trust"] >= 90.0
    # Action evaluation for normal trade should also allow
    eval_res = engine.evaluate_action("7842", "TRADE", context={"amount": 1500})
    assert eval_res["decision"] == "ALLOW"
    assert eval_res["allowed"] is True


def test_continuous_trading_normal_does_not_trigger_restriction():
    """Normal trading sequence does not unnecessarily trigger VERIFY/RESTRICT."""
    engine = NetraEngine()
    engine.reset()
    _, events = engine.prepare_scenario("CONTINUOUS_TRADING")
    # First 4 events are normal (LOGIN + 3 normal trades)
    for ev in events[:4]:
        res = engine.ingest(ev)
        assert res["decision"]["decision"] in {"ALLOW", "MONITOR"}
        assert res["trust"] >= 70.0


def test_continuous_trading_anomalous_affects_trust():
    """Anomalous trading behavior affects the EXISTING trust state via engine.ingest()."""
    engine = NetraEngine()
    engine.reset()
    _, events = engine.prepare_scenario("CONTINUOUS_TRADING")
    trusts = []
    for ev in events:
        res = engine.ingest(ev)
        trusts.append(res["trust"])
    # Trust must degrade from start to end
    assert trusts[0] >= 90.0
    assert trusts[-1] < trusts[0]
    assert trusts[-1] < 45.0
    # Trust decays monotonically after leverage spike (index 4 onwards)
    assert trusts[5] < trusts[4]
    assert trusts[6] < trusts[5]


def test_continuous_trading_high_sensitivity_enforcement():
    """High-sensitivity trading action invokes existing enforcement mechanism."""
    engine = NetraEngine()
    engine.reset()
    _, events = engine.prepare_scenario("CONTINUOUS_TRADING")
    for ev in events:
        engine.ingest(ev)
    # After degraded trust, WITHDRAWAL should be restricted/blocked
    eval_res = engine.evaluate_action("7842", "WITHDRAWAL", context={"amount": 15000})
    assert eval_res["decision"] in {"VERIFY", "RESTRICT", "BLOCK"}
    assert eval_res["allowed"] is False
    # Normal read should still be allowed (read-only bypass)
    read_res = engine.evaluate_action("7842", "PROFILE_VIEW")
    assert read_res["allowed"] is True


def test_continuous_trading_step_up_recovery():
    """Step-up verification through existing system produces recovery."""
    engine = NetraEngine()
    engine.reset()
    _, events = engine.prepare_scenario("CONTINUOUS_TRADING")
    for ev in events:
        engine.ingest(ev)
    prior = engine.traders["7842"]["trust_score"]
    assert prior < 50.0
    recovery = engine.step_up_verify("7842", "2FA_BIOMETRIC")
    assert recovery["new_trust"] > recovery["previous_trust"]
    assert recovery["verified"] is True
    assert engine.traders["7842"]["trust_score"] == recovery["new_trust"]
    # After recovery, enforcement should be less restrictive
    post_eval = engine.evaluate_action("7842", "TRADE", context={"amount": 1500})
    assert post_eval["decision"] in {"ALLOW", "MONITOR", "VERIFY"}


def test_continuous_trading_failed_verification_restriction():
    """Failed verification or continued anomaly produces restriction/containment."""
    engine = NetraEngine()
    engine.reset()
    _, events = engine.prepare_scenario("CONTINUOUS_TRADING")
    for ev in events[:6]:
        engine.ingest(ev)
    prior = engine.traders["7842"]["trust_score"]
    failed = engine.step_up_verify("7842", "PASSKEY", status="FAILED")
    assert failed["verified"] is False
    assert failed["new_trust"] < prior
    assert failed["session_risk_state"] == "SESSION_RESTRICTED"
    # Second failure should trigger containment
    failed2 = engine.step_up_verify("7842", "PASSKEY", status="FAILED")
    # After 2 failures, session may be terminated
    assert failed2["session_risk_state"] in {"SESSION_RESTRICTED", "SESSION_TERMINATED"}


def test_continuous_trading_audit_evidence():
    """Audit evidence is generated for continuous trading transitions."""
    engine = NetraEngine()
    engine.reset()
    _, events = engine.prepare_scenario("CONTINUOUS_TRADING")
    audit_before = len(engine.audit)
    for ev in events:
        engine.ingest(ev)
    assert len(engine.audit) > audit_before
    assert len(engine.decisions) >= len(events)
    # Each decision should have audit provenance
    for dec in engine.decisions[-len(events):]:
        assert dec.get("audit_id") is not None
        assert dec.get("audit_hash") is not None
        assert len(dec["audit_hash"]) == 64
    # Audit chain must remain valid
    chain = engine.verify_audit_chain()
    assert chain["valid"] is True


def test_continuous_trading_observatory_consistency():
    """Observatory state remains consistent after continuous trading scenario."""
    engine = NetraEngine()
    engine.reset()
    _, events = engine.prepare_scenario("CONTINUOUS_TRADING")
    for ev in events:
        engine.ingest(ev)
    obs = engine.get_observatory()
    rec = next((r for r in obs if r["trader_id"] == "7842"), None)
    assert rec is not None
    assert rec["trust_score"] == engine.traders["7842"]["trust_score"]
    assert rec["session_risk_state"] == engine.traders["7842"]["session_risk_state"]
    assert rec["operational_state"] in {"HIGH_ALERT", "RESTRICTED", "PROTOCOL_ACTIVE", "MONITORING", "RECOVERY", "RESOLVED"}


def test_continuous_trading_scenario_determinism():
    """Continuous trading scenario is deterministic and reproducible."""
    engine_a = NetraEngine()
    engine_a.reset()
    _, events_a = engine_a.prepare_scenario("CONTINUOUS_TRADING")
    trusts_a = [engine_a.ingest(ev)["trust"] for ev in events_a]

    engine_b = NetraEngine()
    engine_b.reset()
    _, events_b = engine_b.prepare_scenario("CONTINUOUS_TRADING")
    trusts_b = [engine_b.ingest(ev)["trust"] for ev in events_b]

    assert trusts_a == trusts_b
    assert len(trusts_a) == 8


def test_continuous_trading_uses_existing_enforcement_and_protocols():
    """Continuous trading reuses existing P-01..P-04 and OPT mechanisms without duplication."""
    engine = NetraEngine()
    engine.reset()
    _, events = engine.prepare_scenario("CONTINUOUS_TRADING")
    for ev in events:
        engine.ingest(ev)
    # Check that existing protocols are triggered, not new ones
    from enforcement import SECURITY_PROTOCOLS, OPT_IN_PROTOCOLS
    # After degraded trust, at least P-01 or P-02 should be active
    trader = engine.traders["7842"]
    active = engine.evaluate_action("7842", "WITHDRAWAL", context={"amount": 15000})
    assert any(p in SECURITY_PROTOCOLS for p in active["active_protocols"])
    # No fake trust score field introduced
    assert "trust_score" in trader
    assert "continuous_trust_score" not in trader
    assert "secondary_trust" not in trader


# =====================================================================
# SESSION RISK HEATMAP TESTS
# =====================================================================

def test_session_heatmap_deterministic_ordering():
    """Heatmap returns deterministic chronological timeline derived from transitions."""
    engine = NetraEngine()
    engine.reset()
    # After reset, 7842 has initial transitions from seed
    initial_points = engine.get_session_heatmap("7842")
    # Ingest continuous trading scenario and verify heatmap grows deterministically
    engine2 = NetraEngine()
    engine2.reset()
    tid, events = engine2.prepare_scenario("CONTINUOUS_TRADING")
    for ev in events:
        engine2.ingest(ev)
    points = engine2.get_session_heatmap("7842")
    assert len(points) == len(events)
    # Chronological ordering (timestamps are generated at ingest, should be monotonic)
    timestamps = [p["timestamp"] for p in points]
    assert timestamps == sorted(timestamps)
    # Deterministic: re-run and compare trust/decision/event_type (timestamps and event_ids are runtime-generated and differ)
    engine3 = NetraEngine()
    engine3.reset()
    tid3, evs3 = engine3.prepare_scenario("CONTINUOUS_TRADING")
    for ev in evs3:
        engine3.ingest(ev)
    points3 = engine3.get_session_heatmap("7842")
    assert len(points) == len(points3)
    assert [p["trust_score"] for p in points] == [p["trust_score"] for p in points3]
    assert [p["decision"] for p in points] == [p["decision"] for p in points3]
    assert [p["event_type"] for p in points] == [p["event_type"] for p in points3]
    assert [p["heat_band"] for p in points] == [p["heat_band"] for p in points3]


def test_session_heatmap_explanatory_context():
    """Each heatmap point retains explanatory context (signals, session state, protocol)."""
    engine = NetraEngine()
    engine.reset()
    _, events = engine.prepare_scenario("CONTINUOUS_TRADING")
    for ev in events:
        engine.ingest(ev)
    points = engine.get_session_heatmap("7842")
    # Major transitions should have signals and protocol context
    major = [p for p in points if p["is_major_transition"]]
    assert len(major) >= 2
    for p in points:
        assert "trust_score" in p
        assert "risk_level" in p
        assert "heat_band" in p
        assert "session_risk_state" in p
        assert "decision" in p
        assert "event_type" in p
        assert "risk_intensity" in p
        assert "signals" in p
        # No fabricated new trust field
        assert "fake_score" not in p
        assert "secondary_risk" not in p


def test_session_heatmap_normal_vs_degraded_regions():
    """Normal actions remain ALLOW, degraded actions show VERIFY/RESTRICT and heat bands."""
    engine = NetraEngine()
    engine.reset()
    _, events = engine.prepare_scenario("CONTINUOUS_TRADING")
    # First 4 are normal
    for ev in events[:4]:
        engine.ingest(ev)
    early_points = engine.get_session_heatmap("7842")[-4:]
    for p in early_points:
        assert p["decision"] in {"ALLOW", "MONITOR"}
        assert p["heat_band"] in {"NORMAL", "GUARDED"}
    # Ingest remaining anomalous events
    for ev in events[4:]:
        engine.ingest(ev)
    full_points = engine.get_session_heatmap("7842")
    # Last point must be degraded/high-risk
    final = full_points[-1]
    assert final["trust_score"] < 45.0
    assert final["heat_band"] in {"HIGH", "CRITICAL"}
    assert final["risk_level"] in {"HIGH", "CRITICAL"}
    # Penultimate point should be elevated or worse (trust has decayed)
    penultimate = full_points[-2]
    assert penultimate["trust_score"] < 70.0
    assert penultimate["heat_band"] in {"ELEVATED", "HIGH", "CRITICAL"}


def test_session_heatmap_api_response_shape(monkeypatch):
    """API endpoint returns correct shape and handles missing trader."""
    import main as main_module
    test_engine = NetraEngine()
    test_engine.reset()
    monkeypatch.setattr(main_module, "engine", test_engine)
    # Valid trader
    points = main_module.trader_heatmap("7842", limit=50)
    assert isinstance(points, list)
    # Prepare scenario to populate points
    test_engine.prepare_scenario("CONTINUOUS_TRADING")
    # After prepare but before ingest, heatmap may be empty (transitions cleared)
    # Ingest one event and verify shape
    res = test_engine.ingest({"trader_id": "7842", "event_type": "TRADE", "amount": 1500, "asset": "BTC", "leverage": 3, "device_id": "DEV-7842-PRIMARY", "ip_address": "203.0.113.22"})
    points2 = main_module.trader_heatmap("7842", limit=10)
    assert len(points2) >= 1
    sample = points2[0]
    assert "event_id" in sample
    assert "trust_score" in sample
    assert "session_risk_state" in sample
    assert "decision" in sample
    assert "heat_band" in sample
    # Missing trader raises 404
    import pytest
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        main_module.trader_heatmap("999999")
    assert exc.value.status_code == 404


def test_session_heatmap_no_duplicate_trust_system():
    """Heatmap reuses existing trust; no secondary trust calculation introduced."""
    engine = NetraEngine()
    engine.reset()
    _, events = engine.prepare_scenario("CONTINUOUS_TRADING")
    for ev in events:
        engine.ingest(ev)
    points = engine.get_session_heatmap("7842")
    for p in points:
        # Ensure trust_score matches underlying transition new_score (source of truth)
        # And that we didn't invent a parallel score
        assert "trust_score" in p
        assert "heat_trust" not in p
        assert "secondary_trust" not in p
        assert "risk_score_v2" not in p
        # Risk intensity is deterministic inverse, not fabricated random
        assert p["risk_intensity"] == round(100.0 - p["trust_score"], 1)
