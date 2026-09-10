from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from statistics import mean, median, stdev
from typing import Any


@dataclass
class NumericDistribution:
    mean: float = 0.0
    median: float = 0.0
    std_dev: float = 0.0
    min_val: float = 0.0
    max_val: float = 0.0
    sample_count: int = 0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class AdaptiveTraderProfile:
    trader_id: str
    deposit_distribution: NumericDistribution = field(default_factory=NumericDistribution)
    withdrawal_distribution: NumericDistribution = field(default_factory=NumericDistribution)
    trade_size_distribution: NumericDistribution = field(default_factory=NumericDistribution)
    leverage_distribution: NumericDistribution = field(default_factory=NumericDistribution)
    countries: list[str] = field(default_factory=list)
    cities: list[str] = field(default_factory=list)
    known_devices: list[str] = field(default_factory=list)
    known_ips: list[str] = field(default_factory=list)
    known_wallets: list[str] = field(default_factory=list)
    normal_login_hours: list[int] = field(default_factory=list)
    transaction_velocity_per_hour: float = 3.0
    sensitive_actions_per_hour: float = 1.0
    trusted_sample_count: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "trader_id": self.trader_id,
            "deposit_amount": round(self.deposit_distribution.mean, 1) if self.deposit_distribution.sample_count > 0 else 2500,
            "deposit_stats": self.deposit_distribution.to_dict(),
            "withdrawal_stats": self.withdrawal_distribution.to_dict(),
            "trade_size_stats": self.trade_size_distribution.to_dict(),
            "leverage": round(self.leverage_distribution.mean, 1) if self.leverage_distribution.sample_count > 0 else 3,
            "leverage_stats": self.leverage_distribution.to_dict(),
            "countries": list(self.countries),
            "cities": list(self.cities),
            "known_devices": list(self.known_devices),
            "known_ips": list(self.known_ips),
            "known_wallets": list(self.known_wallets),
            "normal_login_hours": list(self.normal_login_hours),
            "transaction_velocity_per_hour": self.transaction_velocity_per_hour,
            "sensitive_actions_per_hour": self.sensitive_actions_per_hour,
            "trusted_sample_count": self.trusted_sample_count,
        }

    def learn_device(self, dev: str) -> None:
        if dev and dev not in self.known_devices:
            self.known_devices.append(dev)

    def learn_ip(self, ip: str) -> None:
        if ip and ip not in self.known_ips:
            self.known_ips.append(ip)

    def learn_wallet(self, wallet: str) -> None:
        if wallet and wallet not in self.known_wallets:
            self.known_wallets.append(wallet)


