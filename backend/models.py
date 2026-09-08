import json
from sqlalchemy import Column, Float, Integer, String, Text
from database import Base


class TraderModel(Base):
    __tablename__ = "traders"

    trader_id = Column(String(64), primary_key=True, index=True)
    name = Column(String(128), nullable=False)
    segment = Column(String(64), nullable=False)
    trust_score = Column(Float, nullable=False, default=94.0)
    initial_trust = Column(Float, nullable=False, default=94.0)
    status = Column(String(32), nullable=False, default="NORMAL")
    baseline_json = Column(Text, nullable=False, default="{}")
    risk_dimensions_json = Column(Text, nullable=False, default="{}")
    last_decision = Column(String(32), nullable=False, default="ALLOW")
    last_event_at = Column(String(64), nullable=True)
    relationship_summary = Column(String(256), nullable=False, default="No elevated connections observed")
    event_count = Column(Integer, nullable=False, default=0)

    def to_dict(self):
        return {
            "trader_id": self.trader_id,
            "name": self.name,
            "segment": self.segment,
            "trust_score": self.trust_score,
            "initial_trust": self.initial_trust,
            "status": self.status,
            "baseline": json.loads(self.baseline_json) if self.baseline_json else {},
            "risk_dimensions": json.loads(self.risk_dimensions_json) if self.risk_dimensions_json else {},
            "last_decision": self.last_decision,
            "last_event_at": self.last_event_at,
            "relationship_summary": self.relationship_summary,
            "event_count": self.event_count,
        }


class EventModel(Base):
    __tablename__ = "events"

    event_id = Column(String(64), primary_key=True, index=True)
    timestamp = Column(String(64), nullable=False, index=True)
    trader_id = Column(String(64), nullable=False, index=True)
    event_type = Column(String(64), nullable=False, index=True)
    source = Column(String(64), nullable=False, default="api")
    session_id = Column(String(64), nullable=True)
    device_id = Column(String(64), nullable=True, index=True)
    ip_address = Column(String(64), nullable=True, index=True)
    country = Column(String(8), nullable=True)
    city = Column(String(64), nullable=True)
    asn = Column(String(64), nullable=True)
    network_type = Column(String(32), nullable=True)
    amount = Column(Float, nullable=True)
    currency = Column(String(8), nullable=False, default="USD")
    asset = Column(String(32), nullable=True)
    leverage = Column(Float, nullable=True)
    wallet_address = Column(String(128), nullable=True, index=True)
    metadata_json = Column(Text, nullable=False, default="{}")
    risk_relevance = Column(String(32), nullable=False, default="medium")

    def to_dict(self):
        return {
            "event_id": self.event_id,
            "timestamp": self.timestamp,
            "trader_id": self.trader_id,
            "event_type": self.event_type,
            "source": self.source,
            "session_id": self.session_id,
            "device_id": self.device_id,
            "ip_address": self.ip_address,
            "country": self.country,
            "city": self.city,
            "asn": self.asn,
            "network_type": self.network_type,
            "amount": self.amount,
            "currency": self.currency,
            "asset": self.asset,
            "leverage": self.leverage,
            "wallet_address": self.wallet_address,
            "metadata": json.loads(self.metadata_json) if self.metadata_json else {},
            "risk_relevance": self.risk_relevance,
        }


class DecisionModel(Base):
    __tablename__ = "decisions"

    decision_id = Column(String(64), primary_key=True, index=True)
    timestamp = Column(String(64), nullable=False, index=True)
    trader_id = Column(String(64), nullable=False, index=True)
    action = Column(String(64), nullable=False)
    decision = Column(String(32), nullable=False)
    trust_score = Column(Float, nullable=False)
    risk_level = Column(String(32), nullable=False)
    confidence = Column(String(32), nullable=False)
    explanation_json = Column(Text, nullable=False, default="{}")
    triggered_rules_json = Column(Text, nullable=False, default="[]")
    policy_version = Column(String(64), nullable=False)
    processing_latency_ms = Column(Float, nullable=False, default=12.0)

    def to_dict(self):
        return {
            "decision_id": self.decision_id,
            "timestamp": self.timestamp,
            "trader_id": self.trader_id,
            "action": self.action,
            "decision": self.decision,
            "trust_score": self.trust_score,
            "risk_level": self.risk_level,
            "confidence": self.confidence,
            "explanation": json.loads(self.explanation_json) if self.explanation_json else {},
            "triggered_rules": json.loads(self.triggered_rules_json) if self.triggered_rules_json else [],
            "policy_version": self.policy_version,
            "processing_latency_ms": self.processing_latency_ms,
        }


class CaseModel(Base):
    __tablename__ = "cases"

    case_id = Column(String(64), primary_key=True, index=True)
    trader_id = Column(String(64), nullable=False, index=True)
    severity = Column(String(32), nullable=False)
    trust_score = Column(Float, nullable=False)
    status = Column(String(32), nullable=False, default="OPEN")
    created_at = Column(String(64), nullable=False)
    updated_at = Column(String(64), nullable=False)
    assigned_to = Column(String(64), nullable=False, default="Unassigned")
    reason = Column(Text, nullable=False)
    evidence_json = Column(Text, nullable=False, default="[]")
    decision = Column(String(32), nullable=False)
    notes_json = Column(Text, nullable=False, default="[]")
    resolution = Column(Text, nullable=True)

    def to_dict(self):
        return {
            "case_id": self.case_id,
            "trader_id": self.trader_id,
            "severity": self.severity,
            "trust_score": self.trust_score,
            "status": self.status,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "assigned_to": self.assigned_to,
            "reason": self.reason,
            "evidence": json.loads(self.evidence_json) if self.evidence_json else [],
            "decision": self.decision,
            "notes": json.loads(self.notes_json) if self.notes_json else [],
            "resolution": self.resolution,
        }


class AuditModel(Base):
    __tablename__ = "audit_log"

    audit_id = Column(String(64), primary_key=True, index=True)
    timestamp = Column(String(64), nullable=False, index=True)
    actor = Column(String(64), nullable=False)
    event = Column(String(64), nullable=False)
    subject = Column(String(64), nullable=False, index=True)
    reason = Column(Text, nullable=False)
    policy_version = Column(String(64), nullable=False)
    details_json = Column(Text, nullable=False, default="{}")

    def to_dict(self):
        return {
            "audit_id": self.audit_id,
            "timestamp": self.timestamp,
            "actor": self.actor,
            "event": self.event,
            "subject": self.subject,
            "reason": self.reason,
            "policy_version": self.policy_version,
            "details": json.loads(self.details_json) if self.details_json else {},
        }


class PolicyModel(Base):
    __tablename__ = "policies"

    id = Column(Integer, primary_key=True)
    version = Column(String(64), nullable=False)
    config_json = Column(Text, nullable=False)

    def to_dict(self):
        return json.loads(self.config_json)


class GraphLinkModel(Base):
    __tablename__ = "graph_links"

    id = Column(Integer, primary_key=True, autoincrement=True)
    source = Column(String(128), nullable=False, index=True)
    target = Column(String(128), nullable=False, index=True)
    link_type = Column(String(64), nullable=False)
    evidence_json = Column(Text, nullable=False, default="[]")

    def to_dict(self):
        return {
            "source": self.source,
            "target": self.target,
            "type": self.link_type,
            "evidence": json.loads(self.evidence_json) if self.evidence_json else [],
        }
