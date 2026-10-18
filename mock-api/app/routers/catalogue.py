"""Read-only catalogue endpoints used by the mobile app (F3, F10)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from .. import db
from ..deps import CurrentParent

router = APIRouter(prefix="/catalogue", tags=["catalogue"])


@router.get("")
def list_catalogue(
    parent: CurrentParent,
    q: str = "",
    type: str = "",
    category: str = "",
    ids: str = "",
    limit: int = Query(24, ge=1, le=100),
) -> dict:
    if ids:
        wanted = [item.strip() for item in ids.split(",") if item.strip()]
        items = db.items_by_ids(wanted)
        ordered = [items[item_id] for item_id in wanted if item_id in items]
        return {"items": ordered, "count": len(ordered)}
    rows = db.list_catalogue(search=q, type_filter=type, category=category, limit=limit)
    return {"items": rows, "count": len(rows)}


@router.get("/{item_id}")
def get_item(item_id: str, parent: CurrentParent) -> dict:
    item = db.get_catalogue_item(item_id)
    if not item or not item.get("active"):
        raise HTTPException(status_code=404, detail="Catalogue item not found")
    return item
