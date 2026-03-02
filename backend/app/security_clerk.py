from __future__ import annotations

import json
import time
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from jose import JWTError, jwt, ExpiredSignatureError

from app.config import get_settings


class ClerkVerificationError(RuntimeError):
    pass


@dataclass
class ClerkIdentity:
    user_id: str
    email: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    role_hint: str | None = None
    claims: dict | None = None


_JWKS_CACHE_URL: str | None = None
_JWKS_CACHE_KEYS: dict[str, dict[str, object]] = {}
_JWKS_FETCHED_AT: float = 0.0
_JWKS_TTL_SECONDS = 300


def _invalidate_jwks_cache() -> None:
    global _JWKS_CACHE_URL, _JWKS_CACHE_KEYS, _JWKS_FETCHED_AT
    _JWKS_CACHE_URL = None
    _JWKS_CACHE_KEYS = {}
    _JWKS_FETCHED_AT = 0.0


def _http_json(url: str, headers: dict[str, str] | None = None, timeout: float = 5.0) -> dict:
    req_headers = headers or {}
    req_headers.setdefault("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
    req = Request(url=url, headers=req_headers, method="GET")
    try:
        with urlopen(req, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise ClerkVerificationError(f"Errore rete/JSON Clerk: {exc}") from exc


def _clerk_jwks_url() -> str:
    s = get_settings()
    if s.clerk_jwks_url:
        return s.clerk_jwks_url.strip()
    if not s.clerk_issuer:
        raise ClerkVerificationError("Config Clerk incompleta: CLERK_ISSUER o CLERK_JWKS_URL richiesti")
    return f"{s.clerk_issuer.rstrip('/')}/.well-known/jwks.json"


def _load_jwks() -> dict[str, dict[str, object]]:
    global _JWKS_CACHE_URL, _JWKS_CACHE_KEYS, _JWKS_FETCHED_AT
    url = _clerk_jwks_url()
    now = time.time()
    if _JWKS_CACHE_URL == url and (now - _JWKS_FETCHED_AT) <= _JWKS_TTL_SECONDS and _JWKS_CACHE_KEYS:
        return _JWKS_CACHE_KEYS

    payload = _http_json(url)
    key_rows = payload.get("keys")
    if not isinstance(key_rows, list) or not key_rows:
        raise ClerkVerificationError("JWKS Clerk non valido")
    by_kid: dict[str, dict[str, object]] = {}
    for row in key_rows:
        kid = (row or {}).get("kid")
        if kid:
            by_kid[str(kid)] = row
    if not by_kid:
        raise ClerkVerificationError("JWKS Clerk senza kid")
    _JWKS_CACHE_URL = url
    _JWKS_CACHE_KEYS = by_kid
    _JWKS_FETCHED_AT = now
    return by_kid


def _resolve_role_hint(claims: dict) -> str | None:
    for key in ("softibridge_role", "role", "org_role"):
        value = claims.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip().upper()
    return None


def _extract_email_from_claims(claims: dict) -> str | None:
    for key in ("email", "email_address", "primary_email_address"):
        value = claims.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip().lower()
    return None


def fetch_clerk_user_profile(clerk_user_id: str) -> dict:
    s = get_settings()
    if not s.clerk_secret_key:
        raise ClerkVerificationError("CLERK_SECRET_KEY mancante per fetch profilo utente")
    api_base = (s.clerk_api_url or "https://api.clerk.com").rstrip("/")
    headers = {
        "Authorization": f"Bearer {s.clerk_secret_key}",
        "Content-Type": "application/json",
    }
    return _http_json(f"{api_base}/v1/users/{clerk_user_id}", headers=headers)


def extract_email_from_clerk_profile(profile: dict) -> str | None:
    primary_id = profile.get("primary_email_address_id")
    addresses = profile.get("email_addresses") or []
    if isinstance(addresses, list):
        for row in addresses:
            if isinstance(row, dict) and row.get("id") == primary_id:
                email = row.get("email_address")
                if isinstance(email, str) and email.strip():
                    return email.strip().lower()
        for row in addresses:
            if isinstance(row, dict):
                email = row.get("email_address")
                if isinstance(email, str) and email.strip():
                    return email.strip().lower()
    return None


def verify_clerk_bearer_token(token: str) -> ClerkIdentity:
    s = get_settings()
    issuer = (s.clerk_issuer or "").strip()
    if not issuer and not (s.clerk_jwks_url or "").strip():
        raise ClerkVerificationError("Config Clerk incompleta: CLERK_ISSUER o CLERK_JWKS_URL richiesti")
    jwks = _load_jwks()
    try:
        headers = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise ClerkVerificationError("Header JWT non valido") from exc
    kid = headers.get("kid")
    if not kid:
        raise ClerkVerificationError("JWT senza kid")
    key = jwks.get(str(kid))
    if not key:
        _invalidate_jwks_cache()
        jwks = _load_jwks()
        key = jwks.get(str(kid))
    if not key:
        raise ClerkVerificationError("Chiave pubblica Clerk non trovata per kid")

    decode_kwargs = {
        "algorithms": ["RS256"],
        "options": {
            "verify_aud": bool((s.clerk_audience or "").strip()),
            "verify_iss": bool(issuer),
        },
    }
    if issuer:
        decode_kwargs["issuer"] = issuer
    if (s.clerk_audience or "").strip():
        decode_kwargs["audience"] = s.clerk_audience.strip()
    try:
        claims = jwt.decode(token, key, **decode_kwargs)
    except ExpiredSignatureError as exc:
        raise ClerkVerificationError("Token Clerk scaduto") from exc
    except JWTError as exc:
        raise ClerkVerificationError("Token Clerk non valido") from exc

    user_id = claims.get("sub")
    if not isinstance(user_id, str) or not user_id.strip():
        raise ClerkVerificationError("Token Clerk senza subject")

    email = _extract_email_from_claims(claims)
    role_hint = _resolve_role_hint(claims)
    first_name = claims.get("first_name") if isinstance(claims.get("first_name"), str) else None
    last_name = claims.get("last_name") if isinstance(claims.get("last_name"), str) else None
    return ClerkIdentity(
        user_id=user_id,
        email=email,
        first_name=first_name,
        last_name=last_name,
        role_hint=role_hint,
        claims=claims,
    )