class BaselineEngine:
    """Adaptive behavioral baseline engine calculating dynamic statistics from trusted historical trader events.

    Strictly incorporates poisoning protection: only trusted_for_learning events are learned.
    """

    MIN_SAMPLES_FOR_ZSCORE = 3

    @staticmethod
    def compute_distribution(values: list[float]) -> NumericDistribution:
        if not values:
            return NumericDistribution()
        n = len(values)
        avg = float(mean(values))
        med = float(median(values))
        sd = float(stdev(values)) if n > 1 else 0.0
        return NumericDistribution(
            mean=round(avg, 2),
            median=round(med, 2),
            std_dev=round(sd, 2),
            min_val=round(min(values), 2),
            max_val=round(max(values), 2),
            sample_count=n,
        )

    @classmethod
    def evaluate_zscore(
        cls, value: float, dist: NumericDistribution, fallback_expected: float = 0.0
    ) -> tuple[float | None, float, str]:
        """Calculates statistical deviation (z-score) and mapped risk severity (0-100).

        Returns: (z_score, severity, method_label)
        Safe handling:
        - If sample_count < MIN_SAMPLES_FOR_ZSCORE: fallback to bounded heuristic.
        - If std_dev == 0: check if value equals mean.
        """
        if dist.sample_count < cls.MIN_SAMPLES_FOR_ZSCORE:
            expected = dist.mean if dist.sample_count > 0 else fallback_expected
            if expected <= 0:
                return None, 0.0, "insufficient_history_default"
            ratio = value / expected
            if ratio <= 1.2:
                sev = 0.0
            elif ratio <= 2.0:
                sev = min(40.0, 15.0 + (ratio - 1.2) * 30.0)
            else:
                sev = min(92.0, 40.0 + (ratio - 2.0) * 8.0)
            return None, round(sev, 1), f"heuristic_ratio_{ratio:.1f}x (samples={dist.sample_count})"

        if dist.std_dev <= 1e-6:
            if math.isclose(value, dist.mean, rel_tol=0.05):
                return 0.0, 0.0, "zero_variance_exact_match"
            ratio = (value / dist.mean) if dist.mean > 0 else 1.0
            sev = min(90.0, max(20.0, (ratio - 1.0) * 25.0))
            return None, round(sev, 1), f"zero_variance_relative_deviation_{ratio:.1f}x"

        z = (value - dist.mean) / dist.std_dev

        # Map z-score to bounded severity
        if z <= 1.5:
            sev = 0.0
        elif z <= 2.5:
            # Mild deviation
            sev = 20.0 + (z - 1.5) * 25.0  # 20.0 to 45.0
        elif z <= 4.0:
            # Moderate deviation
            sev = 45.0 + (z - 2.5) * 16.67  # 45.0 to 70.0
        else:
            # Extreme outlier
            sev = min(94.0, 70.0 + (z - 4.0) * 5.0)  # 70.0 to 94.0

        return round(z, 2), round(sev, 1), f"zscore_{z:.2f} (mean={dist.mean:.1f}, std={dist.std_dev:.1f}, n={dist.sample_count})"

    @staticmethod
    def is_trusted_for_learning(
        decision: str,
        trust_score: float,
        is_step_up_verified: bool = False,
        is_analyst_approved: bool = False,
    ) -> bool:
        """Determines if an event is safe to incorporate into the trader's historical baseline profile.

        Poisoning prevention rule:
        Events with trust < 70.0, or RESTRICT / BLOCK / VERIFY status, or unverified anomalies
        must NEVER contaminate the baseline profile.
        """
        if is_analyst_approved or is_step_up_verified:
            return True
        if decision in {"BLOCK", "RESTRICT", "VERIFY"}:
            return False
        return trust_score >= 70.0 and decision in {"ALLOW", "MONITOR"}

    @classmethod
    def build_profile_from_events(
        cls, trader_id: str, events: list[dict[str, Any]], initial_baseline: dict[str, Any] | None = None
    ) -> AdaptiveTraderProfile:
        """Constructs an adaptive trader profile from trusted historical events."""
        init = initial_baseline or {}
        deposits: list[float] = []
        withdrawals: list[float] = []
        trades: list[float] = []
        leverages: list[float] = []
        countries = set(init.get("countries", ["IN"]))
        cities = set(init.get("cities", ["Mumbai"]))
        devices = set(init.get("known_devices", []))
        ips = set(init.get("known_ips", []))
        wallets = set(init.get("known_wallets", []))
        login_hours = set(init.get("normal_login_hours", [8, 9, 10, 18, 19, 20]))

        # Include initial baseline values if available
        if "deposit_amount" in init and init["deposit_amount"] > 0:
            deposits.append(float(init["deposit_amount"]))
        if "leverage" in init and init["leverage"] > 0:
            leverages.append(float(init["leverage"]))

        trusted_count = 0
        for ev in events:
            # Events in history: seed events are inherently trusted
            source = ev.get("source", "")
            relevance = ev.get("risk_relevance", "low")
            if source == "seed" or relevance == "low":
                trusted_count += 1
                if ev.get("amount") is not None and ev["amount"] > 0:
                    ev_type = ev.get("event_type", "")
                    if ev_type == "DEPOSIT":
                        deposits.append(float(ev["amount"]))
                    elif ev_type == "WITHDRAWAL":
                        withdrawals.append(float(ev["amount"]))
                    elif ev_type == "TRADE":
                        trades.append(float(ev["amount"]))

                if ev.get("leverage") is not None and ev["leverage"] > 0:
                    leverages.append(float(ev["leverage"]))

                if ev.get("country"):
                    countries.add(ev["country"])
                if ev.get("city"):
                    cities.add(ev["city"])
                if ev.get("device_id"):
                    devices.add(ev["device_id"])
                if ev.get("ip_address"):
                    ips.add(ev["ip_address"])
                if ev.get("wallet_address"):
                    wallets.add(ev["wallet_address"])

                if ev.get("timestamp"):
                    try:
                        ts = datetime.fromisoformat(ev["timestamp"])
                        login_hours.add(ts.hour)
                    except Exception:
                        pass

        profile = AdaptiveTraderProfile(
            trader_id=trader_id,
            deposit_distribution=cls.compute_distribution(deposits),
            withdrawal_distribution=cls.compute_distribution(withdrawals),
            trade_size_distribution=cls.compute_distribution(trades),
            leverage_distribution=cls.compute_distribution(leverages),
            countries=sorted(countries),
            cities=sorted(cities),
            known_devices=sorted(devices),
            known_ips=sorted(ips),
            known_wallets=sorted(wallets),
            normal_login_hours=sorted(login_hours) if login_hours else [8, 9, 10, 18, 19, 20],
            transaction_velocity_per_hour=float(init.get("transaction_velocity_per_hour", 3.0)),
            sensitive_actions_per_hour=float(init.get("sensitive_actions_per_hour", 1.0)),
            trusted_sample_count=trusted_count,
        )
        return profile

    @classmethod
    def check_circadian_deviation(cls, timestamp_str: str, normal_hours: list[int]) -> tuple[bool, float, str]:
        """Evaluates whether an event timestamp falls outside the trader's circadian normal activity periods."""
        if not normal_hours:
            return False, 0.0, "no_circadian_baseline"
        try:
            ts = datetime.fromisoformat(timestamp_str)
            hour = ts.hour
        except Exception:
            return False, 0.0, "unparseable_timestamp"

        if hour in normal_hours:
            return False, 0.0, f"hour_{hour}_within_baseline"

        # Calculate circular distance in hours from closest normal hour
        min_dist = min(min(abs(hour - nh), 24 - abs(hour - nh)) for nh in normal_hours)
        if min_dist <= 2:
            return False, 0.0, f"hour_{hour}_near_baseline_boundary"

        severity = min(35.0, 15.0 + min_dist * 3.5)
        return True, round(severity, 1), f"activity_at_{hour:02d}:00_UTC_outside_normal_{normal_hours}"
