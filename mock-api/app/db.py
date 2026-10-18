"""SQLite persistence layer.

The FYP backend uses SQLite locally and can be pointed at Firestore for
production (see ``docs/API.md``).  All access goes through the helpers in this
module so swapping the storage engine only touches one file.
"""

from __future__ import annotations

import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterable, Iterator

from .config import settings
from .seed import CATALOGUE, DEMO_MODELS, DEMO_PARENTS, build_demo_events

SCHEMA = """
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS parents (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'parent',
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS children (
    id TEXT PRIMARY KEY,
    parent_id TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    age INTEGER NOT NULL,
    avatar TEXT NOT NULL DEFAULT '🐣',
    age_band TEXT NOT NULL,
    blocked_categories TEXT NOT NULL DEFAULT '[]',
    age_band_depth INTEGER NOT NULL DEFAULT 2,
    preferences TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_children_parent ON children(parent_id);

CREATE TABLE IF NOT EXISTS catalogue (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    category TEXT NOT NULL,
    age_min INTEGER NOT NULL,
    age_max INTEGER NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    year INTEGER NOT NULL,
    publisher TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL DEFAULT 'English',
    sensitivity TEXT NOT NULL DEFAULT '[]',
    popularity INTEGER NOT NULL DEFAULT 50,
    cover_emoji TEXT NOT NULL DEFAULT '📘',
    external_links TEXT NOT NULL DEFAULT '{}',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_catalogue_active ON catalogue(active);

CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    parent_id TEXT NOT NULL,
    child_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversations_child ON conversations(child_id);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    meta TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

CREATE TABLE IF NOT EXISTS favourites (
    id TEXT PRIMARY KEY,
    parent_id TEXT NOT NULL,
    child_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (child_id, item_id)
);

CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    parent_id TEXT NOT NULL,
    child_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    rating TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feedback_child ON feedback(child_id);

CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    parent_id TEXT,
    child_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    topic TEXT NOT NULL DEFAULT '',
    item_id TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_child_time ON events(child_id, created_at);

CREATE TABLE IF NOT EXISTS model_versions (
    version TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    metrics TEXT NOT NULL DEFAULT '{}',
    trained_at TEXT,
    activated_at TEXT,
    notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS retrain_jobs (
    id TEXT PRIMARY KEY,
    requested_by TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    notes TEXT NOT NULL DEFAULT '',
    requested_at TEXT NOT NULL,
    completed_at TEXT
);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


@contextmanager
def get_conn() -> Iterator[sqlite3.Connection]:
    os.makedirs(os.path.dirname(settings.database_path) or ".", exist_ok=True)
    conn = sqlite3.connect(settings.database_path, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _json_load(raw: Any, default: Any) -> Any:
    if raw in (None, ""):
        return default
    if isinstance(raw, (dict, list)):
        return raw
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return default


# --------------------------------------------------------------------------- #
# Serialisation helpers
# --------------------------------------------------------------------------- #
def child_to_dict(row: sqlite3.Row) -> dict:
    prefs = _json_load(row["preferences"], {})
    return {
        "id": row["id"],
        "parent_id": row["parent_id"],
        "name": row["name"],
        "age": row["age"],
        "avatar": row["avatar"],
        "age_band": row["age_band"],
        "blocked_categories": _json_load(row["blocked_categories"], []),
        "age_band_depth": row["age_band_depth"],
        "preferences": {
            "max_recommendations": prefs.get("max_recommendations", settings.default_recommendations),
            "display_mode": prefs.get("display_mode", "summary"),
            "sort": prefs.get("sort", "relevance"),
            "show_explanations": prefs.get("show_explanations", True),
        },
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def item_to_dict(row: sqlite3.Row, *, include_inactive: bool = False) -> dict:
    data = {
        "id": row["id"],
        "title": row["title"],
        "type": row["type"],
        "category": row["category"],
        "age_min": row["age_min"],
        "age_max": row["age_max"],
        "age_range": f"{row['age_min']}–{row['age_max']}",
        "summary": row["summary"],
        "tags": _json_load(row["tags"], []),
        "year": row["year"],
        "publisher": row["publisher"],
        "language": row["language"],
        "sensitivity": _json_load(row["sensitivity"], []),
        "popularity": row["popularity"],
        "cover_emoji": row["cover_emoji"],
        "external_links": _json_load(row["external_links"], {}),
    }
    if include_inactive:
        data["active"] = bool(row["active"])
        data["created_at"] = row["created_at"]
        data["updated_at"] = row["updated_at"]
    return data


def parent_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "email": row["email"],
        "display_name": row["display_name"],
        "role": row["role"],
        "created_at": row["created_at"],
        "last_seen_at": row["last_seen_at"],
    }


# --------------------------------------------------------------------------- #
# Initialisation / seeding
# --------------------------------------------------------------------------- #
def init_db() -> None:
    os.makedirs(os.path.dirname(settings.database_path) or ".", exist_ok=True)
    with get_conn() as conn:
        conn.executescript(SCHEMA)
    _seed_catalogue()
    if settings.seed_demo_data:
        _seed_demo()


def _seed_catalogue() -> None:
    stamp = now_iso()
    with get_conn() as conn:
        existing = {row["id"] for row in conn.execute("SELECT id FROM catalogue")}
        missing = [item for item in CATALOGUE if item["id"] not in existing]
        for item in missing:
            conn.execute(
                """
                INSERT INTO catalogue (id, title, type, category, age_min, age_max, summary,
                    tags, year, publisher, language, sensitivity, popularity, cover_emoji,
                    external_links, active, created_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)
                """,
                (
                    item["id"], item["title"], item["type"], item["category"], item["age_min"],
                    item["age_max"], item["summary"], json.dumps(item["tags"]), item["year"],
                    item["publisher"], item["language"], json.dumps(item["sensitivity"]),
                    item["popularity"], item["cover_emoji"], json.dumps(item["external_links"]),
                    stamp, stamp,
                ),
            )


def _seed_demo() -> None:
    stamp = now_iso()
    with get_conn() as conn:
        if conn.execute("SELECT COUNT(*) AS c FROM model_versions").fetchone()["c"] == 0:
            for model in DEMO_MODELS:
                conn.execute(
                    "INSERT INTO model_versions (version, status, metrics, trained_at, activated_at, notes)"
                    " VALUES (?,?,?,?,?,?)",
                    (
                        model["version"], model["status"], json.dumps(model["metrics"]),
                        model["trained_at"], model["activated_at"], model["notes"],
                    ),
                )

        has_parents = conn.execute("SELECT COUNT(*) AS c FROM parents").fetchone()["c"] > 0
        if has_parents:
            return

        parent_ids: dict[str, str] = {}
        child_parent: dict[str, str] = {}
        for parent in DEMO_PARENTS:
            parent_ids[parent["email"]] = parent["uid"]
            conn.execute(
                "INSERT INTO parents (id, email, display_name, role, created_at, last_seen_at)"
                " VALUES (?,?,?,?,?,?)",
                (parent["uid"], parent["email"], parent["display_name"], "parent", stamp, stamp),
            )
            for child in parent["children"]:
                child_parent[child["id"]] = parent["uid"]
                conn.execute(
                    """INSERT INTO children (id, parent_id, name, age, avatar, age_band,
                        blocked_categories, age_band_depth, preferences, created_at, updated_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                    (
                        child["id"], parent["uid"], child["name"], child["age"], child["avatar"],
                        child["age_band"], json.dumps(child["blocked_categories"]),
                        child["age_band_depth"], json.dumps({}), stamp, stamp,
                    ),
                )
        for event in build_demo_events():
            conn.execute(
                "INSERT INTO events (id, parent_id, child_id, kind, topic, item_id, created_at)"
                " VALUES (?,?,?,?,?,?,?)",
                (new_id("evt"), None, event["child_id"], event["kind"], event["topic"],
                 event["item_id"], event["created_at"]),
            )
            if event["kind"] == "favourite" and event["item_id"]:
                conn.execute(
                    "INSERT OR IGNORE INTO favourites (id, parent_id, child_id, item_id, created_at)"
                    " VALUES (?,?,?,?,?)",
                    (new_id("fav"), child_parent.get(event["child_id"]),
                     event["child_id"], event["item_id"], event["created_at"]),
                )


