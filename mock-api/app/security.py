"""Authentication helpers.

Two independent mechanisms are used:

* **Mobile / API clients** – Firebase ID tokens sent as ``Authorization: Bearer``.
  When Firebase credentials are not configured the server accepts development
  tokens of the form ``dev:<email>`` (only when ``DEV_AUTH=true``).  This keeps
  the whole stack testable offline; it is never enabled in production.
* **Admin web portal** – a signed, HttpOnly session cookie created after the
  administrator signs in on ``/admin/login``.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import time
from dataclasses import dataclass

from .config import settings

logger = logging.getLogger(__name__)


class AuthError(Exception):
    """Raised when a credential cannot be validated."""


@dataclass(frozen=True)
class Identity:
    uid: str
    email: str
    name: str = ""
    is_dev: bool = False

    @property
    def is_admin(self) -> bool:
        return self.email.lower() == settings.admin_email.lower()


# --------------------------------------------------------------------------- #
# Firebase
# --------------------------------------------------------------------------- #
_firebase_app = None


def _firebase_verify(token: str) -> dict:
    global _firebase_app
    try:
        from firebase_admin import auth as fb_auth  # imported lazily
        from firebase_admin import credentials, initialize_app
    except ImportError as exc:  # pragma: no cover - only without firebase-admin
        raise AuthError(
            "Server is configured for Firebase but firebase-admin is not installed "
            "(pip install firebase-admin), or DEV_AUTH must be enabled."
        ) from exc

    if _firebase_app is None:
        cred = credentials.Certificate(settings.firebase_credentials)
        _firebase_app = initialize_app(cred)
    return fb_auth.verify_id_token(token, app=_firebase_app)


def verify_id_token(token: str) -> Identity:
    """Validate a bearer token and return the caller identity."""
    token = token.strip()
    if not token:
        raise AuthError("Missing token")

    if token.startswith("dev:"):
        if not settings.dev_auth:
            raise AuthError("Development tokens are disabled")
        email = token[4:].strip().lower()
        if "@" not in email:
            raise AuthError("Malformed development token")
        return Identity(uid=f"dev-{email}", email=email, name=email.split("@")[0], is_dev=True)

    if not settings.firebase_ready:
        raise AuthError(
            "Server is not configured for Firebase tokens. "
            "Set GOOGLE_APPLICATION_CREDENTIALS or use DEV_AUTH."
        )
    try:
        decoded = _firebase_verify(token)
    except AuthError:
        raise
    except Exception as exc:  # noqa: BLE001 - surfaced as 401
        logger.info("Firebase token rejected: %s", exc)
        raise AuthError("Invalid or expired token") from exc

    return Identity(
        uid=decoded.get("uid") or decoded.get("sub", ""),
        email=(decoded.get("email") or "").lower(),
        name=decoded.get("name") or "",
    )


# --------------------------------------------------------------------------- #
# Admin session cookie
# --------------------------------------------------------------------------- #
def _sign(value: str) -> str:
    digest = hmac.new(settings.session_secret.encode(), value.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


def create_session_token(email: str, ttl: int | None = None) -> str:
    ttl = ttl or settings.session_max_age
    payload = f"{email.lower()}|{int(time.time()) + ttl}"
    encoded = base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")
    return f"{encoded}.{_sign(encoded)}"


def read_session_token(token: str) -> str | None:
    """Return the admin e-mail for a valid, unexpired session token."""
    try:
        encoded, signature = token.split(".", 1)
    except ValueError:
        return None
    if not hmac.compare_digest(signature, _sign(encoded)):
        return None
    try:
        padded = encoded + "=" * (-len(encoded) % 4)
        payload = base64.urlsafe_b64decode(padded).decode()
        email, expires = payload.rsplit("|", 1)
    except Exception:  # noqa: BLE001
        return None
    if int(expires) < time.time():
        return None
    return email.lower()


def check_admin_credentials(email: str, password: str) -> bool:
    email = (email or "").strip().lower()
    password = password or ""
    return hmac.compare_digest(email, settings.admin_email.lower()) and hmac.compare_digest(
        password, settings.admin_password
    )
