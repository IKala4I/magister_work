"""Authentication (specs/07 §5, §7): Supabase user JWT verified against the project JWKS
(asymmetric, `kid`-keyed cache, aud = authenticated, sub must equal the requested user_id), or
the service-to-service secret `X-Service-Key` with an explicit user_id. The secret lives only in
the edge-function env and the HF Space secrets — never in the client, never in the repo.
"""

from __future__ import annotations

import hmac
import os
from dataclasses import dataclass
from typing import Any, Literal, Protocol

import jwt
from jwt import PyJWKClient

ALGORITHMS = ["ES256", "RS256"]
AUDIENCE = "authenticated"


class AuthError(Exception):
    def __init__(self, status: int, detail: str) -> None:
        super().__init__(detail)
        self.status = status
        self.detail = detail


@dataclass(frozen=True)
class AuthSettings:
    service_key: str | None
    jwks_url: str | None

    @classmethod
    def from_env(cls) -> AuthSettings:
        supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        jwks = os.environ.get("RECSYS_JWKS_URL") or (
            f"{supabase_url}/auth/v1/.well-known/jwks.json" if supabase_url else None
        )
        return cls(service_key=os.environ.get("HOURWELL_SERVICE_KEY") or None, jwks_url=jwks)


@dataclass(frozen=True)
class Principal:
    kind: Literal["service", "user"]
    user_id: str | None


class TokenVerifier(Protocol):
    def verify(self, token: str) -> dict[str, Any]: ...


class JwksVerifier:
    def __init__(self, jwks_url: str) -> None:
        self._client = PyJWKClient(jwks_url, cache_keys=True, lifespan=600)

    def verify(self, token: str) -> dict[str, Any]:
        key = self._client.get_signing_key_from_jwt(token)
        claims: dict[str, Any] = jwt.decode(
            token,
            key.key,
            algorithms=ALGORITHMS,
            audience=AUDIENCE,
            options={"require": ["exp", "sub"]},
        )
        return claims


def authenticate(
    *,
    authorization: str | None,
    x_service_key: str | None,
    settings: AuthSettings,
    verifier: TokenVerifier | None,
) -> Principal:
    if x_service_key is not None:
        if settings.service_key and hmac.compare_digest(
            x_service_key.encode("utf-8", "surrogateescape"),
            settings.service_key.encode("utf-8", "surrogateescape"),
        ):
            return Principal("service", None)
        raise AuthError(401, "invalid service key")
    if authorization and authorization.startswith("Bearer "):
        if verifier is None:
            raise AuthError(401, "JWT verification is not configured")
        token = authorization.removeprefix("Bearer ").strip()
        try:
            claims = verifier.verify(token)
        except jwt.PyJWTError as exc:
            raise AuthError(401, f"invalid token: {exc}") from exc
        return Principal("user", str(claims["sub"]))
    raise AuthError(401, "missing credentials")


def authorize_user(principal: Principal, user_id: str) -> None:
    """A user token may only act on its own `sub`; the service key may act on any user."""
    if principal.kind == "user" and principal.user_id != user_id:
        raise AuthError(403, "token subject does not match user_id")
