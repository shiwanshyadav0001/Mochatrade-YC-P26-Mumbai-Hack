from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from typing import Any, Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator

from engine import EVENT_TYPES, NetraEngine

engine = NetraEngine()
subscribers: set[asyncio.Queue[str]] = set()

ROLES = {"ADMIN", "RISK_ANALYST", "INVESTIGATOR", "VIEWER"}


def get_current_actor(
    x_actor_id: str | None = Header(default="analyst-01"),
    x_actor_role: str | None = Header(default="RISK_ANALYST"),
) -> dict[str, str]:
    role = (x_actor_role or "RISK_ANALYST").upper()
    if role not in ROLES:
        role = "RISK_ANALYST"
    return {"actor_id": x_actor_id or "analyst-01", "role": role}


def require_role(allowed_roles: set[str]):
    def checker(actor: dict[str, str] = Depends(get_current_actor)):
        if actor["role"] not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied: Role '{actor['role']}' does not have permission for this action. Allowed: {sorted(allowed_roles)}",
            )
        return actor

    return checker


class EventInput(BaseModel):
    trader_id: str = Field(min_length=1, max_length=64, pattern=r"^\d+$")
    event_type: str
    timestamp: str | None = None
    event_id: str | None = None
    session_id: str | None = None
    device_id: str | None = None
    ip_address: str | None = None
    country: str | None = Field(default=None, max_length=2)
    city: str | None = None
    asn: str | None = None
    network_type: Literal["residential", "mobile", "datacenter", "vpn", "unknown"] | None = None
    amount: float | None = Field(default=None, ge=0)
    currency: str = "USD"
    asset: str | None = None
    leverage: float | None = Field(default=None, ge=0, le=500)
    wallet_address: str | None = None
    bank_account_id: str | None = None
    email_hash: str | None = None
    phone_hash: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    source: str = "api"
    risk_relevance: Literal["low", "medium", "high", "critical"] = "medium"

    @field_validator("event_type")
    @classmethod
    def valid_event_type(cls, value: str) -> str:
        value = value.upper()
        if value not in EVENT_TYPES:
            raise ValueError(f"event_type must be one of {sorted(EVENT_TYPES)}")
        return value


class CaseInput(BaseModel):
    trader_id: str
    severity: str | None = None
    assigned_to: str | None = None
    reason: str | None = None
    decision: str | None = None
    evidence: list[dict[str, Any]] = Field(default_factory=list)


class CasePatch(BaseModel):
    status: Literal["OPEN", "INVESTIGATING", "ESCALATED", "RESOLVED", "FALSE_POSITIVE"] | None = None
    assigned_to: str | None = None
    resolution: str | None = None
    note: str | None = Field(default=None, max_length=2000)


class ScenarioRequest(BaseModel):
    scenario: Literal["FLAGSHIP", "TRAVEL", "LEGITIMATE_TRAVEL", "FRAUD_RING", "RING", "TAKEOVER"]
    mode: Literal["FAST", "NORMAL"] = "NORMAL"


class StepUpRequest(BaseModel):
    verification_type: Literal["2FA_BIOMETRIC", "HARDWARE_KEY", "VIDEO_KYC", "SMS_OTP"] = "2FA_BIOMETRIC"


async def broadcast(kind: str, data: Any) -> None:
    message = json.dumps({"type": kind, "data": data})
    stale: list[asyncio.Queue[str]] = []
    for queue in subscribers:
        try:
            queue.put_nowait(message)
        except asyncio.QueueFull:
            stale.append(queue)
    for queue in stale:
        subscribers.discard(queue)


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield


app = FastAPI(
    title="NETRA Continuous Trader Trust Intelligence API",
    version="2.0.0",
    description="State-of-the-art evidence-grounded trader trust and continuous risk intelligence engine.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "netra-engine-v2",
        "traders": len(engine.traders),
        "events": len(engine.events),
        "cases": len(engine.cases),
        "storage": "sqlite-wal-persistent",
        "rbac_enabled": True,
    }


@app.post("/api/events")
async def post_event(
    event: EventInput,
    actor: dict[str, str] = Depends(require_role({"ADMIN", "RISK_ANALYST"})),
) -> dict[str, Any]:
    if event.trader_id not in engine.traders:
        raise HTTPException(status_code=404, detail="Trader not found")
    try:
        result = engine.ingest(event.model_dump(), actor=actor["actor_id"])
    except KeyError:
        raise HTTPException(status_code=404, detail="Trader not found")
    except Exception:
        raise HTTPException(status_code=500, detail="Database write failed")
    await broadcast("RISK_UPDATED", result)
    await broadcast("GRAPH_UPDATED", engine.trader_graph(event.trader_id))
    return result


@app.get("/api/traders")
def traders() -> list[dict[str, Any]]:
    return engine.trader_list()


@app.get("/api/traders/{trader_id}")
def trader(trader_id: str) -> dict[str, Any]:
    try:
        return engine.get_trader(trader_id)
    except KeyError:
        raise HTTPException(404, "Trader not found")


