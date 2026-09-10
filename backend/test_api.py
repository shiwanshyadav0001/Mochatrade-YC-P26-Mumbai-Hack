import asyncio
from contextlib import contextmanager
from copy import deepcopy

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

import engine as engine_module
import main


def valid_event(trader_id: str = "7842") -> dict[str, str]:
    return {"trader_id": trader_id, "event_type": "LOGIN"}


def test_event_input_rejects_missing_trader_id():
    with pytest.raises(ValidationError) as error:
        main.EventInput(event_type="LOGIN")
    assert error.value.errors()[0]["type"] == "missing"


def test_event_input_rejects_malformed_trader_id():
    with pytest.raises(ValidationError) as error:
        main.EventInput(**valid_event("TRADER-7842"))
    assert error.value.errors()[0]["type"] == "string_pattern_mismatch"


def test_post_event_returns_404_for_unknown_trader(monkeypatch):
    test_engine = engine_module.NetraEngine()
    monkeypatch.setattr(main, "engine", test_engine)

    with pytest.raises(HTTPException) as error:
        asyncio.run(main.post_event(main.EventInput(**valid_event("999999")), {"actor_id": "test"}))

    assert error.value.status_code == 404
    assert error.value.detail == "Trader not found"


def test_post_event_accepts_existing_trader(monkeypatch):
    test_engine = engine_module.NetraEngine()
    monkeypatch.setattr(main, "engine", test_engine)

    result = asyncio.run(main.post_event(main.EventInput(**valid_event()), {"actor_id": "test"}))

    assert result["event"]["trader_id"] == "7842"


def test_event_persistence_failure_restores_memory(monkeypatch):
    test_engine = engine_module.NetraEngine()
    trader_before = deepcopy(test_engine.traders["7842"])
    events_before = deepcopy(test_engine.events)
    decisions_before = deepcopy(test_engine.decisions)
    transitions_before = deepcopy(test_engine.transitions["7842"])
    audit_before = deepcopy(test_engine.audit)
    graph_links_before = deepcopy(test_engine.graph_links)

    class BrokenSession:
        def query(self, *_args, **_kwargs):
            raise RuntimeError("database unavailable")

    @contextmanager
    def broken_db():
        yield BrokenSession()

    monkeypatch.setattr(engine_module, "get_db", broken_db)

    with pytest.raises(RuntimeError, match="database unavailable"):
        test_engine.ingest(valid_event())

    assert test_engine.traders["7842"] == trader_before
    assert test_engine.events == events_before
    assert test_engine.decisions == decisions_before
    assert test_engine.transitions["7842"] == transitions_before
    assert test_engine.audit == audit_before
    assert test_engine.graph_links == graph_links_before


def test_post_event_returns_500_for_database_failure(monkeypatch):
    test_engine = engine_module.NetraEngine()
    monkeypatch.setattr(main, "engine", test_engine)

    class BrokenSession:
        def query(self, *_args, **_kwargs):
            raise RuntimeError("database unavailable")

    @contextmanager
    def broken_db():
        yield BrokenSession()

    monkeypatch.setattr(engine_module, "get_db", broken_db)

    with pytest.raises(HTTPException) as error:
        asyncio.run(main.post_event(main.EventInput(**valid_event()), {"actor_id": "test"}))

    assert error.value.status_code == 500
    assert error.value.detail == "Database write failed"


def test_action_evaluate_endpoint(monkeypatch):
    test_engine = engine_module.NetraEngine()
    monkeypatch.setattr(main, "engine", test_engine)

    body = main.ActionEvaluationInput(trader_id="7842", action="WITHDRAWAL", amount=5000)
    res = main.evaluate_action_endpoint(body, {"actor_id": "analyst-01", "role": "RISK_ANALYST"})
    assert res["trader_id"] == "7842"
    assert res["action"] == "WITHDRAWAL"
    assert res["decision"] in {"ALLOW", "MONITOR", "VERIFY", "RESTRICT", "BLOCK"}
    assert "status" in res


def test_audit_verify_endpoint(monkeypatch):
    test_engine = engine_module.NetraEngine()
    monkeypatch.setattr(main, "engine", test_engine)

    res = main.verify_audit_endpoint({"actor_id": "viewer-01", "role": "VIEWER"})
    assert res["valid"] is True
    assert "checked_records" in res


def test_trader_baseline_endpoint(monkeypatch):
    test_engine = engine_module.NetraEngine()
    monkeypatch.setattr(main, "engine", test_engine)

    res = main.trader_baseline_endpoint("7842")
    assert "deposit_amount" in res
    assert "countries" in res


def test_rbac_viewer_denied_modifications():
    viewer_actor = {"actor_id": "viewer-01", "role": "VIEWER"}
    checker = main.require_role({"ADMIN", "RISK_ANALYST"})

    with pytest.raises(HTTPException) as err:
        checker(viewer_actor)
    assert err.value.status_code == 403
    assert "Access denied" in err.value.detail


def test_rbac_admin_allowed_policy_update():
    admin_actor = {"actor_id": "admin-01", "role": "ADMIN"}
    checker = main.require_role({"ADMIN"})
    res = checker(admin_actor)
    assert res["role"] == "ADMIN"


def test_graph_intelligence_endpoint(monkeypatch):
    test_engine = engine_module.NetraEngine()
    monkeypatch.setattr(main, "engine", test_engine)

    res = main.trader_graph_intelligence("7842")
    assert res["trader_id"] == "7842"
    assert "traversal" in res
    assert "nodes" in res["traversal"]
    assert "relationship_strengths" in res


