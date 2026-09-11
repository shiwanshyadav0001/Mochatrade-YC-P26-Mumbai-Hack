from __future__ import annotations

import asyncio
import json
import os
from contextlib import asynccontextmanager
from typing import Any, Literal

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator

from auth import authenticate_user, create_access_token, get_current_actor, require_role
from engine import EVENT_TYPES, NetraEngine
from anomaly_model import BehavioralAnomalyService

engine = NetraEngine()
subscribers: set[asyncio.Queue[str]] = set()

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
    scenario: str
    mode: Literal["FAST", "NORMAL"] = "NORMAL"

    @field_validator("scenario")
    @classmethod
    def valid_scenario(cls, val: str) -> str:
        val = val.upper()
        valid = {
            "FLAGSHIP", "TRAVEL", "LEGITIMATE_TRAVEL", "IMPOSSIBLE_TRAVEL",
            "FRAUD_RING", "RING", "COLLUSION", "COLLUSION_CLUSTER",
            "TAKEOVER", "ACCOUNT_TAKEOVER",
            "NORMAL", "NORMAL_ACTIVITY",
            "NEW_DEVICE",
            "CREDENTIALS", "CREDENTIAL_CHANGE", "2FA_CHANGE", "TWO_FACTOR_CHANGE",
            "LEVERAGE_SPIKE", "LEVERAGE",
            "WITHDRAWAL", "ABNORMAL_WITHDRAWAL",
            "ATTACK_SURGE", "SURGE",
            "HIGH_VALUE", "LEGITIMATE_HIGH_VALUE", "WHALE", "LEGITIMATE_HIGH_VALUE_ACTIVITY",
        }
        if val not in valid:
            raise ValueError(f"Unknown scenario: {val}. Supported: {sorted(valid)}")
        return val


class StepUpRequest(BaseModel):
    verification_type: Literal["2FA_BIOMETRIC", "HARDWARE_KEY", "VIDEO_KYC", "SMS_OTP"] = "2FA_BIOMETRIC"


class LoginInput(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=256)

class ActionEvaluationInput(BaseModel):
    trader_id: str = Field(min_length=1, max_length=64, pattern=r"^\d+$")
    action: str
    amount: float | None = Field(default=None, ge=0)
    context: dict[str, Any] = Field(default_factory=dict)


class CounterfactualSimInput(BaseModel):
    trader_id: str = Field(min_length=1, max_length=64)
    event: dict[str, Any]
    modifications: dict[str, Any] = Field(default_factory=dict)


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

allowed_origins_env = os.getenv("ALLOWED_ORIGINS")
if allowed_origins_env:
    cors_origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()]
else:
    cors_origins = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins if os.getenv("ENVIRONMENT") == "production" else ["*"],
    allow_credentials=True if os.getenv("ENVIRONMENT") == "production" else False,
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
        "authentication_enabled": True,
        "rbac_enabled": True,
    }


@app.post("/api/auth/login")
def login(credentials: LoginInput) -> dict[str, Any]:
    actor = authenticate_user(credentials.username, credentials.password)
    access_token, expires_at = create_access_token(actor)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_at": expires_at,
        "actor_id": actor["actor_id"],
        "role": actor["role"],
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
    await broadcast("NEW_EVENT", result)
    await broadcast("RISK_UPDATED", result)
    await broadcast("GRAPH_UPDATED", engine.trader_graph(event.trader_id))
    if result.get("case"):
        await broadcast("CASE_CREATED", result["case"])
    return result


@app.get("/api/events")
def get_events_endpoint(
    trader_id: str | None = None,
    limit: int = 100,
    _: dict[str, str] = Depends(get_current_actor),
) -> list[dict[str, Any]]:
    return engine.get_events(trader_id=trader_id, limit=limit)


@app.get("/api/traders")
def traders(_: dict[str, str] = Depends(get_current_actor)) -> list[dict[str, Any]]:
    return engine.trader_list()


@app.get("/api/traders/{trader_id}")
def trader(trader_id: str, _: dict[str, str] = Depends(get_current_actor)) -> dict[str, Any]:
    try:
        return engine.get_trader(trader_id)
    except KeyError:
        raise HTTPException(404, "Trader not found")