# --------------------------------------------------------------------------- #
# Parents
# --------------------------------------------------------------------------- #
def upsert_parent(uid: str, email: str, display_name: str = "") -> dict:
    """Create the parent on first sight, otherwise just refresh ``last_seen_at``.

    Concurrent first requests (the mobile app fans out /account/me and /children
    at the same time) must not raise a UNIQUE violation, so a failed insert is
    tolerated and followed by a read.
    """
    stamp = now_iso()
    with get_conn() as conn:
        conn.execute("PRAGMA busy_timeout = 15000")
        row = conn.execute("SELECT * FROM parents WHERE id = ? OR email = ?", (uid, email)).fetchone()
        if row is None:
            try:
                conn.execute(
                    "INSERT INTO parents (id, email, display_name, role, created_at, last_seen_at)"
                    " VALUES (?,?,?,?,?,?)",
                    (uid, email, display_name or email.split("@")[0], "parent", stamp, stamp),
                )
            except sqlite3.IntegrityError:
                pass  # another request won the race – fall through to the read
            row = conn.execute(
                "SELECT * FROM parents WHERE id = ? OR email = ? ORDER BY created_at LIMIT 1",
                (uid, email),
            ).fetchone()
        if row is None:
            raise RuntimeError("Could not create the parent account")
        conn.execute("UPDATE parents SET last_seen_at = ? WHERE id = ?", (stamp, row["id"]))
        row = conn.execute("SELECT * FROM parents WHERE id = ?", (row["id"],)).fetchone()
        return parent_to_dict(row)


