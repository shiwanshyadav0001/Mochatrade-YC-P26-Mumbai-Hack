from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

ROLES = {"ADMIN", "RISK_ANALYST", "INVESTIGATOR", "VIEWER"}
ALGORITHM = "HS256"
TOKEN_TTL_SECONDS = 3600
bearer_scheme = HTTPBearer(auto_error=False)


def _unauthorized(detail: str = "Invalid or missing authentication token") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


DEFAULT_DEV_JWT_SECRET = "netra-dev-jwt-secret-insecure-only-for-local-development"
_DEV_USERS_CACHE: dict[str, dict[str, str]] | None = None


def _get_dev_users() -> dict[str, dict[str, str]]:
    global _DEV_USERS_CACHE
    if _DEV_USERS_CACHE is None:
        _DEV_USERS_CACHE = {
            "admin": {"role": "ADMIN", "password_hash": hash_password("admin-pass", salt=b"netra-dev-admin-salt")},
            "analyst": {"role": "RISK_ANALYST", "password_hash": hash_password("analyst-pass", salt=b"netra-dev-analyst-salt")},
            "risk_analyst": {"role": "RISK_ANALYST", "password_hash": hash_password("analyst-pass", salt=b"netra-dev-analyst-salt")},
            "investigator": {"role": "INVESTIGATOR", "password_hash": hash_password("investigator-pass", salt=b"netra-dev-invest-salt")},
            "viewer": {"role": "VIEWER", "password_hash": hash_password("viewer-pass", salt=b"netra-dev-viewer-salt")},
        }
    return _DEV_USERS_CACHE


def _secret() -> bytes:
    value = os.getenv("NETRA_JWT_SECRET")
    if not value:
        if os.getenv("ENVIRONMENT") == "production":
            raise HTTPException(status_code=503, detail="Authentication is not configured")
        value = DEFAULT_DEV_JWT_SECRET
    return value.encode("utf-8")


def hash_password(password: str, salt: bytes | None = None, iterations: int = 310_000) -> str:
    salt = salt or os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations)
    return "$".join(
        [
            "pbkdf2_sha256",
            str(iterations),
            _encode(salt),
            _encode(digest),
        ]
    )


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations, salt, expected = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        actual = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode(),
            _decode(salt),
            int(iterations),
        )
        return hmac.compare_digest(_encode(actual), expected)
    except (TypeError, ValueError):
        return False


def load_users() -> dict[str, dict[str, str]]:
    raw = os.getenv("NETRA_AUTH_USERS_JSON", "")
    if not raw:
        if os.getenv("ENVIRONMENT") == "production":
            return {}
        return _get_dev_users()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=503, detail="Authentication user store is invalid") from exc

    users: dict[str, dict[str, str]] = {}
    entries = parsed.items() if isinstance(parsed, dict) else ((item.get("username"), item) for item in parsed)
    for username, item in entries:
        if not isinstance(username, str) or not isinstance(item, dict):
            continue
        role = str(item.get("role", ""))
        password_hash = item.get("password_hash")
        if role in ROLES and isinstance(password_hash, str):
            users[username] = {"role": role, "password_hash": password_hash}
    return users


def authenticate_user(username: str, password: str) -> dict[str, str]:
    normalized = (username or "").strip().lower()
    users = load_users()
    user = users.get(normalized)
    if not user:
        # Fallback: check if the username was supplied as a canonical role name (e.g. "RISK_ANALYST")
        for u, data in users.items():
            if data.get("role", "").lower() == normalized or u.lower() == normalized:
                user = data
                normalized = u
                break
    if not user or not verify_password(password, user["password_hash"]):
        raise _unauthorized("Invalid username or password")
    return {"actor_id": normalized, "role": user["role"]}


def create_access_token(actor: dict[str, str], now: int | None = None) -> tuple[str, int]:
    issued_at = int(time.time() if now is None else now)
    expires_at = issued_at + TOKEN_TTL_SECONDS
    claims = {
        "sub": actor["actor_id"],
        "role": actor["role"],
        "iat": issued_at,
        "exp": expires_at,
    }
    encoded_header = _encode_json({"alg": ALGORITHM, "typ": "JWT"})
    encoded_claims = _encode_json(claims)
    unsigned = f"{encoded_header}.{encoded_claims}"
    signature = _sign(unsigned, _secret())
    return f"{unsigned}.{signature}", expires_at


def decode_access_token(token: str, now: int | None = None) -> dict[str, Any]:
    try:
        encoded_header, encoded_claims, signature = token.split(".", 2)
        unsigned = f"{encoded_header}.{encoded_claims}"
        expected_signature = _sign(unsigned, _secret())
        if not hmac.compare_digest(signature, expected_signature):
            raise _unauthorized()
        header = json.loads(_decode(encoded_header))
        claims = json.loads(_decode(encoded_claims))
        current_time = int(time.time() if now is None else now)
        if header.get("alg") != ALGORITHM or header.get("typ") != "JWT":
            raise _unauthorized()
        if not isinstance(claims.get("sub"), str) or not isinstance(claims.get("role"), str):
            raise _unauthorized()
        if not isinstance(claims.get("exp"), int) or claims["exp"] <= current_time:
            raise _unauthorized("Authentication token has expired")
        return claims
    except HTTPException:
        raise
    except (TypeError, ValueError, json.JSONDecodeError):
        raise _unauthorized()


def get_current_actor(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, str]:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise _unauthorized()
    claims = decode_access_token(credentials.credentials)
    user = load_users().get(claims["sub"])
    if not user or user["role"] != claims["role"]:
        raise _unauthorized()
    return {"actor_id": claims["sub"], "role": user["role"]}


def require_role(allowed_roles: set[str]):
    def checker(actor: dict[str, str] = Depends(get_current_actor)) -> dict[str, str]:
        if actor["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: Role '{actor['role']}' does not have permission for this action. Allowed: {sorted(allowed_roles)}",
            )
        return actor

    return checker


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _encode_json(value: dict[str, Any]) -> str:
    return _encode(json.dumps(value, separators=(",", ":"), sort_keys=True).encode())


def _sign(value: str, secret: bytes) -> str:
    return _encode(hmac.new(secret, value.encode(), hashlib.sha256).digest())
