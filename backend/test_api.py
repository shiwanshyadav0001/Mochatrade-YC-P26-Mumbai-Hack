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