@app.get("/api/traders/{trader_id}/risk")
def trader_risk(trader_id: str, _: dict[str, str] = Depends(get_current_actor)) -> dict[str, Any]:
    try:
        t = engine.get_trader(trader_id)
        return {"trader_id": trader_id, "trust_score": t["trust_score"], "status": t["status"], "dimensions": t["risk_dimensions"]}
    except KeyError:
        raise HTTPException(404, "Trader not found")


@app.get("/api/traders/{trader_id}/timeline")
def trader_timeline(trader_id: str, _: dict[str, str] = Depends(get_current_actor)) -> list[dict[str, Any]]:
    if trader_id not in engine.traders:
        raise HTTPException(404, "Trader not found")
    return engine.transitions[trader_id][::-1]


@app.get("/api/traders/{trader_id}/events")
def trader_events(trader_id: str, _: dict[str, str] = Depends(get_current_actor)) -> list[dict[str, Any]]:
    if trader_id not in engine.traders:
        raise HTTPException(404, "Trader not found")
    return engine.trader_events(trader_id)


@app.get("/api/traders/{trader_id}/graph")
def trader_graph(trader_id: str, _: dict[str, str] = Depends(get_current_actor)) -> dict[str, Any]:
    if trader_id not in engine.traders:
        raise HTTPException(404, "Trader not found")
    return engine.trader_graph(trader_id)


@app.get("/api/traders/{trader_id}/graph/intelligence")
def trader_graph_intelligence(trader_id: str) -> dict[str, Any]:
    if trader_id not in engine.traders:
        raise HTTPException(404, "Trader not found")
    return engine.trader_graph_intelligence(trader_id)


@app.get("/api/graph/system")
def system_graph() -> dict[str, Any]:
    return engine.system_graph()


@app.get("/api/anomaly/status")
def anomaly_status() -> dict[str, Any]:
    return engine.anomaly_service.get_status()


@app.get("/api/traders/{trader_id}/anomaly")
def trader_anomaly(trader_id: str) -> dict[str, Any]:
    if trader_id not in engine.traders:
        raise HTTPException(404, "Trader not found")
    result = engine.trader_anomaly_results.get(trader_id)
    if not result:
        events = engine.trader_events(trader_id)
        if events:
            profile = engine.baseline_profiles.get(trader_id)
            deg = len([l for l in engine.graph_links if l["source"] == f"TRADER-{trader_id}" or l["target"] == f"TRADER-{trader_id}"])
            vec, val_map = BehavioralAnomalyService.extract_feature_vector(events[-1], profile, None, graph_degree=deg)
            result = engine.anomaly_service.predict_anomaly(vec, val_map)
            engine.trader_anomaly_results[trader_id] = result
        else:
            return {
                "trader_id": trader_id,
                "anomaly_score": 0.0,
                "status": "INSUFFICIENT_DATA",
                "explanation": "No events available for this trader.",
                "feature_values": {},
                "top_deviations": [],
                "model_version": engine.anomaly_service.model_version,
            }
    return {"trader_id": trader_id, **result.to_dict()}


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
def risk_events(
    trader_id: str | None = None,
    category: str | None = None,
    min_severity: float | None = None,
    limit: int = 100,
    _: dict[str, str] = Depends(get_current_actor),
) -> list[dict[str, Any]]:
    return engine.get_risk_events(
        trader_id=trader_id,
        category=category,
        min_severity=min_severity,
        limit=limit,
    )


@app.get("/api/decisions")
def decisions(
    event_id: str | None = None,
    trader_id: str | None = None,
    limit: int = 100,
    _: dict[str, str] = Depends(get_current_actor),
) -> list[dict[str, Any]]:
    rows = engine.decisions[::-1]
    if event_id:
        rows = [r for r in rows if r.get("event_id") == event_id]
    if trader_id:
        rows = [r for r in rows if r.get("trader_id") == trader_id]
    return rows[:limit]


@app.get("/api/decisions/{decision_id}")
def decision(decision_id: str, _: dict[str, str] = Depends(get_current_actor)) -> dict[str, Any]:
    for row in engine.decisions:
        if row["decision_id"] == decision_id:
            return row
    raise HTTPException(404, "Decision not found")


