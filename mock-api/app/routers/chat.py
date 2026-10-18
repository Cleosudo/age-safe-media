"""Conversational recommendation endpoint (F1, F3, F7)."""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query

from .. import db
from ..deps import CurrentParent
from ..schemas import ChatRequest
from ..services import recommender

router = APIRouter(prefix="/chat", tags=["chat"])


def _effective_preferences(child: dict, override: dict | None) -> dict:
    prefs = {
        "max_recommendations": 5,
        "display_mode": "summary",
        "sort": "relevance",
        "show_explanations": True,
        **child.get("preferences", {}),
    }
    for key, value in (override or {}).items():
        if value is not None:
            prefs[key] = value
    prefs["max_recommendations"] = max(1, min(int(prefs["max_recommendations"]), 10))
    prefs["display_mode"] = prefs["display_mode"] if prefs["display_mode"] in {"summary", "title"} else "summary"
    prefs["sort"] = prefs["sort"] if prefs["sort"] in {"relevance", "newest", "oldest"} else "relevance"
    return prefs


@router.post("")
def chat(body: ChatRequest, parent: CurrentParent) -> dict:
    started = time.perf_counter()
    child = db.get_child(parent["id"], body.child_id)
    if not child:
        raise HTTPException(status_code=404, detail="Child profile not found")

    prefs = _effective_preferences(child, body.preferences.model_dump() if body.preferences else None)
    conversation_id = db.get_or_create_conversation(parent["id"], child["id"], body.conversation_id)
    db.add_message(conversation_id, "user", body.message)

    if recommender.is_unsafe(body.message):
        reply = recommender.SAFE_REDIRECT
        db.add_message(conversation_id, "assistant", reply, {"blocked": True})
        db.record_event(parent["id"], child["id"], "safety_block", body.message[:60])
        return {
            "conversation_id": conversation_id,
            "reply": reply,
            "recommendations": [],
            "topics": [],
            "confidence": "none",
            "age_window": [child["age"], child["age"]],
            "safety": {"blocked": True, "reason": "Unsafe topic detected and blocked by the server"},
            "preferences_applied": prefs,
            "favourite_ids": sorted(db.favourite_ids(parent["id"], child["id"])),
            "feedback": db.feedback_map(parent["id"], child["id"]),
            "suggested_replies": recommender.SUGGESTED_REPLIES,
            "timing_ms": round((time.perf_counter() - started) * 1000, 1),
        }

    result = recommender.recommend(
        body.message,
        child=child,
        blocked_categories=child.get("blocked_categories", []),
        age_band_depth=child.get("age_band_depth", 2),
        limit=prefs["max_recommendations"],
        sort=prefs["sort"],
    )
    reply = recommender.build_reply(child["name"], result, display_mode=prefs["display_mode"])

    topic = (result["topics"][0] if result["topics"] else body.message[:40]).strip()
    db.record_event(parent["id"], child["id"], "search", topic)
    for item in result["recommendations"]:
        db.record_event(parent["id"], child["id"], "recommendation", topic, item["id"])

    favourite_ids = db.favourite_ids(parent["id"], child["id"])
    recommendations = []
    for item in result["recommendations"]:
        recommendations.append(
            {
                **item,
                "is_favourite": item["id"] in favourite_ids,
                "explanation": item["explanation"] if prefs["show_explanations"] else "",
                "summary": item["summary"] if prefs["display_mode"] == "summary" else "",
            }
        )

    db.add_message(
        conversation_id,
        "assistant",
        reply,
        {
            "recommendation_ids": [item["id"] for item in recommendations],
            "recommendations": [
                {
                    "id": item["id"],
                    "explanation": item["explanation"],
                    "matched_tags": item["matched_tags"],
                    "match_type": item["match_type"],
                }
                for item in recommendations
            ],
            "topics": result["topics"],
        },
    )

    return {
        "conversation_id": conversation_id,
        "reply": reply,
        "recommendations": recommendations,
        "topics": result["topics"],
        "confidence": result["confidence"],
        "age_window": list(result["age_window"]),
        "safety": {"blocked": False, "reason": None},
        "preferences_applied": prefs,
        "favourite_ids": sorted(favourite_ids),
        "feedback": db.feedback_map(parent["id"], child["id"]),
        "suggested_replies": recommender.SUGGESTED_REPLIES,
        "timing_ms": round((time.perf_counter() - started) * 1000, 1),
    }


@router.get("/history")
def history(parent: CurrentParent, child_id: str = Query(...), conversation_id: str | None = None) -> dict:
    child = db.get_child(parent["id"], child_id)
    if not child:
        raise HTTPException(status_code=404, detail="Child profile not found")
    conv_id = conversation_id or db.latest_conversation(parent["id"], child_id)
    messages = db.list_messages(conv_id) if conv_id else []
    return {"conversation_id": conv_id, "messages": messages}


@router.get("/suggestions")
def suggestions(parent: CurrentParent, child_id: str | None = None) -> dict:
    topics: list[str] = []
    if child_id and db.get_child(parent["id"], child_id):
        since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        seen: list[str] = []
        for event in db.events_since(child_id, since):
            if event["kind"] == "search" and event["topic"] and event["topic"] not in seen:
                seen.append(event["topic"])
        topics = [f"More about {topic}" for topic in seen[-3:]][::-1]
    return {"suggested_replies": recommender.SUGGESTED_REPLIES, "topics": topics}
