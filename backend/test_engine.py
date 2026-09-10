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




