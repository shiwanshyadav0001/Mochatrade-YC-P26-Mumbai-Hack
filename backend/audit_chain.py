from __future__ import annotations

import hashlib
import json
from typing import Any

GENESIS_HASH = "GENESIS_00000000000000000000000000000000000000000000000000000000"


def canonicalize_record(record: dict[str, Any]) -> str:
    """Produces a deterministic, canonical JSON string representation of an audit record

    excluding previous_hash and current_hash so it can be hashed reproducibly.
    """
    payload = {
        "audit_id": str(record.get("audit_id", "")),
        "timestamp": str(record.get("timestamp", "")),
        "actor": str(record.get("actor", "")),
        "event": str(record.get("event", "")),
        "subject": str(record.get("subject", "")),
        "reason": str(record.get("reason", "")),
        "policy_version": str(record.get("policy_version", "")),
        "details": record.get("details", {}),
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def compute_audit_hash(record: dict[str, Any], previous_hash: str) -> str:
    """Computes SHA-256 hash of canonicalized record + previous_hash."""
    canonical_json = canonicalize_record(record)
    content_to_hash = f"{canonical_json}|{previous_hash}".encode("utf-8")
    return hashlib.sha256(content_to_hash).hexdigest()


def chain_audit_record(record: dict[str, Any], previous_record: dict[str, Any] | None) -> dict[str, Any]:
    """Populates previous_hash and computes current_hash for a new audit record."""
    prev_hash = previous_record.get("current_hash") if previous_record else GENESIS_HASH
    if not prev_hash:
        prev_hash = GENESIS_HASH
    rec_copy = dict(record)
    rec_copy["previous_hash"] = prev_hash
    rec_copy["current_hash"] = compute_audit_hash(rec_copy, prev_hash)
    return rec_copy


def verify_audit_chain(audit_list: list[dict[str, Any]]) -> dict[str, Any]:
    """Verifies the cryptographic integrity of an audit record chain in chronological order.

    Detects modified records, deleted records, reordered records, and broken hash links.
    """
    if not audit_list:
        return {
            "valid": True,
            "checked_records": 0,
            "message": "Audit chain is empty; 0 records verified.",
            "first_invalid_record": None,
            "reason": None,
        }

    expected_prev = GENESIS_HASH
    for idx, rec in enumerate(audit_list):
        rec_id = rec.get("audit_id", f"INDEX-{idx}")
        rec_prev = rec.get("previous_hash")
        rec_curr = rec.get("current_hash")

        # 1. Check link to previous hash
        if rec_prev != expected_prev:
            return {
                "valid": False,
                "checked_records": idx,
                "first_invalid_record": rec_id,
                "record_index": idx,
                "reason": (
                    f"Broken hash link at record {rec_id} (index {idx}): "
                    f"expected previous_hash '{expected_prev}', got '{rec_prev}'."
                ),
            }

        # 2. Check current hash authenticity
        expected_curr = compute_audit_hash(rec, rec_prev)
        if rec_curr != expected_curr:
            return {
                "valid": False,
                "checked_records": idx,
                "first_invalid_record": rec_id,
                "record_index": idx,
                "reason": (
                    f"Tampered or corrupted record {rec_id} (index {idx}): "
                    f"recalculated hash '{expected_curr}' does not match stored hash '{rec_curr}'."
                ),
            }

        expected_prev = rec_curr

    return {
        "valid": True,
        "checked_records": len(audit_list),
        "message": f"Cryptographic integrity verified across {len(audit_list)} audit records.",
        "head_hash": expected_prev,
        "first_invalid_record": None,
        "reason": None,
    }


def verify_single_audit_record(record: dict[str, Any]) -> dict[str, Any]:
    """Verifies the cryptographic integrity of an individual audit record.

    Validates that recalculating sha256(canonicalize_record(record) + "|" + previous_hash)
    matches the stored current_hash.
    """
    prev_hash = record.get("previous_hash") or GENESIS_HASH
    stored_hash = record.get("current_hash") or ""
    canonical_payload = canonicalize_record(record)
    expected_hash = compute_audit_hash(record, prev_hash)
    is_valid = bool(stored_hash and stored_hash == expected_hash)
    return {
        "valid": is_valid,
        "audit_id": record.get("audit_id"),
        "stored_hash": stored_hash,
        "recalculated_hash": expected_hash,
        "previous_hash": prev_hash,
        "canonical_payload": canonical_payload,
        "reason": None if is_valid else (
            f"Hash mismatch: stored '{stored_hash}' vs recalculated '{expected_hash}'"
        ),
    }
