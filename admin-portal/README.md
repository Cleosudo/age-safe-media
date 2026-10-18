# Admin Web Portal (frontend)

Server-rendered frontend for librarians/administrators: **Jinja2 templates + CSS +
vanilla JS**, exactly as the project brief specifies (no separate React web app).

This folder is a **frontend deliverable**. It contains no Python application code —
your FastAPI backend renders these templates. The repo's `mock-api/` is only a
development harness that shows how to wire them up.

```
admin-portal/
├── templates/admin/
│   ├── base.html             layout: sidebar, topbar, flash, blocks
│   ├── login.html            standalone sign-in page
│   ├── dashboard.html        stats, top topics, active model, newest families
│   ├── catalogue.html        search / filter / paginated table
│   ├── catalogue_form.html   create + edit form (shared)
│   ├── users.html            parent accounts + child profiles
│   └── models.html           deployed model, versions, retrain requests
└── static/
    ├── css/admin.css         full design system + responsive breakpoints
    └── js/admin.js           nav drawer, confirm dialogs, flash, live search
```

---

## 1. Mounting in your FastAPI app

```python
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

PORTAL = Path("admin-portal")          # adjust to your checkout
templates = Jinja2Templates(directory=str(PORTAL / "templates"))

app = FastAPI()
app.mount("/static", StaticFiles(directory=str(PORTAL / "static")), name="static")
```

`url_for('static', path='css/admin.css')` inside the templates resolves to
`/static/css/admin.css`, so the mount **must** be named `static`.

Render with the request first (FastAPI ≥ 0.108 signature):

```python
return templates.TemplateResponse(request, "admin/dashboard.html", context)
```

## 2. Context each template expects

`base.html` is extended by every page and needs:

| Variable | Type | Notes |
| --- | --- | --- |
| `request` | `Request` | required by Starlette |
| `active_page` | `"dashboard" \| "catalogue" \| "users" \| "models"` | highlights the sidebar item |
| `admin_email` | `str` | shown in the sidebar footer |
| `settings` | object | only `settings.admin_email` / `settings.admin_password` are used, on the login page |
| `flash` | `str` | optional success banner, auto-hides after ~4 s |

### `login.html`

| Variable | Type |
| --- | --- |
| `next` | `str` (default `/admin`) |
| `error` | `str` — invalid credentials message |
| `email` | `str` — re-filled after a failed attempt |

Posts `application/x-www-form-urlencoded` `email`, `password`, `next` to
`/admin/login` and expects a `303` redirect.

### `dashboard.html`

| Variable | Type |
| --- | --- |
| `stats` | see `mock-api/app/db.py::admin_stats` (`parents`, `children`, `catalogue_items`, `inactive_items`, `conversations`, `messages`, `favourites`, `searches`, `recommendations_served`, `active_model`, `top_categories[]`, `top_topics[]`) |
| `models` | list of `{version, status, metrics, trained_at, activated_at, notes}` |
| `parents` | list of `{display_name, email, created_at, children[]}` |
| `max_category`, `max_topic` | ints used to scale the bars |

### `catalogue.html`

| Variable | Type |
| --- | --- |
| `items` | catalogue rows (`id, title, type, category, age_range, year, popularity, cover_emoji, publisher, tags[], active`) |
| `categories` | `list[str]` for the filter select |
| `q`, `type_filter`, `category_filter` | current filter values |
| `page`, `has_next` | pagination state (page size is the backend's choice) |
| `total`, `inactive` | counters shown in the toolbar |

### `catalogue_form.html`

| Variable | Type |
| --- | --- |
| `mode` | `"create"` or `"edit"` (drives the form action and button label) |
| `item` | the item being edited, or an empty skeleton for create |
| `categories` | datalist suggestions |
| `sensitivity_categories` | `list[str]` checkboxes |
| `error` | validation message to show above the form |

Form fields: `title`, `type`, `category`, `age_min`, `age_max`, `year`, `publisher`,
`language`, `popularity`, `cover_emoji`, `summary`, `tags` (comma separated),
`sensitivity` (repeated), `link_nlb`, `link_open_library`, `active`.

### `users.html`

| Variable | Type |
| --- | --- |
| `rows` | parents with `children[]` and `children_count` |
| `q`, `children_filter` | `"" \| "with" \| "without"` |
| `totals` | `{parents, children, avg}` |
| `sensitivity_categories` | list of category ids |

### `models.html`

| Variable | Type |
| --- | --- |
| `models` | all versions |
| `active_model` | the deployed version object (or `None`) |
| `jobs` | retraining requests `{id, requested_by, status, requested_at, notes}` |
| `metric_labels` | maps metric keys to display labels |

## 3. Routes the templates expect

| Method | Path | Template / behaviour |
| --- | --- | --- |
| GET | `/admin/login` | `login.html` |
| POST | `/admin/login` | validate → set HTTP-only cookie → `303` |
| POST | `/admin/logout` | clear cookie → `303 /admin/login` |
| GET | `/admin` | `dashboard.html` |
| GET | `/admin/catalogue` | `catalogue.html` (`q`, `type`, `category`, `page`) |
| GET/POST | `/admin/catalogue/new` | `catalogue_form.html` (create) |
| GET/POST | `/admin/catalogue/{id}/edit` | `catalogue_form.html` (update) |
| POST | `/admin/catalogue/{id}/delete` | delete → `303` back with `flash` |
| GET | `/admin/users` | `users.html` |
| GET | `/admin/models` | `models.html` |
| POST | `/admin/models/retrain` | queue job → `303` |
| POST | `/admin/models/{version}/activate` | activate → `303` |

Any request that mutates state redirects with `303` and a `flash` query parameter.

The templates never perform privileged work themselves: account deletion, model
training and data export stay on the backend.

## 4. Notes

* **Auth** is a signed, HttpOnly cookie set by the backend. The portal needs no
  JavaScript token handling; every page is rendered server-side.
* **Progressive enhancement** — search filtering, the mobile drawer and confirm
  dialogs work only with `admin.js`; every page is usable without it.
* **Responsive** — sidebar collapses into a drawer below 860 px, tables scroll
  horizontally, forms go single column below 560 px.
* **Shared design tokens** are duplicated at the top of `static/css/admin.css`;
  keep them in sync with `mobile/src/theme/tokens.ts`.
* The portal has no build step: HTML, CSS and JS are served as-is.
