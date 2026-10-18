"""Activity reporting used by the parent dashboard (F5)."""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone

from ..db import events_since

RANGES = {
    "daily": {"days": 7, "bucket": "day", "title": "Last 7 days"},
    "weekly": {"days": 56, "bucket": "week", "title": "Last 8 weeks"},
    "monthly": {"days": 186, "bucket": "month", "title": "Last 6 months"},
}


def _bucket_key(moment: datetime, bucket: str) -> tuple[str, str]:
    if bucket == "day":
        return moment.strftime("%Y-%m-%d"), moment.strftime("%a %d %b")
    if bucket == "week":
        monday = moment - timedelta(days=moment.weekday())
        return monday.strftime("%Y-%m-%d"), f"wk {monday.strftime('%d %b')}"
    return moment.strftime("%Y-%m"), moment.strftime("%b %Y")


def _empty_buckets(bucket: str, days: int) -> list[dict]:
    now = datetime.now(timezone.utc)
    keys: list[tuple[str, str]] = []
    if bucket == "day":
        for offset in range(days - 1, -1, -1):
            keys.append(_bucket_key(now - timedelta(days=offset), bucket))
    elif bucket == "week":
        for offset in range(days // 7 - 1, -1, -1):
            keys.append(_bucket_key(now - timedelta(weeks=offset), bucket))
    else:
        for offset in range(5, -1, -1):
            keys.append(_bucket_key(now - timedelta(days=offset * 30), bucket))
    return [
        {"key": key, "label": label, "searches": 0, "recommendations": 0, "favourites": 0}
        for key, label in keys
    ]


def build_report(child_id: str, range_key: str = "weekly") -> dict:
    config = RANGES.get(range_key, RANGES["weekly"])
    since = (datetime.now(timezone.utc) - timedelta(days=config["days"])).isoformat()
    events = events_since(child_id, since)

    buckets = _empty_buckets(config["bucket"], config["days"])
    index = {bucket["key"]: bucket for bucket in buckets}

    totals = Counter()
    searched_topics: Counter[str] = Counter()
    recommended_topics: Counter[str] = Counter()
    active_days: set[str] = set()

    for event in events:
        kind = event["kind"]
        if kind == "search":
            totals["searches"] += 1
            if event["topic"]:
                searched_topics[event["topic"]] += 1
        elif kind == "recommendation":
            totals["recommendations"] += 1
            if event["topic"]:
                recommended_topics[event["topic"]] += 1
        elif kind == "favourite":
            totals["favourites"] += 1
        elif kind == "feedback_up":
            totals["positive_feedback"] += 1
        elif kind == "feedback_down":
            totals["negative_feedback"] += 1

        moment = datetime.fromisoformat(event["created_at"])
        key, _ = _bucket_key(moment, config["bucket"])
        bucket = index.get(key)
        if bucket is not None:
            if kind == "search":
                bucket["searches"] += 1
            elif kind == "recommendation":
                bucket["recommendations"] += 1
            elif kind == "favourite":
                bucket["favourites"] += 1
        active_days.add(moment.strftime("%Y-%m-%d"))

    totals["active_days"] = len(active_days)

    topics = [
        {"topic": topic, "count": count, "kind": "searched"}
        for topic, count in searched_topics.most_common(8)
    ]
    topics += [
        {"topic": topic, "count": count, "kind": "recommended"}
        for topic, count in recommended_topics.most_common(8)
        if topic not in searched_topics
    ]

    peak = max([bucket["searches"] for bucket in buckets] + [1])
    return {
        "child_id": child_id,
        "range": range_key if range_key in RANGES else "weekly",
        "range_title": config["title"],
        "totals": {
            "searches": totals["searches"],
            "recommendations": totals["recommendations"],
            "favourites": totals["favourites"],
            "positive_feedback": totals["positive_feedback"],
            "negative_feedback": totals["negative_feedback"],
            "active_days": totals["active_days"],
        },
        "series": [
            {**bucket, "searches_pct": round(bucket["searches"] / peak * 100), }
            for bucket in buckets
        ],
        "topics": topics[:10],
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
