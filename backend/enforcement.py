from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

SESSION_RISK_STATES = {
    "SESSION_NORMAL": "Normal baseline conforming session",
    "SESSION_MONITORED": "Monitored session with minor anomalies or velocity shifts",
    "SESSION_SUSPICIOUS": "Suspicious session with correlated contextual risk signals",
    "SESSION_VERIFICATION_REQUIRED": "Step-up verification challenge required before sensitive operations",
    "SESSION_RESTRICTED": "Restricted session due to elevated risk or verification challenge",
    "SESSION_TERMINATED": "Terminated session due to critical compromise or repeated verification failures",
}

SECURITY_PROTOCOLS = {
    "P-01": {
        "protocol_id": "P-01",
        "name": "Identity Revalidation",
        "description": "Step-up verification challenge required upon identity, device, or network contextual deviations.",
        "trigger_conditions": "Contextual risk >= 25.0 OR new device / impossible travel / network anomaly detected.",
        "applicable_categories": ["IDENTITY", "NETWORK", "RELATIONSHIP"],
        "min_risk_level": "ELEVATED",
        "target_actions": ["WITHDRAWAL", "CHANGE_PASSWORD", "CHANGE_2FA", "CHANGE_API_KEY", "NEW_WALLET", "TRADE"],
        "required_response": "STEP_UP_CHALLENGE",
        "enforcement_action": "VERIFY",
        "escalation_behavior": "SESSION_VERIFICATION_REQUIRED",
        "failure_behavior": "SESSION_RESTRICTED",
        "recovery_behavior": "P-04 Secondary Out-of-Band Verification",
        "status": "ACTIVE",
    },
    "P-02": {
        "protocol_id": "P-02",
        "name": "Sensitive Transaction Protection",
        "description": "Transaction hold and step-up authorization for high-value withdrawals or new destination wallets under elevated risk.",
        "trigger_conditions": "Withdrawal >= $10,000 OR new destination wallet combined with contextual anomalies (trust < 70).",
        "applicable_categories": ["TRANSACTION", "TRADING", "BEHAVIOURAL"],
        "min_risk_level": "HIGH",
        "target_actions": ["WITHDRAWAL", "NEW_WALLET", "LEVERAGE_CHANGE"],
        "required_response": "STEP_UP_CHALLENGE",
        "enforcement_action": "VERIFY_OR_RESTRICT",
        "escalation_behavior": "RESTRICT_TRANSACTION",
        "failure_behavior": "BLOCK_TRANSACTION",
        "recovery_behavior": "Manual Analyst Review or OOB Verification",
        "status": "ACTIVE",
    },
    "P-03": {
        "protocol_id": "P-03",
        "name": "Session Containment & Revocation",
        "description": "Immediate session termination and credential containment upon critical compromise or repeated verification failures.",
        "trigger_conditions": "Trust score < 20.0 OR repeated verification failures (>= 2) OR active kill-chain progression >= 75%.",
        "applicable_categories": ["IDENTITY", "BEHAVIOURAL", "TRANSACTION", "SEQUENCE"],
        "min_risk_level": "CRITICAL",
        "target_actions": ["ALL_ACTIONS"],
        "required_response": "IMMEDIATE_REVOCATION",
        "enforcement_action": "BLOCK",
        "escalation_behavior": "SESSION_TERMINATED",
        "failure_behavior": "AUTO_ESCALATE_CRITICAL_CASE",
        "recovery_behavior": "P-04 Formal Out-of-Band Account Recovery",
        "status": "ACTIVE",
    },
    "P-04": {
        "protocol_id": "P-04",
        "name": "Account Recovery & Secondary Remediation",
        "description": "Out-of-band secondary identity verification workflow for restricted or contained trader accounts.",
        "trigger_conditions": "Account in SESSION_RESTRICTED standing OR verification unavailable OR explicit user recovery request.",
        "applicable_categories": ["IDENTITY", "RECOVERY"],
        "min_risk_level": "RESTRICTED",
        "target_actions": ["RESTORE_SESSION", "RE-EVALUATE_TRUST"],
        "required_response": "SECONDARY_OOB_OTP_OR_KYC",
        "enforcement_action": "RE_EVALUATE",
        "escalation_behavior": "RESTORE_TO_MONITORED",
        "failure_behavior": "MAINTAIN_RESTRICTION",
        "recovery_behavior": "EVIDENTIARY_TRUST_UPDATE",
        "status": "ACTIVE",
    },
}