@app.get("/api/traders/{trader_id}/risk")
def trader_risk(trader_id: str) -> dict[str, Any]:
    try:
        t = engine.get_trader(trader_id)
        return {"trader_id": trader_id, "trust_score": t["trust_score"], "status": t["status"], "dimensions": t["risk_dimensions"]}
    except KeyError:
        raise HTTPException(404, "Trader not found")


@app.get("/api/traders/{trader_id}/timeline")
def trader_timeline(trader_id: str) -> list[dict[str, Any]]:
    if trader_id not in engine.traders:
        raise HTTPException(404, "Trader not found")
    return engine.transitions[trader_id][::-1]


@app.get("/api/traders/{trader_id}/events")
def trader_events(trader_id: str) -> list[dict[str, Any]]:
    if trader_id not in engine.traders:
        raise HTTPException(404, "Trader not found")
    return engine.trader_events(trader_id)


@app.get("/api/traders/{trader_id}/graph")
def trader_graph(trader_id: str) -> dict[str, Any]:
    if trader_id not in engine.traders:
        raise HTTPException(404, "Trader not found")
    return engine.trader_graph(trader_id)


@app.post("/api/traders/{trader_id}/step-up")
async def step_up_trader(
    trader_id: str,
    body: StepUpRequest,
    actor: dict[str, str] = Depends(require_role({"ADMIN", "RISK_ANALYST", "INVESTIGATOR"})),
) -> dict[str, Any]:
    try:
        result = engine.step_up_verify(trader_id, body.verification_type, actor=actor["actor_id"])
        await broadcast("RISK_UPDATED", {"trader_id": trader_id, "step_up": result})
        return result
    except KeyError:
        raise HTTPException(404, "Trader not found")


@app.get("/api/risk-events")
def risk_events() -> list[dict[str, Any]]:
    return [
        event for event in engine.events
        if event.get("risk_relevance") in {"high", "critical"} or event.get("source") not in {"seed"}
    ][-100:][::-1]


@app.get("/api/decisions")
def decisions() -> list[dict[str, Any]]:
    return engine.decisions[::-1]


@app.get("/api/decisions/{decision_id}")
def decision(decision_id: str) -> dict[str, Any]:
    for row in engine.decisions:
        if row["decision_id"] == decision_id:
            return row
    raise HTTPException(404, "Decision not found")


@app.get("/api/cases")
def cases() -> list[dict[str, Any]]:
    return sorted(engine.cases.values(), key=lambda item: item["updated_at"], reverse=True)


@app.post("/api/cases")
async def post_case(
    case: CaseInput,
    actor: dict[str, str] = Depends(require_role({"ADMIN", "RISK_ANALYST", "INVESTIGATOR"})),
) -> dict[str, Any]:
    try:
        result = engine.create_case(case.model_dump(), actor=actor["actor_id"])
    except KeyError:
        raise HTTPException(404, "Trader not found")
    except Exception:
        raise HTTPException(500, "Database write failed")
    await broadcast("CASE_CREATED", result)
    return result


@app.get("/api/cases/{case_id}")
def get_case(case_id: str) -> dict[str, Any]:
    if case_id not in engine.cases:
        raise HTTPException(404, "Case not found")
    case = engine.cases[case_id]
    return {
        **case,
        "trader": engine.get_trader(case["trader_id"]),
        "graph": engine.trader_graph(case["trader_id"]),
        "audit": [item for item in engine.audit if item["subject"] == case["trader_id"]],
    }


@app.patch("/api/cases/{case_id}")
async def patch_case(
    case_id: str,
    changes: CasePatch,
    actor: dict[str, str] = Depends(require_role({"ADMIN", "RISK_ANALYST", "INVESTIGATOR"})),
) -> dict[str, Any]:
    try:
        result = engine.update_case(case_id, changes.model_dump(exclude_none=True), actor=actor["actor_id"])
    except KeyError:
        raise HTTPException(404, "Case not found")
    except Exception:
        raise HTTPException(500, "Database write failed")
    await broadcast("CASE_UPDATED", result)
    return result


@app.get("/api/cases/{case_id}/dossier")
def case_dossier(case_id: str) -> dict[str, Any]:
    if case_id not in engine.cases:
        raise HTTPException(404, "Case not found")
    case = engine.cases[case_id]
    trader = engine.get_trader(case["trader_id"])
    graph = engine.trader_graph(case["trader_id"])
    return {
        "dossier_id": f"DOSSIER-{case_id}",
        "generated_at": engine.audit[-1]["timestamp"] if engine.audit else "2026-09-08T00:00:00Z",
        "case": case,
        "trader_profile": trader,
        "graph_topology": graph,
        "risk_chain": [
            d for d in engine.decisions if d["trader_id"] == case["trader_id"]
        ][-10:],
        "legal_notice": "Confidential Security Telemetry Dossier generated by NETRA Continuous Trust Intelligence.",
    }


