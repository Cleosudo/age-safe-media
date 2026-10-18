"""Deterministic reference recommender.

IMPORTANT: this module is *not* the FYP's machine-learning pipeline.  It is a
transparent keyword/tag matcher that exists so the frontend can be developed
and tested against a real API with real data.  The production system swaps this
out for ``rec-v1.x`` served by the model service; the request/response contract
in ``docs/API.md`` stays identical.

Safety filtering, however, is deliberately implemented server-side (and must
stay there): the client only *displays* what the API returns.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from ..db import all_catalogue
from ..seed import AGE_BANDS

# --------------------------------------------------------------------------- #
# Safety guard (defence in depth – the client never filters on its own)
# --------------------------------------------------------------------------- #
UNSAFE_PATTERNS = [
    r"\bkill\b", r"\bgun\b", r"\bshoot\b", r"\bblood\b", r"\bknife\b", r"\bweapon\b",
    r"\bsuicide\b", r"\bdrugs?\b", r"\bsex\b", r"\bporn\b", r"\bdie\b", r"\bdead\b",
    r"\bhorror\b", r"\bnightmare\b", r"自杀", r"色情", r"枪", r"暴力", r"血腥", r"毒品",
]
SAFE_REDIRECT = (
    "That is not something I can help with, but I would love to find you something fun! "
    "Try asking about dinosaurs, space, the ocean or how plants grow."
)

# --------------------------------------------------------------------------- #
# Topic understanding
# --------------------------------------------------------------------------- #
_CJK = re.compile(r"[\u4e00-\u9fff]")

SYNONYMS: dict[str, str] = {
    # zh -> en
    "恐龙": "dinosaur", "霸王龙": "t-rex", "太空": "space", "星球": "planet", "宇宙": "space",
    "海洋": "ocean", "海": "ocean", "珊瑚": "coral", "鲸鱼": "whale", "鲨鱼": "shark",
    "植物": "plant", "花": "plant", "树": "plant", "叶子": "leaf",
    "画画": "drawing", "美术": "art", "颜色": "colour", "音乐": "music",
    "机器人": "robot", "编程": "coding", "数学": "maths", "数字": "number",
    "动物": "animal", "猫": "cat", "狗": "dog", "虫子": "caterpillar",
    "友谊": "friendship", "朋友": "friendship", "情绪": "feelings", "生气": "feelings",
    "科学": "science", "实验": "experiment", "天气": "weather", "季节": "season",
    "健康": "health", "运动": "exercise", "瑜伽": "yoga",
    # spelling / synonyms
    "dino": "dinosaur", "dinosaurs": "dinosaur", "planets": "planet", "astronomy": "space",
    "rockets": "rocket", "seas": "ocean", "sea": "ocean", "underwater": "ocean",
    "animals": "animal", "bugs": "insect", "draw": "drawing", "paint": "art",
    "coding": "code", "programming": "code", "math": "maths", "numbers": "number",
    "emotions": "feelings", "feeling": "feelings", "friends": "friendship",
}

STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "for", "with", "about", "some", "any", "please",
    "i", "im", "i'm", "me", "my", "we", "you", "want", "wanna", "would", "like", "love",
    "can", "could", "you", "show", "find", "give", "tell", "more", "something", "anything",
    "that", "this", "these", "those", "is", "are", "was", "be", "to", "of", "in", "on",
    "it", "its", "do", "does", "have", "has", "get", "got", "look", "looking", "book",
    "books", "video", "videos", "recommend", "recommendations", "suggest", "suggestions",
    "best", "good", "nice", "fun", "cool", "kids", "children", "child", "please", "now",
    "hey", "hi", "hello", "thanks", "thank", "ok", "okay", "what", "whats", "what's",
    "are", "there", "here", "any", "new", "old", "top", "list", "read", "watch",
    # adjectives / filler that used to leak into explanations and topic chips
    "big", "small", "little", "huge", "tiny", "super", "very", "really", "awesome",
    "amazing", "interesting", "favourite", "favorite", "story", "stories", "learn",
    "learning", "know", "again", "another", "different", "similar", "much", "many",
    "kinda", "sort", "type", "kind", "thing", "things", "one", "ones", "all", "also",
    "make", "made", "help", "need", "try", "going", "go", "see", "saw", "us", "our",
}


def _tokenise(text: str) -> list[str]:
    lowered = text.lower()
    tokens = re.findall(r"[a-z0-9']+", lowered)
    tokens = [t for t in tokens if t not in STOPWORDS and len(t) > 1]
    # Chinese keywords are matched as substrings (no word boundaries in CJK).
    for zh, en in SYNONYMS.items():
        if _CJK.search(zh) and zh in text:
            tokens.append(en)
    return list(dict.fromkeys(tokens))


def _normalise(token: str) -> str:
    return SYNONYMS.get(token, token)


def band_for_age(age: int) -> str:
    for band, (low, high) in AGE_BANDS.items():
        if low <= age <= high:
            return band
    return "3-5" if age < 3 else "12-14"


def band_window(age: int, depth: int) -> tuple[int, int]:
    """Expand the child's age band by ``depth`` to get an allowed age window."""
    low_band, high_band = AGE_BANDS[band_for_age(age)]
    slack = max(0, depth - 1) * 2
    return max(0, low_band - slack), high_band + slack


@dataclass
class Recommendation:
    item: dict
    score: float
    matched_tags: list[str]
    explanation: str

    def to_dict(self) -> dict:
        return {
            **self.item,
            "score": round(self.score, 3),
            "matched_tags": self.matched_tags,
            "match_type": "topic" if self.matched_tags else "discovery",
            "explanation": self.explanation,
        }


