"""API integration tests. Every assertion runs against the real FastAPI app,
real SQLite schema and real routers – no mocks."""

from __future__ import annotations

import os
import pathlib
import tempfile

import pytest

TEST_DB = pathlib.Path(tempfile.mkdtemp(prefix="agesafe-tests-")) / "test.db"
os.environ["DATABASE_PATH"] = str(TEST_DB)
os.environ["DEV_AUTH"] = "true"
os.environ["SEED_DEMO_DATA"] = "true"
os.environ["ADMIN_EMAIL"] = "admin@test.sg"
os.environ["ADMIN_PASSWORD"] = "Test123!"
os.environ["SESSION_SECRET"] = "test-secret"
os.environ["ENVIRONMENT"] = "test"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

PARENT = {"Authorization": "Bearer dev:parent@demo.sg"}
OTHER_PARENT = {"Authorization": "Bearer dev:newparent@example.com"}


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def admin_client(client):
    response = client.post(
        "/admin/login",
        data={"email": "admin@test.sg", "password": "Test123!"},
        follow_redirects=False,
    )
    assert response.status_code == 303
    return client


# --------------------------------------------------------------------------- #
# Meta & auth
# --------------------------------------------------------------------------- #
def test_health(client):
    payload = client.get("/healthz").json()
    assert payload["status"] == "ok"
    assert payload["auth_mode"] == "dev"


def test_missing_token_is_401(client):
    response = client.get("/account/me")
    assert response.status_code == 401


def test_invalid_token_is_401(client):
    response = client.get("/account/me", headers={"Authorization": "Bearer nope"})
    assert response.status_code == 401


def test_account_me_creates_parent_and_returns_meta(client):
    payload = client.get("/account/me", headers=PARENT).json()
    assert payload["parent"]["email"] == "parent@demo.sg"
    assert payload["children_count"] == 2
    assert "sensitivity_categories" in payload["meta"]
    assert payload["meta"]["active_model"] == "rec-v1.2.0"


def test_first_request_upserts_new_parent(client):
    payload = client.get("/account/me", headers=OTHER_PARENT).json()
    assert payload["parent"]["email"] == "newparent@example.com"
    assert payload["children_count"] == 0


# --------------------------------------------------------------------------- #
# Children
# --------------------------------------------------------------------------- #
def test_children_crud_and_isolation(client):
    created = client.post(
        "/children",
        headers=OTHER_PARENT,
        json={"name": "Test Kid", "age": 9, "avatar": "🐼", "blocked_categories": ["scary"]},
    )
    assert created.status_code == 201, created.text
    child = created.json()
    assert child["age_band"] == "9-11"

    # another parent can never read or mutate it
    assert client.get(f"/children/{child['id']}", headers=PARENT).status_code == 404
    assert client.patch(f"/children/{child['id']}", headers=PARENT, json={"name": "Hacked"}).status_code == 404

    updated = client.patch(
        f"/children/{child['id']}",
        headers=OTHER_PARENT,
        json={"age": 4, "blocked_categories": ["scary", "violence"]},
    ).json()
    assert updated["age"] == 4 and updated["age_band"] == "3-5"
    assert updated["blocked_categories"] == ["scary", "violence"]

    restrictions = client.put(
        f"/children/{child['id']}/restrictions",
        headers=OTHER_PARENT,
        json={"blocked_categories": ["romance"], "age_band_depth": 1},
    ).json()
    assert restrictions["age_band_depth"] == 1
    assert restrictions["blocked_categories"] == ["romance"]

    assert client.delete(f"/children/{child['id']}", headers=OTHER_PARENT).status_code == 204
    assert client.get(f"/children/{child['id']}", headers=OTHER_PARENT).status_code == 404


def test_unknown_sensitivity_category_is_rejected(client):
    response = client.post(
        "/children",
        headers=OTHER_PARENT,
        json={"name": "Bad", "age": 8, "blocked_categories": ["not-a-category"]},
    )
    assert response.status_code == 422
    assert "sensitivity categories" in response.json()["detail"].lower()