@app.get("/api/audit")
def audit() -> list[dict[str, Any]]:
    return engine.audit[::-1]


@app.get("/api/policies")
def policy() -> dict[str, Any]:
    return engine.policy


@app.put("/api/policies")
async def put_policy(
    policy_update: dict[str, Any],
    actor: dict[str, str] = Depends(require_role({"ADMIN"})),
) -> dict[str, Any]:
    for key in ["weights", "action_sensitivity", "velocity_thresholds", "trust_bands"]:
        if key in policy_update and isinstance(policy_update[key], dict):
            engine.policy[key].update(policy_update[key])
    engine.policy["version"] = f"2026.09-v2.{len(engine.audit) + 1}"
    engine._audit(actor["actor_id"], "POLICY_UPDATED", "POLICY", "NETRA policy controls modified", policy_update)
    await broadcast("POLICY_UPDATED", engine.policy)
    return engine.policy


@app.post("/api/policy/simulate")
def simulate_policy_endpoint(
    candidate_policy: dict[str, Any],
    actor: dict[str, str] = Depends(require_role({"ADMIN", "RISK_ANALYST"})),
) -> dict[str, Any]:
    return engine.simulate_policy(candidate_policy)


@app.get("/api/search")
def universal_search(q: str = Query(default="", min_length=1)) -> dict[str, Any]:
    return engine.search(q)


@app.get("/api/sequences")
def sequences() -> list[dict[str, Any]]:
    return [
        {
            "id": "SEQ-RAPID-WITHDRAWAL",
            "name": "Rapid Suspicious Withdrawal",
            "events": ["NEW_DEVICE", "IP_CHANGE", "DEPOSIT", "LEVERAGE_CHANGE", "WITHDRAWAL"],
            "max_duration_minutes": 30,
            "enabled": True,
        },
        {
            "id": "SEQ-CREDENTIAL-TAKEOVER",
            "name": "Account Takeover Surge",
            "events": ["NEW_DEVICE", "PASSWORD_CHANGE", "2FA_CHANGE", "API_KEY_CHANGE"],
            "max_duration_minutes": 15,
            "enabled": True,
        },
        {
            "id": "SEQ-FLASH-COLLUSION",
            "name": "Multi-Account Infrastructure Reuse",
            "events": ["DEVICE_CHANGE", "IP_CHANGE", "WITHDRAWAL"],
            "max_duration_minutes": 60,
            "enabled": True,
        },
    ]


@app.post("/api/simulator/step")
async def simulator_step(
    request: ScenarioRequest,
    actor: dict[str, str] = Depends(require_role({"ADMIN", "RISK_ANALYST"})),
) -> dict[str, Any]:
    key = request.scenario
    if key not in engine.scenario_queues:
        trader_id, events = engine.prepare_scenario(key)
        engine.scenario_queues[key] = events
    queue = engine.scenario_queues[key]
    if not queue:
        return {"complete": True, "message": "Scenario complete"}
    result = engine.ingest(queue.pop(0), actor["actor_id"])
    await broadcast("NEW_EVENT", result)
    return {"complete": not queue, "remaining": len(queue), **result}


@app.post("/api/simulator/run")
async def simulator_run(
    request: ScenarioRequest,
    actor: dict[str, str] = Depends(require_role({"ADMIN", "RISK_ANALYST"})),
) -> dict[str, Any]:
    trader_id, events = engine.prepare_scenario(request.scenario)

    async def run_events() -> None:
        for event in events:
            result = engine.ingest(event, actor["actor_id"])
            await broadcast("NEW_EVENT", result)
            await asyncio.sleep(0.4 if request.mode == "FAST" else 1.1)
        await broadcast("SCENARIO_COMPLETE", {"scenario": request.scenario, "trader_id": trader_id})

    asyncio.create_task(run_events())
    return {
        "started": True,
        "scenario": request.scenario,
        "trader_id": trader_id,
        "events": len(events),
        "mode": request.mode,
    }


@app.post("/api/simulator/reset")
async def simulator_reset(
    actor: dict[str, str] = Depends(require_role({"ADMIN"})),
) -> dict[str, Any]:
    engine.reset()
    await broadcast("DEMO_RESET", {"trader_id": "7842"})
    return {"reset": True, "traders": len(engine.traders), "events": len(engine.events)}


@app.get("/api/analytics")
def analytics() -> dict[str, Any]:
    return engine.analytics()


@app.get("/api/stream")
async def stream(request: Request) -> StreamingResponse:
    queue: asyncio.Queue[str] = asyncio.Queue(maxsize=100)
    subscribers.add(queue)

    async def events():
        try:
            yield 'event: connected\ndata: {"type":"CONNECTED"}\n\n'
            while True:
                if await request.is_disconnected():
                    break
                try:
                    message = await asyncio.wait_for(queue.get(), timeout=20)
                    yield f"data: {message}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            subscribers.discard(queue)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