def get_parent(parent_id: str) -> dict | None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM parents WHERE id = ?", (parent_id,)).fetchone()
        return parent_to_dict(row) if row else None


def list_parents(search: str = "") -> list[dict]:
    sql = "SELECT * FROM parents"
    params: list[Any] = []
    if search:
        sql += " WHERE lower(email) LIKE ? OR lower(display_name) LIKE ?"
        like = f"%{search.lower()}%"
        params += [like, like]
    sql += " ORDER BY created_at DESC"
    with get_conn() as conn:
        return [parent_to_dict(row) for row in conn.execute(sql, params)]


def children_count_by_parent() -> dict[str, int]:
    with get_conn() as conn:
        rows = conn.execute("SELECT parent_id, COUNT(*) AS c FROM children GROUP BY parent_id")
        return {row["parent_id"]: row["c"] for row in rows}


# --------------------------------------------------------------------------- #
# Children
# --------------------------------------------------------------------------- #
def list_children(parent_id: str) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM children WHERE parent_id = ? ORDER BY created_at ASC", (parent_id,)
        )
        return [child_to_dict(row) for row in rows]


def get_child(parent_id: str, child_id: str) -> dict | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM children WHERE id = ? AND parent_id = ?", (child_id, parent_id)
        ).fetchone()
        return child_to_dict(row) if row else None


def create_child(parent_id: str, data: dict) -> dict:
    stamp = now_iso()
    child_id = data.get("id") or new_id("child")
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO children (id, parent_id, name, age, avatar, age_band,
                blocked_categories, age_band_depth, preferences, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (
                child_id, parent_id, data["name"], data["age"], data.get("avatar", "🐣"),
                data["age_band"], json.dumps(data.get("blocked_categories", [])),
                data.get("age_band_depth", 2), json.dumps(data.get("preferences", {})),
                stamp, stamp,
            ),
        )
        row = conn.execute("SELECT * FROM children WHERE id = ?", (child_id,)).fetchone()
        return child_to_dict(row)


def update_child(parent_id: str, child_id: str, data: dict) -> dict | None:
    fields: list[str] = []
    params: list[Any] = []
    json_fields = {"blocked_categories", "preferences"}
    for key in ("name", "age", "avatar", "age_band", "age_band_depth",
                "blocked_categories", "preferences"):
        if key in data and data[key] is not None:
            fields.append(f"{key} = ?")
            value = json.dumps(data[key]) if key in json_fields else data[key]
            params.append(value)
    if not fields:
        return get_child(parent_id, child_id)
    fields.append("updated_at = ?")
    params.append(now_iso())
    params += [child_id, parent_id]
    with get_conn() as conn:
        cur = conn.execute(
            f"UPDATE children SET {', '.join(fields)} WHERE id = ? AND parent_id = ?", params
        )
        if cur.rowcount == 0:
            return None
        row = conn.execute("SELECT * FROM children WHERE id = ?", (child_id,)).fetchone()
        return child_to_dict(row)


def delete_child(parent_id: str, child_id: str) -> bool:
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM children WHERE id = ? AND parent_id = ?", (child_id, parent_id))
        conn.execute("DELETE FROM favourites WHERE child_id = ?", (child_id,))
        conn.execute("DELETE FROM feedback WHERE child_id = ?", (child_id,))
        conn.execute("DELETE FROM events WHERE child_id = ?", (child_id,))
        return cur.rowcount > 0


