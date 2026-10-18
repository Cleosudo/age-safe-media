"""Favourites and recommendation feedback (F8)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status

from .. import db
from ..deps import CurrentParent
from ..schemas import FavouriteRequest, FeedbackRequest

router = APIRouter(tags=["favourites"])


@router.get("/favourites")
def list_favourites(parent: CurrentParent, child_id: str | None = Query(None)) -> dict:
    if child_id and not db.get_child(parent["id"], child_id):
        raise HTTPException(status_code=404, detail="Child profile not found")
    favourites = db.list_favourites(parent["id"], child_id)
    return {"favourites": favourites, "count": len(favourites)}


@router.post("/favourites", status_code=status.HTTP_201_CREATED)
def add_favourite(body: FavouriteRequest, parent: CurrentParent) -> dict:
    if not db.get_child(parent["id"], body.child_id):
        raise HTTPException(status_code=404, detail="Child profile not found")
    if not db.get_catalogue_item(body.item_id):
        raise HTTPException(status_code=404, detail="Catalogue item not found")
    favourite = db.add_favourite(parent["id"], body.child_id, body.item_id)
    return {"favourite": favourite, "favourite_ids": sorted(db.favourite_ids(parent["id"], body.child_id))}


@router.delete("/favourites/{item_id}")
def remove_favourite(item_id: str, parent: CurrentParent, child_id: str = Query(...)) -> dict:
    if not db.get_child(parent["id"], child_id):
        raise HTTPException(status_code=404, detail="Child profile not found")
    removed = db.remove_favourite(parent["id"], child_id, item_id)
    return {"removed": removed, "favourite_ids": sorted(db.favourite_ids(parent["id"], child_id))}


@router.post("/feedback", status_code=status.HTTP_201_CREATED)
def send_feedback(body: FeedbackRequest, parent: CurrentParent) -> dict:
    if not db.get_child(parent["id"], body.child_id):
        raise HTTPException(status_code=404, detail="Child profile not found")
    if not db.get_catalogue_item(body.item_id):
        raise HTTPException(status_code=404, detail="Catalogue item not found")
    entry = db.add_feedback(parent["id"], body.child_id, body.item_id, body.rating, body.reason)
    return {"feedback": entry, "feedback_map": db.feedback_map(parent["id"], body.child_id)}
