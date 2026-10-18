"""Shared FastAPI dependencies (authentication + templates)."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.templating import Jinja2Templates

from . import db
from pathlib import Path

from .config import settings
from .security import AuthError, Identity, read_session_token, verify_id_token

_PORTAL = Path(settings.admin_portal_dir)
templates = Jinja2Templates(directory=str(_PORTAL / "templates"))

bearer = HTTPBearer(auto_error=False)


def get_identity(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> Identity:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        return verify_id_token(credentials.credentials)
    except AuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


def get_parent(identity: Annotated[Identity, Depends(get_identity)]) -> dict:
    """Return the parent row, creating it on first authenticated request."""
    return db.upsert_parent(identity.uid, identity.email, identity.name)


CurrentParent = Annotated[dict, Depends(get_parent)]
CurrentIdentity = Annotated[Identity, Depends(get_identity)]


# --------------------------------------------------------------------------- #
# Admin (web portal)
# --------------------------------------------------------------------------- #
def _admin_from_cookie(request: Request) -> str | None:
    token = request.cookies.get(settings.session_cookie)
    if not token:
        return None
    return read_session_token(token)


def require_admin_page(request: Request) -> str:
    email = _admin_from_cookie(request)
    if email:
        return email
    raise HTTPException(
        status_code=status.HTTP_303_SEE_OTHER,
        detail="Login required",
        headers={"Location": f"/admin/login?next={request.url.path}"},
    )


def require_admin_api(request: Request) -> str:
    email = _admin_from_cookie(request)
    if email:
        return email
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        try:
            identity = verify_id_token(auth.split(" ", 1)[1])
            if identity.is_admin:
                return identity.email
        except AuthError:
            pass
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Administrator login required")


AdminEmail = Annotated[str, Depends(require_admin_page)]
AdminApiEmail = Annotated[str, Depends(require_admin_api)]


def render(request: Request, template: str, context: dict | None = None):
    data = {"request": request, "settings": settings, "admin_email": _admin_from_cookie(request)}
    data.update(context or {})
    return templates.TemplateResponse(request, template, data)
