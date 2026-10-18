"""Parent account endpoints (F2)."""

from __future__ import annotations

from fastapi import APIRouter

from .. import db
from ..config import settings
from ..deps import CurrentParent
from ..schemas import ParentUpdate
from ..seed import SENSITIVITY_CATEGORIES
from ..services import recommender

router = APIRouter(prefix="/account", tags=["account"])


def _payload(parent: dict) -> dict:
    children = db.list_children(parent["id"])
    return {
        "parent": parent,
        "children": children,
        "children_count": len(children),
        "meta": {
            "app_name": settings.app_name,
            "dev_auth": settings.dev_auth,
            "firebase_configured": settings.firebase_ready,
            "active_model": db.active_model_version(),
            "sensitivity_categories": SENSITIVITY_CATEGORIES,
            "max_recommendations": settings.max_recommendations,
            "default_recommendations": settings.default_recommendations,
            "suggested_replies": recommender.SUGGESTED_REPLIES,
        },
    }


@router.post("/register")
def register(parent: CurrentParent) -> dict:
    """Called right after Firebase creates the account.

    The parent row is created (or refreshed) from the verified token, so the
    mobile app never has to send an e-mail or password to this API.
    """
    return _payload(parent)


@router.get("/me")
def me(parent: CurrentParent) -> dict:
    return _payload(parent)


@router.patch("/me")
def update_me(body: ParentUpdate, parent: CurrentParent) -> dict:
    display_name = body.display_name.strip()
    if display_name:
        with db.get_conn() as conn:
            conn.execute("UPDATE parents SET display_name = ? WHERE id = ?", (display_name, parent["id"]))
    refreshed = db.get_parent(parent["id"]) or parent
    return _payload(refreshed)