def is_unsafe(message: str) -> bool:
    lowered = message.lower()
    return any(re.search(pattern, lowered) for pattern in UNSAFE_PATTERNS)


def _sensitivity_blocked(item: dict, blocked: list[str]) -> bool:
    blocked_lower = {b.lower() for b in blocked}
    return bool(blocked_lower.intersection({s.lower() for s in item.get("sensitivity", [])}))


def recommend(
    message: str,
    *,
    child: dict,
    blocked_categories: list[str] | None = None,
    age_band_depth: int = 2,
    limit: int = 5,
    sort: str = "relevance",
    exclude_ids: set[str] | None = None,
) -> dict:
    """Return recommendations plus the explanation shown to the child/parent."""
    blocked = list(blocked_categories if blocked_categories is not None else child.get("blocked_categories", []))
    age = int(child.get("age", 7))
    depth = max(1, min(3, int(age_band_depth)))
    low, high = band_window(age, depth)
    exclude_ids = exclude_ids or set()

    tokens = _tokenise(message)
    normalised = [_normalise(t) for t in tokens]

    scored: list[Recommendation] = []
    for item in all_catalogue():
        if item["id"] in exclude_ids:
            continue
        if _sensitivity_blocked(item, blocked):
            continue
        # age fit window (the depth setting controls how far we may reach)
        if item["age_max"] < low or item["age_min"] > high:
            continue

        haystack = " ".join(
            [item["title"], item["category"], item["summary"], " ".join(item["tags"])]
        ).lower()
        item_tokens = set(re.findall(r"[a-z0-9']+", haystack)) | {t.lower() for t in item["tags"]}

        matched: list[str] = []
        score = 0.0
        for raw, norm in zip(tokens, normalised):
            if norm in item_tokens or raw in haystack:
                matched.append(norm)
                score += 3.0
            elif any(norm in cand for cand in item_tokens if len(cand) > 3):
                matched.append(norm)
                score += 1.5

        # age proximity: prefer items centred on the child's age
        centre = (item["age_min"] + item["age_max"]) / 2
        score += max(0.0, 2.0 - abs(centre - age) * 0.4)
        score += item["popularity"] / 100.0

        if sort == "newest":
            score += (item["year"] - 1990) / 40.0
        elif sort == "oldest":
            score += (2025 - item["year"]) / 60.0

        if not matched and score < 2.5:
            continue

        matched = list(dict.fromkeys(matched))[:4]
        scored.append(Recommendation(item, score, matched, ""))

    if sort == "newest":
        scored.sort(key=lambda r: (r.item["year"], r.score), reverse=True)
    elif sort == "oldest":
        scored.sort(key=lambda r: (r.item["year"], -r.score))
    else:
        scored.sort(key=lambda r: r.score, reverse=True)

    top = scored[: max(1, min(limit, 10))]
    for rec in top:
        rec.explanation = _explain(rec, child)

    # Topic chips should describe what was actually matched, not raw tokens.
    matched_union: list[str] = []
    for rec in top:
        for tag in rec.matched_tags:
            if tag not in matched_union:
                matched_union.append(tag)
    topics = [tag for tag in normalised if tag in matched_union]
    if not topics:
        topics = matched_union or [token for token in normalised if len(token) > 2][:1]
    confidence = "high" if top and top[0].score >= 6 else "medium" if top else "low"

    return {
        "recommendations": [rec.to_dict() for rec in top],
        "topics": topics[:3],
        "confidence": confidence,
        "age_window": [low, high],
    }


def _explain(rec: Recommendation, child: dict) -> str:
    item = rec.item
    bits: list[str] = []
    if rec.matched_tags:
        bits.append("matches " + ", ".join(rec.matched_tags))
    else:
        bits.append("a different topic children this age enjoy")
    bits.append(f"fits {child.get('name', 'your child')}'s age group ({item['age_range']})")
    if item["popularity"] >= 88:
        bits.append("popular this age")
    if item.get("type") == "book":
        bits.append("borrow via NLB")
    else:
        bits.append("short video")
    return " · ".join(bits)


def build_reply(child_name: str, result: dict, *, display_mode: str = "summary") -> str:
    recs = result["recommendations"]
    if not recs:
        return (
            f"I could not find a good match for that yet, {child_name}. "
            "Try naming a topic like dinosaurs, space, the ocean, plants or drawing!"
        )
    topics = result.get("topics") or []
    topic_matches = [item for item in recs if item.get("matched_tags")]
    count = len(recs)

    if topic_matches:
        topic_text = f" about {', '.join(topics[:3])}" if topics else ""
        lead = f"Here {'is' if count == 1 else 'are'} {count} pick{'s' if count != 1 else ''}{topic_text} for {child_name}."
    else:
        lead = (
            f"I could not find an exact match for that, {child_name}, "
            f"but here {'is' if count == 1 else 'are'} {count} age-appropriate pick{'s' if count != 1 else ''} you might like."
        )

    if display_mode == "title":
        listing = " · ".join(item["title"] for item in recs)
        return f"{lead} {listing}."

    first = topic_matches[0] if topic_matches else recs[0]
    body = f" Start with “{first['title']}” ({first['category']}, ages {first['age_range']})."
    second = next((item for item in topic_matches if item["id"] != first["id"]), None)
    if second:
        body += f" Also try “{second['title']}”."
    return lead + body


SUGGESTED_REPLIES = [
    "Show me dinosaur books",
    "Something about space",
    "Ocean animals please",
    "How do plants grow?",
    "Easy drawing for kids",
]
