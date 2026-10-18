# API Integration Guide

The Expo mobile app and the Jinja Admin Web Portal both talk to the **same FastAPI
API** documented below. It is the contract the two frontends code against; the
repo's `mock-api/` is a development implementation of it, not a deliverable.

Base URL during development: `http://<host>:8010` (configurable, see below).

```
mock-api/run.sh                    # 0.0.0.0:8000 by default (dev mock)
PORT=8010 ./run.sh                 # what the docs and the mobile .env example assume
```

Interactive schema: `GET /docs` (Swagger UI) and `GET /openapi.json`.

---

## 1. Authentication

### Mobile app — Firebase ID token

```
Authorization: Bearer <firebase-id-token>
```

* Obtained client-side with the Firebase JS SDK (`signInWithEmailAndPassword`,
  `createUserWithEmailAndPassword`). The app never sends passwords to this API.
* The backend verifies the token with `firebase-admin` when
  `GOOGLE_APPLICATION_CREDENTIALS` points at a service-account file.
* **First authenticated request creates the parent row** (`GET /account/me` or
  `POST /account/register`), so registration is idempotent and needs no payload.

### Mobile app — local demo token

When `DEV_AUTH=true` and Firebase is not configured, the API also accepts

```
Authorization: Bearer dev:<email>
```

This exists so the whole stack can be demonstrated without a Firebase project.
It is a server-side switch: with `DEV_AUTH=false` those tokens are rejected with
`401`.

### Admin Web Portal — signed session cookie

`POST /admin/login` (form-encoded `email`, `password`, optional `next`) sets an
HttpOnly cookie `admin_session` containing `base64(email|expiry).hmac-sha256`.
Page routes redirect to `/admin/login` when it is missing; JSON admin routes answer
`401`. Admins can alternatively call the JSON admin API with a Firebase token whose
e-mail matches `ADMIN_EMAIL`.

### Error envelope

```json
{ "detail": "Human readable message", "errors": [{ "field": "age", "message": "…" }], "path": "/children" }
```

`401` invalid/expired token · `403` wrong role · `404` not found or not owned by the
caller · `422` validation (see `errors`) · `5xx` unexpected.

---

## 2. Meta

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/healthz` | status, environment, auth mode, database path |
| GET | `/config` | non-secret client config (`max_recommendations`, `dev_auth`, …) |

---

## 3. Account (`/account`)

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/account/register` | – | `AccountPayload` (creates/refreshes parent from the token) |
| GET | `/account/me` | – | `AccountPayload` |
| PATCH | `/account/me` | `{ "display_name": "Mei Ling" }` | `AccountPayload` |

```ts
AccountPayload = {
  parent: { id, email, display_name, role, created_at, last_seen_at },
  children: Child[],
  children_count: number,
  meta: {
    app_name, dev_auth, firebase_configured, active_model,
    sensitivity_categories: string[], max_recommendations, default_recommendations,
    suggested_replies: string[]
  }
}
```

---

## 4. Children (`/children`)

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/children/meta` | – | age bands, sensitivity categories with labels/emoji, avatars, depth options |
| GET | `/children` | – | `{ children: Child[], count }` |
| POST | `/children` | `ChildCreate` | `201` + `Child` |
| GET | `/children/{id}` | – | `Child` (404 if it belongs to another parent) |
| PATCH | `/children/{id}` | `ChildUpdate` | partial update |
| PUT | `/children/{id}/restrictions` | `{ blocked_categories: string[], age_band_depth: 1\|2\|3 }` | parental controls |
| DELETE | `/children/{id}` | – | `204`, cascades favourites/feedback/events |

```ts
Child = {
  id, parent_id, name, age, avatar, age_band,
  blocked_categories: string[], age_band_depth: 1|2|3,
  preferences: { max_recommendations, display_mode: 'summary'|'title', sort: 'relevance'|'newest'|'oldest', show_explanations },
  created_at, updated_at
}
```

`blocked_categories` accepts only the ids from `GET /children/meta`
(`violence`, `scary`, `romance`, `strong language`, `substances`,
`death and grief`, `bullying`). Unknown ids return `422`.

---

## 5. Catalogue (`/catalogue`)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/catalogue?q=&type=&category=&limit=` | public browsing |
| GET | `/catalogue?ids=a,b,c` | batch lookup used to re-hydrate chat history (order preserved) |
| GET | `/catalogue/{id}` | single item, `404` when inactive/unknown |

---

## 6. Chat (`/chat`)

### `POST /chat`

```json
{
  "child_id": "child-amelia",
  "message": "I love dinosaurs and fossils",
  "conversation_id": "conv-…",
  "preferences": { "max_recommendations": 3, "display_mode": "summary", "sort": "relevance" }
}
```

`conversation_id` is optional (a new one is created when omitted).
`preferences` overrides the child's stored preferences for this turn only.

Response (`ChatResponse`):