@app.get("/api/cases")
def cases(_: dict[str, str] = Depends(get_current_actor)) -> list[dict[str, Any]]:
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
def get_case(case_id: str, _: dict[str, str] = Depends(get_current_actor)) -> dict[str, Any]:
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
def case_dossier(case_id: str, _: dict[str, str] = Depends(get_current_actor)) -> dict[str, Any]:
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
def audit(_: dict[str, str] = Depends(get_current_actor)) -> list[dict[str, Any]]:
    return engine.audit[::-1]


@app.get("/api/audit/verify")
def verify_audit_endpoint(
    actor: dict[str, str] = Depends(require_role({"ADMIN", "RISK_ANALYST", "INVESTIGATOR", "VIEWER"})),
) -> dict[str, Any]:
    return engine.verify_audit_chain()


@app.get("/api/audit/{audit_id}")
def get_single_audit_record(
    audit_id: str,
    _: dict[str, str] = Depends(get_current_actor),
) -> dict[str, Any]:
    """Fetches a specific audit record by ID and cryptographically verifies its individual SHA-256 integrity."""
    from audit_chain import verify_single_audit_record

    for rec in engine.audit:
        if rec.get("audit_id") == audit_id:
            res = verify_single_audit_record(rec)
            return {
                "record": rec,
                **res,
            }
    raise HTTPException(404, f"Audit record '{audit_id}' not found")


@app.post("/api/actions/evaluate")
def evaluate_action_endpoint(
    body: ActionEvaluationInput,
    actor: dict[str, str] = Depends(require_role({"ADMIN", "RISK_ANALYST", "INVESTIGATOR"})),
) -> dict[str, Any]:
    try:
        context = {**body.context, "amount": body.amount}
        return engine.evaluate_action(body.trader_id, body.action, context=context)
    except KeyError:
        raise HTTPException(404, "Trader not found")


@app.get("/api/traders/{trader_id}/baseline")
def trader_baseline_endpoint(trader_id: str) -> dict[str, Any]:
    if trader_id not in engine.traders:
        raise HTTPException(404, "Trader not found")
    profile = engine.baseline_profiles.get(trader_id)
    if profile:
        return profile.to_dict()
    return engine.traders[trader_id].get("baseline", {})


@app.post("/api/traders/{trader_id}/baseline/reset")
async def reset_trader_baseline_endpoint(
    trader_id: str,
    actor: dict[str, str] = Depends(require_role({"ADMIN", "RISK_ANALYST"})),
) -> dict[str, Any]:
    try:
        res = engine.reset_trader_baseline(trader_id, actor=actor["actor_id"])
        await broadcast("TRADER_UPDATED", engine.get_trader(trader_id))
        return res
    except KeyError:
        raise HTTPException(404, "Trader not found")


@app.get("/api/policies")
def policy(_: dict[str, str] = Depends(get_current_actor)) -> dict[str, Any]:
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


@app.post("/api/counterfactual/simulate")
def simulate_counterfactual_endpoint(
    payload: CounterfactualSimInput,
    actor: dict[str, str] = Depends(require_role({"ADMIN", "RISK_ANALYST", "INVESTIGATOR", "VIEWER"})),
) -> dict[str, Any]:
    return engine.simulate_counterfactual(
        trader_id=payload.trader_id,
        event_payload=payload.event,
        modifications=payload.modifications,
    )


@app.get("/api/search")
def universal_search(q: str = Query(default="", min_length=1), _: dict[str, str] = Depends(get_current_actor)) -> dict[str, Any]:
    return engine.search(q)


@app.get("/api/sequences")
def sequences(_: dict[str, str] = Depends(get_current_actor)) -> list[dict[str, Any]]:
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
    await broadcast("RISK_UPDATED", result)
    trader_id = result.get("event", {}).get("trader_id")
    if trader_id:
        await broadcast("GRAPH_UPDATED", engine.trader_graph(trader_id))
    if result.get("case"):
        await broadcast("CASE_CREATED", result["case"])
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
            await broadcast("RISK_UPDATED", result)
            tid = result.get("event", {}).get("trader_id") or trader_id
            if tid:
                await broadcast("GRAPH_UPDATED", engine.trader_graph(tid))
            if result.get("case"):
                await broadcast("CASE_CREATED", result["case"])
            await asyncio.sleep(0.45 if request.mode == "FAST" else 1.0)
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
def analytics(_: dict[str, str] = Depends(get_current_actor)) -> dict[str, Any]:
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

# Netra Day 4 Multi-Trader Intelligence Service Active

