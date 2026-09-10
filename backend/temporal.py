from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any


def parse_iso(ts: str) -> datetime:
    try:
        dt = datetime.fromisoformat(ts)
        if dt.tzinfo is None:
            return dt.replace(tzinfo=UTC)
        return dt
    except Exception:
        return datetime.now(UTC)


@dataclass
class TemporalMetrics:
    events_5m: int = 0
    events_15m: int = 0
    events_1h: int = 0
    events_24h: int = 0
    events_7d: int = 0
    deposits_1h: int = 0
    withdrawals_1h: int = 0
    trades_15m: int = 0
    trades_1h: int = 0
    leverage_changes_1h: int = 0
    credential_changes_24h: int = 0
    new_wallets_24h: int = 0
    seconds_since_last_login: float | None = None
    seconds_since_last_deposit: float | None = None
    seconds_since_last_trade: float | None = None
    seconds_since_last_leverage_change: float | None = None
    seconds_since_last_sensitive_action: float | None = None
    burst_detected: bool = False
    burst_ratio: float = 1.0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class TemporalWindowEngine:
    """Sliding temporal window engine calculating granular event velocity and recency across 5m, 15m, 1h, 24h, and 7d windows."""

    SENSITIVE_ACTIONS = {"WITHDRAWAL", "PASSWORD_CHANGE", "2FA_CHANGE", "API_KEY_CHANGE", "NEW_WALLET"}

    @classmethod
    def analyze_event_stream(
        cls,
        current_event_timestamp: str,
        historical_events: list[dict[str, Any]],
        baseline_velocity_per_hour: float = 3.0,
    ) -> TemporalMetrics:
        curr_dt = parse_iso(current_event_timestamp)
        cutoff_7d = curr_dt - timedelta(days=7)

        # Filter recent events within 7 days
        recent = [
            e for e in historical_events
            if parse_iso(e["timestamp"]) <= curr_dt and parse_iso(e["timestamp"]) >= cutoff_7d
        ]

        metrics = TemporalMetrics()
        cutoff_5m = curr_dt - timedelta(minutes=5)
        cutoff_15m = curr_dt - timedelta(minutes=15)
        cutoff_1h = curr_dt - timedelta(hours=1)
        cutoff_24h = curr_dt - timedelta(hours=24)

        last_login_dt: datetime | None = None
        last_deposit_dt: datetime | None = None
        last_trade_dt: datetime | None = None
        last_leverage_dt: datetime | None = None
        last_sensitive_dt: datetime | None = None

        for ev in recent:
            ev_dt = parse_iso(ev["timestamp"])
            ev_type = ev.get("event_type", "")

            # Window counts
            if ev_dt >= cutoff_5m:
                metrics.events_5m += 1
            if ev_dt >= cutoff_15m:
                metrics.events_15m += 1
                if ev_type == "TRADE":
                    metrics.trades_15m += 1
            if ev_dt >= cutoff_1h:
                metrics.events_1h += 1
                if ev_type == "DEPOSIT":
                    metrics.deposits_1h += 1
                elif ev_type == "WITHDRAWAL":
                    metrics.withdrawals_1h += 1
                elif ev_type == "TRADE":
                    metrics.trades_1h += 1
                elif ev_type == "LEVERAGE_CHANGE":
                    metrics.leverage_changes_1h += 1
            if ev_dt >= cutoff_24h:
                metrics.events_24h += 1
                if ev_type in {"PASSWORD_CHANGE", "2FA_CHANGE", "API_KEY_CHANGE"}:
                    metrics.credential_changes_24h += 1
                elif ev_type == "NEW_WALLET":
                    metrics.new_wallets_24h += 1

            metrics.events_7d += 1

            # Track recency (only for events strictly prior to current event)
            if ev_dt < curr_dt:
                if ev_type == "LOGIN" and (last_login_dt is None or ev_dt > last_login_dt):
                    last_login_dt = ev_dt
                if ev_type == "DEPOSIT" and (last_deposit_dt is None or ev_dt > last_deposit_dt):
                    last_deposit_dt = ev_dt
                if ev_type == "TRADE" and (last_trade_dt is None or ev_dt > last_trade_dt):
                    last_trade_dt = ev_dt
                if ev_type == "LEVERAGE_CHANGE" and (last_leverage_dt is None or ev_dt > last_leverage_dt):
                    last_leverage_dt = ev_dt
                if ev_type in cls.SENSITIVE_ACTIONS and (last_sensitive_dt is None or ev_dt > last_sensitive_dt):
                    last_sensitive_dt = ev_dt

        if last_login_dt:
            metrics.seconds_since_last_login = round((curr_dt - last_login_dt).total_seconds(), 1)
        if last_deposit_dt:
            metrics.seconds_since_last_deposit = round((curr_dt - last_deposit_dt).total_seconds(), 1)
        if last_trade_dt:
            metrics.seconds_since_last_trade = round((curr_dt - last_trade_dt).total_seconds(), 1)
        if last_leverage_dt:
            metrics.seconds_since_last_leverage_change = round((curr_dt - last_leverage_dt).total_seconds(), 1)
        if last_sensitive_dt:
            metrics.seconds_since_last_sensitive_action = round((curr_dt - last_sensitive_dt).total_seconds(), 1)

        # Burst detection relative to trader's individual baseline velocity
        base_rate = max(1.0, baseline_velocity_per_hour)
        metrics.burst_ratio = round(metrics.events_1h / base_rate, 2)
        metrics.burst_detected = metrics.events_1h >= max(6, int(base_rate * 3))

        return metrics


