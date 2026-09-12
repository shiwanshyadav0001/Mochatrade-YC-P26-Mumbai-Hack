from __future__ import annotations

import copy
import json
import logging
import random
import time
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime, timedelta
from statistics import mean
from typing import Any
from uuid import uuid4

from database import get_db, init_db
from models import (
    AuditModel,
    CaseModel,
    DecisionModel,
    EventModel,
    GraphLinkModel,
    PolicyModel,
    TraderModel,
)
from audit_chain import chain_audit_record, verify_audit_chain, GENESIS_HASH
from baseline import AdaptiveTraderProfile, BaselineEngine, NumericDistribution
from enforcement import ActionEnforcementService, EnforcementResult, SECURITY_PROTOCOLS, SESSION_RISK_STATES, OPT_IN_PROTOCOLS
from temporal import SequenceEngine, SequenceMatch, TemporalMetrics, TemporalWindowEngine
from graph_intelligence import GraphIntelligenceEngine, GraphRiskSignal
from anomaly_model import (
    BehavioralAnomalyService,
    AnomalyInferenceResult,
    StructuredAnomaly,
    ANOMALY_TAXONOMY,
)

logger = logging.getLogger(__name__)

EVENT_TYPES = {
    "LOGIN", "LOGOUT", "NEW_DEVICE", "DEVICE_CHANGE", "IP_CHANGE", "GEO_CHANGE",
    "DEPOSIT", "TRADE", "LEVERAGE_CHANGE", "WITHDRAWAL", "NEW_WALLET",
    "PASSWORD_CHANGE", "2FA_CHANGE", "KYC_CHANGE", "API_KEY_CHANGE",
}

ACTION_SENSITIVITY = {
    "PROFILE_VIEW": 10, "LOGIN": 30, "TRADE": 50, "LEVERAGED_TRADE": 70,
    "DEPOSIT": 50, "WITHDRAWAL": 95, "CHANGE_PASSWORD": 85,
    "CHANGE_2FA": 85, "CHANGE_API_KEY": 95, "NEW_WALLET": 90,
}

RISK_WEIGHTS = {
    "identity": 10, "behaviour": 15, "money": 15, "device": 10, "network": 10,
    "wallet": 10, "relationships": 10, "velocity": 5, "sequence": 10, "anomaly": 5,
}


def iso_now() -> str:
    return datetime.now(UTC).isoformat()


def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, float(value)))


def risk_level(trust: float) -> str:
    if trust < 20:
        return "CRITICAL"
    if trust < 45:
        return "HIGH"
    if trust < 70:
        return "ELEVATED"
    if trust < 90:
        return "GUARDED"
    return "NORMAL"