def test_anomaly_status_endpoint(monkeypatch):
    test_engine = engine_module.NetraEngine()
    monkeypatch.setattr(main, "engine", test_engine)

    res = main.anomaly_status()
    assert "model_available" in res
    assert "status" in res
    assert "algorithm" in res
    assert "feature_count" in res
    assert res["feature_count"] == 12


def test_trader_anomaly_endpoint(monkeypatch):
    test_engine = engine_module.NetraEngine()
    monkeypatch.setattr(main, "engine", test_engine)

    res = main.trader_anomaly("7842")
    assert res["trader_id"] == "7842"
    assert "anomaly_score" in res
    assert 0.0 <= res["anomaly_score"] <= 100.0
    assert "status" in res
    assert "model_version" in res


def test_get_events_endpoint(monkeypatch):
    test_engine = engine_module.NetraEngine()
    monkeypatch.setattr(main, "engine", test_engine)

    # Ingest an event
    ev = {"trader_id": "7842", "event_type": "LOGIN", "device_id": "DEV-TEST-1"}
    test_engine.ingest(ev)

    # Query all events
    events = main.get_events_endpoint()
    assert len(events) >= 1
    assert any(e["event_type"] == "LOGIN" and e["trader_id"] == "7842" for e in events)

    # Query filtered by trader
    filtered = main.get_events_endpoint(trader_id="7842")
    assert all(e["trader_id"] == "7842" for e in filtered)


def test_reset_trader_baseline_endpoint(monkeypatch):
    import asyncio
    test_engine = engine_module.NetraEngine()
    monkeypatch.setattr(main, "engine", test_engine)

    actor = {"actor_id": "admin-1", "role": "ADMIN"}
    res = asyncio.run(main.reset_trader_baseline_endpoint("7842", actor=actor))
    assert res["reset"] is True
    assert res["trader_id"] == "7842"
    assert "profile" in res


def test_system_graph_endpoint(monkeypatch):
    test_engine = engine_module.NetraEngine()
    monkeypatch.setattr(main, "engine", test_engine)

    res = main.system_graph()
    assert "nodes" in res
    assert "edges" in res
    assert "clusters" in res
    assert len(res["nodes"]) > 0


def test_risk_events_endpoint(monkeypatch):
    test_engine = engine_module.NetraEngine()
    monkeypatch.setattr(main, "engine", test_engine)

    # Ingest event with risk signal
    test_engine.ingest({
        "trader_id": "7001",
        "event_type": "WITHDRAWAL",
        "amount": 200000.0,
        "device_id": "DEV-ANONYMOUS-77",
        "ip_address": "198.51.100.77",
        "wallet_address": "0xATTACKERWALLET7777",
    })

    events = main.risk_events()
    assert len(events) >= 1
    sample = events[0]
    # Regression check: ensure fields expected by frontend risk-events table exist
    assert "risk_id" in sample or "event_id" in sample
    assert "trader_id" in sample
    assert "event_type" in sample
    assert "reason" in sample
    assert "resulting_trust" in sample or "trust_after" in sample

    # Filter by trader_id
    filtered = main.risk_events(trader_id="7001")
    assert all(e["trader_id"] == "7001" for e in filtered)


def test_canonical_trader_7842_identity(monkeypatch):
    test_engine = engine_module.NetraEngine()
    monkeypatch.setattr(main, "engine", test_engine)

    trader_data = test_engine.get_trader("7842")
    assert trader_data is not None
    assert trader_data["name"] == "Maya Chen"
    assert trader_data["segment"] == "Retail Pro"

    traders_list = main.traders()
    t7842 = next((t for t in traders_list if t["trader_id"] == "7842"), None)
    assert t7842 is not None
    assert t7842["name"] == "Maya Chen"


def test_topology_truth_distinction(monkeypatch):
    test_engine = engine_module.NetraEngine()
    monkeypatch.setattr(main, "engine", test_engine)

    # Ingest event linking device and IP for 7842
    test_engine.ingest({
        "trader_id": "7842",
        "event_type": "LOGIN",
        "device_id": "DEV-7842-TEST",
        "ip_address": "198.51.100.42",
    })

    # Local graph for 7842 should be isolated 1-hop subgraph (3 nodes: trader, device, IP)
    local_graph = test_engine.trader_graph("7842")
    assert len(local_graph["nodes"]) == 3
    assert len(local_graph["edges"]) == 2
    node_ids = {n["id"] for n in local_graph["nodes"]}
    assert "TRADER-7842" in node_ids
    assert "DEV-7842-TEST" in node_ids
    assert "IP-198.51.100.42" in node_ids

    # Fleet-wide system graph contains clusters and multi-trader infrastructure
    sys_graph = test_engine.system_graph()
    assert len(sys_graph["nodes"]) >= 3
    assert "clusters" in sys_graph
    assert isinstance(sys_graph["clusters"], list)


def test_traders_list_metadata(monkeypatch):
    test_engine = engine_module.NetraEngine()
    monkeypatch.setattr(main, "engine", test_engine)

    traders = main.traders()
    assert len(traders) >= 105
    sample = traders[0]
    assert "open_case_count" in sample
    assert "anomaly_score" in sample
    assert "last_activity" in sample
    assert "risk_dimensions" in sample





