"""Reporting endpoints for the parent dashboard (F5)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from .. import db
from ..deps import CurrentParent
from ..services.reports import RANGES, build_report

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/activity")
def activity(
    parent: CurrentParent,
    child_id: str = Query(...),
    range: str = Query("weekly", pattern="^(daily|weekly|monthly)$"),
) -> dict:
    child = db.get_child(parent["id"], child_id)
    if not child:
        raise HTTPException(status_code=404, detail="Child profile not found")
    report = build_report(child_id, range)
    return {"child": child, **report, "ranges": list(RANGES.keys())}
