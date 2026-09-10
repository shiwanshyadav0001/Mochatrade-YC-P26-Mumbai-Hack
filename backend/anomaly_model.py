from __future__ import annotations

import logging
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from typing import Any

import numpy as np
from sklearn.ensemble import IsolationForest

logger = logging.getLogger(__name__)

FEATURE_NAMES = [
    "deposit_zscore",
    "withdrawal_zscore",
    "leverage_zscore",
    "trade_size_zscore",
    "velocity_1h_ratio",
    "sensitive_actions_1h",
    "burst_ratio",
    "device_novelty",
    "network_novelty",
    "wallet_novelty",
    "circadian_anomaly",
    "graph_degree",
]

FEATURE_SCHEMA = {
    "feature_version": "1.0.0",
    "feature_count": len(FEATURE_NAMES),
    "features": [
        {"name": "deposit_zscore", "type": "float", "description": "Z-score deviation of deposit amount against baseline"},
        {"name": "withdrawal_zscore", "type": "float", "description": "Z-score deviation of withdrawal amount against baseline"},
        {"name": "leverage_zscore", "type": "float", "description": "Z-score deviation of leverage against baseline"},
        {"name": "trade_size_zscore", "type": "float", "description": "Z-score deviation of trade size against baseline"},
        {"name": "velocity_1h_ratio", "type": "float", "description": "1h event count divided by baseline velocity per hour"},
        {"name": "sensitive_actions_1h", "type": "float", "description": "Count of sensitive actions within 1h sliding window"},
        {"name": "burst_ratio", "type": "float", "description": "Burst acceleration ratio from temporal sliding window"},
        {"name": "device_novelty", "type": "float", "description": "1.0 if device is unseen/new, 0.0 if known"},
        {"name": "network_novelty", "type": "float", "description": "1.0 if datacenter/vpn/unseen IP, 0.0 if known residential/mobile"},
        {"name": "wallet_novelty", "type": "float", "description": "1.0 if destination wallet is new, 0.0 if known"},
        {"name": "circadian_anomaly", "type": "float", "description": "1.0 if action occurs outside normal login hours, 0.0 if normal"},
        {"name": "graph_degree", "type": "float", "description": "Number of connected infrastructure links for the trader"},
    ],
}


@dataclass
class AnomalyInferenceResult:
    anomaly_score: float  # Normalized 0.0 to 100.0
    status: str           # "TRAINED", "INSUFFICIENT_DATA", "FAILED"
    raw_decision_score: float | None
    feature_values: dict[str, float]
    top_deviations: list[dict[str, Any]]
    explanation: str
    model_version: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "anomaly_score": round(self.anomaly_score, 1),
            "status": self.status,
            "raw_decision_score": round(self.raw_decision_score, 4) if self.raw_decision_score is not None else None,
            "feature_values": {k: round(v, 3) for k, v in self.feature_values.items()},
            "top_deviations": self.top_deviations,
            "explanation": self.explanation,
            "model_version": self.model_version,
        }