@dataclass
class SequenceMatch:
    sequence_id: str
    name: str
    completion_percentage: int
    severity: float
    elapsed_minutes: float
    matched_events: list[str]
    evidence_details: list[dict[str, Any]]
    is_terminal: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class SequenceEngine:
    """Evaluates multi-event attack kill chains and suspicious patterns using actual timestamps and context."""

    DEFINED_SEQUENCES = [
        {
            "id": "SEQ-RAPID-WITHDRAWAL",
            "name": "Deposit -> Leverage Spike -> Rapid Withdrawal",
            "steps": ["DEPOSIT", "LEVERAGE_CHANGE", "WITHDRAWAL"],
            "max_minutes": 45,
            "base_severity": 82.0,
            "terminal_action": "WITHDRAWAL",
        },
        {
            "id": "SEQ-ACCOUNT-TAKEOVER-DRAIN",
            "name": "New Device -> Credential Change -> Extraction",
            "steps": ["NEW_DEVICE", ["PASSWORD_CHANGE", "2FA_CHANGE", "API_KEY_CHANGE"], "WITHDRAWAL"],
            "max_minutes": 30,
            "base_severity": 88.0,
            "terminal_action": "WITHDRAWAL",
        },
        {
            "id": "SEQ-INFRASTRUCTURE-HOP-DRAIN",
            "name": "New Device -> Network Anomaly -> Withdrawal",
            "steps": ["NEW_DEVICE", "IP_CHANGE", "WITHDRAWAL"],
            "max_minutes": 30,
            "base_severity": 84.0,
            "terminal_action": "WITHDRAWAL",
        },
        {
            "id": "SEQ-RAPID-DEPOSIT-DRAIN",
            "name": "Rapid Deposit Drain",
            "steps": ["DEPOSIT", "WITHDRAWAL"],
            "max_minutes": 60,
            "base_severity": 76.0,
            "terminal_action": "WITHDRAWAL",
        },
    ]

    @classmethod
    def evaluate_sequences(
        cls,
        current_event: dict[str, Any],
        historical_events: list[dict[str, Any]],
    ) -> list[SequenceMatch]:
        curr_dt = parse_iso(current_event["timestamp"])
        curr_type = current_event.get("event_type", "").upper()

        # Combine chronological event chain up to and including current event
        chain = sorted(
            [e for e in historical_events if parse_iso(e["timestamp"]) < curr_dt] + [current_event],
            key=lambda item: parse_iso(item["timestamp"]),
        )

        matches: list[SequenceMatch] = []

        for seq_def in cls.DEFINED_SEQUENCES:
            steps = seq_def["steps"]
            max_minutes = seq_def["max_minutes"]
            cutoff = curr_dt - timedelta(minutes=max_minutes)

            # Look for step occurrences in chronological order within max_minutes window
            matched_indices: list[int] = []
            current_step_idx = 0

            for event_idx, ev in enumerate(chain):
                if parse_iso(ev["timestamp"]) < cutoff:
                    continue

                ev_type = ev.get("event_type", "").upper()
                expected_step = steps[current_step_idx]

                matches_step = False
                if isinstance(expected_step, list):
                    matches_step = ev_type in expected_step
                else:
                    matches_step = (ev_type == expected_step)

                if matches_step:
                    matched_indices.append(event_idx)
                    current_step_idx += 1
                    if current_step_idx >= len(steps):
                        break

            # Must have at least 2 steps, and must involve a sensitive/escalation event
            has_escalation_event = any(
                chain[i]["event_type"] in {"LEVERAGE_CHANGE", "PASSWORD_CHANGE", "2FA_CHANGE", "API_KEY_CHANGE", "WITHDRAWAL"}
                for i in matched_indices
            )
            if current_step_idx >= 2 and (current_step_idx == len(steps) or has_escalation_event):
                first_event = chain[matched_indices[0]]
                last_event = chain[matched_indices[-1]]
                elapsed_secs = (parse_iso(last_event["timestamp"]) - parse_iso(first_event["timestamp"])).total_seconds()
                elapsed_mins = max(0.1, round(elapsed_secs / 60.0, 1))

                completion = round((current_step_idx / len(steps)) * 100)
                is_terminal = (current_step_idx == len(steps)) and (curr_type == seq_def.get("terminal_action"))

                # Scale severity by completion percentage and speed of execution
                speed_multiplier = 1.0 + max(0.0, (max_minutes - elapsed_mins) / max_minutes) * 0.20
                sev = min(96.0, round(seq_def["base_severity"] * (current_step_idx / len(steps)) * speed_multiplier, 1))

                matched_types = [chain[i]["event_type"] for i in matched_indices]
                evidence = [
                    {
                        "id": f"{seq_def['id']}-{i}",
                        "type": "SEQUENCE_STEP",
                        "label": f"Step {i+1}: {chain[idx]['event_type']} at {chain[idx]['timestamp']}",
                    }
                    for i, idx in enumerate(matched_indices)
                ]

                matches.append(
                    SequenceMatch(
                        sequence_id=seq_def["id"],
                        name=seq_def["name"],
                        completion_percentage=completion,
                        severity=sev,
                        elapsed_minutes=elapsed_mins,
                        matched_events=matched_types,
                        evidence_details=evidence,
                        is_terminal=is_terminal,
                    )
                )

        return sorted(matches, key=lambda m: m.severity, reverse=True)