# --------------------------------------------------------------------------- #
# Chat
# --------------------------------------------------------------------------- #
def test_chat_returns_explainable_recommendations(client):
    response = client.post(
        "/chat",
        headers=PARENT,
        json={"child_id": "child-amelia", "message": "I love dinosaurs and fossils"},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["recommendations"], "expected at least one recommendation"
    first = payload["recommendations"][0]
    assert first["match_type"] in {"topic", "discovery"}
    assert first["explanation"]
    assert first["age_range"]
    assert payload["safety"]["blocked"] is False
    assert payload["conversation_id"].startswith("conv-")
    # Amelia blocks scary/violence, so nothing with those sensitivities may appear
    for item in payload["recommendations"]:
        assert not {"scary", "violence"}.intersection(item["sensitivity"])


def test_chat_blocks_unsafe_requests_server_side(client):
    payload = client.post(
        "/chat",
        headers=PARENT,
        json={"child_id": "child-amelia", "message": "tell me about guns and blood"},
    ).json()
    assert payload["safety"]["blocked"] is True
    assert payload["recommendations"] == []


def test_chat_honours_preferences(client):
    payload = client.post(
        "/chat",
        headers=PARENT,
        json={
            "child_id": "child-jun",
            "message": "space books",
            "preferences": {"max_recommendations": 2, "display_mode": "title", "sort": "newest"},
        },
    ).json()
    assert len(payload["recommendations"]) <= 2
    assert payload["preferences_applied"]["display_mode"] == "title"
    # titles-only mode strips the summary from the payload
    assert payload["recommendations"][0]["summary"] == ""
    years = [item["year"] for item in payload["recommendations"]]
    assert years == sorted(years, reverse=True)


def test_chat_rejects_foreign_child(client):
    response = client.post(
        "/chat",
        headers=OTHER_PARENT,
        json={"child_id": "child-amelia", "message": "dinosaurs"},
    )
    assert response.status_code == 404


def test_chat_history_keeps_recommendation_metadata(client):
    first = client.post(
        "/chat",
        headers=PARENT,
        json={"child_id": "child-jun", "message": "ocean animals"},
    ).json()
    history = client.get("/chat/history", headers=PARENT, params={"child_id": "child-jun"}).json()
    assistant = [message for message in history["messages"] if message["role"] == "assistant"][-1]
    stored = assistant["meta"].get("recommendations") or []
    assert stored, "assistant messages should carry recommendation metadata"
    assert stored[0]["id"] == first["recommendations"][0]["id"]


# --------------------------------------------------------------------------- #
# Favourites & feedback
# --------------------------------------------------------------------------- #
def test_favourites_roundtrip(client):
    added = client.post(
        "/favourites", headers=PARENT, json={"child_id": "child-amelia", "item_id": "bk-gruffalo"}
    )
    assert added.status_code == 201
    listing = client.get("/favourites", headers=PARENT, params={"child_id": "child-amelia"}).json()
    assert any(entry["item_id"] == "bk-gruffalo" for entry in listing["favourites"])

    removed = client.delete(
        "/favourites/bk-gruffalo", headers=PARENT, params={"child_id": "child-amelia"}
    ).json()
    assert removed["removed"] is True


def test_feedback_is_persisted(client):
    response = client.post(
        "/feedback",
        headers=PARENT,
        json={"child_id": "child-amelia", "item_id": "bk-gruffalo", "rating": "up", "reason": "loved it"},
    )
    assert response.status_code == 201
    assert response.json()["feedback_map"]["bk-gruffalo"] == "up"


def test_favourite_unknown_item_is_404(client):
    response = client.post(
        "/favourites", headers=PARENT, json={"child_id": "child-amelia", "item_id": "does-not-exist"}
    )
    assert response.status_code == 404


# --------------------------------------------------------------------------- #
# Reports
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("range_key", ["daily", "weekly", "monthly"])
def test_reports_for_every_range(client, range_key):
    payload = client.get(
        "/reports/activity", headers=PARENT, params={"child_id": "child-amelia", "range": range_key}
    ).json()
    assert payload["range"] == range_key
    assert payload["series"], "series should never be empty"
    assert "searches" in payload["totals"]
    assert payload["totals"]["searches"] >= 0


def test_reports_reject_unknown_range(client):
    response = client.get(
        "/reports/activity", headers=PARENT, params={"child_id": "child-amelia", "range": "yearly"}
    )
    assert response.status_code == 422


# --------------------------------------------------------------------------- #
# Admin portal
# --------------------------------------------------------------------------- #
def test_admin_requires_login(client):
    response = client.get("/admin", follow_redirects=False)
    assert response.status_code == 303
    assert response.headers["location"].startswith("/admin/login")


def test_admin_api_requires_login(client):
    assert client.get("/admin/api/stats").status_code == 401


def test_admin_login_rejects_bad_password(client):
    response = client.post(
        "/admin/login", data={"email": "admin@test.sg", "password": "nope"}, follow_redirects=False
    )
    assert response.status_code == 200
    assert "not recognised" in response.text


def test_admin_pages_render(admin_client):
    for path in ["/admin", "/admin/catalogue", "/admin/catalogue/new", "/admin/users", "/admin/models"]:
        response = admin_client.get(path)
        assert response.status_code == 200, path
        assert "<html" in response.text


def test_admin_stats(admin_client):
    stats = admin_client.get("/admin/api/stats").json()
    assert stats["parents"] >= 3
    assert stats["catalogue_items"] >= 30
    assert stats["active_model"] == "rec-v1.2.0"


def test_admin_catalogue_crud_via_json(admin_client):
    payload = {
        "title": "Test Item for API",
        "type": "book",
        "category": "Science",
        "age_min": 6,
        "age_max": 9,
        "summary": "Created by the test suite.",
        "tags": ["testing"],
        "year": 2024,
        "publisher": "Test",
        "sensitivity": [],
        "popularity": 10,
        "cover_emoji": "🧪",
        "external_links": {},
        "active": True,
    }
    created = admin_client.post("/admin/api/catalogue", json=payload)
    assert created.status_code == 201, created.text
    item_id = created.json()["id"]

    updated = admin_client.patch(f"/admin/api/catalogue/{item_id}", json={**payload, "title": "Renamed"})
    assert updated.status_code == 200
    assert updated.json()["title"] == "Renamed"

    listed = admin_client.get("/admin/api/catalogue", params={"q": "Renamed"}).json()
    assert any(item["id"] == item_id for item in listed["items"])

    assert admin_client.delete(f"/admin/api/catalogue/{item_id}").status_code == 204
    assert admin_client.get(f"/catalogue/{item_id}", headers=PARENT).status_code == 404


def test_admin_catalogue_form_create_and_edit(admin_client):
    response = admin_client.post(
        "/admin/catalogue/new",
        data={
            "title": "Form Created Item",
            "type": "video",
            "category": "Science",
            "age_min": "5",
            "age_max": "8",
            "year": "2023",
            "summary": "Added through the HTML form.",
            "tags": "form, test",
            "publisher": "Test",
            "language": "English",
            "popularity": "42",
            "cover_emoji": "🎬",
            "active": "on",
        },
        follow_redirects=False,
    )
    assert response.status_code == 303
    assert "flash=" in response.headers["location"]

    listing = admin_client.get("/admin/api/catalogue", params={"q": "Form Created Item"}).json()
    assert listing["items"]
    item_id = listing["items"][0]["id"]
    assert listing["items"][0]["age_range"] == "5–8"


def test_admin_form_validation_message(admin_client):
    response = admin_client.post(
        "/admin/catalogue/new",
        data={"title": "", "category": "", "age_min": "5", "age_max": "4", "year": "2024"},
    )
    assert response.status_code == 200
    assert "required" in response.text.lower() or "maximum age" in response.text.lower()


def test_admin_model_retrain_and_activate(admin_client):
    queued = admin_client.post("/admin/api/retrain", json={"notes": "test run"})
    assert queued.status_code == 202
    assert queued.json()["job"]["status"] == "queued"

    activated = admin_client.post("/admin/api/models/rec-v1.3.0-rc1/activate")
    assert activated.status_code == 200
    assert activated.json()["model"]["status"] == "active"

    stats = admin_client.get("/admin/api/stats").json()
    assert stats["active_model"] == "rec-v1.3.0-rc1"

    # restore the original model
    admin_client.post("/admin/api/models/rec-v1.2.0/activate")


def test_admin_users_include_children(admin_client):
    payload = admin_client.get("/admin/api/users").json()
    demo = next(user for user in payload["users"] if user["email"] == "parent@demo.sg")
    assert demo["children_count"] == 2
    assert len(demo["children"]) == 2


# --------------------------------------------------------------------------- #
# Public catalogue
# --------------------------------------------------------------------------- #
def test_catalogue_batch_lookup(client):
    payload = client.get(
        "/catalogue", headers=PARENT, params={"ids": "bk-gruffalo,bk-matilda"}
    ).json()
    assert [item["id"] for item in payload["items"]] == ["bk-gruffalo", "bk-matilda"]


# --------------------------------------------------------------------------- #
# Concurrency
# --------------------------------------------------------------------------- #
def test_concurrent_first_requests_do_not_race(client):
    """The mobile app fires /account/me, /children and /chat in parallel on boot."""
    import concurrent.futures

    email = "race.condition@example.com"
    headers = {"Authorization": f"Bearer dev:{email}"}

    def hit(path):
        return client.get(path, headers=headers).status_code

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(hit, ["/account/me"] * 3 + ["/children"] * 3))

    assert results == [200] * 6, results
    payload = client.get("/account/me", headers=headers).json()
    assert payload["parent"]["email"] == email