# --------------------------------------------------------------------------- #
# Catalogue
# --------------------------------------------------------------------------- #
def list_catalogue(
    *,
    search: str = "",
    type_filter: str = "",
    category: str = "",
    include_inactive: bool = False,
    limit: int = 200,
    offset: int = 0,
) -> list[dict]:
    clauses: list[str] = []
    params: list[Any] = []
    if not include_inactive:
        clauses.append("active = 1")
    if search:
        clauses.append("(lower(title) LIKE ? OR lower(summary) LIKE ? OR lower(tags) LIKE ?)")
        like = f"%{search.lower()}%"
        params += [like, like, like]
    if type_filter:
        clauses.append("type = ?")
        params.append(type_filter)
    if category:
        clauses.append("category = ?")
        params.append(category)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    sql = f"SELECT * FROM catalogue {where} ORDER BY popularity DESC, title ASC LIMIT ? OFFSET ?"
    params += [limit, offset]
    with get_conn() as conn:
        return [item_to_dict(row, include_inactive=include_inactive) for row in conn.execute(sql, params)]


def all_catalogue(include_inactive: bool = False) -> list[dict]:
    return list_catalogue(include_inactive=include_inactive, limit=5000)


def get_catalogue_item(item_id: str) -> dict | None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM catalogue WHERE id = ?", (item_id,)).fetchone()
        return item_to_dict(row, include_inactive=True) if row else None


def items_by_ids(ids: Iterable[str]) -> dict[str, dict]:
    ids = list(ids)
    if not ids:
        return {}
    placeholders = ",".join("?" for _ in ids)
    with get_conn() as conn:
        rows = conn.execute(f"SELECT * FROM catalogue WHERE id IN ({placeholders})", ids).fetchall()
        return {row["id"]: item_to_dict(row) for row in rows}


def create_catalogue_item(data: dict) -> dict:
    stamp = now_iso()
    item_id = data.get("id") or new_id("item")
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO catalogue (id, title, type, category, age_min, age_max, summary,
                tags, year, publisher, language, sensitivity, popularity, cover_emoji,
                external_links, active, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                item_id, data["title"], data["type"], data["category"], data["age_min"],
                data["age_max"], data.get("summary", ""), json.dumps(data.get("tags", [])),
                data.get("year", datetime.now().year), data.get("publisher", ""),
                data.get("language", "English"), json.dumps(data.get("sensitivity", [])),
                data.get("popularity", 50), data.get("cover_emoji", "📘"),
                json.dumps(data.get("external_links", {})), 1 if data.get("active", True) else 0,
                stamp, stamp,
            ),
        )
        row = conn.execute("SELECT * FROM catalogue WHERE id = ?", (item_id,)).fetchone()
        return item_to_dict(row, include_inactive=True)


def update_catalogue_item(item_id: str, data: dict) -> dict | None:
    allowed = {
        "title", "type", "category", "age_min", "age_max", "summary", "year", "publisher",
        "language", "popularity", "cover_emoji", "active", "tags", "sensitivity", "external_links",
    }
    json_fields = {"tags", "sensitivity", "external_links"}
    fields: list[str] = []
    params: list[Any] = []
    for key, value in data.items():
        if key not in allowed or value is None:
            continue
        fields.append(f"{key} = ?")
        params.append(json.dumps(value) if key in json_fields else value)
    if not fields:
        return get_catalogue_item(item_id)
    fields.append("updated_at = ?")
    params.append(now_iso())
    params.append(item_id)
    with get_conn() as conn:
        cur = conn.execute(f"UPDATE catalogue SET {', '.join(fields)} WHERE id = ?", params)
        if cur.rowcount == 0:
            return None
        row = conn.execute("SELECT * FROM catalogue WHERE id = ?", (item_id,)).fetchone()
        return item_to_dict(row, include_inactive=True)


def delete_catalogue_item(item_id: str) -> bool:
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM catalogue WHERE id = ?", (item_id,))
        return cur.rowcount > 0


# --------------------------------------------------------------------------- #
# Conversations & messages
# --------------------------------------------------------------------------- #
def get_or_create_conversation(parent_id: str, child_id: str, conversation_id: str | None) -> str:
    stamp = now_iso()
    with get_conn() as conn:
        if conversation_id:
            row = conn.execute(
                "SELECT id FROM conversations WHERE id = ? AND parent_id = ?", (conversation_id, parent_id)
            ).fetchone()
            if row:
                conn.execute("UPDATE conversations SET updated_at = ? WHERE id = ?", (stamp, conversation_id))
                return row["id"]
        conversation_id = new_id("conv")
        conn.execute(
            "INSERT INTO conversations (id, parent_id, child_id, created_at, updated_at) VALUES (?,?,?,?,?)",
            (conversation_id, parent_id, child_id, stamp, stamp),
        )
        return conversation_id