```json
{
  "conversation_id": "conv-…",
  "reply": "Here are 5 picks about dinosaur, fossils for Amelia. …",
  "recommendations": [
    {
      "id": "bk-dinosaur-ng",
      "title": "National Geographic Kids: Dinosaurs",
      "type": "book",
      "category": "Dinosaurs",
      "age_range": "6–9",
      "summary": "Big photos and facts about T-rex…",
      "tags": ["dinosaurs", "fossils"],
      "matched_tags": ["dinosaur", "fossils"],
      "match_type": "topic",
      "explanation": "matches what you asked about: dinosaur, fossils; fits Amelia's age group (6–9); …",
      "score": 14.73,
      "is_favourite": false,
      "external_links": { "nlb": "https://…", "open_library": "https://…" }
    }
  ],
  "topics": ["dinosaur", "fossils"],
  "confidence": "high",
  "age_window": [4, 10],
  "safety": { "blocked": false, "reason": null },
  "preferences_applied": { "max_recommendations": 3, "display_mode": "summary", "sort": "relevance", "show_explanations": true },
  "favourite_ids": ["bk-gruffalo"],
  "feedback": { "bk-gruffalo": "up" },
  "suggested_replies": ["Show me dinosaur books", "…"],
  "timing_ms": 12.4
}
```

* `display_mode: "title"` returns `summary: ""` so the client can render titles only.
* `safety.blocked = true` means the **server** refused the topic; `recommendations`
  is empty and `reply` is a safe redirect. The client must not bypass this.
* `sort: "newest" | "oldest"` sorts by publication year; `relevance` (default) keeps
  the ranking from the recommender.

### Other chat routes

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/chat/history?child_id=&conversation_id=` | stored transcript; assistant messages carry `meta.recommendations` so cards can be rebuilt |
| GET | `/chat/suggestions?child_id=` | quick replies + “more about …” chips from recent searches |

> The recommender behind `/chat` is the deterministic reference implementation in
> `mock-api/app/services/recommender.py`. Swapping in the ML model only changes the
> internals of that function — the request/response contract above stays the same.

---

## 7. Reports (`/reports`)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/reports/activity?child_id=&range=daily\|weekly\|monthly` | dashboard payload |

```ts
Report = {
  child_id, range, range_title,
  totals: { searches, recommendations, favourites, positive_feedback, negative_feedback, active_days },
  series: [{ key, label, searches, recommendations, favourites, searches_pct }],
  topics: [{ topic, count, kind: 'searched'|'recommended' }],
  generated_at
}
```

`daily` → last 7 days, `weekly` → last 8 weeks, `monthly` → last 6 months.

---

## 8. Favourites & feedback

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/favourites?child_id=` | – | `{ favourites: [{ id, item_id, child_id, created_at, item }], count }` |
| POST | `/favourites` | `{ child_id, item_id }` | `201`, idempotent |
| DELETE | `/favourites/{item_id}?child_id=` | – | `{ removed, favourite_ids }` |
| POST | `/feedback` | `{ child_id, item_id, rating: "up"\|"down", reason? }` | `201`, returns the updated `feedback_map` |

Both mutations return `favourite_ids` / `feedback_map` so the UI can re-sync without
another round-trip.

---

## 9. Admin Web Portal

### Server-rendered pages (cookie auth)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/admin/login` | sign-in form |
| POST | `/admin/login` | validates credentials, sets cookie, `303` redirect |
| POST | `/admin/logout` | clears cookie |
| GET | `/admin` | dashboard: stats, top topics, active model, newest families |
| GET | `/admin/catalogue` | searchable/filterable catalogue table with pagination |
| GET/POST | `/admin/catalogue/new` | create item |
| GET/POST | `/admin/catalogue/{id}/edit` | edit item |
| POST | `/admin/catalogue/{id}/delete` | delete item |
| GET | `/admin/users` | parent accounts + child profile statistics |
| GET | `/admin/models` | deployed model, metrics, version table, retrain jobs |
| POST | `/admin/models/retrain` | queues a retraining request |
| POST | `/admin/models/{version}/activate` | activates a model version |

### Protected JSON endpoints (cookie **or** admin bearer token)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/admin/api/stats` | dashboard counters |
| GET | `/admin/api/catalogue?q=&type=&category=&page=` | paginated list |
| POST | `/admin/api/catalogue` | create (`CatalogueItemIn`) |
| PATCH | `/admin/api/catalogue/{id}` | update |
| DELETE | `/admin/api/catalogue/{id}` | delete |
| GET | `/admin/api/users?q=` | parents + children counts |
| GET | `/admin/api/models` | versions + retrain jobs |
| POST | `/admin/api/retrain` | `202` + job |
| POST | `/admin/api/models/{version}/activate` | activates |

Privileged operations (account deletion, model training) deliberately stay on the
backend; the portal only requests them.

---

## 10. CORS & origins

`CORS_ORIGINS` (comma separated) must include the Expo web origin
(`http://localhost:8081`) during browser-based testing. Native apps are not subject
to CORS.

---

## 11. Secrets that must never reach a client

* `GOOGLE_APPLICATION_CREDENTIALS` / service-account JSON
* `SESSION_SECRET`, `ADMIN_PASSWORD`
* Any Firebase Admin / Cloud credentials

Only `EXPO_PUBLIC_*` values are embedded in the mobile bundle; everything else lives
in the API's environment, never in the app bundle.