OPT_IN_PROTOCOLS = {
    "OPT-01": {
        "protocol_id": "OPT-01",
        "name": "Mandatory Biometric Gate for Sensitive Operations",
        "category": "TRANSACTION_PROTECTION",
        "description": "Voluntary trader security lock: requires biometric TouchID/FaceID step-up authorization for all withdrawals, destination wallet registrations, and security credential updates regardless of current trust score.",
        "trigger_conditions": "Voluntarily enabled by trader. Gated on high-sensitivity actions (WITHDRAWAL, NEW_WALLET, CHANGE_PASSWORD, CHANGE_2FA).",
        "target_actions": ["WITHDRAWAL", "NEW_WALLET", "CHANGE_PASSWORD", "CHANGE_2FA", "CHANGE_API_KEY"],
        "protection_tier": "HIGH_ASSURANCE",
        "status": "AVAILABLE",
        "default_state": "OFF",
    },
    "OPT-02": {
        "protocol_id": "OPT-02",
        "name": "Baseline Volume Surge Lock",
        "category": "SURGE_PROTECTION",
        "description": "Voluntary anomaly boundary: automatically holds and challenges any trade or withdrawal exceeding 3x habitual baseline volume or 10x margin leverage.",
        "trigger_conditions": "Voluntarily enabled by trader. Triggered when transaction volume > 3x baseline deposit or leverage > 10x.",
        "target_actions": ["WITHDRAWAL", "TRADE", "LEVERAGE_CHANGE"],
        "protection_tier": "FINANCIAL_BOUND",
        "status": "AVAILABLE",
        "default_state": "OFF",
    },
    "OPT-03": {
        "protocol_id": "OPT-03",
        "name": "Novel Device & Datacenter Guard",
        "category": "INFRASTRUCTURE_GUARD",
        "description": "Voluntary infrastructure lock: demands biometric step-up whenever an action originates from an unwhitelisted hardware device ID or datacenter/VPN network.",
        "trigger_conditions": "Voluntarily enabled by trader. Intercepts session operations from unrecognized hardware footprints.",
        "target_actions": ["LOGIN", "WITHDRAWAL", "NEW_WALLET"],
        "protection_tier": "DEVICE_BOUND",
        "status": "AVAILABLE",
        "default_state": "OFF",
    },
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
    active_protocols: list[str] = field(default_factory=list)
    evidence: list[dict[str, Any]] = field(default_factory=list)
    opt_in_intercept: bool = False
    opt_in_protocol: str | None = None
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

        # Match triggered security protocols
        matched_protocols = cls.get_active_protocols(trader, action, context=context)
        proto_ids = [p["protocol_id"] for p in matched_protocols]

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
                active_protocols=proto_ids or ["P-03"],
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
                    active_protocols=proto_ids,
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
                active_protocols=proto_ids,
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
                active_protocols=proto_ids or ["P-01", "P-04"],
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
                active_protocols=proto_ids or ["P-03"],
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
                active_protocols=proto_ids or ["P-01", "P-02"],
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
                active_protocols=proto_ids or ["P-01", "P-02"],
                evidence=evidence,
            )

        # 4b. Voluntary Opt-In Security Protocol Interception
        opt_in_protos = trader.get("opt_in_protocols", [])
        if "OPT-01" in opt_in_protos and action in cls.HIGH_SENSITIVITY_ACTIONS:
            return EnforcementResult(
                trader_id=trader_id,
                action=action,
                decision="VERIFY",
                allowed=False,
                status="CHALLENGED",
                reason=f"Action '{action}' requires biometric step-up verification: Trader opted into OPT-01 Mandatory Biometric Gate.",
                trust_score=trust,
                policy_version=policy_ver,
                session_risk_state=session_risk_state,
                requires_step_up=True,
                active_protocols=[*proto_ids, "OPT-01"],
                opt_in_intercept=True,
                opt_in_protocol="OPT-01",
                evidence=evidence + [{"id": "OPT-01", "type": "VOLUNTARY_POLICY", "label": "OPT-01 Mandatory Biometric Gate Enrolled"}],
            )

        if "OPT-02" in opt_in_protos and action in {"WITHDRAWAL", "TRADE", "LEVERAGE_CHANGE", "DEPOSIT"}:
            baseline = trader.get("baseline", {})
            amt = float(ctx.get("amount") or 0.0)
            base_dep = float(baseline.get("deposit_amount", 3000))
            if amt > base_dep * 3.0:
                return EnforcementResult(
                    trader_id=trader_id,
                    action=action,
                    decision="VERIFY",
                    allowed=False,
                    status="CHALLENGED",
                    reason=f"Action '{action}' (${amt:,.0f}) exceeds 3x habitual baseline (${base_dep:,.0f}): Trader opted into OPT-02 Baseline Volume Surge Lock.",
                    trust_score=trust,
                    policy_version=policy_ver,
                    session_risk_state=session_risk_state,
                    requires_step_up=True,
                    active_protocols=[*proto_ids, "OPT-02"],
                    opt_in_intercept=True,
                    opt_in_protocol="OPT-02",
                    evidence=evidence + [{"id": "OPT-02", "type": "VOLUNTARY_POLICY", "label": "OPT-02 Volume Surge Lock Enrolled"}],
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
                active_protocols=proto_ids,
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
            active_protocols=proto_ids,
        )

    @classmethod
    def get_active_protocols(
        cls,
        trader: dict[str, Any],
        action: str = "ALLOW",
        context: dict[str, Any] | None = None,
        anomalies: list[dict[str, Any]] | None = None,
    ) -> list[dict[str, Any]]:
        """Identifies triggered security protocols based on trader trust standing, context, anomalies, and action sensitivity."""
        matched: list[dict[str, Any]] = []
        trust = float(trader.get("trust_score", 94.0))
        ctx = context or {}
        sess_state = ctx.get("session_risk_state") or trader.get("session_risk_state", "SESSION_NORMAL")
        failed_verifs = ctx.get("failed_verifications") or trader.get("failed_verifications", 0)
        action_name = action.upper()
        anom_list = anomalies or []

        # P-03: Session Containment & Revocation
        if trust < 20.0 or failed_verifs >= 2 or sess_state == "SESSION_TERMINATED":
            matched.append(SECURITY_PROTOCOLS["P-03"])

        # P-04: Account Recovery & Secondary Remediation
        if sess_state == "SESSION_RESTRICTED" or trader.get("pending_recovery"):
            matched.append(SECURITY_PROTOCOLS["P-04"])

        # P-02: Sensitive Transaction Protection
        is_sensitive_tx = action_name in {"WITHDRAWAL", "NEW_WALLET", "LEVERAGE_CHANGE"}
        if is_sensitive_tx and (trust < 70.0 or any(a.get("type", "").startswith("TRANSACTION") or a.get("type", "").startswith("TRADING") for a in anom_list)):
            matched.append(SECURITY_PROTOCOLS["P-02"])

        # P-01: Identity Revalidation
        if (trust < 65.0 or sess_state in {"SESSION_VERIFICATION_REQUIRED", "SESSION_SUSPICIOUS"} or any(a.get("type", "").startswith("IDENTITY") or a.get("type", "").startswith("NETWORK") for a in anom_list)) and action_name not in cls.READ_ONLY_ACTIONS:
            if SECURITY_PROTOCOLS["P-01"] not in matched:
                matched.append(SECURITY_PROTOCOLS["P-01"])

        # Opt-In Voluntary Protocol Triggers
        opt_in_list = trader.get("opt_in_protocols", [])
        for opt_id in opt_in_list:
            if opt_id in OPT_IN_PROTOCOLS:
                proto_def = OPT_IN_PROTOCOLS[opt_id]
                if action_name in proto_def.get("target_actions", []) or action_name == "ALLOW":
                    if proto_def not in matched:
                        matched.append(proto_def)

        return matched