class BehavioralAnomalyService:
    """Production unsupervised behavioral anomaly detection service utilizing scikit-learn Isolation Forest

    with deterministic 12-dimensional feature extraction, training contamination protection,

    0–100 score normalization, and failure-safe operation.

    """

    MIN_TRAINING_SAMPLES = 8
    RETRAIN_INTERVAL = 10

    def __init__(self, model_version: str = "iforest-v1.0") -> None:
        self.model_version = model_version
        self.model: IsolationForest | None = None
        self.status = "UNINITIALIZED"
        self.trained_at: str | None = None
        self.training_sample_count = 0
        self.last_error: str | None = None
        self.training_buffer: list[np.ndarray] = []
        self.feature_means: np.ndarray | None = None
        self.feature_stds: np.ndarray | None = None

    @staticmethod
    def extract_feature_vector(
        event_data: dict[str, Any],
        profile: Any | None,
        temporal_metrics: Any | None,
        graph_degree: int = 0,
    ) -> tuple[np.ndarray, dict[str, float]]:
        """Deterministically extracts a 12-dimensional feature vector from real NETRA telemetry."""
        e_type = event_data.get("event_type", "").upper()
        amount = float(event_data.get("amount") or 0.0)
        leverage = float(event_data.get("leverage") or 0.0)

        # 1. Statistical Z-scores against trader baseline
        dep_z = 0.0
        with_z = 0.0
        lev_z = 0.0
        trade_z = 0.0

        if profile:
            if e_type == "DEPOSIT" and amount > 0:
                dist = profile.deposit_distribution
                if dist.sample_count >= 2 and dist.std_dev > 0:
                    dep_z = max(0.0, (amount - dist.mean) / dist.std_dev)
                elif dist.sample_count >= 1 and amount > dist.mean * 2:
                    dep_z = (amount - dist.mean) / (dist.mean * 0.5)

            elif e_type == "WITHDRAWAL" and amount > 0:
                dist = profile.withdrawal_distribution
                if dist.sample_count >= 2 and dist.std_dev > 0:
                    with_z = max(0.0, (amount - dist.mean) / dist.std_dev)
                elif dist.sample_count >= 1 and amount > dist.mean * 2:
                    with_z = (amount - dist.mean) / (dist.mean * 0.5)

            elif e_type == "LEVERAGE_CHANGE" and leverage > 0:
                dist = profile.leverage_distribution
                if dist.sample_count >= 2 and dist.std_dev > 0:
                    lev_z = max(0.0, (leverage - dist.mean) / dist.std_dev)
                elif dist.sample_count >= 1 and leverage > dist.mean:
                    lev_z = (leverage - dist.mean) / max(1.0, dist.mean * 0.5)

            elif e_type == "TRADE" and amount > 0:
                dist = profile.trade_size_distribution
                if dist.sample_count >= 2 and dist.std_dev > 0:
                    trade_z = max(0.0, (amount - dist.mean) / dist.std_dev)

        # 2. Velocity & Temporal Ratios
        base_vel = profile.transaction_velocity_per_hour if profile else 3.0
        vel_1h = float(temporal_metrics.events_1h) if temporal_metrics else 1.0
        vel_ratio = min(15.0, vel_1h / max(1.0, base_vel))
        sens_actions = float(temporal_metrics.withdrawals_1h + temporal_metrics.new_wallets_24h) if temporal_metrics else 0.0
        burst_ratio = float(temporal_metrics.burst_ratio) if temporal_metrics else 1.0

        # 3. Novelty flags
        dev_id = event_data.get("device_id")
        dev_novel = 1.0 if (profile and dev_id and dev_id not in profile.known_devices) else (1.0 if e_type == "NEW_DEVICE" else 0.0)

        net_type = event_data.get("network_type", "")
        ip_addr = event_data.get("ip_address")
        net_novel = 1.0 if net_type in {"datacenter", "vpn"} or (profile and ip_addr and ip_addr not in profile.known_ips) else 0.0

        wallet_addr = event_data.get("wallet_address")
        wallet_novel = 1.0 if (profile and wallet_addr and wallet_addr not in profile.known_wallets) or e_type == "NEW_WALLET" else 0.0

        # 4. Circadian
        circadian = 0.0
        if profile and profile.normal_login_hours:
            ts_str = event_data.get("timestamp", "")
            try:
                dt = datetime.fromisoformat(ts_str)
                if dt.hour not in profile.normal_login_hours:
                    circadian = 1.0
            except Exception:
                pass

        deg = min(20.0, float(graph_degree))

        values = [
            min(10.0, dep_z),
            min(10.0, with_z),
            min(10.0, lev_z),
            min(10.0, trade_z),
            vel_ratio,
            min(10.0, sens_actions),
            min(10.0, burst_ratio),
            dev_novel,
            net_novel,
            wallet_novel,
            circadian,
            deg,
        ]

        vec = np.array(values, dtype=np.float64)
        val_map = dict(zip(FEATURE_NAMES, values))
        return vec, val_map

    def fit_trusted_population(self, trusted_vectors: list[np.ndarray]) -> bool:
        """Fits Isolation Forest on confirmed trusted historical telemetry.

        Strict contamination protection: excluded attack / blocked events.

        """
        if len(trusted_vectors) < self.MIN_TRAINING_SAMPLES:
            self.status = "INSUFFICIENT_DATA"
            self.training_sample_count = len(trusted_vectors)
            return False

        try:
            X = np.vstack(trusted_vectors)
            # Store distribution baseline for feature attribution
            self.feature_means = np.mean(X, axis=0)
            self.feature_stds = np.std(X, axis=0)
            self.feature_stds[self.feature_stds == 0] = 1.0

            # Fit Isolation Forest (unsupervised outlier detection)
            clf = IsolationForest(
                n_estimators=100,
                contamination=0.05,
                max_samples=min(256, len(trusted_vectors)),
                random_state=42,
            )
            clf.fit(X)

            self.model = clf
            self.status = "TRAINED"
            self.training_sample_count = len(trusted_vectors)
            self.trained_at = datetime.now(UTC).isoformat()
            self.last_error = None
            return True
        except Exception as exc:
            logger.exception("Failed to fit IsolationForest model: %s", exc)
            self.status = "FAILED"
            self.last_error = str(exc)
            return False

    def predict_anomaly(self, vec: np.ndarray, val_map: dict[str, float]) -> AnomalyInferenceResult:
        """Performs real anomaly inference and maps decision function to normalized 0–100 scale.

        If model is unavailable, gracefully returns INSUFFICIENT_DATA without crashing.

        """
        if self.status != "TRAINED" or self.model is None:
            return AnomalyInferenceResult(
                anomaly_score=0.0,
                status=self.status if self.status in {"INSUFFICIENT_DATA", "FAILED"} else "INSUFFICIENT_DATA",
                raw_decision_score=None,
                feature_values=val_map,
                top_deviations=[],
                explanation="Behavioral anomaly model not active: insufficient trusted training population.",
                model_version=self.model_version,
            )

        try:
            X = vec.reshape(1, -1)
            raw_decision = float(self.model.decision_function(X)[0])

            # Normalization Method:
            # IsolationForest decision_function returns positive scores for inliers (normal) and negative for outliers.
            # Typically range is approx [-0.35, +0.25].
            # We map decision_function to a 0.0 - 100.0 Anomaly Score:
            # df >= 0.12 -> Score: 0 - 10 (Very normal)
            # df == 0.0  -> Score: 40 - 50 (Boundary)
            # df <= -0.15 -> Score: 75 - 100 (Severe anomaly)
            # Formula: anomaly_score = clamp((0.14 - raw_decision) / 0.32 * 100.0, 0.0, 100.0)
            normalized = float(np.clip((0.14 - raw_decision) / 0.32 * 100.0, 0.0, 100.0))

            # Feature-Level Attribution
            deviations = []
            if self.feature_means is not None and self.feature_stds is not None:
                z_devs = (vec - self.feature_means) / self.feature_stds
                for i, name in enumerate(FEATURE_NAMES):
                    val = float(vec[i])
                    z = float(z_devs[i])
                    if z > 1.2 or val >= 1.0:
                        deviations.append({
                            "feature": name,
                            "value": round(val, 2),
                            "baseline_mean": round(float(self.feature_means[i]), 2),
                            "z_deviation": round(z, 2),
                        })

            deviations.sort(key=lambda d: d["z_deviation"], reverse=True)
            top_devs = deviations[:4]

            if normalized >= 65.0 and top_devs:
                top_desc = ", ".join(f"{d['feature']} ({d['z_deviation']}σ)" for d in top_devs)
                explanation = f"High behavioral anomaly ({normalized:.0f}/100). Key contributing factors: {top_desc}."
            elif normalized >= 40.0:
                explanation = f"Moderate behavioral novelty ({normalized:.0f}/100) observed relative to trusted population."
            else:
                explanation = f"Behavior is consistent with trusted population baseline (anomaly score: {normalized:.0f}/100)."

            return AnomalyInferenceResult(
                anomaly_score=normalized,
                status="TRAINED",
                raw_decision_score=raw_decision,
                feature_values=val_map,
                top_deviations=top_devs,
                explanation=explanation,
                model_version=self.model_version,
            )
        except Exception as exc:
            logger.exception("Inference error in BehavioralAnomalyService: %s", exc)
            return AnomalyInferenceResult(
                anomaly_score=0.0,
                status="FAILED",
                raw_decision_score=None,
                feature_values=val_map,
                top_deviations=[],
                explanation=f"Anomaly inference encountered an internal error: {exc}",
                model_version=self.model_version,
            )

    def get_status(self) -> dict[str, Any]:
        """Returns truthful operational status and metadata for GET /api/anomaly/status."""
        return {
            "model_available": self.status == "TRAINED" and self.model is not None,
            "status": self.status,
            "model_version": self.model_version,
            "feature_version": FEATURE_SCHEMA["feature_version"],
            "feature_count": FEATURE_SCHEMA["feature_count"],
            "training_samples": self.training_sample_count,
            "trained_at": self.trained_at,
            "min_required_samples": self.MIN_TRAINING_SAMPLES,
            "last_error": self.last_error,
            "algorithm": "scikit-learn IsolationForest (unsupervised)",
            "normalization": "Linear boundary projection: clamp((0.14 - decision_function) / 0.32 * 100, 0, 100)",
        }