def add_message(conversation_id: str, role: str, content: str, meta: dict | None = None) -> dict:
    stamp = now_iso()
    message_id = new_id("msg")
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO messages (id, conversation_id, role, content, meta, created_at) VALUES (?,?,?,?,?,?)",
            (message_id, conversation_id, role, content, json.dumps(meta or {}), stamp),
        )
    return {"id": message_id, "role": role, "content": content, "meta": meta or {}, "created_at": stamp}


def list_messages(conversation_id: str, limit: int = 100) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?",
            (conversation_id, limit),
        ).fetchall()
        return [
            {
                "id": row["id"],
                "role": row["role"],
                "content": row["content"],
                "meta": _json_load(row["meta"], {}),
                "created_at": row["created_at"],
            }
            for row in rows
        ]


def latest_conversation(parent_id: str, child_id: str) -> str | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id FROM conversations WHERE parent_id = ? AND child_id = ?"
            " ORDER BY updated_at DESC LIMIT 1",
            (parent_id, child_id),
        ).fetchone()
        return row["id"] if row else None


# --------------------------------------------------------------------------- #
# Favourites & feedback
# --------------------------------------------------------------------------- #
def list_favourites(parent_id: str, child_id: str | None = None) -> list[dict]:
    sql = "SELECT * FROM favourites WHERE parent_id = ?"
    params: list[Any] = [parent_id]
    if child_id:
        sql += " AND child_id = ?"
        params.append(child_id)
    sql += " ORDER BY created_at DESC"
    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
        items = items_by_ids({row["item_id"] for row in rows})
        result = []
        for row in rows:
            item = items.get(row["item_id"])
            if not item:
                continue
            result.append(
                {
                    "id": row["id"],
                    "item_id": row["item_id"],
                    "child_id": row["child_id"],
                    "created_at": row["created_at"],
                    "item": item,
                }
            )
        return result


def favourite_ids(parent_id: str, child_id: str) -> set[str]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT item_id FROM favourites WHERE parent_id = ? AND child_id = ?",
            (parent_id, child_id),
        )
        return {row["item_id"] for row in rows}


def add_favourite(parent_id: str, child_id: str, item_id: str) -> dict:
    stamp = now_iso()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM favourites WHERE child_id = ? AND item_id = ?", (child_id, item_id)
        ).fetchone()
        if row:
            return {"id": row["id"], "item_id": item_id, "child_id": child_id, "created_at": row["created_at"]}
        fav_id = new_id("fav")
        conn.execute(
            "INSERT INTO favourites (id, parent_id, child_id, item_id, created_at) VALUES (?,?,?,?,?)",
            (fav_id, parent_id, child_id, item_id, stamp),
        )
    record_event(parent_id, child_id, "favourite", "", item_id)
    return {"id": fav_id, "item_id": item_id, "child_id": child_id, "created_at": stamp}


def remove_favourite(parent_id: str, child_id: str, item_id: str) -> bool:
    with get_conn() as conn:
        cur = conn.execute(
            "DELETE FROM favourites WHERE child_id = ? AND item_id = ?", (child_id, item_id)
        )
        return cur.rowcount > 0


def add_feedback(parent_id: str, child_id: str, item_id: str, rating: str, reason: str = "") -> dict:
    stamp = now_iso()
    feedback_id = new_id("fb")
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO feedback (id, parent_id, child_id, item_id, rating, reason, created_at)"
            " VALUES (?,?,?,?,?,?,?)",
            (feedback_id, parent_id, child_id, item_id, rating, reason, stamp),
        )
    record_event(parent_id, child_id, f"feedback_{rating}", "", item_id)
    return {"id": feedback_id, "item_id": item_id, "rating": rating, "reason": reason, "created_at": stamp}


def feedback_map(parent_id: str, child_id: str) -> dict[str, str]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT item_id, rating, created_at FROM feedback WHERE parent_id = ? AND child_id = ?"
            " ORDER BY created_at ASC",
            (parent_id, child_id),
        ).fetchall()
        return {row["item_id"]: row["rating"] for row in rows}


