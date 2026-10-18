"""Child profile endpoints (F2, F12, F13)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from .. import db
from ..deps import CurrentParent
from ..schemas import ChildCreate, ChildUpdate, RestrictionsUpdate
from ..seed import AGE_BANDS, SENSITIVITY_CATEGORIES
from ..services.recommender import band_for_age

router = APIRouter(prefix="/children", tags=["children"])

CATEGORY_META = {
    "violence": {"label": "Violence", "emoji": "⚔️", "description": "Fighting, weapons, injuries"},
    "scary": {"label": "Scary scenes", "emoji": "👻", "description": "Monsters, jump scares, dark imagery"},
    "romance": {"label": "Romance", "emoji": "💗", "description": "Dating and romantic themes"},
    "strong language": {"label": "Strong language", "emoji": "💬", "description": "Rude or coarse words"},
    "substances": {"label": "Substances", "emoji": "🚭", "description": "Alcohol, smoking, drugs"},
    "death and grief": {"label": "Death & grief", "emoji": "🕊️", "description": "Loss of a character or loved one"},
    "bullying": {"label": "Bullying", "emoji": "😔", "description": "Teasing, exclusion, intimidation"},
}


@router.get("/meta")
def meta(parent: CurrentParent) -> dict:
    return {
        "age_bands": [
            {"id": band, "label": f"Ages {low}–{high}", "min": low, "max": high}
            for band, (low, high) in AGE_BANDS.items()
        ],
        "sensitivity_categories": [
            {"id": category, **CATEGORY_META.get(category, {"label": category.title(), "emoji": "•", "description": ""})}
            for category in SENSITIVITY_CATEGORIES
        ],
        "avatars": ["🦄", "🚀", "🐼", "🦊", "🐨", "🐳", "🦕", "🌈", "⚽", "🎨", "🐣", "🧸"],
        "depth_options": [
            {"value": 1, "label": "Strict", "description": "Only items inside the child's age band"},
            {"value": 2, "label": "Balanced", "description": "Age band plus two neighbouring years"},
            {"value": 3, "label": "Explorer", "description": "A wider age window for confident readers"},
        ],
    }


@router.get("")
def list_children(parent: CurrentParent) -> dict:
    children = db.list_children(parent["id"])
    return {"children": children, "count": len(children)}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_child(body: ChildCreate, parent: CurrentParent) -> dict:
    data = body.model_dump(exclude_none=True)
    data["age_band"] = band_for_age(body.age)
    if body.preferences is not None:
        data["preferences"] = body.preferences.model_dump()
    else:
        data.pop("preferences", None)
    return db.create_child(parent["id"], data)


@router.get("/{child_id}")
def get_child(child_id: str, parent: CurrentParent) -> dict:
    child = db.get_child(parent["id"], child_id)
    if not child:
        raise HTTPException(status_code=404, detail="Child profile not found")
    return child


@router.patch("/{child_id}")
def update_child(child_id: str, body: ChildUpdate, parent: CurrentParent) -> dict:
    data = body.model_dump(exclude_none=True)
    if body.age is not None:
        data["age_band"] = band_for_age(body.age)
    if body.preferences is not None:
        data["preferences"] = body.preferences.model_dump()
    child = db.update_child(parent["id"], child_id, data)
    if not child:
        raise HTTPException(status_code=404, detail="Child profile not found")
    return child


@router.put("/{child_id}/restrictions")
def update_restrictions(child_id: str, body: RestrictionsUpdate, parent: CurrentParent) -> dict:
    child = db.update_child(
        parent["id"],
        child_id,
        {"blocked_categories": body.blocked_categories, "age_band_depth": body.age_band_depth},
    )
    if not child:
        raise HTTPException(status_code=404, detail="Child profile not found")
    return child


@router.delete("/{child_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_child(child_id: str, parent: CurrentParent) -> None:
    if not db.delete_child(parent["id"], child_id):
        raise HTTPException(status_code=404, detail="Child profile not found")