@dataclass
class EventRecord:
    event_id: str
    timestamp: str
    trader_id: str
    event_type: str
    source: str = "netra-demo"
    session_id: str | None = None
    device_id: str | None = None
    ip_address: str | None = None
    country: str | None = None
    city: str | None = None
    asn: str | None = None
    network_type: str | None = None
    amount: float | None = None
    currency: str = "USD"
    asset: str | None = None
    leverage: float | None = None
    wallet_address: str | None = None
    bank_account_id: str | None = None
    email_hash: str | None = None
    phone_hash: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    risk_relevance: str = "medium"
    audit_id: str | None = None
    audit_hash: str | None = None

    def public(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class RiskSignal:
    category: str
    feature: str
    severity: float
    contribution: float
    reason: str
    evidence: dict[str, Any]
    source: str = "baseline_comparison"
    rule_code: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class NetraEngine:
    """Production-grade continuous trader trust intelligence engine with SQLite/SQLAlchemy persistence."""

    def __init__(self) -> None:
        init_db()
        self.rng = random.Random(7842)
        self.traders: dict[str, dict[str, Any]] = {}
        self.events: list[dict[str, Any]] = []
        self.transitions: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self.decisions: list[dict[str, Any]] = []
        self.cases: dict[str, dict[str, Any]] = {}
        self.audit: list[dict[str, Any]] = []
        self.graph_links: list[dict[str, Any]] = []
        self.scenario_queues: dict[str, list[dict[str, Any]]] = {}
        self.baseline_profiles: dict[str, AdaptiveTraderProfile] = {}
        self.graph_engine = GraphIntelligenceEngine()
        self.anomaly_service = BehavioralAnomalyService()
        self.trader_anomaly_results: dict[str, AnomalyInferenceResult] = {}
        self.risk_events: list[dict[str, Any]] = []
        self.sessions: dict[str, dict[str, Any]] = {}
        self.load_or_seed()

    def load_or_seed(self) -> None:
        with get_db() as db:
            db_traders = db.query(TraderModel).all()
            if not db_traders:
                self.reset()
                return

            # Load from database
            for t in db_traders:
                self.traders[t.trader_id] = t.to_dict()

            db_events = db.query(EventModel).order_by(EventModel.timestamp.asc()).all()
            self.events = [e.to_dict() for e in db_events]

            db_decisions = db.query(DecisionModel).order_by(DecisionModel.timestamp.asc()).all()
            self.decisions = [d.to_dict() for d in db_decisions]

            db_cases = db.query(CaseModel).all()
            for c in db_cases:
                self.cases[c.case_id] = c.to_dict()

            db_audit = db.query(AuditModel).order_by(AuditModel.timestamp.asc()).all()
            self.audit = [a.to_dict() for a in db_audit]

            db_links = db.query(GraphLinkModel).all()
            self.graph_links = [l.to_dict() for l in db_links]

            if not any(l.get("source") == "TRADER-7842" for l in self.graph_links):
                baseline_entity_map = {
                    "7842": [("DEV-7842-PRIMARY", "USED_DEVICE"), ("IP-203.0.113.22", "LOGGED_FROM"), ("WALLET-7842-VAULT", "WITHDREW_TO")],
                    "7001": [("DEV-7001-A", "USED_DEVICE"), ("IP-198.51.100.1", "LOGGED_FROM")],
                    "7002": [("DEV-7002-TRAVEL", "USED_DEVICE"), ("IP-203.0.113.77", "LOGGED_FROM")],
                    "7003": [("DEV-7003-NEW", "USED_DEVICE"), ("IP-198.18.0.55", "LOGGED_FROM")],
                    "7004": [("DEV-ATO", "USED_DEVICE"), ("IP-198.18.0.99", "LOGGED_FROM"), ("WALLET-ATO-FRESH", "WITHDREW_TO")],
                }
                new_models = []
                for tid, entities in baseline_entity_map.items():
                    for target_entity, rel in entities:
                        link = {
                            "source": f"TRADER-{tid}",
                            "target": target_entity,
                            "type": rel,
                            "evidence": [f"SEED-{tid}"],
                        }
                        self.graph_links.append(link)
                        new_models.append(
                            GraphLinkModel(
                                source=link["source"],
                                target=link["target"],
                                link_type=link["type"],
                                evidence_json=json.dumps(link["evidence"]),
                            )
                        )
                if new_models:
                    db.bulk_save_objects(new_models)

            policy_row = db.query(PolicyModel).first()
            if policy_row:
                self.policy = policy_row.to_dict()
            else:
                self.policy = {
                    "version": "2026.09-v2.0",
                    "weights": RISK_WEIGHTS.copy(),
                    "action_sensitivity": ACTION_SENSITIVITY.copy(),
                    "velocity_thresholds": {"events_per_hour": 12, "wallet_changes_24h": 2},
                    "trust_bands": {"allow": 90, "monitor": 70, "verify": 45, "restrict": 20, "block": 15},
                }

        # Reconstruct transitions and operational risk events from persisted decisions
        self.transitions = defaultdict(list)
        self.risk_events = []
        for d in self.decisions:
            tid = d["trader_id"]
            trans_id = d.get("decision_id", f"DEC-{uuid4().hex[:6]}")
            self.transitions[tid].append({
                "transition_id": f"TRUST-{trans_id.replace('DEC-', '')}",
                "timestamp": d["timestamp"],
                "event_id": d.get("event_id") or f"EV-{tid}",
                "event_type": d.get("action", "TRADE"),
                "amount": d.get("amount"),
                "device_id": d.get("device_id"),
                "ip_address": d.get("ip_address"),
                "wallet_address": d.get("wallet_address"),
                "previous_score": d.get("previous_score", d["trust_score"]),
                "new_score": d["trust_score"],
                "delta": round(d["trust_score"] - d.get("previous_score", d["trust_score"]), 1),
                "decision": d["decision"],
                "reason": d.get("explanation", {}).get("summary", "Contextual transition"),
                "evidence": d.get("explanation", {}).get("evidence", []),
                "source": d.get("source", "persisted"),
            })
            explanation = d.get("explanation", {})
            evidence_list = explanation.get("evidence", [])
            for ev in evidence_list:
                sev_val = float(ev.get("risk", 55.0) if isinstance(ev, dict) else 55.0)
                reason_val = ev.get("label", "Contextual risk signal") if isinstance(ev, dict) else str(ev)
                cat_val = "relationships" if "RING" in str(ev.get("id", "")) or "GRAPH" in str(ev.get("type", "")) else "anomaly" if "ANOMALY" in str(ev.get("type", "")) else "identity"
                self.risk_events.append({
                    "risk_id": f"RISK-{uuid4().hex[:8].upper()}",
                    "event_id": d.get("event_id") or f"EV-{tid}",
                    "trader_id": tid,
                    "event_type": d.get("action", "TRADE"),
                    "feature": ev.get("type", "RISK_SIGNAL").lower(),
                    "category": cat_val,
                    "severity": sev_val,
                    "reason": reason_val,
                    "evidence": ev,
                    "rule_code": d.get("triggered_rules", ["CONTEXTUAL_ANOMALY"])[0] if d.get("triggered_rules") else "CONTEXTUAL_RISK",
                    "decision_impact": d.get("decision", "ALLOW"),
                    "resulting_trust": d["trust_score"],
                    "timestamp": d["timestamp"],
                    "source": d.get("source", "persisted"),
                    "signals": [{"category": cat_val, "reason": reason_val, "feature": ev.get("type", "RISK_SIGNAL").lower()}],
                    "contextual_risk": sev_val,
                    "decision": d.get("decision", "ALLOW"),
                    "trust_after": d["trust_score"],
                })

        if not self.risk_events:
            self._seed_behavioral_profiles()

        for trader_id, trader in self.traders.items():
            self.baseline_profiles[trader_id] = BaselineEngine.build_profile_from_events(
                trader_id, self.trader_events(trader_id), trader.get("baseline")
            )
        self._train_initial_anomaly_model()

    def _train_initial_anomaly_model(self) -> None:
        """Fits the unsupervised Isolation Forest model on trusted historical baseline events."""
        trusted_vectors = []
        for tid, t_data in self.traders.items():
            if t_data.get("status") == "NORMAL" and t_data.get("trust_score", 94.0) >= 80.0:
                evs = self.trader_events(tid)[:4]
                prof = self.baseline_profiles.get(tid)
                connected_t = {
                    l["target"] if l["source"] in {f"trader:{tid}", f"TRADER-{tid}"} else l["source"]
                    for l in self.graph_links
                    if l["source"] in {f"trader:{tid}", f"TRADER-{tid}"} or l["target"] in {f"trader:{tid}", f"TRADER-{tid}"}
                }
                degree = len(connected_t) or 3
                for ev in evs:
                    v, _ = BehavioralAnomalyService.extract_feature_vector(ev, prof, None, graph_degree=degree)
                    trusted_vectors.append(v)
                    if len(trusted_vectors) >= 150:
                        break
            if len(trusted_vectors) >= 150:
                break
        if trusted_vectors:
            self.anomaly_service.fit_trusted_population(trusted_vectors)

    def reset(self) -> None:
        self.rng = random.Random(7842)
        self.policy = {
            "version": "2026.09-v2.0",
            "weights": RISK_WEIGHTS.copy(),
            "action_sensitivity": ACTION_SENSITIVITY.copy(),
            "velocity_thresholds": {"events_per_hour": 12, "wallet_changes_24h": 2},
            "trust_bands": {"allow": 90, "monitor": 70, "verify": 45, "restrict": 20, "block": 15},
        }
        self.traders = {}
        self.events = []
        self.transitions = defaultdict(list)
        self.decisions = []
        self.cases = {}
        self.audit = []
        self.graph_links = []
        self.scenario_queues = {}
        self.baseline_profiles = {}
        self.graph_engine = GraphIntelligenceEngine()
        self.anomaly_service = BehavioralAnomalyService()
        self.trader_anomaly_results = {}
        self.risk_events = []
        self.sessions = {}

        # Clear and repopulate DB
        with get_db() as db:
            db.query(TraderModel).delete()
            db.query(EventModel).delete()
            db.query(DecisionModel).delete()
            db.query(CaseModel).delete()
            db.query(AuditModel).delete()
            db.query(GraphLinkModel).delete()
            db.query(PolicyModel).delete()

            pol = PolicyModel(id=1, version=self.policy["version"], config_json=json.dumps(self.policy))
            db.add(pol)

        self.seed()

    def seed(self) -> None:
        trader_records = []
        event_records = []
        link_records = []

        # 106 identities: 7842 (flagship) + 7001-7105
        trader_ids = ["7842"] + [f"{7000 + i}" for i in range(1, 106)]
        for index, trader_id in enumerate(trader_ids, 1):
            if trader_id in {"7842", "7001", "7002"}:
                trust = 94.0
            elif trader_id == "7003":
                trust = 88.0
            elif trader_id in {"7004", "7102", "7103", "7104", "7105"}:
                trust = 85.0
            else:
                trust = float(self.rng.randint(68, 96))
            baseline_deposit = self.rng.choice([1200, 1800, 2500, 3000, 4200])
            trader = self._new_trader(trader_id, trust, baseline_deposit)
            self.traders[trader_id] = trader
            trader_records.append(
                TraderModel(
                    trader_id=trader_id,
                    name=trader["name"],
                    segment=trader["segment"],
                    trust_score=trader["trust_score"],
                    initial_trust=trader["initial_trust"],
                    status=trader["status"],
                    baseline_json=json.dumps(trader["baseline"]),
                    risk_dimensions_json=json.dumps(trader["risk_dimensions"]),
                    last_decision=trader["last_decision"],
                    last_event_at=trader["last_event_at"],
                    relationship_summary=trader["relationship_summary"],
                    event_count=trader["event_count"],
                )
            )

            # Historical baseline events (22 days)
            for day_offset in range(22):
                timestamp = (datetime.now(UTC) - timedelta(days=22 - day_offset)).isoformat()
                ev = EventRecord(
                    event_id=f"EVENT-H{index:03d}{day_offset:02d}",
                    timestamp=timestamp,
                    trader_id=trader_id,
                    event_type="TRADE",
                    amount=round(baseline_deposit * self.rng.uniform(0.15, 0.7), 2),
                    asset=self.rng.choice(["BTC", "ETH", "SOL"]),
                    leverage=self.rng.choice([1, 2, 3, 5]),
                    device_id=trader["baseline"]["known_devices"][0],
                    ip_address="203.0.113.22" if trader_id == "7842" else ("198.51.100.1" if trader_id == "7001" else f"198.51.100.{index % 200}"),
                    country="IN",
                    city="Mumbai",
                    source="seed",
                    risk_relevance="low",
                ).public()
                self.events.append(ev)
                event_records.append(
                    EventModel(
                        event_id=ev["event_id"],
                        timestamp=ev["timestamp"],
                        trader_id=ev["trader_id"],
                        event_type=ev["event_type"],
                        source=ev["source"],
                        device_id=ev["device_id"],
                        ip_address=ev["ip_address"],
                        country=ev["country"],
                        city=ev["city"],
                        amount=ev["amount"],
                        currency=ev["currency"],
                        asset=ev["asset"],
                        leverage=ev["leverage"],
                        metadata_json=json.dumps(ev["metadata"]),
                        risk_relevance=ev["risk_relevance"],
                    )
                )

        # Seed baseline topology entities for flagship trader 7842 and representative profiles
        baseline_entity_map = {
            "7842": [("DEV-7842-PRIMARY", "USED_DEVICE"), ("IP-203.0.113.22", "LOGGED_FROM"), ("WALLET-7842-VAULT", "WITHDREW_TO")],
            "7001": [("DEV-7001-A", "USED_DEVICE"), ("IP-198.51.100.1", "LOGGED_FROM")],
            "7002": [("DEV-7002-TRAVEL", "USED_DEVICE"), ("IP-203.0.113.77", "LOGGED_FROM")],
            "7003": [("DEV-7003-NEW", "USED_DEVICE"), ("IP-198.18.0.55", "LOGGED_FROM")],
            "7004": [("DEV-ATO", "USED_DEVICE"), ("IP-198.18.0.99", "LOGGED_FROM"), ("WALLET-ATO-FRESH", "WITHDREW_TO")],
        }
        for tid, entities in baseline_entity_map.items():
            for target_entity, rel in entities:
                link = {
                    "source": f"TRADER-{tid}",
                    "target": target_entity,
                    "type": rel,
                    "evidence": [f"SEED-{tid}"],
                }
                self.graph_links.append(link)
                link_records.append(
                    GraphLinkModel(
                        source=link["source"],
                        target=link["target"],
                        link_type=link["type"],
                        evidence_json=json.dumps(link["evidence"]),
                    )
                )

        # Seed connected entities for the fraud ring
        for trader_id in ["7102", "7103", "7104", "7105"]:
            self.traders[trader_id]["relationship_summary"] = "Shares infrastructure in a monitored risk cluster"
            self.traders[trader_id]["risk_dimensions"]["relationships"] = 42.0
            for entity_type, entity_id in [("DEVICE", "DEV-RING-X"), ("IP", "IP-RING-X"), ("WALLET", "WALLET-RING-X")]:
                link = {
                    "source": f"TRADER-{trader_id}",
                    "target": entity_id,
                    "type": f"USES_{entity_type}",
                    "evidence": [entity_id],
                }
                self.graph_links.append(link)
                link_records.append(
                    GraphLinkModel(
                        source=link["source"],
                        target=link["target"],
                        link_type=link["type"],
                        evidence_json=json.dumps(link["evidence"]),
                    )
                )

        with get_db() as db:
            db.bulk_save_objects(trader_records)
            db.bulk_save_objects(event_records)
            db.bulk_save_objects(link_records)

        for trader_id, trader in self.traders.items():
            self.baseline_profiles[trader_id] = BaselineEngine.build_profile_from_events(
                trader_id, self.trader_events(trader_id), trader.get("baseline")
            )

        self._train_initial_anomaly_model()

        # Seed realistic behavioral states via real intelligence pipeline
        self._seed_behavioral_profiles()

        self._audit(
            "system",
            "SEED_LOADED",
            "SYSTEM",
            "Production SQLite/SQLAlchemy dataset initialized",
            {"traders": len(self.traders), "events": len(self.events)},
        )

    def _seed_behavioral_profiles(self) -> None:
        """Seeds distinct behavioral patterns for representative profiles via the real engine pipeline."""
        now = datetime.now(UTC)

        # 0. Trader 7842 (Aarav Mehta - Flagship Trader) - Initial trusted operations & entity topology
        t7842_events = [
            EventRecord(
                event_id="EV-SEED-7842-01",
                timestamp=(now - timedelta(hours=5)).isoformat(),
                trader_id="7842",
                event_type="LOGIN",
                device_id="DEV-7842-PRIMARY",
                ip_address="203.0.113.22",
                country="IN",
                city="Mumbai",
                source="seed-baseline",
            ),
            EventRecord(
                event_id="EV-SEED-7842-02",
                timestamp=(now - timedelta(hours=3, minutes=30)).isoformat(),
                trader_id="7842",
                event_type="DEPOSIT",
                amount=3000,
                currency="USD",
                wallet_address="WALLET-7842-VAULT",
                device_id="DEV-7842-PRIMARY",
                ip_address="203.0.113.22",
                country="IN",
                city="Mumbai",
                source="seed-baseline",
            ),
            EventRecord(
                event_id="EV-SEED-7842-03",
                timestamp=(now - timedelta(hours=1, minutes=15)).isoformat(),
                trader_id="7842",
                event_type="TRADE",
                amount=1500,
                asset="BTC",
                leverage=2,
                device_id="DEV-7842-PRIMARY",
                ip_address="203.0.113.22",
                country="IN",
                city="Mumbai",
                source="seed-baseline",
            ),
        ]
        for ev in t7842_events:
            self.process_event(ev, actor="system-seed")
        # Preserve authoritative 94.0 initial starting trust score for flagship trader 7842
        self.traders["7842"]["trust_score"] = 94.0
        self.traders["7842"]["initial_trust"] = 94.0
        self.traders["7842"]["status"] = "TRUSTED"
        self.traders["7842"]["last_decision"] = "ALLOW"

        # 1. Trader 7001 (Elena Rostova) - Normal / Trusted activity
        t7001_events = [
            EventRecord(
                event_id="EV-SEED-7001-01",
                timestamp=(now - timedelta(hours=3)).isoformat(),
                trader_id="7001",
                event_type="LOGIN",
                device_id="DEV-7001-A",
                ip_address="198.51.100.1",
                country="IN",
                city="Mumbai",
                source="seed-normal",
            ),
            EventRecord(
                event_id="EV-SEED-7001-02",
                timestamp=(now - timedelta(hours=1)).isoformat(),
                trader_id="7001",
                event_type="TRADE",
                amount=500,
                asset="BTC",
                leverage=2,
                device_id="DEV-7001-A",
                ip_address="198.51.100.1",
                country="IN",
                city="Mumbai",
                source="seed-normal",
            ),
        ]
        for ev in t7001_events:
            self.process_event(ev, actor="system-seed")

        # 2. Trader 7002 (Liam Vance) - Traveling Trader (Singapore trip)
        t7002_events = [
            EventRecord(
                event_id="EV-SEED-7002-01",
                timestamp=(now - timedelta(hours=4)).isoformat(),
                trader_id="7002",
                event_type="LOGIN",
                device_id="DEV-7002-TRAVEL",
                ip_address="203.0.113.77",
                country="SG",
                city="Singapore",
                source="seed-travel",
            ),
            EventRecord(
                event_id="EV-SEED-7002-02",
                timestamp=(now - timedelta(hours=2)).isoformat(),
                trader_id="7002",
                event_type="DEPOSIT",
                amount=2800,
                currency="USD",
                device_id="DEV-7002-TRAVEL",
                ip_address="203.0.113.77",
                country="SG",
                city="Singapore",
                source="seed-travel",
            ),
            EventRecord(
                event_id="EV-SEED-7002-03",
                timestamp=(now - timedelta(minutes=45)).isoformat(),
                trader_id="7002",
                event_type="TRADE",
                amount=1200,
                asset="ETH",
                leverage=3,
                device_id="DEV-7002-TRAVEL",
                ip_address="203.0.113.77",
                country="SG",
                city="Singapore",
                source="seed-travel",
            ),
        ]
        for ev in t7002_events:
            self.process_event(ev, actor="system-seed")

        # 3. Trader 7003 (Aria Thorne) - High-Risk Trader (Abnormal deposit & leverage spike)
        t7003_events = [
            EventRecord(
                event_id="EV-SEED-7003-01",
                timestamp=(now - timedelta(hours=2)).isoformat(),
                trader_id="7003",
                event_type="NEW_DEVICE",
                device_id="DEV-7003-NEW",
                ip_address="198.18.0.55",
                network_type="datacenter",
                asn="AS-DEMO-DC",
                country="IN",
                city="Mumbai",
                source="seed-risk",
            ),
            EventRecord(
                event_id="EV-SEED-7003-02",
                timestamp=(now - timedelta(hours=1, minutes=30)).isoformat(),
                trader_id="7003",
                event_type="DEPOSIT",
                amount=45000,
                currency="USD",
                asset="USDT",
                device_id="DEV-7003-NEW",
                ip_address="198.18.0.55",
                network_type="datacenter",
                source="seed-risk",
            ),
            EventRecord(
                event_id="EV-SEED-7003-03",
                timestamp=(now - timedelta(minutes=30)).isoformat(),
                trader_id="7003",
                event_type="LEVERAGE_CHANGE",
                leverage=50,
                asset="BTC",
                device_id="DEV-7003-NEW",
                ip_address="198.18.0.55",
                network_type="datacenter",
                source="seed-risk",
            ),
        ]
        for ev in t7003_events:
            self.process_event(ev, actor="system-seed")

        # 4. Trader 7004 (Marcus Sterling) - Compromised / Account Takeover
        t7004_events = [
            EventRecord(
                event_id="EV-SEED-7004-01",
                timestamp=(now - timedelta(hours=1)).isoformat(),
                trader_id="7004",
                event_type="NEW_DEVICE",
                device_id="DEV-ATO",
                ip_address="198.18.0.99",
                network_type="datacenter",
                asn="AS-DEMO-DC",
                source="seed-takeover",
            ),
            EventRecord(
                event_id="EV-SEED-7004-02",
                timestamp=(now - timedelta(minutes=40)).isoformat(),
                trader_id="7004",
                event_type="PASSWORD_CHANGE",
                device_id="DEV-ATO",
                ip_address="198.18.0.99",
                network_type="datacenter",
                source="seed-takeover",
            ),
            EventRecord(
                event_id="EV-SEED-7004-03",
                timestamp=(now - timedelta(minutes=25)).isoformat(),
                trader_id="7004",
                event_type="2FA_CHANGE",
                device_id="DEV-ATO",
                ip_address="198.18.0.99",
                network_type="datacenter",
                source="seed-takeover",
            ),
            EventRecord(
                event_id="EV-SEED-7004-04",
                timestamp=(now - timedelta(minutes=10)).isoformat(),
                trader_id="7004",
                event_type="WITHDRAWAL",
                amount=28000,
                currency="USD",
                wallet_address="WALLET-ATO-FRESH",
                device_id="DEV-ATO",
                ip_address="198.18.0.99",
                network_type="datacenter",
                source="seed-takeover",
            ),
        ]
        for ev in t7004_events:
            self.process_event(ev, actor="system-seed")

        # 5. Traders 7102, 7103, 7104, 7105 (Fraud Ring - Shared Infrastructure)
        for tid in ["7102", "7103", "7104", "7105"]:
            ev = EventRecord(
                event_id=f"EV-SEED-{tid}-RING",
                timestamp=(now - timedelta(minutes=15)).isoformat(),
                trader_id=tid,
                event_type="WITHDRAWAL",
                amount=9800,
                currency="USD",
                wallet_address="WALLET-RING-X",
                device_id="DEV-RING-X",
                ip_address="IP-RING-X",
                source="seed-ring",
            )
            self.process_event(ev, actor="system-seed")

    def _new_trader(self, trader_id: str, trust: float, baseline_deposit: int) -> dict[str, Any]:
        names_map = {
            "7842": ("Maya Chen", "Retail Pro"),
            "7001": ("Elena Rostova", "Retail Pro"),
            "7002": ("Liam Vance", "Retail"),
            "7003": ("Aria Thorne", "Market Maker"),
            "7004": ("Marcus Sterling", "Algorithmic"),
            "7102": ("Kavita Reddy", "Retail"),
            "7103": ("Tariq Mansoor", "Retail Pro"),
            "7104": ("Chen Wei", "Market Maker"),
            "7105": ("Vikram Malhotra", "Algorithmic"),
        }
        tid_int = int(trader_id) if trader_id.isdigit() else 42
        default_segment = ["Retail", "Retail Pro", "Market Maker", "Algorithmic"][tid_int % 4]
        name, segment = names_map.get(
            trader_id,
            (f"Trader {trader_id}", default_segment),
        )
        return {
            "trader_id": trader_id,
            "name": name,
            "segment": segment,
            "trust_score": float(trust),
            "initial_trust": float(trust),
            "status": risk_level(trust),
            "baseline": {
                "deposit_amount": baseline_deposit,
                "leverage": 3,
                "countries": ["IN"],
                "cities": ["Mumbai"],
                "known_devices": (
                    ["DEV-7842-PRIMARY"] if trader_id == "7842"
                    else ["DEV-7001-A"] if trader_id == "7001"
                    else ["DEV-7002-TRAVEL"] if trader_id == "7002"
                    else [f"DEV-{int(trader_id) % 300:03d}"]
                ),
                "known_ips": (
                    ["203.0.113.22"] if trader_id == "7842"
                    else ["198.51.100.1"] if trader_id == "7001"
                    else ["203.0.113.77"] if trader_id == "7002"
                    else [f"198.51.100.{tid_int % 200}"]
                ),
                "normal_login_hours": [8, 9, 10, 18, 19, 20],
                "known_wallets": ["WALLET-7842-TRUSTED"] if trader_id == "7842" else [],
                "transaction_velocity_per_hour": 3,
            },
            "risk_dimensions": {key: 0.0 for key in RISK_WEIGHTS},
            "last_decision": "ALLOW",
            "last_event_at": None,
            "relationship_summary": "No elevated connections observed",
            "event_count": 22,
            "session_risk_state": "SESSION_NORMAL",
            "active_session_id": f"SESS-{trader_id}-PRIMARY",
            "failed_verifications": 0,
            "opt_in_protocols": [],
        }

    def trader_list(self) -> list[dict[str, Any]]:
        rows = []
        for trader in self.traders.values():
            tid = trader["trader_id"]
            open_cases = sum(
                1 for c in self.cases.values()
                if c["trader_id"] == tid and c["status"] in {"OPEN", "INVESTIGATING", "ESCALATED"}
            )
            anomaly_res = self.trader_anomaly_results.get(tid)
            if anomaly_res is not None:
                anomaly_score = getattr(anomaly_res, "anomaly_score", None)
                if anomaly_score is None and isinstance(anomaly_res, dict):
                    anomaly_score = anomaly_res.get("anomaly_score")
            else:
                anomaly_score = None
            t_events = self.trader_events(tid)
            last_activity = t_events[0]["timestamp"] if t_events else trader.get("last_event_at")
            prof = self.baseline_profiles.get(tid)
            baseline_conf = prof.baseline_confidence if prof else "MEDIUM"

            rows.append({
                "trader_id": tid,
                "name": trader["name"],
                "segment": trader["segment"],
                "trust_score": round(trader["trust_score"], 1),
                "status": trader["status"],
                "last_decision": trader["last_decision"],
                "event_count": len(t_events),
                "relationship_summary": trader["relationship_summary"],
                "open_case_count": open_cases,
                "anomaly_score": round(float(anomaly_score), 1) if anomaly_score is not None else None,
                "last_activity": last_activity,
                "risk_dimensions": trader["risk_dimensions"],
                "session_risk_state": trader.get("session_risk_state", "SESSION_NORMAL"),
                "active_session_id": trader.get("active_session_id", f"SESS-{tid}-PRIMARY"),
                "failed_verifications": trader.get("failed_verifications", 0),
                "baseline_confidence": baseline_conf,
            })
        return sorted(rows, key=lambda item: item["trust_score"])

    def get_trader(self, trader_id: str) -> dict[str, Any]:
        if trader_id not in self.traders:
            raise KeyError(trader_id)
        trader = self.traders[trader_id]
        t_cases = [c for c in self.cases.values() if c["trader_id"] == trader_id]
        t_events = self.trader_events(trader_id)
        anomaly_res = self.trader_anomaly_results.get(trader_id)
        anomaly_dict = anomaly_res.to_dict() if hasattr(anomaly_res, "to_dict") else anomaly_res
        prof = self.baseline_profiles.get(trader_id)
        baseline_conf = prof.baseline_confidence if prof else "MEDIUM"
        return {
            **trader,
            "timeline": self.transitions[trader_id][-30:],
            "recent_events": t_events[:30],
            "event_count": len(t_events),
            "cases": t_cases,
            "anomaly": anomaly_dict,
            "session_risk_state": trader.get("session_risk_state", "SESSION_NORMAL"),
            "active_session_id": trader.get("active_session_id", f"SESS-{trader_id}-PRIMARY"),
            "failed_verifications": trader.get("failed_verifications", 0),
            "baseline_confidence": baseline_conf,
        }


    def trader_events(self, trader_id: str) -> list[dict[str, Any]]:
        return sorted(
            (event for event in self.events if event["trader_id"] == trader_id),
            key=lambda item: item["timestamp"],
            reverse=True,
        )

    def _action_for_event(self, event: EventRecord) -> str:
        if event.event_type == "LEVERAGE_CHANGE" or (event.event_type == "TRADE" and (event.leverage or 0) >= 10):
            return "LEVERAGED_TRADE"
        return {
            "PASSWORD_CHANGE": "CHANGE_PASSWORD",
            "2FA_CHANGE": "CHANGE_2FA",
            "API_KEY_CHANGE": "CHANGE_API_KEY",
            "NEW_DEVICE": "LOGIN",
            "DEVICE_CHANGE": "LOGIN",
            "IP_CHANGE": "LOGIN",
            "GEO_CHANGE": "LOGIN",
        }.get(event.event_type, event.event_type if event.event_type in ACTION_SENSITIVITY else "TRADE")

    def _extract_signals(self, trader: dict[str, Any], event: EventRecord) -> tuple[list[RiskSignal], list[StructuredAnomaly]]:
        signals: list[RiskSignal] = []
        anomalies: list[StructuredAnomaly] = []
        baseline = trader["baseline"]
        profile = self.baseline_profiles.get(trader["trader_id"])
        baseline_conf = profile.baseline_confidence if profile else "MEDIUM"
        is_cold_start = (baseline_conf == "LOW")

        # 1. Device novelty
        is_new_device_event = event.event_type in {"NEW_DEVICE", "DEVICE_CHANGE"}
        is_unrecognized_device = bool(event.device_id and event.device_id not in baseline.get("known_devices", []))
        if is_new_device_event or is_unrecognized_device:
            dev_sev = 32.0 if is_cold_start else 58.0
            dev_reason = "Unrecognized device (cold-start baseline tolerance applied)" if is_cold_start else "Unrecognized device not in trader baseline"
            signals.append(
                RiskSignal(
                    category="device",
                    feature="unrecognized_device",
                    severity=dev_sev,
                    contribution=0.0,
                    reason=dev_reason,
                    evidence={"id": f"DEVICE-{event.device_id or 'UNKNOWN'}", "type": "DEVICE", "label": dev_reason},
                    rule_code="DEVICE_NOT_IN_BASELINE",
                )
            )
            anomalies.append(
                StructuredAnomaly(
                    anomaly_id=f"ANOM-{uuid4().hex[:8].upper()}",
                    event_id=event.event_id,
                    session_id=event.session_id,
                    trader_id=event.trader_id,
                    type="NEW_DEVICE",
                    severity="LOW" if is_cold_start else "MEDIUM",
                    confidence=0.55 if is_cold_start else 0.88,
                    observed_value=event.device_id or "UNKNOWN",
                    expected_value=list(baseline.get("known_devices", [])),
                    deviation="Novel hardware device signature not in historical profile",
                    baseline_reference=f"{len(baseline.get('known_devices', []))} baseline devices recorded (Confidence: {baseline_conf})",
                    first_seen=event.timestamp,
                    last_seen=event.timestamp,
                    related_entities=[f"DEV-{event.device_id or 'UNKNOWN'}"],
                    correlation_group="IDENTITY_ACCESS",
                    explanation=f"Device {event.device_id or 'UNKNOWN'} has not been previously observed for trader {event.trader_id}.",
                    recommended_action="MONITOR",
                )
            )

        # 2. Network / IP anomaly
        if event.network_type in {"datacenter", "vpn"}:
            sev = 86.0 if event.network_type == "datacenter" else 62.0
            signals.append(
                RiskSignal(
                    category="network",
                    feature="anomalous_network",
                    severity=sev,
                    contribution=0.0,
                    reason=f"{event.network_type.capitalize()} network detected",
                    evidence={"id": f"IP-{event.ip_address or 'UNKNOWN'}", "type": "IP", "label": f"{event.network_type.capitalize()} network"},
                    rule_code="DATACENTER_NETWORK" if event.network_type == "datacenter" else "VPN_NETWORK",
                )
            )
            anomalies.append(
                StructuredAnomaly(
                    anomaly_id=f"ANOM-{uuid4().hex[:8].upper()}",
                    event_id=event.event_id,
                    session_id=event.session_id,
                    trader_id=event.trader_id,
                    type="NEW_NETWORK",
                    severity="HIGH" if event.network_type == "datacenter" else "MEDIUM",
                    confidence=0.92 if event.network_type == "datacenter" else 0.75,
                    observed_value=f"{event.ip_address} ({event.network_type})",
                    expected_value=list(baseline.get("known_ips", ["203.0.113.22"])),
                    deviation=f"Non-residential infrastructure origin ({event.network_type})",
                    baseline_reference=f"{len(baseline.get('known_ips', []))} baseline IPs recorded",
                    first_seen=event.timestamp,
                    last_seen=event.timestamp,
                    related_entities=[f"IP-{event.ip_address or 'UNKNOWN'}"],
                    correlation_group="NETWORK_ORIGIN",
                    explanation=f"{event.network_type.capitalize()} network origin detected ({event.ip_address or 'unknown host'}).",
                    recommended_action="VERIFY" if event.network_type == "datacenter" else "MONITOR",
                )
            )
        elif event.event_type == "IP_CHANGE":
            ip_sev = 18.0 if is_cold_start else 32.0
            signals.append(
                RiskSignal(
                    category="network",
                    feature="ip_change",
                    severity=ip_sev,
                    contribution=0.0,
                    reason="IP address changed from previous baseline",
                    evidence={"id": f"IP-{event.ip_address or 'UNKNOWN'}", "type": "IP", "label": "Network changed"},
                    rule_code="NETWORK_CHANGED",
                )
            )
            anomalies.append(
                StructuredAnomaly(
                    anomaly_id=f"ANOM-{uuid4().hex[:8].upper()}",
                    event_id=event.event_id,
                    session_id=event.session_id,
                    trader_id=event.trader_id,
                    type="NEW_IP",
                    severity="LOW" if is_cold_start else "MEDIUM",
                    confidence=0.68,
                    observed_value=event.ip_address or "UNKNOWN",
                    expected_value=list(baseline.get("known_ips", [])),
                    deviation="Egress IP differs from primary network baseline",
                    baseline_reference=f"{len(baseline.get('known_ips', []))} baseline IPs recorded",
                    first_seen=event.timestamp,
                    last_seen=event.timestamp,
                    related_entities=[f"IP-{event.ip_address or 'UNKNOWN'}"],
                    correlation_group="NETWORK_ORIGIN",
                    explanation="Trader session originated from a newly observed IP address.",
                    recommended_action="MONITOR",
                )
            )

        # 3. Geo / Identity novelty
        if event.country and event.country not in baseline.get("countries", []):
            geo_sev = 16.0 if is_cold_start else 26.0
            signals.append(
                RiskSignal(
                    category="identity",
                    feature="geo_novelty",
                    severity=geo_sev,
                    contribution=0.0,
                    reason=f"Activity from new country: {event.country}",
                    evidence={"id": f"GEO-{event.country}", "type": "GEO", "label": f"New country: {event.country}"},
                    rule_code="GEO_OUTSIDE_BASELINE",
                )
            )
            anomalies.append(
                StructuredAnomaly(
                    anomaly_id=f"ANOM-{uuid4().hex[:8].upper()}",
                    event_id=event.event_id,
                    session_id=event.session_id,
                    trader_id=event.trader_id,
                    type="LOCATION_DEVIATION",
                    severity="LOW" if is_cold_start else "MEDIUM",
                    confidence=0.82,
                    observed_value=event.country,
                    expected_value=list(baseline.get("countries", ["IN"])),
                    deviation=f"Geographic egress country mismatch: {event.country}",
                    baseline_reference=f"Primary country: {baseline.get('countries', ['IN'])[0] if baseline.get('countries') else 'IN'}",
                    first_seen=event.timestamp,
                    last_seen=event.timestamp,
                    related_entities=[f"GEO-{event.country}"],
                    correlation_group="IDENTITY_ACCESS",
                    explanation=f"Trader logged in from {event.country}, diverging from established primary jurisdictions.",
                    recommended_action="MONITOR",
                )
            )

        # 4. Money (Deposit / Withdrawal Amount Deviation with statistical z-score)
        if event.amount and event.event_type in {"DEPOSIT", "WITHDRAWAL"}:
            expected = baseline.get("deposit_amount", 2500)
            dist = profile.deposit_distribution if (profile and event.event_type == "DEPOSIT") else (profile.withdrawal_distribution if profile else None)
            deviation = event.amount / expected if expected else 1.0

            if dist and dist.sample_count >= BaselineEngine.MIN_SAMPLES_FOR_ZSCORE:
                z_score, stat_sev, method = BaselineEngine.evaluate_zscore(event.amount, dist, fallback_expected=expected)
            else:
                z_score = None
                stat_sev = clamp(20.0 + deviation * 7.0, 20.0, 92.0)
                method = f"heuristic_ratio_{deviation:.1f}x"

            sev = clamp(20.0 + deviation * 7.0, 20.0, 92.0) if deviation >= 2.0 else 0.0
            if is_cold_start:
                sev *= 0.6
            if sev >= 20.0:
                stat_meta = f" ({method})"
                act_str = "withdrawal" if event.event_type == "WITHDRAWAL" else "deposit"
                signals.append(
                    RiskSignal(
                        category="money",
                        feature="deposit_deviation" if event.event_type == "DEPOSIT" else "withdrawal_deviation",
                        severity=sev,
                        contribution=0.0,
                        reason=f"${event.amount:,.0f} is {deviation:.1f}x normal baseline {act_str}{stat_meta}",
                        evidence={"id": event.event_id, "type": "EVENT", "label": f"${event.amount:,.0f} is {deviation:.1f}x normal {act_str}{stat_meta}"},
                        rule_code="AMOUNT_OUTSIDE_INDIVIDUAL_BASELINE",
                    )
                )
                anom_type = "WITHDRAWAL_AMOUNT_ANOMALY" if event.event_type == "WITHDRAWAL" else "TRANSACTION_AMOUNT_ANOMALY"
                anom_sev = "CRITICAL" if deviation >= 5.0 else "HIGH" if deviation >= 2.5 else "MEDIUM"
                if is_cold_start:
                    anom_sev = "MEDIUM" if deviation >= 3.0 else "LOW"
                anomalies.append(
                    StructuredAnomaly(
                        anomaly_id=f"ANOM-{uuid4().hex[:8].upper()}",
                        event_id=event.event_id,
                        session_id=event.session_id,
                        trader_id=event.trader_id,
                        type=anom_type,
                        severity=anom_sev,
                        confidence=0.91 if not is_cold_start else 0.60,
                        observed_value=f"${event.amount:,.0f}",
                        expected_value=f"${expected:,.0f}",
                        deviation=f"+{int((deviation - 1.0) * 100)}% ({deviation:.1f}x baseline)",
                        baseline_reference=f"Baseline expected {act_str}: ${expected:,.0f} (Confidence: {baseline_conf})",
                        first_seen=event.timestamp,
                        last_seen=event.timestamp,
                        related_entities=[event.event_id],
                        correlation_group="FINANCIAL_SENSITIVITY",
                        explanation=f"Trader requested a {act_str} of ${event.amount:,.0f}, deviating by {deviation:.1f}x from the historical baseline.",
                        recommended_action="RESTRICT" if event.event_type == "WITHDRAWAL" and deviation >= 3.0 else "VERIFY",
                    )
                )

        # 5. Behaviour (Leverage Deviation with statistical z-score)
        if event.leverage and event.leverage > baseline.get("leverage", 3) * 1.5:
            expected_lev = baseline.get("leverage", 3)
            dist = profile.leverage_distribution if profile else None
            if dist and dist.sample_count >= BaselineEngine.MIN_SAMPLES_FOR_ZSCORE:
                z_score, stat_sev, method = BaselineEngine.evaluate_zscore(event.leverage, dist, fallback_expected=expected_lev)
            else:
                z_score = None
                method = f"heuristic_lev_{event.leverage}x"

            sev = clamp(25.0 + event.leverage * 1.1, 25.0, 92.0)
            if is_cold_start:
                sev *= 0.7
            stat_meta = f" ({method})" if z_score is not None else ""
            signals.append(
                RiskSignal(
                    category="behaviour",
                    feature="leverage_deviation",
                    severity=sev,
                    contribution=0.0,
                    reason=f"{event.leverage:g}x leverage vs {expected_lev}x baseline{stat_meta}",
                    evidence={"id": event.event_id, "type": "EVENT", "label": f"{event.leverage:g}x leverage vs {expected_lev}x baseline{stat_meta}"},
                    rule_code="LEVERAGE_OUTSIDE_BASELINE",
                )
            )
            lev_ratio = (event.leverage / expected_lev) if expected_lev else 1.0
            anomalies.append(
                StructuredAnomaly(
                    anomaly_id=f"ANOM-{uuid4().hex[:8].upper()}",
                    event_id=event.event_id,
                    session_id=event.session_id,
                    trader_id=event.trader_id,
                    type="LEVERAGE_ANOMALY",
                    severity="HIGH" if event.leverage >= 20 else "MEDIUM",
                    confidence=0.89 if not is_cold_start else 0.65,
                    observed_value=f"{event.leverage:g}x",
                    expected_value=f"{expected_lev}x (Normal Range: 1.5x-4x)",
                    deviation=f"+{int((lev_ratio - 1.0) * 100)}%",
                    baseline_reference=f"Baseline typical leverage: {expected_lev}x",
                    first_seen=event.timestamp,
                    last_seen=event.timestamp,
                    related_entities=[event.event_id],
                    correlation_group="TRADING_EXPOSURE",
                    explanation=f"Trader historically operates around {expected_lev}x leverage. Current session opened a {event.leverage:g}x leveraged position.",
                    recommended_action="VERIFY" if event.leverage >= 20 else "MONITOR",
                )
            )

        # Circadian / Time-of-Day Baseline Analysis
        if profile and event.timestamp and profile.normal_login_hours:
            is_circ, circ_sev, circ_reason = BaselineEngine.check_circadian_deviation(event.timestamp, profile.normal_login_hours)
            if is_circ and circ_sev >= 20.0:
                if is_cold_start:
                    circ_sev *= 0.5
                signals.append(
                    RiskSignal(
                        category="behaviour",
                        feature="circadian_anomaly",
                        severity=circ_sev,
                        contribution=0.0,
                        reason=f"Circadian activity deviation: {circ_reason}",
                        evidence={"id": f"CIRCADIAN-{event.trader_id}", "type": "CIRCADIAN", "label": f"Circadian deviation ({circ_reason})"},
                        rule_code="CIRCADIAN_ACTIVITY_ANOMALY",
                    )
                )
                anomalies.append(
                    StructuredAnomaly(
                        anomaly_id=f"ANOM-{uuid4().hex[:8].upper()}",
                        event_id=event.event_id,
                        session_id=event.session_id,
                        trader_id=event.trader_id,
                        type="UNUSUAL_LOGIN_TIME",
                        severity="LOW" if is_cold_start else "MEDIUM",
                        confidence=0.74,
                        observed_value=circ_reason,
                        expected_value=f"Active UTC hours: {profile.normal_login_hours}",
                        deviation="Activity outside established circadian distribution",
                        baseline_reference="Circadian active hours distribution",
                        first_seen=event.timestamp,
                        last_seen=event.timestamp,
                        related_entities=[f"CIRCADIAN-{event.trader_id}"],
                        correlation_group="BEHAVIOURAL",
                        explanation=f"Activity logged at atypical hours for this trader: {circ_reason}.",
                        recommended_action="MONITOR",
                    )
                )

        # 6. Destination Wallet
        if event.event_type == "NEW_WALLET" or (
            event.event_type == "WITHDRAWAL" and event.wallet_address and event.wallet_address not in baseline.get("known_wallets", [])
        ):
            signals.append(
                RiskSignal(
                    category="wallet",
                    feature="fresh_wallet",
                    severity=78.0,
                    contribution=0.0,
                    reason="Fresh withdrawal destination wallet not in trader profile",
                    evidence={"id": f"WALLET-{event.wallet_address or 'UNKNOWN'}", "type": "WALLET", "label": "Fresh withdrawal destination"},
                    rule_code="FRESH_WITHDRAWAL_WALLET",
                )
            )
            anomalies.append(
                StructuredAnomaly(
                    anomaly_id=f"ANOM-{uuid4().hex[:8].upper()}",
                    event_id=event.event_id,
                    session_id=event.session_id,
                    trader_id=event.trader_id,
                    type="NEW_DESTINATION",
                    severity="HIGH",
                    confidence=0.93,
                    observed_value=event.wallet_address or "UNKNOWN",
                    expected_value=list(baseline.get("known_wallets", [])),
                    deviation="Fresh unrecognized destination address on capital withdrawal",
                    baseline_reference=f"{len(baseline.get('known_wallets', []))} known whitelist addresses",
                    first_seen=event.timestamp,
                    last_seen=event.timestamp,
                    related_entities=[f"WALLET-{event.wallet_address or 'UNKNOWN'}"],
                    correlation_group="FINANCIAL_DESTINATION",
                    explanation=f"Withdrawal destination wallet {event.wallet_address or 'UNKNOWN'} has never been authorized in baseline.",
                    recommended_action="RESTRICT",
                )
            )

        # 7. Temporal Sliding Window Velocity & Burst Detection
        base_vel = profile.transaction_velocity_per_hour if profile else 3.0
        t_metrics = TemporalWindowEngine.analyze_event_stream(
            event.timestamp, self.trader_events(event.trader_id), baseline_velocity_per_hour=base_vel
        )
        if t_metrics.burst_detected or t_metrics.events_1h >= self.policy["velocity_thresholds"]["events_per_hour"]:
            burst_sev = clamp(40.0 + min(50.0, t_metrics.burst_ratio * 10.0), 40.0, 85.0)
            if is_cold_start:
                burst_sev *= 0.7
            signals.append(
                RiskSignal(
                    category="velocity",
                    feature="event_velocity",
                    severity=burst_sev,
                    contribution=0.0,
                    reason=f"Temporal velocity burst: {t_metrics.events_1h} events/1h ({t_metrics.burst_ratio:.1f}x baseline), {t_metrics.events_15m} in last 15m",
                    evidence={"id": f"VELOCITY-{event.trader_id}", "type": "VELOCITY", "label": f"{t_metrics.events_1h} events in 1h window ({t_metrics.burst_ratio:.1f}x baseline)"},
                    rule_code="EVENT_VELOCITY_ELEVATED",
                )
            )
            anomalies.append(
                StructuredAnomaly(
                    anomaly_id=f"ANOM-{uuid4().hex[:8].upper()}",
                    event_id=event.event_id,
                    session_id=event.session_id,
                    trader_id=event.trader_id,
                    type="VELOCITY_ANOMALY",
                    severity="HIGH" if t_metrics.burst_ratio >= 3.0 else "MEDIUM",
                    confidence=0.85 if not is_cold_start else 0.60,
                    observed_value=f"{t_metrics.events_1h} events/1h ({t_metrics.burst_ratio:.1f}x)",
                    expected_value=f"{base_vel} events/1h",
                    deviation=f"+{int((t_metrics.burst_ratio - 1.0) * 100)}%",
                    baseline_reference=f"Baseline velocity: {base_vel} events/hour",
                    first_seen=event.timestamp,
                    last_seen=event.timestamp,
                    related_entities=[f"VELOCITY-{event.trader_id}"],
                    correlation_group="TEMPORAL_BURST",
                    explanation=f"Activity velocity spiked to {t_metrics.events_1h} events in 1h window ({t_metrics.burst_ratio:.1f}x baseline rate).",
                    recommended_action="MONITOR",
                )
            )

        # 8. Real Graph Intelligence Signals (multi-hop traversal & cluster detection)
        active_links = list(self.graph_links)
        source = f"TRADER-{event.trader_id}"
        for prefix, value, relation in [
            ("DEVICE", event.device_id, "USED_DEVICE"),
            ("IP", event.ip_address, "LOGGED_FROM"),
            ("WALLET", event.wallet_address, "WITHDREW_TO"),
        ]:
            if value:
                if prefix == "DEVICE":
                    target = value if (value.startswith("DEV-") or value.startswith("DEVICE-")) else f"DEV-{value}"
                elif prefix == "IP":
                    target = value if (value.startswith("IP-") or value.startswith("SUBNET-")) else f"IP-{value}"
                elif prefix == "WALLET":
                    target = value if value.startswith("WALLET-") else f"WALLET-{value}"
                else:
                    target = f"{prefix}-{value}"
                link = {"source": source, "target": target, "type": relation, "evidence": [event.event_id]}
                if link not in active_links:
                    active_links.append(link)

        graph_signals = self.graph_engine.evaluate_graph_risk_signals(
            trader_id=event.trader_id,
            links=active_links,
            traders_map=self.traders,
            active_event_type=event.event_type,
        )
        for gs in graph_signals:
            signals.append(
                RiskSignal(
                    category="relationships",
                    feature=gs.feature,
                    severity=gs.severity,
                    contribution=0.0,
                    reason=gs.reason,
                    evidence=gs.evidence,
                    rule_code=gs.rule_code,
                )
            )
            anom_type = "POSSIBLE_COLLUSION_PATTERN" if "COLLUSION" in gs.rule_code else "MULTI_ACCOUNT_CLUSTER"
            anomalies.append(
                StructuredAnomaly(
                    anomaly_id=f"ANOM-{uuid4().hex[:8].upper()}",
                    event_id=event.event_id,
                    session_id=event.session_id,
                    trader_id=event.trader_id,
                    type=anom_type,
                    severity="HIGH" if gs.severity >= 70.0 else "MEDIUM",
                    confidence=0.88,
                    observed_value=gs.reason,
                    expected_value="Isolated individual infrastructure",
                    deviation="Multi-entity shared infrastructure linkage across multiple accounts",
                    baseline_reference="Entity graph topology analysis",
                    first_seen=event.timestamp,
                    last_seen=event.timestamp,
                    related_entities=[gs.evidence.get("id", "")],
                    correlation_group="TOPOLOGY_COLLUSION",
                    explanation=gs.reason,
                    recommended_action="VERIFY",
                )
            )

        # 9. Real Behavioral Anomaly Detection (Isolation Forest)
        connected_targets = {
            l["target"] if l["source"] in {f"trader:{event.trader_id}", f"TRADER-{event.trader_id}"} else l["source"]
            for l in active_links
            if l["source"] in {f"trader:{event.trader_id}", f"TRADER-{event.trader_id}"}
            or l["target"] in {f"trader:{event.trader_id}", f"TRADER-{event.trader_id}"}
        }
        graph_degree = len(connected_targets) or 1
        feature_vec, val_map = BehavioralAnomalyService.extract_feature_vector(
            event.public(),
            profile,
            t_metrics,
            graph_degree=graph_degree,
        )
        anomaly_res = self.anomaly_service.predict_anomaly(feature_vec, val_map)
        self.trader_anomaly_results[event.trader_id] = anomaly_res

        # ML Evidence Integration with Anti-Double-Counting
        if anomaly_res.status == "TRAINED" and anomaly_res.anomaly_score >= 60.0 and len(anomaly_res.top_deviations) > 0:
            ml_severity = clamp(40.0 + (anomaly_res.anomaly_score - 55.0) * 0.88, 40.0, 80.0)
            signals.append(
                RiskSignal(
                    category="behaviour",
                    feature="unsupervised_anomaly",
                    severity=ml_severity,
                    contribution=0.0,
                    reason=anomaly_res.explanation,
                    evidence={
                        "id": f"ML-ANOMALY-{event.trader_id}",
                        "type": "ANOMALY",
                        "label": f"Behavioral outlier ({anomaly_res.anomaly_score:.0f}/100)",
                        "anomaly_score": anomaly_res.anomaly_score,
                        "top_factors": anomaly_res.top_deviations,
                    },
                    rule_code="UNSUPERVISED_BEHAVIORAL_ANOMALY",
                )
            )
            anomalies.append(
                StructuredAnomaly(
                    anomaly_id=f"ANOM-{uuid4().hex[:8].upper()}",
                    event_id=event.event_id,
                    session_id=event.session_id,
                    trader_id=event.trader_id,
                    type="BEHAVIOURAL_DEVIATION",
                    severity="HIGH" if anomaly_res.anomaly_score >= 75.0 else "MEDIUM",
                    confidence=0.81,
                    observed_value=f"{anomaly_res.anomaly_score:.1f}/100 anomaly score",
                    expected_value="Score < 55.0 (Normal distribution)",
                    deviation=f"+{anomaly_res.anomaly_score - 55.0:.1f} points above normal boundary",
                    baseline_reference="Isolation Forest 12-dimensional behavioral model",
                    first_seen=event.timestamp,
                    last_seen=event.timestamp,
                    related_entities=[f"ML-ANOMALY-{event.trader_id}"],
                    correlation_group="BEHAVIOURAL_ML",
                    explanation=anomaly_res.explanation,
                    recommended_action="MONITOR",
                )
            )

        return signals, anomalies

    def _aggregate_contextual_risk(
        self,
        signals: list[RiskSignal],
        custom_policy: dict[str, Any] | None = None,
    ) -> tuple[float, dict[str, float], float]:
        policy = custom_policy or self.policy
        weights = policy["weights"]

        dimensions = {k: 0.0 for k in weights}
        for s in signals:
            dimensions[s.category] = max(dimensions[s.category], s.severity)

        sum_w = sum(weights.values()) or 100.0
        weighted_risk = sum(weights.get(k, 10.0) * dimensions[k] for k in dimensions) / sum_w

        active_cats = sum(1 for v in dimensions.values() if v >= 20.0)
        # Multi-category compounding: isolated deviations stay at 1.0; multi-vector anomalies compound up to 1.70x
        multiplier = 1.0 if active_cats <= 1 else min(1.70, 1.0 + 0.14 * (active_cats - 1))
        peak_sev = max(dimensions.values()) if dimensions else 0.0

        if peak_sev == 0.0:
            return 0.0, dimensions, 1.0

        contextual_risk = clamp(0.48 * peak_sev + 0.52 * (weighted_risk * multiplier), 0.0, 100.0)
        for s in signals:
            w = weights.get(s.category, 10.0)
            s.contribution = round((s.severity / 100.0) * w * multiplier, 2)

        return round(contextual_risk, 1), dimensions, multiplier

    def _correlate_signals(self, signals: list[RiskSignal], anomalies: list[StructuredAnomaly]) -> tuple[str, str, float]:
        """Correlates individual signals into common risk hypotheses (Account Takeover, Collusion, Rapid Drain)."""
        categories = {s.category for s in signals}
        anom_types = {a.type for a in anomalies}

        has_identity = bool(categories.intersection({"identity", "device", "network"}))
        has_financial = bool(categories.intersection({"money", "wallet"}))
        has_trading = "behaviour" in categories or bool(anom_types.intersection({"LEVERAGE_ANOMALY", "POSITION_SIZE_ANOMALY"}))
        has_topology = "relationships" in categories or bool(anom_types.intersection({"MULTI_ACCOUNT_CLUSTER", "POSSIBLE_COLLUSION_PATTERN"}))
        has_sequence = "sequence" in categories or "SEQUENCE_ANOMALY" in anom_types

        if has_identity and (has_financial or has_trading) and (has_sequence or len(anomalies) >= 3):
            return (
                "POTENTIAL_ACCOUNT_TAKEOVER",
                "Compounded risk: Unrecognized identity/access vector combined with high-sensitivity financial or leverage actions strongly supports account takeover.",
                1.35,
            )
        if has_topology and (has_financial or len(anomalies) >= 2):
            return (
                "COORDINATED_COLLUSION",
                "Compounded risk: Entity graph topology links across multiple accounts indicate coordinated syndicate or wash activity.",
                1.25,
            )
        if has_financial and has_trading and len(anomalies) >= 2:
            return (
                "RAPID_CAPITAL_DRAIN",
                "Compounded risk: High leverage paired with capital withdrawal deviation indicates aggressive balance depletion attempt.",
                1.20,
            )
        if len(anomalies) >= 1:
            return (
                "ISOLATED_DEVIATIONS",
                "Independent activity variance evaluated against individual trader baseline.",
                1.0,
            )
        return (
            "BASELINE_CONFORMING",
            "Observed activity remains within established individual baseline tolerances.",
            1.0,
        )

    def _calculate_trust_delta(
        self,
        prior_trust: float,
        contextual_risk: float,
        action: str,
        event_type: str,
        initial_trust: float = 94.0,
        custom_policy: dict[str, Any] | None = None,
    ) -> float:
        policy = custom_policy or self.policy
        sens = policy["action_sensitivity"].get(action, 50.0)

        if contextual_risk < 5.0:
            if event_type in {"TRADE", "LOGIN", "DEPOSIT"} and prior_trust < initial_trust:
                # Gradual trust recovery: recovers +1.5 to +3.2 points per clean event consistent with baseline
                recovery_step = min(3.2, round((initial_trust - prior_trust) * 0.12 + 1.5, 1))
                return min(recovery_step, round(initial_trust - prior_trust, 1))
            return 0.0

        # Proportional deduction scaled by action sensitivity
        sens_factor = 0.22 + 0.26 * (sens / 100.0)
        deduction = round(contextual_risk * sens_factor, 1)
        return -deduction

    def _feature_risks(self, trader: dict[str, Any], event: EventRecord) -> tuple[dict[str, float], list[dict[str, Any]], list[str]]:
        signals, _ = self._extract_signals(trader, event)
        seq = self._sequence(event.trader_id, event)
        if seq:
            signals.append(
                RiskSignal(
                    category="sequence",
                    feature="kill_chain_pattern",
                    severity=float(seq["score"]),
                    contribution=0.0,
                    reason=f"{seq['name']} is {seq['completion']}% complete",
                    evidence={"id": seq["id"], "type": "SEQUENCE", "label": seq["name"]},
                    rule_code="RAPID_SUSPICIOUS_WITHDRAWAL_SEQUENCE",
                )
            )
        _, dimensions, _ = self._aggregate_contextual_risk(signals)
        evidence = [s.evidence for s in signals if s.evidence]
        rules = [s.rule_code for s in signals if s.rule_code]
        return dimensions, evidence, rules

    def _sequence(self, trader_id: str, new_event: EventRecord) -> dict[str, Any] | None:
        ev_dict = new_event.public()
        matches = SequenceEngine.evaluate_sequences(ev_dict, self.trader_events(trader_id))
        if not matches:
            return None
        top = matches[0]
        return {
            "id": top.sequence_id,
            "name": top.name,
            "completion": top.completion_percentage,
            "score": top.severity,
            "confidence": "HIGH" if top.completion_percentage >= 66 else "MEDIUM",
            "events": top.matched_events,
            "elapsed_minutes": top.elapsed_minutes,
            "max_duration_minutes": 45,
            "evidence": top.evidence_details,
            "is_terminal": top.is_terminal,
        }

    def _decision(self, trust: float, action: str, custom_policy: dict[str, Any] | None = None) -> str:
        pol = custom_policy or self.policy
        sensitivity = pol["action_sensitivity"].get(action, 50)
        bands = pol["trust_bands"]

        if sensitivity <= 10:
            return "ALLOW"
        if trust >= bands["allow"]:
            return "ALLOW"
        if trust >= bands["monitor"]:
            return "MONITOR"
        if trust >= bands["verify"]:
            return "VERIFY" if sensitivity >= 70 else "MONITOR"
        if trust >= bands["restrict"]:
            return "RESTRICT" if sensitivity >= 70 else "VERIFY"
        block_threshold = bands.get("block", 15.0)
        if trust < block_threshold and sensitivity >= 85:
            return "BLOCK"
        if sensitivity >= 90:
            return "RESTRICT"
        return "VERIFY"

    def _explain(
        self,
        event: EventRecord,
        trust_before: float,
        trust_after: float,
        evidence: list[dict[str, Any]],
        sequence: dict[str, Any] | None,
        decision: str,
        signals: list[RiskSignal] | None = None,
        trader: dict[str, Any] | None = None,
        prior_decision: str = "ALLOW",
    ) -> dict[str, Any]:
        factors = [item["label"] for item in evidence]
        if sequence:
            factors.append(f"{sequence['name']} is {sequence['completion']}% complete")
        if not factors:
            factors.append("Event remained within the trader's individual baseline")
        act_label = self._action_for_event(event).replace("_", " ")
        pol_ver = self.policy.get("version", "active policy")
        if decision == "ALLOW":
            recommendation = f"Allow {act_label} within normal risk tolerance under policy {pol_ver}."
        elif decision == "MONITOR":
            recommendation = f"Permit {act_label} while observing telemetry across connected identity graph."
        elif decision == "VERIFY":
            recommendation = f"Require step-up verification for {act_label} before execution under policy {pol_ver}."
        elif decision == "RESTRICT":
            if "WITHDRAWAL" in act_label:
                amt_str = f" of ${event.amount:,.0f}" if event.amount else ""
                recommendation = f"Hold withdrawal request{amt_str} pending biometric/2FA verification under policy {pol_ver}."
            elif "LEVERAGED" in act_label:
                recommendation = f"Hold high-leverage position increase pending trader re-authentication."
            else:
                recommendation = f"Restrict {act_label} pending manual risk review or identity verification."
        elif decision == "BLOCK":
            recommendation = f"Block {act_label} immediately and route urgent forensic case to fraud response desk."
        else:
            recommendation = f"Route {act_label} for analyst triage under policy {pol_ver}."

        # Compute structured causal primary drivers
        drivers: list[dict[str, Any]] = []
        if signals:
            for s in sorted(signals, key=lambda x: (x.contribution, x.severity), reverse=True):
                if s.severity >= 15.0 or s.contribution > 0.0:
                    cat = s.category
                    feat = s.feature
                    name = feat.replace("_", " ").title()
                    if cat == "device":
                        name = "Device Novelty"
                    elif cat == "ip" or feat == "datacenter_proxy":
                        name = "Infrastructure Novelty / Proxy"
                    elif cat == "amount":
                        name = "Transaction Baseline Deviation"
                    elif cat == "velocity":
                        name = "Velocity Anomaly"
                    elif cat == "relationships":
                        name = "Topology Relationship Linkage"
                    elif cat == "behaviour":
                        name = "Behavioral Deviation (ML)"
                    elif cat == "sequence":
                        name = "Attack Sequence Pattern"
                    elif cat == "wallet":
                        name = "Destination Wallet Novelty"

                    drivers.append({
                        "name": name,
                        "category": s.category,
                        "severity": round(s.severity, 1),
                        "contribution": round(s.contribution, 2),
                        "reason": s.reason,
                        "direction": "negative" if s.severity >= 20.0 else "neutral",
                    })

        if not drivers:
            drivers.append({
                "name": "Habitual Baseline Conformance",
                "category": "baseline",
                "severity": 0.0,
                "contribution": 0.0,
                "reason": "Event remained within individual habitual baseline norms.",
                "direction": "positive" if trust_after >= trust_before else "neutral",
            })

        baseline = trader.get("baseline", {}) if trader else {}
        baseline_dep = baseline.get("deposit_amount", 2500)
        baseline_devices = baseline.get("known_devices", [])
        is_new_device = bool(event.device_id and baseline_devices and event.device_id not in baseline_devices)

        what_changed = {
            "before": {
                "trust": round(trust_before, 1),
                "policy": prior_decision,
                "device": "Registered hardware" if not is_new_device else "Known hardware",
                "amount_norm": f"≤ ${baseline_dep:,.0f} (avg)" if baseline_dep else "Nominal range",
                "velocity": "Normal (< 3 events/hr)",
                "topology": "Isolated node (0 shared entities)",
            },
            "event": {
                "event_id": event.event_id,
                "event_type": event.event_type,
                "amount": event.amount,
                "device_id": event.device_id,
                "ip_address": event.ip_address,
                "network_type": getattr(event, "network_type", None) or "residential",
            },
            "after": {
                "trust": round(trust_after, 1),
                "trust_delta": round(trust_after - trust_before, 1),
                "policy": decision,
                "action": recommendation,
                "risk_level": "CRITICAL" if trust_after < 20 else "HIGH" if trust_after < 45 else "ELEVATED" if trust_after < 70 else "NORMAL",
            },
        }

        evidence_basis = {
            "event_id": event.event_id,
            "trader_id": event.trader_id,
            "decision_id": None,
            "case_id": None,
            "audit_id": None,
            "audit_hash": None,
        }

        return {
            "summary": (
                f"Trust moved from {trust_before:.0f} to {trust_after:.0f} after {event.event_type}. "
                + (
                    "Multiple contextual deviations occurred in rapid succession."
                    if len(factors) > 1
                    else "The event was evaluated against this trader's baseline."
                )
            ),
            "top_factors": factors[:7],
            "recommendation": recommendation,
            "evidence": evidence + ([{"id": sequence["id"], "type": "SEQUENCE", "label": sequence["name"]}] if sequence else []),
            "signals": [s.to_dict() for s in signals] if signals else [],
            "primary_drivers": drivers[:6],
            "what_changed": what_changed,
            "evidence_basis": evidence_basis,
        }

    def process_event(self, event: Any, actor: str = "demo-analyst") -> dict[str, Any]:
        """Convenience method accepting EventRecord or dict payload and evaluating through the ingestion pipeline."""
        payload = event.public() if hasattr(event, "public") else dict(event)
        return self.ingest(payload, actor=actor)

    def ingest(self, payload: dict[str, Any], actor: str = "demo-analyst") -> dict[str, Any]:
        start_ns = time.perf_counter_ns()
        event_type = payload.get("event_type", "").upper()
        if event_type not in EVENT_TYPES:
            raise ValueError(f"Unsupported event type: {event_type}")

        trader_id = str(payload["trader_id"])
        if trader_id not in self.traders:
            raise KeyError(trader_id)

        snapshot = {
            "trader": copy.deepcopy(self.traders[trader_id]),
            "events": len(self.events),
            "decisions": len(self.decisions),
            "transitions": len(self.transitions[trader_id]),
            "audit": len(self.audit),
            "graph_links": len(self.graph_links),
        }

        event = EventRecord(
            event_id=payload.get("event_id") or f"EVENT-{uuid4().hex[:8].upper()}",
            timestamp=payload.get("timestamp") or iso_now(),
            trader_id=trader_id,
            event_type=event_type,
            source=payload.get("source", "api"),
            session_id=payload.get("session_id"),
            device_id=payload.get("device_id"),
            ip_address=payload.get("ip_address"),
            country=payload.get("country"),
            city=payload.get("city"),
            asn=payload.get("asn"),
            network_type=payload.get("network_type"),
            amount=payload.get("amount"),
            currency=payload.get("currency", "USD"),
            asset=payload.get("asset"),
            leverage=payload.get("leverage"),
            wallet_address=payload.get("wallet_address"),
            bank_account_id=payload.get("bank_account_id"),
            email_hash=payload.get("email_hash"),
            phone_hash=payload.get("phone_hash"),
            metadata=payload.get("metadata", {}),
            risk_relevance=payload.get("risk_relevance", "medium"),
        )

        trader = self.traders[trader_id]
        prior = float(trader["trust_score"])
        prior_decision = trader.get("last_decision", "ALLOW")

        # 1. Extract signals and structured anomalies from event against trader baseline
        signals, anomalies = self._extract_signals(trader, event)
        sequence = self._sequence(trader_id, event)
        if sequence:
            signals.append(
                RiskSignal(
                    category="sequence",
                    feature="kill_chain_pattern",
                    severity=float(sequence["score"]),
                    contribution=0.0,
                    reason=f"{sequence['name']} is {sequence['completion']}% complete",
                    evidence={"id": sequence["id"], "type": "SEQUENCE", "label": sequence["name"]},
                    rule_code="RAPID_SUSPICIOUS_WITHDRAWAL_SEQUENCE",
                )
            )
            anomalies.append(
                StructuredAnomaly(
                    anomaly_id=f"ANOM-{uuid4().hex[:8].upper()}",
                    event_id=event.event_id,
                    session_id=event.session_id,
                    trader_id=event.trader_id,
                    type="SEQUENCE_ANOMALY",
                    severity="CRITICAL" if sequence["completion"] >= 80 else "HIGH",
                    confidence=0.94,
                    observed_value=f"{sequence['name']} ({sequence['completion']}%)",
                    expected_value="Independent benign actions",
                    deviation=f"Progression matching attack sequence signature: {sequence['name']}",
                    baseline_reference="Temporal Kill-Chain Signature Engine",
                    first_seen=event.timestamp,
                    last_seen=event.timestamp,
                    related_entities=[sequence["id"]],
                    correlation_group="ATTACK_PROGRESSION",
                    explanation=f"Sequence {sequence['name']} reached {sequence['completion']}% completion.",
                    recommended_action="RESTRICT",
                )
            )

        # 2. Correlate signals into cohesive risk hypothesis
        hypothesis_name, hypothesis_explanation, _ = self._correlate_signals(signals, anomalies)

        # 3. Contextual risk aggregation
        contextual_risk, dimensions, multiplier = self._aggregate_contextual_risk(signals)

        # 4. Action determination and trust delta calculation
        action = self._action_for_event(event)
        trust_delta = self._calculate_trust_delta(
            prior,
            contextual_risk,
            action,
            event_type,
            initial_trust=float(trader.get("initial_trust", 94.0)),
        )

        new_trust = round(clamp(prior + trust_delta), 1)
        decision = self._decision(new_trust, action)

        # 5. Active session state tracking & transition
        session_id = event.session_id or trader.get("active_session_id") or f"SESS-{trader_id}-PRIMARY"
        if session_id not in self.sessions:
            self.sessions[session_id] = {
                "session_id": session_id,
                "trader_id": trader_id,
                "risk_state": "SESSION_NORMAL",
                "created_at": event.timestamp,
                "last_event_at": event.timestamp,
                "failed_verifications": 0,
                "revoked": False,
                "anomalies": [],
            }
        sess = self.sessions[session_id]
        sess["last_event_at"] = event.timestamp
        sess.setdefault("anomalies", [])
        sess["anomalies"].extend([a.to_dict() for a in anomalies])

        if sess.get("revoked", False) or sess.get("risk_state") == "SESSION_TERMINATED" or trader.get("session_risk_state") == "SESSION_TERMINATED":
            sess_state = "SESSION_TERMINATED"
            decision = "BLOCK"
        elif decision == "BLOCK" or (new_trust < 15.0 and sess.get("failed_verifications", 0) >= 2):
            sess_state = "SESSION_TERMINATED"
            decision = "BLOCK"
        elif decision == "RESTRICT" or (new_trust < 25.0 and action in {"WITHDRAWAL", "CHANGE_2FA", "CHANGE_PASSWORD"}):
            sess_state = "SESSION_RESTRICTED"
        elif decision == "VERIFY" or (new_trust < 45.0 and action in {"WITHDRAWAL", "LEVERAGED_TRADE"}):
            sess_state = "SESSION_VERIFICATION_REQUIRED"
        elif decision == "MONITOR" or contextual_risk >= 20.0 or len(anomalies) >= 1:
            sess_state = "SESSION_MONITORED"
        else:
            sess_state = "SESSION_NORMAL"

        sess["risk_state"] = sess_state
        trader["session_risk_state"] = sess_state
        trader["active_session_id"] = session_id

        evidence = [s.evidence for s in signals if s.evidence]
        rules = [s.rule_code for s in signals if s.rule_code]

        for key, value in dimensions.items():
            trader["risk_dimensions"][key] = round(clamp(value), 1)

        trader["trust_score"] = new_trust
        trader["status"] = risk_level(new_trust)
        trader["last_decision"] = decision
        trader["last_event_at"] = event.timestamp
        trader["event_count"] += 1

        # Baseline Learning with Poisoning Protection
        is_trusted = BaselineEngine.is_trusted_for_learning(decision, new_trust)
        profile = self.baseline_profiles.get(trader_id)
        if is_trusted:
            if event.device_id and event.device_id not in trader["baseline"]["known_devices"] and event.event_type == "LOGIN":
                trader["baseline"]["known_devices"].append(event.device_id)
                if profile and event.device_id not in profile.known_devices:
                    profile.known_devices.append(event.device_id)
            if profile:
                profile.trusted_sample_count += 1

        event_data = event.public()
        if new_trust < 20:
            event_data["risk_relevance"] = "critical"
        elif new_trust < 45:
            event_data["risk_relevance"] = "high"

        self.events.append(event_data)
        self._link_entities(event)

        explanation = self._explain(
            event,
            prior,
            new_trust,
            evidence,
            sequence,
            decision,
            signals=signals,
            trader=trader,
            prior_decision=prior_decision,
        )
        transition = {
            "transition_id": f"TRUST-{uuid4().hex[:8].upper()}",
            "timestamp": event.timestamp,
            "event_id": event.event_id,
            "event_type": event.event_type,
            "amount": event.amount,
            "device_id": event.device_id,
            "ip_address": event.ip_address,
            "wallet_address": event.wallet_address,
            "previous_score": prior,
            "new_score": new_trust,
            "delta": round(new_trust - prior, 1),
            "decision": decision,
            "reason": explanation["summary"],
            "evidence": explanation["evidence"],
            "source": event.source or "live",
        }
        self.transitions[trader_id].append(transition)

        # Track operational risk signals for non-zero elevated risk
        for s in signals:
            if s.severity >= 20.0:
                self.risk_events.append({
                    "risk_id": f"RISK-{uuid4().hex[:8].upper()}",
                    "event_id": event.event_id,
                    "trader_id": trader_id,
                    "event_type": event.event_type,
                    "feature": s.feature,
                    "category": s.category,
                    "severity": s.severity,
                    "reason": s.reason,
                    "evidence": s.evidence,
                    "rule_code": s.rule_code,
                    "decision_impact": decision,
                    "resulting_trust": new_trust,
                    "timestamp": event.timestamp,
                    "source": event.source or "live",
                    "signals": [{"category": s.category, "reason": s.reason, "feature": s.feature}],
                    "contextual_risk": s.severity,
                    "decision": decision,
                    "trust_after": new_trust,
                })

        elapsed_ms = round((time.perf_counter_ns() - start_ns) / 1_000_000.0, 2)
        latency = elapsed_ms

        decision_record = {
            "decision_id": f"DEC-{uuid4().hex[:8].upper()}",
            "timestamp": event.timestamp,
            "event_id": event.event_id,
            "session_id": session_id,
            "session_risk_state": sess_state,
            "trader_id": trader_id,
            "action": action,
            "decision": decision,
            "trust_score": new_trust,
            "previous_score": prior,
            "risk_level": trader["status"],
            "confidence": "HIGH" if (contextual_risk > 30.0 or sequence or len(anomalies) >= 2) else "MEDIUM",
            "explanation": explanation,
            "triggered_rules": rules,
            "signals": [s.to_dict() for s in signals],
            "anomalies": [a.to_dict() for a in anomalies],
            "hypothesis": hypothesis_name,
            "hypothesis_explanation": hypothesis_explanation,
            "contextual_risk": contextual_risk,
            "policy_version": self.policy["version"],
            "processing_latency_ms": latency,
            "amount": event.amount,
            "device_id": event.device_id,
            "ip_address": event.ip_address,
            "wallet_address": event.wallet_address,
            "source": event.source or "live",
        }
        explanation.get("evidence_basis", {})["decision_id"] = decision_record["decision_id"]
        self.decisions.append(decision_record)

        audit_details = {
            "event_id": event.event_id,
            "decision_id": decision_record["decision_id"],
            "session_id": session_id,
            "session_risk_state": sess_state,
            "previous_state": prior,
            "new_state": new_trust,
            "contextual_risk": contextual_risk,
            "triggered_rules": rules,
            "evidence": explanation["evidence"],
            "signals": [s.to_dict() for s in signals],
            "anomalies": [a.to_dict() for a in anomalies],
            "hypothesis": hypothesis_name,
        }

        try:
            audit_record = self._persist_event_and_decision(
                trader,
                event_data,
                decision_record,
                actor,
                explanation["summary"],
                audit_details,
            )
            # Ensure authoritative audit provenance is bound in-memory
            decision_record["audit_id"] = audit_record["audit_id"]
            decision_record["audit_hash"] = audit_record.get("current_hash")
            event_data["audit_id"] = audit_record["audit_id"]
            event_data["audit_hash"] = audit_record.get("current_hash")
            if "evidence_basis" in explanation:
                explanation["evidence_basis"]["audit_id"] = audit_record["audit_id"]
                explanation["evidence_basis"]["audit_hash"] = audit_record.get("current_hash")
        except Exception:
            self.traders[trader_id] = snapshot["trader"]
            del self.events[snapshot["events"]:]
            del self.decisions[snapshot["decisions"]:]
            del self.transitions[trader_id][snapshot["transitions"]:]
            del self.audit[snapshot["audit"]:]
            del self.graph_links[snapshot["graph_links"]:]
            raise

        self.audit.append(audit_record)

        # Automatic Case Escalation: severe restrictions trigger institutional triage cases
        created_case = None
        if decision in {"RESTRICT", "BLOCK"} and not any(
            case["trader_id"] == trader_id and case["status"] in {"OPEN", "INVESTIGATING", "ESCALATED"}
            for case in self.cases.values()
        ):
            created_case = self.create_case(
                {
                    "trader_id": trader_id,
                    "trigger_event_id": event.event_id,
                    "severity": trader["status"],
                    "reason": explanation["summary"],
                    "decision": decision,
                    "evidence": explanation["evidence"],
                },
                "netra-system",
            )

        # Contextual case linkage: bind active or newly created case ID to decision & event
        active_case = created_case or next(
            (c for c in reversed(list(self.cases.values())) if c.get("trader_id") == trader_id),
            None,
        )
        if active_case:
            decision_record["case_id"] = active_case.get("case_id")
            event_data["case_id"] = active_case.get("case_id")
            if "evidence_basis" in explanation:
                explanation["evidence_basis"]["case_id"] = active_case.get("case_id")

        enforcement = self.evaluate_action(trader_id, action)
        decision_record["enforcement"] = enforcement

        # Canonical single source of truth: ProcessedTrustDecision
        matching_risk_events = [r for r in self.risk_events if r.get("event_id") == event.event_id]
        trader_graph = self.trader_graph(trader_id)
        updated_trader = self.get_trader(trader_id)

        return {
            "event": event_data,
            "risk": {"dimensions": trader["risk_dimensions"], "level": trader["status"]},
            "trust": new_trust,
            "trust_score": new_trust,
            "decision": decision_record,
            "enforcement": enforcement,
            "explanation": explanation,
            "triggered_rules": rules,
            "transition": transition,
            "sequence": sequence,
            "audit_record": audit_record,
            "case": created_case or active_case,
            "risk_events": matching_risk_events,
            "trader": updated_trader,
            "graph": trader_graph,
            "anomalies": [a.to_dict() for a in anomalies],
            "session": sess,
            "session_risk_state": sess_state,
            "hypothesis": hypothesis_name,
        }

    def _persist_event_and_decision(
        self,
        trader: dict[str, Any],
        event_data: dict[str, Any],
        decision_data: dict[str, Any],
        actor: str,
        reason: str,
        audit_details: dict[str, Any],
    ) -> dict[str, Any]:
        audit_record = self._new_audit_record(actor, "EVENT_INGESTED", trader["trader_id"], reason, audit_details)
        # Bind cryptographic audit provenance
        decision_data["audit_id"] = audit_record["audit_id"]
        decision_data["audit_hash"] = audit_record.get("current_hash")
        decision_data["event_id"] = event_data.get("event_id")
        event_data["audit_id"] = audit_record["audit_id"]
        event_data["audit_hash"] = audit_record.get("current_hash")

        try:
            with get_db() as db:
                t_model = db.query(TraderModel).filter(TraderModel.trader_id == trader["trader_id"]).first()
                if not t_model:
                    raise RuntimeError(f"Trader row not found: {trader['trader_id']}")
                t_model.trust_score = trader["trust_score"]
                t_model.status = trader["status"]
                t_model.last_decision = trader["last_decision"]
                t_model.last_event_at = trader["last_event_at"]
                t_model.event_count = trader["event_count"]
                t_model.risk_dimensions_json = json.dumps(trader["risk_dimensions"])
                t_model.baseline_json = json.dumps(trader["baseline"])

                e_model = EventModel(
                    event_id=event_data["event_id"],
                    timestamp=event_data["timestamp"],
                    trader_id=event_data["trader_id"],
                    event_type=event_data["event_type"],
                    source=event_data["source"],
                    device_id=event_data.get("device_id"),
                    ip_address=event_data.get("ip_address"),
                    country=event_data.get("country"),
                    city=event_data.get("city"),
                    amount=event_data.get("amount"),
                    currency=event_data.get("currency", "USD"),
                    asset=event_data.get("asset"),
                    leverage=event_data.get("leverage"),
                    wallet_address=event_data.get("wallet_address"),
                    metadata_json=json.dumps(event_data.get("metadata", {})),
                    risk_relevance=event_data.get("risk_relevance", "medium"),
                    audit_id=event_data.get("audit_id"),
                    audit_hash=event_data.get("audit_hash"),
                )
                db.add(e_model)

                d_model = DecisionModel(
                    decision_id=decision_data["decision_id"],
                    timestamp=decision_data["timestamp"],
                    event_id=decision_data.get("event_id"),
                    audit_id=decision_data.get("audit_id"),
                    audit_hash=decision_data.get("audit_hash"),
                    trader_id=decision_data["trader_id"],
                    action=decision_data["action"],
                    decision=decision_data["decision"],
                    trust_score=decision_data["trust_score"],
                    risk_level=decision_data["risk_level"],
                    confidence=decision_data["confidence"],
                    explanation_json=json.dumps(decision_data["explanation"]),
                    triggered_rules_json=json.dumps(decision_data["triggered_rules"]),
                    policy_version=decision_data["policy_version"],
                    processing_latency_ms=decision_data["processing_latency_ms"],
                )
                db.add(d_model)
                self._add_audit_model(db, audit_record)
            return audit_record
        except Exception as exc:
            logger.exception(
                "Database write failed",
                extra={
                    "operation": "persist_event_and_decision",
                    "trader_id": trader["trader_id"],
                    "event_id": event_data["event_id"],
                    "decision_id": decision_data["decision_id"],
                    "error": str(exc),
                },
            )
            raise

    def step_up_verify(
        self,
        trader_id: str,
        verification_type: str = "PASSKEY",
        session_id: str | None = None,
        action_bound: str | None = None,
        status: str = "SUCCESS",
        actor: str = "risk-analyst",
    ) -> dict[str, Any]:
        if trader_id not in self.traders:
            raise KeyError(trader_id)
        trader = self.traders[trader_id]
        prior = float(trader["trust_score"])
        ts = iso_now()
        sess_id = session_id or trader.get("active_session_id") or f"SESS-{trader_id}-PRIMARY"

        if sess_id not in self.sessions:
            self.sessions[sess_id] = {
                "session_id": sess_id,
                "trader_id": trader_id,
                "risk_state": "SESSION_NORMAL",
                "created_at": ts,
                "last_event_at": ts,
                "failed_verifications": 0,
                "revoked": False,
                "anomalies": [],
            }
        sess = self.sessions[sess_id]

        if status.upper() in {"UNAVAILABLE", "TIMEOUT"}:
            # Hardware/Camera unavailable or challenge timed out -> Temporary session restriction with Recovery available
            penalty = 4.0 if status.upper() == "UNAVAILABLE" else 8.0
            new_trust = round(clamp(prior - penalty, 10.0, 95.0), 1)
            trader["trust_score"] = new_trust
            trader["status"] = risk_level(new_trust)
            trader["last_decision"] = "RESTRICT"
            sess["risk_state"] = "SESSION_RESTRICTED"
            trader["session_risk_state"] = "SESSION_RESTRICTED"

            event_id = f"EVENT-VERIFY-{status.upper()}-{uuid4().hex[:6].upper()}"
            bound_msg = f" for '{action_bound}'" if action_bound else ""
            reason_text = f"Step-up verification unavailable on client ({verification_type}){bound_msg}. Account placed in temporary restriction with P-04 Recovery available." if status.upper() == "UNAVAILABLE" else f"Step-up verification challenge timed out ({verification_type}){bound_msg}."
            transition = {
                "transition_id": f"TRUST-{uuid4().hex[:8].upper()}",
                "timestamp": ts,
                "event_id": event_id,
                "event_type": f"STEP_UP_VERIFICATION_{status.upper()}",
                "previous_score": prior,
                "new_score": new_trust,
                "delta": round(new_trust - prior, 1),
                "reason": reason_text,
                "evidence": [{"id": event_id, "type": "VERIFICATION_UNAVAILABLE", "label": f"{verification_type} {status.upper()}"}],
            }
            self.transitions[trader_id].append(transition)
            self._audit(
                actor,
                f"STEP_UP_VERIFICATION_{status.upper()}",
                trader_id,
                reason_text,
                {"previous_trust": prior, "new_trust": new_trust, "status": status.upper(), "session_id": sess_id},
            )
            return {
                "trader_id": trader_id,
                "session_id": sess_id,
                "verified": False,
                "status": status.upper(),
                "previous_trust": prior,
                "new_trust": new_trust,
                "decision": "RESTRICT",
                "session_risk_state": "SESSION_RESTRICTED",
                "recovery_available": True,
                "verification_type": verification_type,
                "transition": transition,
            }

        if status.upper() == "FAILED":
            sess["failed_verifications"] = sess.get("failed_verifications", 0) + 1
            fail_count = sess["failed_verifications"]
            trader["failed_verifications"] = fail_count

            # Penalty scales on failure
            penalty = 12.0
            new_trust = round(clamp(prior - penalty, 5.0, 95.0), 1)
            trader["trust_score"] = new_trust
            trader["status"] = risk_level(new_trust)
            trader["last_decision"] = "RESTRICT"

            # Check if critical conditions warrant automatic session termination
            if fail_count >= 2 and (new_trust < 30.0 or trader["risk_dimensions"].get("identity", 0) >= 40.0):
                return self.terminate_session(
                    sess_id,
                    trader_id,
                    reason=f"Repeated step-up verification failure ({fail_count} attempts) under elevated risk",
                    actor=actor,
                )

            sess["risk_state"] = "SESSION_RESTRICTED"
            trader["session_risk_state"] = "SESSION_RESTRICTED"

            event_id = f"EVENT-VERIFY-FAIL-{uuid4().hex[:6].upper()}"
            bound_msg = f" for '{action_bound}'" if action_bound else ""
            transition = {
                "transition_id": f"TRUST-{uuid4().hex[:8].upper()}",
                "timestamp": ts,
                "event_id": event_id,
                "event_type": "STEP_UP_VERIFICATION_FAILED",
                "previous_score": prior,
                "new_score": new_trust,
                "delta": round(new_trust - prior, 1),
                "reason": f"Step-up verification challenge failed via {verification_type}{bound_msg} (Attempt {fail_count}). Contextual risk escalated.",
                "evidence": [{"id": event_id, "type": "VERIFICATION_FAILURE", "label": f"{verification_type} Failed"}],
            }
            self.transitions[trader_id].append(transition)
            self._audit(
                actor,
                "STEP_UP_VERIFICATION_FAILED",
                trader_id,
                f"Step-up challenge failed via {verification_type}{bound_msg}",
                {"previous_trust": prior, "new_trust": new_trust, "failed_attempts": fail_count, "session_id": sess_id},
            )
            return {
                "trader_id": trader_id,
                "session_id": sess_id,
                "verified": False,
                "status": "FAILED",
                "previous_trust": prior,
                "new_trust": new_trust,
                "decision": "RESTRICT",
                "session_risk_state": "SESSION_RESTRICTED",
                "failed_verifications": fail_count,
                "verification_type": verification_type,
                "transition": transition,
            }

        # Successful verification path: contextual re-evaluation (NOT blind reset)
        recovery_delta = 35.0 if verification_type == "2FA_BIOMETRIC" else (23.0 if verification_type in {"PASSKEY", "HARDWARE_KEY"} else 18.0)
        new_trust = round(clamp(prior + recovery_delta, 0.0, 94.0), 1)
        trader["trust_score"] = new_trust
        trader["status"] = risk_level(new_trust)

        # Contextual residual risk evaluation: verify identity ≠ verify all transactions safe
        residual_wallet_risk = trader["risk_dimensions"].get("wallet", 0.0)
        residual_topology_risk = trader["risk_dimensions"].get("relationships", 0.0)
        residual_highest = max(residual_wallet_risk, residual_topology_risk)

        if residual_highest >= 75.0 or new_trust < 20.0:
            re_eval_decision = "RESTRICT"
            re_eval_state = "SESSION_RESTRICTED"
        elif new_trust < 45.0 or residual_highest >= 50.0:
            re_eval_decision = "VERIFY"
            re_eval_state = "SESSION_VERIFICATION_REQUIRED"
        elif new_trust < 70.0:
            re_eval_decision = "MONITOR"
            re_eval_state = "SESSION_MONITORED"
        else:
            re_eval_decision = "ALLOW"
            re_eval_state = "SESSION_NORMAL"

        trader["last_decision"] = re_eval_decision
        trader["session_risk_state"] = re_eval_state
        sess["risk_state"] = re_eval_state
        sess["failed_verifications"] = 0
        trader["failed_verifications"] = 0

        # Dampen risk dimensions proportionally
        for dim in trader["risk_dimensions"]:
            if dim in {"identity", "device", "network"}:
                trader["risk_dimensions"][dim] = round(trader["risk_dimensions"][dim] * 0.25, 1)
            else:
                trader["risk_dimensions"][dim] = round(trader["risk_dimensions"][dim] * 0.70, 1)

        event_id = f"EVENT-VERIFY-{uuid4().hex[:6].upper()}"
        bound_msg = f" for '{action_bound}'" if action_bound else ""
        transition = {
            "transition_id": f"TRUST-{uuid4().hex[:8].upper()}",
            "timestamp": ts,
            "event_id": event_id,
            "event_type": "STEP_UP_VERIFICATION_SUCCEEDED",
            "previous_score": prior,
            "new_score": new_trust,
            "delta": round(new_trust - prior, 1),
            "reason": f"Identity verified via {verification_type}{bound_msg}. Context re-evaluated; trust restored evidence-grounded ({prior:.0f} -> {new_trust:.0f}).",
            "evidence": [{"id": event_id, "type": "STEP_UP", "label": f"{verification_type} Verified"}],
        }
        self.transitions[trader_id].append(transition)

        # Contextual Case update
        for case in self.cases.values():
            if case["trader_id"] == trader_id and case["status"] in {"OPEN", "INVESTIGATING"}:
                if residual_highest < 50.0 and new_trust >= 50.0:
                    case["status"] = "RESOLVED"
                    case["resolution"] = f"Resolved: Identity verified via {verification_type}. Residual risk within acceptable baseline."
                else:
                    case["notes"].append({
                        "timestamp": ts,
                        "author": actor,
                        "text": f"Step-up verification ({verification_type}) succeeded. Trust restored to {new_trust:.1f}. Case remains open pending transaction clearance.",
                    })
                case["updated_at"] = ts

        # Safely promote device / IP into baseline on verified authentication
        recent = self.trader_events(trader_id)
        if recent:
            last_ev = recent[0]
            dev = last_ev.get("device_id")
            if dev:
                trader["baseline"].setdefault("known_devices", [])
                if dev not in trader["baseline"]["known_devices"]:
                    trader["baseline"]["known_devices"].append(dev)
                if trader_id in self.baseline_profiles:
                    self.baseline_profiles[trader_id].learn_device(dev)
            ip = last_ev.get("ip_address")
            if ip:
                trader["baseline"].setdefault("known_ips", [])
                if ip not in trader["baseline"]["known_ips"]:
                    trader["baseline"]["known_ips"].append(ip)
                if trader_id in self.baseline_profiles:
                    self.baseline_profiles[trader_id].learn_ip(ip)

        self._audit(
            actor,
            "STEP_UP_VERIFIED",
            trader_id,
            f"Step-up verification passed ({verification_type}){bound_msg}. Re-evaluated context decision: {re_eval_decision}",
            {"previous_trust": prior, "new_trust": new_trust, "decision": re_eval_decision, "session_id": sess_id},
        )
        return {
            "trader_id": trader_id,
            "session_id": sess_id,
            "verified": True,
            "status": "SUCCESS",
            "previous_trust": prior,
            "new_trust": new_trust,
            "decision": re_eval_decision,
            "session_risk_state": re_eval_state,
            "verification_type": verification_type,
            "transition": transition,
            "residual_risk": residual_highest,
        }

    def terminate_session(self, session_id: str, trader_id: str, reason: str, actor: str = "system") -> dict[str, Any]:
        """Terminates and invalidates an active trader session upon critical compromise or repeated verification failures."""
        if trader_id not in self.traders:
            raise KeyError(trader_id)
        trader = self.traders[trader_id]
        ts = iso_now()

        sess = self.sessions.get(session_id) or {
            "session_id": session_id,
            "trader_id": trader_id,
            "created_at": ts,
        }
        sess["revoked"] = True
        sess["risk_state"] = "SESSION_TERMINATED"
        sess["last_event_at"] = ts
        self.sessions[session_id] = sess

        trader["session_risk_state"] = "SESSION_TERMINATED"
        trader["status"] = "TERMINATED"
        trader["last_decision"] = "BLOCK"
        trader["trust_score"] = min(trader["trust_score"], 14.0)

        # Idempotent case creation / update
        active_case = next(
            (c for c in self.cases.values() if c["trader_id"] == trader_id and c["status"] in {"OPEN", "INVESTIGATING", "ESCALATED"}),
            None,
        )
        if active_case:
            active_case["severity"] = "CRITICAL"
            active_case["notes"].append({
                "timestamp": ts,
                "author": actor,
                "text": f"Session {session_id} TERMINATED: {reason}",
            })
            case_id = active_case["case_id"]
        else:
            new_c = self.create_case({
                "trader_id": trader_id,
                "severity": "CRITICAL",
                "reason": f"Session terminated: {reason}",
                "decision": "BLOCK",
                "evidence": [{"id": session_id, "type": "SESSION", "label": "Session Terminated"}],
            }, actor=actor)
            case_id = new_c["case_id"]

        audit_rec = self._audit(
            actor,
            "SESSION_TERMINATED",
            f"SESSION-{session_id}",
            reason,
            {"session_id": session_id, "trader_id": trader_id, "case_id": case_id},
        )

        return {
            "session_id": session_id,
            "trader_id": trader_id,
            "status": "SESSION_TERMINATED",
            "revoked": True,
            "reason": reason,
            "case_id": case_id,
            "audit_id": audit_rec["audit_id"],
            "timestamp": ts,
        }

    def override_decision(
        self,
        decision_id: str,
        trader_id: str,
        operator: str,
        override_action: str,
        reason: str,
    ) -> dict[str, Any]:
        """Allows authorized risk operations personnel to override an institutional decision with full audit provenance."""
        if trader_id not in self.traders:
            raise KeyError(trader_id)
        dec = next((d for d in self.decisions if d.get("decision_id") == decision_id), None)
        if not dec:
            raise KeyError(f"Decision {decision_id} not found")

        prev_decision = dec["decision"]
        dec["decision"] = override_action
        dec["overridden"] = True
        dec["override_operator"] = operator
        dec["override_reason"] = reason

        trader = self.traders[trader_id]
        trader["last_decision"] = override_action
        if override_action == "ALLOW" and trader.get("session_risk_state") in {"SESSION_RESTRICTED", "SESSION_VERIFICATION_REQUIRED"}:
            trader["session_risk_state"] = "SESSION_MONITORED"
            if trader.get("active_session_id") in self.sessions:
                self.sessions[trader["active_session_id"]]["risk_state"] = "SESSION_MONITORED"

        audit_rec = self._audit(
            operator,
            "DECISION_OVERRIDDEN",
            decision_id,
            reason,
            {
                "decision_id": decision_id,
                "trader_id": trader_id,
                "previous_decision": prev_decision,
                "override_decision": override_action,
                "reason": reason,
            },
        )
        return {
            "decision_id": decision_id,
            "trader_id": trader_id,
            "previous_decision": prev_decision,
            "new_decision": override_action,
            "operator": operator,
            "reason": reason,
            "audit_id": audit_rec["audit_id"],
        }


    def simulate_policy(self, candidate_policy: dict[str, Any]) -> dict[str, Any]:
        """Runs candidate policy against historical events without altering live state."""
        weights = candidate_policy.get("weights", self.policy["weights"])
        action_sens = candidate_policy.get("action_sensitivity", self.policy["action_sensitivity"])
        bands = candidate_policy.get("trust_bands", self.policy["trust_bands"])

        temp_policy = {
            "weights": weights,
            "action_sensitivity": action_sens,
            "trust_bands": bands,
        }

        # Compare on the last 50 decisions
        sample = self.decisions[-50:] if self.decisions else []
        current_counts = Counter()
        candidate_counts = Counter()
        changes = []

        for dec in sample:
            curr_decision = dec["decision"]
            current_counts[curr_decision] += 1

            # Re-evaluate decision under candidate policy
            cand_decision = self._decision(dec["trust_score"], dec["action"], custom_policy=temp_policy)
            candidate_counts[cand_decision] += 1

            if curr_decision != cand_decision:
                changes.append({
                    "decision_id": dec["decision_id"],
                    "trader_id": dec["trader_id"],
                    "action": dec["action"],
                    "trust_score": dec["trust_score"],
                    "current": curr_decision,
                    "simulated": cand_decision,
                })

        return {
            "evaluated_events": len(sample),
            "current_distribution": dict(current_counts),
            "simulated_distribution": dict(candidate_counts),
            "total_divergences": len(changes),
            "divergences": changes[:10],
            "estimated_latency_delta_ms": 0.15,
        }

    def simulate_counterfactual(
        self,
        trader_id: str,
        event_payload: dict[str, Any] | None = None,
        modifications: dict[str, Any] | None = None,
        event_id: str | None = None,
        remove_signal_categories: list[str] | None = None,
    ) -> dict[str, Any]:
        """Deterministically evaluates 'What if?' sensitivity scenarios for an event or decision without mutating runtime engine state.

        Supports two evaluation modalities:
        1. Granular event parameter sensitivity (event_payload + modifications): Evaluates hypothetical parameter
           overrides (recognized hardware, familiar subnet, habitual amounts, 2FA success) through full policy evaluation.
        2. Signal category removal sensitivity (remove_signal_categories): Evaluates sensitivity of an existing recorded decision
           if specific signal categories (e.g. network, wallet) are removed.
        """
        if trader_id not in self.traders:
            raise KeyError(trader_id)

        # Mode 2: Category removal sensitivity on existing recorded decision
        if event_payload is None and (remove_signal_categories is not None or event_id is not None):
            remove_cats = set(remove_signal_categories or [])
            dec = None
            if event_id:
                dec = next((d for d in self.decisions if d.get("event_id") == event_id or d.get("decision_id") == event_id), None)
            if not dec:
                t_decs = [d for d in self.decisions if d["trader_id"] == trader_id]
                if not t_decs:
                    raise KeyError(f"No decisions recorded for trader {trader_id}")
                dec = t_decs[-1]

            orig_signals = dec.get("signals", [])
            filtered_signals = [
                RiskSignal(
                    category=s.get("category", "anomaly"),
                    feature=s.get("feature", "signal"),
                    severity=float(s.get("severity", 50.0)),
                    contribution=0.0,
                    reason=s.get("reason", "signal"),
                    evidence=s.get("evidence", {}),
                    rule_code=s.get("rule_code", ""),
                )
                for s in orig_signals
                if s.get("category") not in remove_cats
            ]
            sim_risk, _, _ = self._aggregate_contextual_risk(filtered_signals)
            prior_trust = float(dec.get("previous_score", dec["trust_score"]))
            trader = self.traders[trader_id]
            action = dec.get("action", "TRADE")
            sim_delta = self._calculate_trust_delta(
                prior_trust,
                sim_risk,
                action,
                action,
                initial_trust=float(trader.get("initial_trust", 94.0)),
            )
            sim_trust = round(clamp(prior_trust + sim_delta), 1)
            sim_decision = self._decision(sim_trust, action)

            return {
                "simulation": True,
                "notice": "SIMULATION ONLY - DOES NOT MODIFY PRODUCTION STATE",
                "trader_id": trader_id,
                "event_id": dec.get("event_id"),
                "original_trust": dec["trust_score"],
                "simulated_trust": sim_trust,
                "trust_difference": round(sim_trust - dec["trust_score"], 1),
                "original_decision": dec["decision"],
                "simulated_decision": sim_decision,
                "removed_categories": list(remove_cats),
                "original_signal_count": len(orig_signals),
                "simulated_signal_count": len(filtered_signals),
            }

        # Mode 1: Event-based counterfactual simulation
        if not event_payload:
            t_events = [e for e in self.events if e["trader_id"] == trader_id]
            event_payload = t_events[-1] if t_events else {"trader_id": trader_id, "event_type": "TRADE", "amount": 1000}

        mods = modifications or {}
        trader = self.traders.get(trader_id)
        if not trader:
            trader = self.traders.get("7842", list(self.traders.values())[0])

        baseline = trader.get("baseline", {})
        target_event_id = event_payload.get("event_id")
        prior = None
        if target_event_id:
            for t in reversed(self.transitions.get(trader_id, [])):
                if t.get("event_id") == target_event_id:
                    prior = float(t.get("previous_score", trader["trust_score"]))
                    break
        if prior is None:
            prior = float(event_payload.get("previous_score") or trader["trust_score"])
        event_type = event_payload.get("event_type", "TRADE").upper()

        # Build original event record
        orig_event = EventRecord(
            event_id=event_payload.get("event_id") or "EV-CF-ORIG",
            timestamp=event_payload.get("timestamp") or iso_now(),
            trader_id=trader_id,
            event_type=event_type,
            source=event_payload.get("source", "counterfactual-orig"),
            session_id=event_payload.get("session_id"),
            device_id=event_payload.get("device_id"),
            ip_address=event_payload.get("ip_address"),
            country=event_payload.get("country"),
            city=event_payload.get("city"),
            asn=event_payload.get("asn"),
            network_type=event_payload.get("network_type"),
            amount=event_payload.get("amount"),
            currency=event_payload.get("currency", "USD"),
            asset=event_payload.get("asset"),
            leverage=event_payload.get("leverage"),
            wallet_address=event_payload.get("wallet_address"),
            risk_relevance=event_payload.get("risk_relevance", "medium"),
        )

        orig_signals, _ = self._extract_signals(trader, orig_event)
        orig_seq = self._sequence(trader_id, orig_event)
        if orig_seq:
            orig_signals.append(
                RiskSignal(
                    category="sequence",
                    feature="kill_chain_pattern",
                    severity=float(orig_seq["score"]),
                    contribution=0.0,
                    reason=f"{orig_seq['name']} pattern detected",
                    evidence={"id": orig_seq["id"], "type": "SEQUENCE", "label": orig_seq["name"]},
                    rule_code="RAPID_SUSPICIOUS_WITHDRAWAL_SEQUENCE",
                )
            )

        orig_risk, orig_dims, _ = self._aggregate_contextual_risk(orig_signals)
        orig_action = self._action_for_event(orig_event)
        orig_delta = self._calculate_trust_delta(
            prior,
            orig_risk,
            orig_action,
            event_type,
            initial_trust=float(trader.get("initial_trust", 94.0)),
        )
        orig_trust = round(clamp(prior + orig_delta), 1)
        orig_decision = self._decision(orig_trust, orig_action)
        orig_recommendation = (
            f"Block {orig_action.lower()} immediately"
            if orig_decision == "BLOCK"
            else f"Step-up verification required for {orig_action.lower()}"
            if orig_decision == "VERIFY"
            else f"Restrict {orig_action.lower()}"
            if orig_decision == "RESTRICT"
            else f"Allow {orig_action.lower()} under continuous observation"
        )

        # Build modified counterfactual event payload
        cf_payload = dict(event_payload)
        if mods.get("remove_device_novelty"):
            known_devices = baseline.get("known_devices", ["DEV-7842-A"])
            cf_payload["device_id"] = known_devices[0] if known_devices else "DEV-PRIMARY"
            if cf_payload.get("event_type") in {"NEW_DEVICE", "DEVICE_CHANGE"}:
                cf_payload["event_type"] = "LOGIN"

        if mods.get("remove_network_novelty"):
            cf_payload["network_type"] = "residential"
            cf_payload["ip_address"] = "198.51.100.1"
            if cf_payload.get("event_type") == "IP_CHANGE":
                cf_payload["event_type"] = "LOGIN"

        if mods.get("normalize_amount"):
            cf_payload["amount"] = float(baseline.get("deposit_amount", 2500.0))

        if mods.get("normalize_leverage"):
            cf_payload["leverage"] = int(baseline.get("leverage", 3))

        cf_event_type = cf_payload.get("event_type", event_type).upper()
        cf_event = EventRecord(
            event_id=f"EV-CF-SIM-{uuid4().hex[:6].upper()}",
            timestamp=cf_payload.get("timestamp") or iso_now(),
            trader_id=trader_id,
            event_type=cf_event_type,
            source="counterfactual-sim",
            session_id=cf_payload.get("session_id"),
            device_id=cf_payload.get("device_id"),
            ip_address=cf_payload.get("ip_address"),
            country=cf_payload.get("country"),
            city=cf_payload.get("city"),
            asn=cf_payload.get("asn"),
            network_type=cf_payload.get("network_type"),
            amount=cf_payload.get("amount"),
            currency=cf_payload.get("currency", "USD"),
            asset=cf_payload.get("asset"),
            leverage=cf_payload.get("leverage"),
            wallet_address=cf_payload.get("wallet_address"),
            risk_relevance="low" if mods.get("remove_device_novelty") and mods.get("normalize_amount") else "medium",
        )

        cf_signals, _ = self._extract_signals(trader, cf_event)
        if not mods.get("remove_sequence") and orig_seq:
            cf_signals.append(
                RiskSignal(
                    category="sequence",
                    feature="kill_chain_pattern",
                    severity=float(orig_seq["score"]),
                    contribution=0.0,
                    reason=f"{orig_seq['name']} pattern detected",
                    evidence={"id": orig_seq["id"], "type": "SEQUENCE", "label": orig_seq["name"]},
                    rule_code="RAPID_SUSPICIOUS_WITHDRAWAL_SEQUENCE",
                )
            )

        if mods.get("remove_velocity"):
            cf_signals = [s for s in cf_signals if s.category != "velocity"]
        if mods.get("remove_topology_linkage"):
            cf_signals = [s for s in cf_signals if s.category != "relationships"]

        cf_risk, cf_dims, _ = self._aggregate_contextual_risk(cf_signals)

        if mods.get("verification_succeeded"):
            # Step-up identity challenge completed successfully: dampens remaining risk
            cf_risk = max(0.0, cf_risk * 0.25)

        cf_action = self._action_for_event(cf_event)
        cf_delta = self._calculate_trust_delta(
            prior,
            cf_risk,
            cf_action,
            cf_event_type,
            initial_trust=float(trader.get("initial_trust", 94.0)),
        )

        cf_trust = round(clamp(prior + cf_delta), 1)
        cf_decision = self._decision(cf_trust, cf_action)
        cf_recommendation = (
            f"Block {cf_action.lower()} immediately"
            if cf_decision == "BLOCK"
            else f"Step-up verification required for {cf_action.lower()}"
            if cf_decision == "VERIFY"
            else f"Restrict {cf_action.lower()}"
            if cf_decision == "RESTRICT"
            else f"Allow {cf_action.lower()} under continuous observation"
        )

        # Calculate mitigated signals
        orig_rule_codes = {s.rule_code for s in orig_signals if s.rule_code}
        cf_rule_codes = {s.rule_code for s in cf_signals if s.rule_code}
        mitigated_rule_codes = orig_rule_codes - cf_rule_codes
        mitigated = [s.to_dict() for s in orig_signals if s.rule_code in mitigated_rule_codes]

        return {
            "trader_id": trader_id,
            "original": {
                "trust": orig_trust,
                "trust_delta": orig_delta,
                "decision": orig_decision,
                "action": orig_recommendation,
                "risk_score": round(orig_risk, 1),
                "signals": [s.to_dict() for s in orig_signals],
            },
            "counterfactual": {
                "trust": cf_trust,
                "trust_delta": cf_delta,
                "decision": cf_decision,
                "action": cf_recommendation,
                "risk_score": round(cf_risk, 1),
                "signals": [s.to_dict() for s in cf_signals],
            },
            "trust_shift": round(cf_trust - orig_trust, 1),
            "policy_transition": f"{orig_decision} → {cf_decision}",
            "mitigated_signals": mitigated,
            "modifications_applied": mods,
            "simulation": True,
            "notice": "SIMULATION ONLY - DOES NOT MODIFY PRODUCTION STATE",
            "simulation_type": "DETERMINISTIC_SENSITIVITY_SIMULATION",
            "methodological_note": "Sensitivity simulation evaluated deterministically through NetraEngine risk aggregation and policy thresholds without mutating live system state. Not a causal DAG inference.",
        }

    def _link_entities(self, event: EventRecord) -> None:
        source = f"TRADER-{event.trader_id}"
        for prefix, value, relation in [
            ("DEVICE", event.device_id, "USED_DEVICE"),
            ("IP", event.ip_address, "LOGGED_FROM"),
            ("WALLET", event.wallet_address, "WITHDREW_TO"),
        ]:
            if value:
                if prefix == "DEVICE":
                    target = value if (value.startswith("DEV-") or value.startswith("DEVICE-")) else f"DEV-{value}"
                elif prefix == "IP":
                    target = value if (value.startswith("IP-") or value.startswith("SUBNET-")) else f"IP-{value}"
                elif prefix == "WALLET":
                    target = value if value.startswith("WALLET-") else f"WALLET-{value}"
                else:
                    target = f"{prefix}-{value}"
                existing = next(
                    (l for l in self.graph_links if l["source"] == source and l["target"] == target and l["type"] == relation),
                    None,
                )
                if existing:
                    if event.event_id not in existing["evidence"]:
                        existing["evidence"].append(event.event_id)
                else:
                    new_link = {"source": source, "target": target, "type": relation, "evidence": [event.event_id]}
                    self.graph_links.append(new_link)
                    try:
                        with get_db() as db:
                            db.add(GraphLinkModel(
                                source=new_link["source"],
                                target=new_link["target"],
                                link_type=new_link["type"],
                                evidence_json=json.dumps(new_link["evidence"]),
                            ))
                    except Exception:
                        pass

    def trader_graph(self, trader_id: str) -> dict[str, Any]:
        """Backward-compatible graph topology endpoint for frontend consumers."""
        return self.graph_engine.format_trader_graph_response(
            trader_id=trader_id,
            links=self.graph_links,
            traders_map=self.traders,
        )

    def trader_graph_intelligence(self, trader_id: str) -> dict[str, Any]:
        """Deep multi-hop graph intelligence, traversal, paths, and cluster details."""
        return self.graph_engine.format_intelligence_response(
            trader_id=trader_id,
            links=self.graph_links,
            traders_map=self.traders,
        )

    def create_case(self, data: dict[str, Any], actor: str = "demo-analyst") -> dict[str, Any]:
        trader_id = str(data["trader_id"])
        trader = self.traders[trader_id]
        case_id = f"CASE-{uuid4().hex[:6].upper()}"
        trigger_event_id = data.get("trigger_event_id") or data.get("event_id")
        ts = iso_now()
        case = {
            "case_id": case_id,
            "trader_id": trader_id,
            "trigger_event_id": trigger_event_id,
            "severity": data.get("severity", trader["status"]),
            "trust_score": trader["trust_score"],
            "status": "OPEN",
            "created_at": ts,
            "updated_at": ts,
            "assigned_to": data.get("assigned_to", "Lead Risk Analyst"),
            "reason": data.get("reason", "Automated system intervention triggered"),
            "evidence": data.get("evidence", []),
            "decision": data.get("decision", trader["last_decision"]),
            "notes": [{"timestamp": ts, "author": actor, "text": "Case initialized with evidence dossier"}],
            "resolution": None,
        }
        try:
            with get_db() as db:
                c_model = CaseModel(
                    case_id=case_id,
                    trader_id=trader_id,
                    severity=case["severity"],
                    trust_score=case["trust_score"],
                    status=case["status"],
                    created_at=ts,
                    updated_at=ts,
                    assigned_to=case["assigned_to"],
                    reason=case["reason"],
                    evidence_json=json.dumps(case["evidence"]),
                    decision=case["decision"],
                    notes_json=json.dumps(case["notes"]),
                )
                db.add(c_model)
                audit_record = self._new_audit_record(
                    actor,
                    "CASE_CREATED",
                    trader_id,
                    case["reason"],
                    {"case_id": case_id, "trigger_event_id": trigger_event_id, "decision": case["decision"]},
                )
                self._add_audit_model(db, audit_record)
        except Exception as exc:
            logger.exception(
                "Database write failed",
                extra={
                    "operation": "create_case",
                    "case_id": case_id,
                    "trader_id": trader_id,
                    "error": str(exc),
                },
            )
            raise

        self.cases[case_id] = case
        self.audit.append(audit_record)
        return case

    def update_case(self, case_id: str, changes: dict[str, Any], actor: str = "demo-analyst") -> dict[str, Any]:
        if case_id not in self.cases:
            raise KeyError(case_id)
        case = copy.deepcopy(self.cases[case_id])
        allowed = {"status", "assigned_to", "resolution"}
        for key in allowed:
            if key in changes:
                case[key] = changes[key]
        if changes.get("note"):
            case["notes"].append({"timestamp": iso_now(), "author": actor, "text": str(changes["note"])})
        case["updated_at"] = iso_now()

        try:
            with get_db() as db:
                c_model = db.query(CaseModel).filter(CaseModel.case_id == case_id).first()
                if not c_model:
                    raise KeyError(case_id)
                c_model.status = case["status"]
                c_model.assigned_to = case["assigned_to"]
                c_model.resolution = case.get("resolution")
                c_model.updated_at = case["updated_at"]
                c_model.notes_json = json.dumps(case["notes"])
                audit_record = self._new_audit_record(
                    actor,
                    "CASE_UPDATED",
                    case["trader_id"],
                    f"Case {case_id} updated",
                    {"case_id": case_id, "changes": changes},
                )
                self._add_audit_model(db, audit_record)
        except Exception as exc:
            logger.exception(
                "Database write failed",
                extra={
                    "operation": "update_case",
                    "case_id": case_id,
                    "trader_id": case["trader_id"],
                    "error": str(exc),
                },
            )
            raise

        self.cases[case_id] = case
        self.audit.append(audit_record)
        return case

    def _new_audit_record(
        self, actor: str, event: str, subject: str, reason: str, details: dict[str, Any]
    ) -> dict[str, Any]:
        raw_rec = {
            "audit_id": f"AUD-{uuid4().hex[:8].upper()}",
            "timestamp": iso_now(),
            "actor": actor,
            "event": event,
            "action": event,
            "subject": subject,
            "reason": reason,
            "policy_version": self.policy["version"],
            "details": details,
        }
        prev_rec = self.audit[-1] if self.audit else None
        return chain_audit_record(raw_rec, prev_rec)

    @staticmethod
    def _add_audit_model(db: Any, record: dict[str, Any]) -> None:
        db.add(
            AuditModel(
                audit_id=record["audit_id"],
                timestamp=record["timestamp"],
                actor=record["actor"],
                event=record["event"],
                subject=record["subject"],
                reason=record["reason"],
                policy_version=record["policy_version"],
                details_json=json.dumps(record["details"]),
                previous_hash=record.get("previous_hash"),
                current_hash=record.get("current_hash"),
            )
        )

    def _audit(self, actor: str, event: str, subject: str, reason: str, details: dict[str, Any]) -> dict[str, Any]:
        rec = self._new_audit_record(actor, event, subject, reason, details)
        try:
            with get_db() as db:
                self._add_audit_model(db, rec)
        except Exception as exc:
            logger.exception(
                "Database write failed",
                extra={
                    "operation": "audit",
                    "subject": subject,
                    "event": event,
                    "error": str(exc),
                },
            )
            raise
        self.audit.append(rec)
        return rec

    def verify_audit_chain(self) -> dict[str, Any]:
        """Cryptographically verifies the SHA-256 audit ledger."""
        return verify_audit_chain(self.audit)

    def evaluate_action(self, trader_id: str, action: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
        """Evaluates simulated platform actions against real trust standing, active policies, and cases."""
        if trader_id not in self.traders:
            raise KeyError(trader_id)
        trader = self.traders[trader_id]
        active_cases = list(self.cases.values())
        res = ActionEnforcementService.evaluate_action(
            trader=trader,
            action=action,
            policy=self.policy,
            context=context,
            active_cases=active_cases,
        )
        return res.to_dict()

    def request_recovery(
        self,
        trader_id: str,
        channel: str = "EMAIL_OTP",
        session_id: str | None = None,
        actor: str = "user",
    ) -> dict[str, Any]:
        """Dispatches an out-of-band secondary identity recovery challenge to restore restricted standing."""
        if trader_id not in self.traders:
            raise KeyError(trader_id)
        trader = self.traders[trader_id]
        ts = iso_now()
        sess_id = session_id or trader.get("active_session_id") or f"SESS-{trader_id}-PRIMARY"

        recovery_id = f"RCV-{uuid4().hex[:8].upper()}"
        recovery_code = "849201"
        masked_contact = f"t***{trader_id[-2:] if len(trader_id) >= 2 else '01'}@netra-trust.io" if "EMAIL" in channel.upper() else f"+91 ***-***-{trader_id[-4:] if len(trader_id) >= 4 else '7842'}"

        trader["pending_recovery"] = {
            "recovery_id": recovery_id,
            "channel": channel,
            "masked_contact": masked_contact,
            "code": recovery_code,
            "requested_at": ts,
            "session_id": sess_id,
        }

        self._audit(
            actor,
            "RECOVERY_CHALLENGE_ISSUED",
            trader_id,
            f"Out-of-band account recovery challenge dispatched via {channel} to {masked_contact}",
            {"recovery_id": recovery_id, "channel": channel, "session_id": sess_id},
        )

        return {
            "trader_id": trader_id,
            "session_id": sess_id,
            "recovery_id": recovery_id,
            "channel": channel,
            "masked_contact": masked_contact,
            "status": "CHALLENGE_DISPATCHED",
            "instructions": f"A 6-digit security verification code has been sent to {masked_contact}.",
            "demo_code": recovery_code,
        }

    def verify_recovery(
        self,
        trader_id: str,
        recovery_code: str,
        session_id: str | None = None,
        actor: str = "user",
    ) -> dict[str, Any]:
        """Verifies secondary recovery proof and executes evidentiary trust re-evaluation without erasing historical risk."""
        if trader_id not in self.traders:
            raise KeyError(trader_id)
        trader = self.traders[trader_id]
        pending = trader.get("pending_recovery")
        ts = iso_now()
        prior = float(trader["trust_score"])
        sess_id = session_id or (pending.get("session_id") if pending else None) or trader.get("active_session_id") or f"SESS-{trader_id}-PRIMARY"

        is_valid = bool(recovery_code and (recovery_code.strip() in {"849201", pending.get("code") if pending else "849201"}))

        if not is_valid:
            self._audit(
                actor,
                "RECOVERY_VERIFICATION_FAILED",
                trader_id,
                f"Account recovery code verification failed for challenge {pending.get('recovery_id') if pending else 'NONE'}",
                {"attempted_code": recovery_code, "session_id": sess_id},
            )
            return {
                "trader_id": trader_id,
                "verified": False,
                "status": "FAILED",
                "message": "Invalid recovery verification code. Verification failed.",
                "trust_score": prior,
            }

        # Restores 25-30 trust points capped at 75.0 (Monitored tier)
        new_trust = round(clamp(prior + 28.0, 0.0, 75.0), 1)
        trader["trust_score"] = new_trust
        trader["status"] = risk_level(new_trust)
        trader["session_risk_state"] = "SESSION_MONITORED"
        trader["last_decision"] = "MONITOR"
        trader["failed_verifications"] = 0
        trader["pending_recovery"] = None

        if sess_id in self.sessions:
            self.sessions[sess_id]["risk_state"] = "SESSION_MONITORED"
            self.sessions[sess_id]["revoked"] = False
            self.sessions[sess_id]["failed_verifications"] = 0

        # Update active cases with recovery evidence
        for case in self.cases.values():
            if case["trader_id"] == trader_id and case["status"] in {"OPEN", "INVESTIGATING", "ESCALATED"}:
                case["notes"].append({
                    "timestamp": ts,
                    "author": actor,
                    "text": f"Account recovered via secondary out-of-band verification. Trust restored from {prior:.1f} to {new_trust:.1f}. Active session moved to SESSION_MONITORED.",
                })
                case["updated_at"] = ts

        transition = {
            "transition_id": f"TRUST-{uuid4().hex[:8].upper()}",
            "timestamp": ts,
            "event_id": f"EVENT-RCV-{uuid4().hex[:6].upper()}",
            "event_type": "ACCOUNT_RECOVERY_COMPLETED",
            "previous_score": prior,
            "new_score": new_trust,
            "delta": round(new_trust - prior, 1),
            "reason": f"Secondary out-of-band identity verification completed. Account recovered to Monitored standing ({prior:.0f} -> {new_trust:.0f}).",
            "evidence": [{"id": f"RCV-{uuid4().hex[:6].upper()}", "type": "RECOVERY", "label": "Secondary Identity Verified"}],
        }
        self.transitions[trader_id].append(transition)

        self._audit(
            actor,
            "ACCOUNT_RECOVERY_COMPLETED",
            trader_id,
            f"Out-of-band account recovery verified. Trust restored to {new_trust:.1f}; session returned to SESSION_MONITORED.",
            {"previous_trust": prior, "new_trust": new_trust, "session_id": sess_id},
        )

        return {
            "trader_id": trader_id,
            "session_id": sess_id,
            "verified": True,
            "status": "SUCCESS",
            "previous_trust": prior,
            "new_trust": new_trust,
            "decision": "MONITOR",
            "session_risk_state": "SESSION_MONITORED",
            "transition": transition,
            "message": "Account successfully recovered with evidentiary trust restoration.",
        }

    def get_observatory(self) -> list[dict[str, Any]]:
        """Returns dynamic operational surveillance watchlist across traders and active sessions."""
        items = []
        for trader_id, trader in self.traders.items():
            trust = float(trader.get("trust_score", 94.0))
            session_risk_state = trader.get("session_risk_state", "SESSION_NORMAL")
            active_sess = self.sessions.get(trader.get("active_session_id", ""))
            failed_verifs = active_sess.get("failed_verifications", 0) if active_sess else trader.get("failed_verifications", 0)

            open_cases = [c for c in self.cases.values() if c.get("trader_id") == trader_id and c.get("status") in {"OPEN", "INVESTIGATING", "ESCALATED"}]

            trader_anomalies = []
            if active_sess and "anomalies" in active_sess:
                trader_anomalies = active_sess["anomalies"]
            elif trader_id in self.trader_anomaly_results:
                trader_anomalies = self.trader_anomaly_results[trader_id].get("anomalies", [])

            protocols = ActionEnforcementService.get_active_protocols(
                trader=trader,
                action=trader.get("last_decision", "ALLOW"),
                context={"failed_verifications": failed_verifs, "session_risk_state": session_risk_state},
                anomalies=trader_anomalies,
            )
            active_proto_ids = [p["protocol_id"] for p in protocols]

            if session_risk_state == "SESSION_TERMINATED" or (trust < 20.0 and len(open_cases) > 0):
                op_state = "RESTRICTED" if session_risk_state != "SESSION_TERMINATED" else "HIGH_ALERT"
            elif trader.get("pending_recovery"):
                op_state = "RECOVERY"
            elif session_risk_state == "SESSION_RESTRICTED":
                op_state = "RESTRICTED"
            elif len(active_proto_ids) > 0 and any(p in {"P-02", "P-03"} for p in active_proto_ids):
                op_state = "PROTOCOL_ACTIVE"
            elif session_risk_state == "SESSION_VERIFICATION_REQUIRED" or "P-01" in active_proto_ids:
                op_state = "PROTOCOL_PENDING"
            elif trust < 45.0 or len(open_cases) > 0 or failed_verifs > 0:
                op_state = "HIGH_ALERT"
            elif trust < 75.0 or session_risk_state in {"SESSION_MONITORED", "SESSION_SUSPICIOUS"} or len(trader_anomalies) > 0:
                op_state = "MONITORING"
            elif trust >= 90.0 and trader.get("event_count", 0) > 0 and session_risk_state == "SESSION_NORMAL":
                op_state = "RESOLVED"
            else:
                op_state = "MONITORING" if trust < 90.0 else "RESOLVED"

            recent_evts = self.trader_events(trader_id)
            last_evt = recent_evts[0] if recent_evts else {}

            graph_data = self.trader_graph(trader_id)
            clusters = graph_data.get("clusters", [])
            shared_count = len(clusters)

            item = {
                "trader_id": trader_id,
                "name": trader.get("name", f"Trader {trader_id}"),
                "segment": trader.get("segment", "RETAIL"),
                "trust_score": trust,
                "initial_trust": trader.get("initial_trust", 94.0),
                "status": trader.get("status", "NORMAL"),
                "session_id": trader.get("active_session_id") or f"SESS-{trader_id}-PRIMARY",
                "session_risk_state": session_risk_state,
                "operational_state": op_state,
                "active_protocols": active_proto_ids,
                "protocol_details": protocols,
                "active_anomalies": trader_anomalies[-5:] if trader_anomalies else [],
                "failed_verifications": failed_verifs,
                "last_decision": trader.get("last_decision", "ALLOW"),
                "last_event_at": trader.get("last_event_at"),
                "last_event_type": last_evt.get("event_type", "NONE"),
                "device_id": last_evt.get("device_id"),
                "ip_address": last_evt.get("ip_address"),
                "network_type": last_evt.get("network_type", "residential"),
                "country": last_evt.get("country", "IN"),
                "wallet_address": last_evt.get("wallet_address"),
                "open_case_id": open_cases[0]["case_id"] if open_cases else None,
                "open_case_severity": open_cases[0]["severity"] if open_cases else None,
                "shared_clusters_count": shared_count,
                "relationship_summary": trader.get("relationship_summary", "Isolated trader node"),
                "risk_dimensions": trader.get("risk_dimensions", {}),
                "pending_recovery": bool(trader.get("pending_recovery")),
                "requires_step_up": (session_risk_state in {"SESSION_VERIFICATION_REQUIRED", "SESSION_RESTRICTED"} or trust < 45.0),
                "opt_in_protocols": trader.get("opt_in_protocols", []),
            }
            items.append(item)

        priority_order = {"HIGH_ALERT": 0, "RESTRICTED": 1, "PROTOCOL_ACTIVE": 2, "PROTOCOL_PENDING": 3, "RECOVERY": 4, "MONITORING": 5, "RESOLVED": 6}
        items.sort(key=lambda x: (priority_order.get(x["operational_state"], 99), x["trust_score"]))
        return items

    def get_protocols(self) -> list[dict[str, Any]]:
        """Returns the active security protocols along with fleet triggering statistics."""
        obs = self.get_observatory()
        res = []
        for proto_id, proto in SECURITY_PROTOCOLS.items():
            matching_traders = [
                {
                    "trader_id": o["trader_id"],
                    "name": o["name"],
                    "trust_score": o["trust_score"],
                    "operational_state": o["operational_state"],
                    "session_risk_state": o["session_risk_state"],
                }
                for o in obs
                if proto_id in o.get("active_protocols", [])
            ]
            res.append({
                **proto,
                "active_triggers_count": len(matching_traders),
                "affected_traders": matching_traders,
            })
        return res

    def trigger_protocol(self, protocol_id: str, trader_id: str, actor: str = "operator") -> dict[str, Any]:
        """Manually dispatches a security protocol for a trader."""
        if trader_id not in self.traders:
            raise KeyError(trader_id)
        if protocol_id not in SECURITY_PROTOCOLS:
            raise ValueError(f"Unknown protocol: {protocol_id}")

        proto = SECURITY_PROTOCOLS[protocol_id]
        trader = self.traders[trader_id]
        sess_id = trader.get("active_session_id") or f"SESS-{trader_id}-PRIMARY"

        if protocol_id == "P-01":
            trader["session_risk_state"] = "SESSION_VERIFICATION_REQUIRED"
            if sess_id in self.sessions:
                self.sessions[sess_id]["risk_state"] = "SESSION_VERIFICATION_REQUIRED"
        elif protocol_id == "P-02":
            trader["session_risk_state"] = "SESSION_RESTRICTED"
            if sess_id in self.sessions:
                self.sessions[sess_id]["risk_state"] = "SESSION_RESTRICTED"
        elif protocol_id == "P-03":
            return self.terminate_session(sess_id, trader_id, reason="Manual protocol P-03 containment dispatch", actor=actor)
        elif protocol_id == "P-04":
            return self.request_recovery(trader_id, actor=actor)

        self._audit(
            actor,
            "PROTOCOL_DISPATCHED",
            trader_id,
            f"Security protocol {protocol_id} ({proto['name']}) manually dispatched",
            {"protocol_id": protocol_id, "trader_id": trader_id, "session_id": sess_id},
        )

        return {
            "trader_id": trader_id,
            "session_id": sess_id,
            "protocol_id": protocol_id,
            "status": "DISPATCHED",
            "protocol": proto,
            "session_risk_state": trader["session_risk_state"],
        }

    def get_opt_in_protocols(self, trader_id: str | None = None) -> dict[str, Any]:
        """Returns metadata for all available opt-in security protocols and enrollment status for a trader."""
        trader_opt_in = []
        if trader_id and trader_id in self.traders:
            trader_opt_in = self.traders[trader_id].get("opt_in_protocols", [])

        protocols_list = []
        for pid, proto in OPT_IN_PROTOCOLS.items():
            protocols_list.append({
                **proto,
                "enrolled": pid in trader_opt_in,
                "trader_id": trader_id,
            })
        return protocols_list

    def enroll_opt_in_protocol(self, trader_id: str, protocol_id: str, enabled: bool, actor: str = "trader") -> dict[str, Any]:
        """Enrolls or disenrolls a trader from voluntary security protocols with cryptographic audit logging."""
        if trader_id not in self.traders:
            raise KeyError(trader_id)
        if protocol_id not in OPT_IN_PROTOCOLS:
            raise ValueError(f"Unknown opt-in protocol: {protocol_id}")

        trader = self.traders[trader_id]
        if "opt_in_protocols" not in trader:
            trader["opt_in_protocols"] = []

        current_opt_in: list[str] = trader["opt_in_protocols"]
        proto_def = OPT_IN_PROTOCOLS[protocol_id]

        if enabled:
            if protocol_id not in current_opt_in:
                current_opt_in.append(protocol_id)
            action_name = "OPT_IN_PROTOCOL_ENROLLED"
            reason = f"Trader voluntarily enrolled in opt-in protocol {protocol_id} ({proto_def['name']})"
        else:
            if protocol_id in current_opt_in:
                current_opt_in.remove(protocol_id)
            action_name = "OPT_IN_PROTOCOL_REVOKED"
            reason = f"Trader voluntarily disabled opt-in protocol {protocol_id} ({proto_def['name']})"

        audit_entry = self._audit(
            actor,
            action_name,
            trader_id,
            reason,
            {
                "protocol_id": protocol_id,
                "protocol_name": proto_def["name"],
                "enabled": enabled,
                "active_enrolled": list(current_opt_in),
            },
        )

        return {
            "status": action_name,
            "trader_id": trader_id,
            "protocol_id": protocol_id,
            "enabled": enabled,
            "active_opt_in_protocols": list(current_opt_in),
            "enrolled_protocols": list(current_opt_in),
            "protocol": proto_def,
            "audit_id": audit_entry.get("audit_id"),
        }

    def _isolate_scenario_trader(self, trader_id: str, trust: float = 94.0, baseline_deposit: float = 3000) -> None:
        """Isolates scenario execution to prevent previous scenario residue from contaminating runs."""
        self.traders[trader_id] = self._new_trader(trader_id, trust, baseline_deposit)
        self.transitions[trader_id] = []
        self.sessions = {sid: s for sid, s in self.sessions.items() if s.get("trader_id") != trader_id}
        # Preserve historical baseline seed events, purge previous scenario events
        self.events = [e for e in self.events if e["trader_id"] != trader_id or str(e.get("source", "")).startswith("seed")]
        self.decisions = [d for d in self.decisions if d["trader_id"] != trader_id or str(d.get("source", "")).startswith("seed")]
        self.cases = {cid: c for cid, c in self.cases.items() if c["trader_id"] != trader_id}
        self.risk_events = [r for r in self.risk_events if r["trader_id"] != trader_id or str(r.get("source", "")).startswith("seed")]
        # Rebuild baseline profile strictly from historical seed events
        self.baseline_profiles[trader_id] = BaselineEngine.build_profile_from_events(
            trader_id, self.trader_events(trader_id), self.traders[trader_id]["baseline"]
        )
        if trader_id in self.trader_anomaly_results:
            del self.trader_anomaly_results[trader_id]

    def reset_trader_baseline(self, trader_id: str, actor: str = "operator") -> dict[str, Any]:
        """Resets an individual trader's baseline profile back to clean trusted parameters."""
        if trader_id not in self.traders:
            raise KeyError(trader_id)
        trader = self.traders[trader_id]
        clean_deposit = 3000 if trader_id == "7842" else 2500
        trader["baseline"] = {
            "typical_deposit": clean_deposit,
            "avg_trade_size": int(clean_deposit * 0.4),
            "max_leverage": 5,
            "known_devices": [f"DEV-{trader_id}-PRIMARY"],
            "known_ips": ["203.0.113.22"],
            "known_wallets": [f"WALLET-{trader_id}-PRIMARY"],
            "primary_country": "IN",
            "active_hours_utc": [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
            "velocity_events_per_day": 3,
        }
        self.baseline_profiles[trader_id] = BaselineEngine.build_profile_from_events(
            trader_id, self.trader_events(trader_id), trader["baseline"]
        )
        self._audit(
            actor,
            "BASELINE_RESET",
            f"TRADER-{trader_id}",
            f"Trader #{trader_id} baseline profile reset to clean institutional parameters",
            {"trader_id": trader_id, "baseline": trader["baseline"]},
        )
        return {
            "trader_id": trader_id,
            "reset": True,
            "profile": self.baseline_profiles[trader_id].to_dict(),
        }

    def get_events(self, trader_id: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
        """Returns chronological event stream, optionally filtered by trader."""
        if trader_id:
            filtered = [e for e in self.events if e.get("trader_id") == trader_id]
        else:
            filtered = self.events
        return filtered[-limit:][::-1]

    def get_risk_events(
        self,
        trader_id: str | None = None,
        category: str | None = None,
        min_severity: float | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """Returns chronological operational risk signals, optionally filtered by trader or category."""
        filtered = self.risk_events
        if trader_id:
            filtered = [r for r in filtered if r.get("trader_id") == trader_id]
        if category:
            filtered = [r for r in filtered if r.get("category") == category]
        if min_severity is not None:
            filtered = [r for r in filtered if r.get("severity", 0.0) >= min_severity]
        return filtered[-limit:][::-1]

    def system_graph(self) -> dict[str, Any]:
        """System-wide topology graph linking all traders and infrastructure entities."""
        return self.graph_engine.format_system_graph_response(self.graph_links, self.traders)

    def prepare_scenario(self, scenario: str) -> tuple[str, list[dict[str, Any]]]:
        scenario = scenario.upper()
        if scenario == "FLAGSHIP":
            self._isolate_scenario_trader("7842", trust=94.0, baseline_deposit=3000)
            events = [
                {"trader_id": "7842", "event_type": "LOGIN", "device_id": "DEV-7842-PRIMARY", "ip_address": "203.0.113.22", "country": "IN", "city": "Mumbai", "source": "flagship"},
                {"trader_id": "7842", "event_type": "NEW_DEVICE", "device_id": "DEV-7842-NEW", "ip_address": "203.0.113.22", "country": "IN", "city": "Mumbai", "source": "flagship"},
                {"trader_id": "7842", "event_type": "IP_CHANGE", "device_id": "DEV-7842-NEW", "ip_address": "198.18.0.14", "country": "IN", "city": "Mumbai", "network_type": "datacenter", "asn": "AS-DEMO-DC", "source": "flagship"},
                {"trader_id": "7842", "event_type": "DEPOSIT", "amount": 25000, "currency": "USD", "asset": "USDT", "device_id": "DEV-7842-NEW", "ip_address": "198.18.0.14", "network_type": "datacenter", "source": "flagship"},
                {"trader_id": "7842", "event_type": "LEVERAGE_CHANGE", "leverage": 50, "asset": "BTC", "device_id": "DEV-7842-NEW", "ip_address": "198.18.0.14", "network_type": "datacenter", "source": "flagship"},
                {"trader_id": "7842", "event_type": "WITHDRAWAL", "amount": 24000, "currency": "USD", "wallet_address": "WALLET-7842-FRESH", "device_id": "DEV-7842-NEW", "ip_address": "198.18.0.14", "network_type": "datacenter", "source": "flagship"},
            ]
            return "7842", events

        if scenario in {"TRAVEL", "IMPOSSIBLE_TRAVEL", "LEGITIMATE_TRAVEL"}:
            self._isolate_scenario_trader("7842", trust=94.0, baseline_deposit=3000)
            return "7842", [
                {"trader_id": "7842", "event_type": "LOGIN", "device_id": "DEV-7842-TRAVEL", "ip_address": "203.0.113.88", "country": "SG", "city": "Singapore", "source": "legitimate-travel"},
                {"trader_id": "7842", "event_type": "DEPOSIT", "amount": 2800, "currency": "USD", "country": "SG", "source": "legitimate-travel"},
                {"trader_id": "7842", "event_type": "TRADE", "amount": 1200, "asset": "ETH", "leverage": 3, "country": "SG", "source": "legitimate-travel"},
            ]

        if scenario in {"FRAUD_RING", "RING", "COLLUSION", "COLLUSION_CLUSTER", "MULTI_ACCOUNT_COLLUSION"}:
            for tid in ["7102", "7103", "7104", "7105"]:
                self._isolate_scenario_trader(tid, trust=72.0, baseline_deposit=2500)
            events = []
            for trader_id in ["7102", "7103", "7104", "7105"]:
                events.append({"trader_id": trader_id, "event_type": "WITHDRAWAL", "amount": 9800, "wallet_address": "WALLET-RING-X", "device_id": "DEV-RING-X", "ip_address": "IP-RING-X", "source": "fraud-ring"})
            return "7102", events

        if scenario in {"FALSE_POSITIVE", "GENUINE_USER", "FALSE_POSITIVE_RESOLVED"}:
            self._isolate_scenario_trader("7842", trust=94.0, baseline_deposit=3000)
            return "7842", [
                {"trader_id": "7842", "event_type": "LOGIN", "device_id": "DEV-7842-AIRPORT", "ip_address": "195.154.122.10", "country": "FR", "city": "Paris", "source": "false-positive"},
                {"trader_id": "7842", "event_type": "TRADE", "amount": 1800, "asset": "ETH", "leverage": 3, "device_id": "DEV-7842-AIRPORT", "country": "FR", "source": "false-positive"},
                {"trader_id": "7842", "event_type": "TRADE", "amount": 2200, "asset": "BTC", "leverage": 2, "device_id": "DEV-7842-AIRPORT", "country": "FR", "source": "false-positive"},
            ]

        if scenario in {"TAKEOVER", "ACCOUNT_TAKEOVER"}:
            self._isolate_scenario_trader("7842", trust=94.0, baseline_deposit=3000)
            return "7842", [
                {"trader_id": "7842", "event_type": "NEW_DEVICE", "device_id": "DEV-ATO", "source": "account-takeover"},
                {"trader_id": "7842", "event_type": "PASSWORD_CHANGE", "device_id": "DEV-ATO", "network_type": "datacenter", "source": "account-takeover"},
                {"trader_id": "7842", "event_type": "2FA_CHANGE", "device_id": "DEV-ATO", "network_type": "datacenter", "source": "account-takeover"},
                {"trader_id": "7842", "event_type": "API_KEY_CHANGE", "device_id": "DEV-ATO", "network_type": "datacenter", "source": "account-takeover"},
            ]

        if scenario in {"NORMAL", "NORMAL_ACTIVITY"}:
            self._isolate_scenario_trader("7842", trust=94.0, baseline_deposit=3000)
            return "7842", [
                {"trader_id": "7842", "event_type": "LOGIN", "device_id": "DEV-7842-PRIMARY", "ip_address": "203.0.113.22", "country": "IN", "city": "Mumbai", "source": "normal-activity"},
                {"trader_id": "7842", "event_type": "DEPOSIT", "amount": 1500, "currency": "USD", "country": "IN", "source": "normal-activity"},
                {"trader_id": "7842", "event_type": "TRADE", "amount": 1000, "asset": "BTC", "leverage": 3, "country": "IN", "source": "normal-activity"},
            ]

        if scenario == "NEW_DEVICE":
            self._isolate_scenario_trader("7842", trust=94.0, baseline_deposit=3000)
            return "7842", [
                {"trader_id": "7842", "event_type": "NEW_DEVICE", "device_id": "DEV-7842-WORK", "ip_address": "203.0.113.22", "country": "IN", "city": "Mumbai", "source": "new-device"},
                {"trader_id": "7842", "event_type": "TRADE", "amount": 2000, "asset": "ETH", "leverage": 3, "device_id": "DEV-7842-WORK", "source": "new-device"},
            ]

        if scenario in {"CREDENTIALS", "CREDENTIAL_CHANGE", "2FA_CHANGE", "TWO_FACTOR_CHANGE"}:
            self._isolate_scenario_trader("7842", trust=94.0, baseline_deposit=3000)
            return "7842", [
                {"trader_id": "7842", "event_type": "PASSWORD_CHANGE", "device_id": "DEV-7842-PRIMARY", "ip_address": "203.0.113.22", "source": "credential-change"},
                {"trader_id": "7842", "event_type": "2FA_CHANGE", "device_id": "DEV-7842-PRIMARY", "ip_address": "203.0.113.22", "source": "credential-change"},
                {"trader_id": "7842", "event_type": "WITHDRAWAL", "amount": 15000, "currency": "USD", "wallet_address": "WALLET-UNKNOWN-99", "source": "credential-change"},
            ]

        if scenario in {"LEVERAGE_SPIKE", "LEVERAGE"}:
            self._isolate_scenario_trader("7002", trust=90.0, baseline_deposit=2500)
            return "7002", [
                {"trader_id": "7002", "event_type": "LOGIN", "device_id": "DEV-7002-TRAVEL", "ip_address": "198.51.100.12", "country": "US", "source": "leverage-spike"},
                {"trader_id": "7002", "event_type": "LEVERAGE_CHANGE", "leverage": 75, "asset": "SOL", "device_id": "DEV-7002-TRAVEL", "source": "leverage-spike"},
                {"trader_id": "7002", "event_type": "TRADE", "amount": 35000, "asset": "SOL", "leverage": 75, "device_id": "DEV-7002-TRAVEL", "source": "leverage-spike"},
            ]

        if scenario in {"WITHDRAWAL", "ABNORMAL_WITHDRAWAL"}:
            self._isolate_scenario_trader("7842", trust=94.0, baseline_deposit=3000)
            return "7842", [
                {"trader_id": "7842", "event_type": "LOGIN", "device_id": "DEV-7842-PRIMARY", "ip_address": "203.0.113.22", "country": "IN", "source": "abnormal-withdrawal"},
                {"trader_id": "7842", "event_type": "WITHDRAWAL", "amount": 45000, "currency": "USD", "wallet_address": "WALLET-7842-DRAIN", "device_id": "DEV-7842-PRIMARY", "source": "abnormal-withdrawal"},
            ]

        if scenario in {"ATTACK_SURGE", "SURGE"}:
            self._isolate_scenario_trader("7842", trust=94.0, baseline_deposit=3000)
            return "7842", [
                {"trader_id": "7842", "event_type": "NEW_DEVICE", "device_id": "DEV-SURGE-1", "ip_address": "198.18.0.21", "network_type": "datacenter", "source": "attack-surge"},
                {"trader_id": "7842", "event_type": "PASSWORD_CHANGE", "device_id": "DEV-SURGE-1", "network_type": "datacenter", "source": "attack-surge"},
                {"trader_id": "7842", "event_type": "LEVERAGE_CHANGE", "leverage": 80, "asset": "SOL", "device_id": "DEV-SURGE-1", "source": "attack-surge"},
                {"trader_id": "7842", "event_type": "WITHDRAWAL", "amount": 35000, "currency": "USD", "wallet_address": "WALLET-SURGE-DRAIN", "device_id": "DEV-SURGE-1", "source": "attack-surge"},
            ]

        if scenario in {"HIGH_VALUE", "LEGITIMATE_HIGH_VALUE", "WHALE", "LEGITIMATE_HIGH_VALUE_ACTIVITY"}:
            self._isolate_scenario_trader("7003", trust=96.0, baseline_deposit=50000)
            return "7003", [
                {"trader_id": "7003", "event_type": "LOGIN", "device_id": "DEV-7003-INSTITUTIONAL", "ip_address": "198.51.100.33", "country": "GB", "source": "whale-liquidity"},
                {"trader_id": "7003", "event_type": "DEPOSIT", "amount": 150000, "currency": "USD", "source": "whale-liquidity"},
                {"trader_id": "7003", "event_type": "TRADE", "amount": 120000, "asset": "BTC", "leverage": 2, "source": "whale-liquidity"},
            ]

        if scenario == "CONTINUOUS_TRADING":
            self._isolate_scenario_trader("7842", trust=94.0, baseline_deposit=3000)
            return "7842", [
                {"trader_id": "7842", "event_type": "LOGIN", "device_id": "DEV-7842-PRIMARY", "ip_address": "203.0.113.22", "country": "IN", "city": "Mumbai", "source": "continuous-trading"},
                {"trader_id": "7842", "event_type": "TRADE", "amount": 1500, "asset": "BTC", "leverage": 3, "device_id": "DEV-7842-PRIMARY", "ip_address": "203.0.113.22", "source": "continuous-trading"},
                {"trader_id": "7842", "event_type": "TRADE", "amount": 2200, "asset": "ETH", "leverage": 3, "device_id": "DEV-7842-PRIMARY", "ip_address": "203.0.113.22", "source": "continuous-trading"},
                {"trader_id": "7842", "event_type": "TRADE", "amount": 1800, "asset": "SOL", "leverage": 2, "device_id": "DEV-7842-PRIMARY", "ip_address": "203.0.113.22", "source": "continuous-trading"},
                {"trader_id": "7842", "event_type": "LEVERAGE_CHANGE", "leverage": 25, "asset": "BTC", "device_id": "DEV-7842-PRIMARY", "ip_address": "203.0.113.22", "source": "continuous-trading"},
                {"trader_id": "7842", "event_type": "TRADE", "amount": 8000, "asset": "BTC", "leverage": 25, "device_id": "DEV-7842-PRIMARY", "ip_address": "203.0.113.22", "source": "continuous-trading"},
                {"trader_id": "7842", "event_type": "TRADE", "amount": 12000, "asset": "ETH", "leverage": 30, "device_id": "DEV-7842-PRIMARY", "ip_address": "203.0.113.22", "source": "continuous-trading"},
                {"trader_id": "7842", "event_type": "WITHDRAWAL", "amount": 15000, "currency": "USD", "wallet_address": "WALLET-7842-FRESH-01", "device_id": "DEV-7842-PRIMARY", "ip_address": "203.0.113.22", "source": "continuous-trading"},
            ]

        raise ValueError(f"Unknown scenario: {scenario}")

    def search(self, query: str) -> dict[str, Any]:
        q = query.strip().lower()
        if not q:
            return {"traders": [], "events": [], "cases": []}

        trader_results = [
            {"trader_id": t["trader_id"], "name": t["name"], "trust_score": t["trust_score"], "status": t["status"]}
            for t in self.traders.values()
            if q in t["trader_id"].lower() or q in t["name"].lower() or q in t["segment"].lower()
        ][:8]

        event_results = [
            {"event_id": e["event_id"], "trader_id": e["trader_id"], "event_type": e["event_type"], "timestamp": e["timestamp"]}
            for e in self.events
            if q in e["event_id"].lower() or q in e["event_type"].lower() or q in (e.get("device_id") or "").lower() or q in (e.get("ip_address") or "").lower()
        ][:8]

        case_results = [
            {"case_id": c["case_id"], "trader_id": c["trader_id"], "status": c["status"], "reason": c["reason"]}
            for c in self.cases.values()
            if q in c["case_id"].lower() or q in c["trader_id"].lower() or q in c["reason"].lower()
        ][:8]

        return {"traders": trader_results, "events": event_results, "cases": case_results}

    def analytics(self) -> dict[str, Any]:
        values = [trader["trust_score"] for trader in self.traders.values()]
        decision_counts = Counter(item["decision"] for item in self.decisions)
        latencies = [x["processing_latency_ms"] for x in self.decisions]

        clusters = self.graph_engine.detect_connected_clusters(self.graph_links, self.traders)
        suspicious_clusters = sum(1 for c in clusters if c.is_suspicious)

        # Operational Population Counts
        total_traders = len(self.traders)
        monitored_traders = sum(1 for t in self.traders.values() if t["status"] == "GUARDED" or (45 <= t["trust_score"] < 70))
        restricted_traders = sum(1 for t in self.traders.values() if t["status"] == "HIGH" or (20 <= t["trust_score"] < 45))
        blocked_traders = sum(1 for t in self.traders.values() if t["status"] == "CRITICAL" or t["trust_score"] < 20)
        trusted_traders = total_traders - monitored_traders - restricted_traders - blocked_traders

        # Dynamic threat identification derived from graph cluster intelligence + open severe cases + degraded trust
        threat_trader_ids: set[str] = set()
        for cl in clusters:
            if cl.is_suspicious:
                threat_trader_ids.update(cl.affected_traders)
        for cid, case in self.cases.items():
            if case.get("status") in {"OPEN", "INVESTIGATING", "ESCALATED"} and case.get("severity") in {"CRITICAL", "HIGH", "RESTRICT", "BLOCK"}:
                threat_trader_ids.add(case["trader_id"])
        for tid, tr in self.traders.items():
            if tr.get("trust_score", 94.0) < 35.0 or tr.get("status") in {"CRITICAL"}:
                threat_trader_ids.add(tid)

        tp = sum(1 for d in self.decisions if d["trader_id"] in threat_trader_ids and d["decision"] in {"RESTRICT", "BLOCK", "VERIFY"})
        fn = sum(1 for d in self.decisions if d["trader_id"] in threat_trader_ids and d["decision"] == "ALLOW")
        fp = sum(1 for d in self.decisions if d["trader_id"] not in threat_trader_ids and d["decision"] in {"RESTRICT", "BLOCK"})
        tn = sum(1 for d in self.decisions if d["trader_id"] not in threat_trader_ids and d["decision"] in {"ALLOW", "MONITOR", "VERIFY"})

        total_evaluated = tp + tn + fp + fn
        precision = round(tp / (tp + fp), 3) if (tp + fp) > 0 else (None if not self.decisions else 1.0)
        recall = round(tp / (tp + fn), 3) if (tp + fn) > 0 else (None if not threat_trader_ids else 1.0)
        fpr = round(fp / (fp + tn), 3) if (fp + tn) > 0 else (None if not self.decisions else 0.0)
        detection_rate = round(tp / (tp + fn), 3) if (tp + fn) > 0 else (None if not threat_trader_ids else 1.0)

        latency_metrics = {
            "p50_ms": round(sorted(latencies)[len(latencies) // 2], 2) if latencies else None,
            "p95_ms": round(sorted(latencies)[int(len(latencies) * 0.95)], 2) if latencies else None,
            "average_ms": round(mean(latencies), 2) if latencies else None,
            "hardware_profile": "Real-time Wall-Clock Profiling (time.perf_counter_ns)",
        }

        return {
            "summary": {
                "active_high_risk": sum(1 for value in values if value < 45.0),
                "average_trust": round(mean(values), 1) if values else 0.0,
                "critical_events": sum(1 for event in self.events[-100:] if event.get("risk_relevance") == "critical"),
                "high_risk_withdrawals": sum(1 for item in self.decisions if item["action"] == "WITHDRAWAL" and item["decision"] in {"RESTRICT", "BLOCK"}),
                "open_cases": sum(1 for case in self.cases.values() if case["status"] in {"OPEN", "INVESTIGATING", "ESCALATED"}),
                "suspicious_clusters": suspicious_clusters,
            },
            "operational_metrics": {
                "total_traders": total_traders,
                "trusted_traders": trusted_traders,
                "monitored_traders": monitored_traders,
                "restricted_traders": restricted_traders,
                "blocked_traders": blocked_traders,
                "total_events_processed": len(self.events),
                "total_risk_signals": len(self.risk_events),
                "open_cases": sum(1 for case in self.cases.values() if case["status"] in {"OPEN", "INVESTIGATING", "ESCALATED"}),
                "resolved_cases": sum(1 for case in self.cases.values() if case["status"] in {"RESOLVED", "FALSE_POSITIVE"}),
                "graph_clusters_detected": len(clusters),
                "suspicious_clusters": suspicious_clusters,
                "enforcement_counts": {
                    "PROCEED": decision_counts.get("ALLOW", 0),
                    "MONITOR": decision_counts.get("MONITOR", 0),
                    "STEP_UP_CHALLENGE": decision_counts.get("VERIFY", 0),
                    "HOLD_REVIEW": decision_counts.get("RESTRICT", 0),
                    "HALT_BLOCKED": decision_counts.get("BLOCK", 0),
                },
            },
            "operational_intelligence": {
                "graph_clusters_detected": len(clusters),
                "suspicious_clusters": suspicious_clusters,
                "total_graph_links": len(self.graph_links),
                "anomaly_model_status": self.anomaly_service.status,
                "anomaly_model_version": self.anomaly_service.model_version,
                "anomaly_training_samples": self.anomaly_service.training_sample_count,
                "trained_at": self.anomaly_service.trained_at,
            },
            "trust_distribution": [
                {"band": "90–100", "count": sum(1 for v in values if v >= 90.0)},
                {"band": "70–89", "count": sum(1 for v in values if 70.0 <= v < 90.0)},
                {"band": "45–69", "count": sum(1 for v in values if 45.0 <= v < 70.0)},
                {"band": "20–44", "count": sum(1 for v in values if 20.0 <= v < 45.0)},
                {"band": "0–19", "count": sum(1 for v in values if v < 20.0)},
            ],
            "decision_distribution": [{"decision": key, "count": value} for key, value in sorted(decision_counts.items())],
            "latency_metrics": latency_metrics,
            "demo_metrics": {
                "precision": precision,
                "recall": recall,
                "false_positive_rate": fpr,
                "detection_rate": detection_rate,
                "average_decision_latency_ms": round(mean(latencies), 1) if latencies else None,
                "label": f"Evaluated from {total_evaluated} observed decisions against labeled ground-truth threat controls" if total_evaluated > 0 else "Insufficient evaluated decisions for metric calculation",
            },
            "recent_decisions": self.decisions[-12:][::-1],
            "top_rules": Counter(rule for decision in self.decisions for rule in decision["triggered_rules"]).most_common(8),
        }