# --------------------------------------------------------------------------- #
# Events
# --------------------------------------------------------------------------- #
def record_event(parent_id: str | None, child_id: str, kind: str, topic: str = "", item_id: str | None = None) -> None:
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO events (id, parent_id, child_id, kind, topic, item_id, created_at) VALUES (?,?,?,?,?,?,?)",
            (new_id("evt"), parent_id, child_id, kind, topic, item_id, now_iso()),
        )


def events_since(child_id: str, since_iso: str) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM events WHERE child_id = ? AND created_at >= ? ORDER BY created_at ASC",
            (child_id, since_iso),
        ).fetchall()
        return [dict(row) for row in rows]


# --------------------------------------------------------------------------- #
# Models
# --------------------------------------------------------------------------- #
def list_models() -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM model_versions ORDER BY trained_at DESC"
        ).fetchall()
        return [
            {
                "version": row["version"],
                "status": row["status"],
                "metrics": _json_load(row["metrics"], {}),
                "trained_at": row["trained_at"],
                "activated_at": row["activated_at"],
                "notes": row["notes"],
            }
            for row in rows
        ]


def get_model(version: str) -> dict | None:
    for model in list_models():
        if model["version"] == version:
            return model
    return None


def active_model_version() -> str | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT version FROM model_versions WHERE status = 'active' ORDER BY activated_at DESC LIMIT 1"
        ).fetchone()
        return row["version"] if row else None


def activate_model(version: str) -> dict | None:
    stamp = now_iso()
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM model_versions WHERE version = ?", (version,)).fetchone()
        if not row:
            return None
        conn.execute("UPDATE model_versions SET status = 'archived' WHERE status = 'active'")
        conn.execute(
            "UPDATE model_versions SET status = 'active', activated_at = ? WHERE version = ?",
            (stamp, version),
        )
    return get_model(version)


def create_retrain_job(requested_by: str, notes: str = "") -> dict:
    job_id = new_id("job")
    stamp = now_iso()
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO retrain_jobs (id, requested_by, status, notes, requested_at) VALUES (?,?,?,?,?)",
            (job_id, requested_by, "queued", notes, stamp),
        )
    return {"id": job_id, "requested_by": requested_by, "status": "queued", "notes": notes,
            "requested_at": stamp, "completed_at": None}


def list_retrain_jobs(limit: int = 10) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM retrain_jobs ORDER BY requested_at DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(row) for row in rows]


# --------------------------------------------------------------------------- #
# Admin statistics
# --------------------------------------------------------------------------- #
def admin_stats() -> dict:
    with get_conn() as conn:
        parents = conn.execute("SELECT COUNT(*) AS c FROM parents").fetchone()["c"]
        children = conn.execute("SELECT COUNT(*) AS c FROM children").fetchone()["c"]
        items = conn.execute("SELECT COUNT(*) AS c FROM catalogue WHERE active = 1").fetchone()["c"]
        inactive = conn.execute("SELECT COUNT(*) AS c FROM catalogue WHERE active = 0").fetchone()["c"]
        conversations = conn.execute("SELECT COUNT(*) AS c FROM conversations").fetchone()["c"]
        messages = conn.execute("SELECT COUNT(*) AS c FROM messages").fetchone()["c"]
        favourites = conn.execute("SELECT COUNT(*) AS c FROM favourites").fetchone()["c"]
        searches = conn.execute("SELECT COUNT(*) AS c FROM events WHERE kind = 'search'").fetchone()["c"]
        recs = conn.execute("SELECT COUNT(*) AS c FROM events WHERE kind = 'recommendation'").fetchone()["c"]
        active_model = conn.execute(
            "SELECT version FROM model_versions WHERE status = 'active' LIMIT 1"
        ).fetchone()
        top_categories = conn.execute(
            "SELECT category, COUNT(*) AS c FROM catalogue WHERE active = 1 GROUP BY category"
            " ORDER BY c DESC LIMIT 6"
        ).fetchall()
        top_topics = conn.execute(
            "SELECT topic, COUNT(*) AS c FROM events WHERE kind = 'search' AND topic != ''"
            " GROUP BY topic ORDER BY c DESC LIMIT 8"
        ).fetchall()
    return {
        "parents": parents,
        "children": children,
        "catalogue_items": items,
        "inactive_items": inactive,
        "conversations": conversations,
        "messages": messages,
        "favourites": favourites,
        "searches": searches,
        "recommendations_served": recs,
        "active_model": active_model["version"] if active_model else None,
        "top_categories": [{"category": row["category"], "count": row["c"]} for row in top_categories],
        "top_topics": [{"topic": row["topic"], "count": row["c"]} for row in top_topics],
    }
