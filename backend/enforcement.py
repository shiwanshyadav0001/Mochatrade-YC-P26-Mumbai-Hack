from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


SESSION_RISK_STATES = {
    "SESSION_NORMAL",
    "SESSION_MONITORED",
    "SESSION_SUSPICIOUS",
    "SESSION_VERIFICATION_REQUIRED",
    "SESSION_RESTRICTED",
    "SESSION_TERMINATED",
}


@dataclass
class EnforcementResult:
    trader_id: str
    action: str
    decision: str  # ALLOW, MONITOR, VERIFY, RESTRICT, BLOCK
    allowed: bool
    status: str    # ALLOWED, MONITORED, CHALLENGED, RESTRICTED, BLOCKED
    reason: str
    trust_score: float
    policy_version: str
    session_risk_state: str = "SESSION_NORMAL"
    requires_step_up: bool = False
    evidence: list[dict[str, Any]] = field(default_factory=list)
    gateway_notice: str = "NETRA Simulated Action Enforcement Gateway (Integration-Ready. No live broker/exchange connection)."

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class ActionEnforcementService:
    """Evaluates and enforces simulated platform actions against live trust standing, contextual risk, active security policies, and session state."""

    READ_ONLY_ACTIONS = {"PROFILE_VIEW", "BALANCE_QUERY", "ORDER_HISTORY_VIEW"}
    HIGH_SENSITIVITY_ACTIONS = {"WITHDRAWAL", "CHANGE_PASSWORD", "CHANGE_2FA", "CHANGE_API_KEY", "NEW_WALLET"}

    @classmethod
    def evaluate_action(
        cls,
        trader: dict[str, Any],
        action: str,
        policy: dict[str, Any],
        context: dict[str, Any] | None = None,
        active_cases: list[dict[str, Any]] | None = None,
    ) -> EnforcementResult:
        action = action.upper()
        trader_id = trader.get("trader_id", "UNKNOWN")
        trust = float(trader.get("trust_score", 94.0))
        bands = policy.get("trust_bands", {"allow": 90, "monitor": 70, "verify": 45, "restrict": 20})
        sens_map = policy.get("action_sensitivity", {})
        sensitivity = sens_map.get(action, 50)
        policy_ver = policy.get("version", "2026.09-v2.0")

        ctx = context or {}
        session_risk_state = ctx.get("session_risk_state") or trader.get("session_risk_state", "SESSION_NORMAL")
        evidence: list[dict[str, Any]] = []

        # 0. If session is explicitly TERMINATED -> ALL actions blocked
        if session_risk_state == "SESSION_TERMINATED":
            return EnforcementResult(
                trader_id=trader_id,
                action=action,
                decision="BLOCK",
                allowed=False,
                status="BLOCKED",
                reason="Session has been terminated due to high-confidence security compromise. Full re-authentication required.",
                trust_score=trust,
                policy_version=policy_ver,
                session_risk_state=session_risk_state,
                requires_step_up=False,
                evidence=[{"id": "SESSION_REVOCATION", "type": "SESSION", "label": "Session Terminated"}],
            )

        # Check for open critical cases on trader
        has_escalated_case = False
        if active_cases:
            for c in active_cases:
                if c.get("trader_id") == trader_id and c.get("status") in {"OPEN", "INVESTIGATING", "ESCALATED"}:
                    has_escalated_case = True
                    evidence.append({"id": c.get("case_id", ""), "type": "CASE", "label": f"Active security case: {c.get('severity')}"})
                    break

        # 1. Read-only actions always proceed unless account is explicitly BLOCKED
        if action in cls.READ_ONLY_ACTIONS:
            if trust < 10.0 and has_escalated_case:
                return EnforcementResult(
                    trader_id=trader_id,
                    action=action,
                    decision="RESTRICT",
                    allowed=False,
                    status="RESTRICTED",
                    reason="Account restricted due to active critical risk investigation.",
                    trust_score=trust,
                    policy_version=policy_ver,
                    session_risk_state=session_risk_state,
                    evidence=evidence,
                )
            return EnforcementResult(
                trader_id=trader_id,
                action=action,
                decision="ALLOW",
                allowed=True,
                status="ALLOWED",
                reason="Read-only action allowed.",
                trust_score=trust,
                policy_version=policy_ver,
                session_risk_state=session_risk_state,
            )

        # 1b. If session is RESTRICTED: sensitive actions restricted, read-only permitted
        if session_risk_state == "SESSION_RESTRICTED" and (action in cls.HIGH_SENSITIVITY_ACTIONS or sensitivity >= 70):
            return EnforcementResult(
                trader_id=trader_id,
                action=action,
                decision="RESTRICT",
                allowed=False,
                status="RESTRICTED",
                reason=f"Action '{action}' restricted: Session is in restricted standing pending step-up verification.",
                trust_score=trust,
                policy_version=policy_ver,
                session_risk_state=session_risk_state,
                requires_step_up=True,
                evidence=evidence,
            )

        # 2. Critical trust (< 15.0 or < restrict band with high sensitivity) -> BLOCK
        block_threshold = bands.get("block", 15.0)
        if trust < block_threshold and (action in cls.HIGH_SENSITIVITY_ACTIONS or has_escalated_case):
            return EnforcementResult(
                trader_id=trader_id,
                action=action,
                decision="BLOCK",
                allowed=False,
                status="BLOCKED",
                reason=(
                    f"Action '{action}' is explicitly BLOCKED: Trader trust score ({trust:.1f}) is at critical risk level. "
                    "Manual security clearance required."
                ),
                trust_score=trust,
                policy_version=policy_ver,
                requires_step_up=False,
                evidence=evidence,
            )

        # 3. High sensitivity action with trust < restrict band -> RESTRICT
        if trust < bands.get("restrict", 20.0):
            return EnforcementResult(
                trader_id=trader_id,
                action=action,
                decision="RESTRICT",
                allowed=False,
                status="RESTRICTED",
                reason=f"Action '{action}' is RESTRICTED: Trust score ({trust:.1f}) falls below restriction threshold ({bands['restrict']}).",
                trust_score=trust,
                policy_version=policy_ver,
                requires_step_up=True,
                evidence=evidence,
            )

        # 4. Action sensitivity >= 70 or trust in verify band -> VERIFY (Step-up required)
        if trust < bands.get("verify", 45.0) or (sensitivity >= 75 and trust < bands.get("monitor", 70.0)):
            return EnforcementResult(
                trader_id=trader_id,
                action=action,
                decision="VERIFY",
                allowed=False,
                status="CHALLENGED",
                reason=f"Action '{action}' requires step-up verification before execution (trust={trust:.1f}).",
                trust_score=trust,
                policy_version=policy_ver,
                requires_step_up=True,
                evidence=evidence,
            )

        # 5. Trust in monitor band -> MONITOR (Allowed with active observation)
        if trust < bands.get("allow", 90.0):
            return EnforcementResult(
                trader_id=trader_id,
                action=action,
                decision="MONITOR",
                allowed=True,
                status="MONITORED",
                reason=f"Action '{action}' is permitted under enhanced continuous telemetry monitoring.",
                trust_score=trust,
                policy_version=policy_ver,
                requires_step_up=False,
                evidence=evidence,
            )

        # 6. Trust >= allow band -> ALLOW
        return EnforcementResult(
            trader_id=trader_id,
            action=action,
            decision="ALLOW",
            allowed=True,
            status="ALLOWED",
            reason=f"Action '{action}' is approved: Trader maintains trusted standing ({trust:.1f}).",
            trust_score=trust,
            policy_version=policy_ver,
            requires_step_up=False,
        )
