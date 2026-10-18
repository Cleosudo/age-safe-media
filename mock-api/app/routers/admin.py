"""Admin Web Portal: server-rendered pages plus protected JSON endpoints (F9, F14, F15)."""

from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import RedirectResponse

from .. import db
from ..config import settings
from ..deps import AdminApiEmail, AdminEmail, render
from ..schemas import CatalogueItemIn, RetrainRequest
from ..security import check_admin_credentials, create_session_token
from ..seed import SENSITIVITY_CATEGORIES

router = APIRouter(prefix="/admin", tags=["admin"])

PAGE_SIZE = 12


# --------------------------------------------------------------------------- #
# Authentication
# --------------------------------------------------------------------------- #
@router.get("/login")
def login_page(request: Request, next: str = "/admin", error: str = ""):
    if request.cookies.get(settings.session_cookie):
        from ..security import read_session_token

        if read_session_token(request.cookies[settings.session_cookie]):
            return RedirectResponse("/admin", status_code=status.HTTP_303_SEE_OTHER)
    return render(request, "admin/login.html", {"next": next, "error": error})


@router.post("/login")
async def login_submit(request: Request):
    form = await request.form()
    email = str(form.get("email", ""))
    password = str(form.get("password", ""))
    next_path = str(form.get("next") or "/admin")
    if not next_path.startswith("/admin"):
        next_path = "/admin"
    if check_admin_credentials(email, password):
        token = create_session_token(email)
        response = RedirectResponse(next_path, status_code=status.HTTP_303_SEE_OTHER)
        response.set_cookie(
            settings.session_cookie,
            token,
            max_age=settings.session_max_age,
            httponly=True,
            samesite="lax",
            secure=settings.environment == "production",
        )
        return response
    return render(
        request,
        "admin/login.html",
        {"next": next_path, "error": "Those credentials are not recognised.", "email": email},
    )


@router.post("/logout")
def logout():
    response = RedirectResponse("/admin/login", status_code=status.HTTP_303_SEE_OTHER)
    response.delete_cookie(settings.session_cookie)
    return response


# --------------------------------------------------------------------------- #
# Dashboard
# --------------------------------------------------------------------------- #
@router.get("")
def dashboard(request: Request, admin: AdminEmail):
    stats = db.admin_stats()
    models = db.list_models()
    parents = db.list_parents()[:5]
    parent_rows = []
    for parent in parents:
        children = db.list_children(parent["id"])
        parent_rows.append({**parent, "children": children})
    return render(
        request,
        "admin/dashboard.html",
        {
            "active_page": "dashboard",
            "stats": stats,
            "models": models[:3],
            "parents": parent_rows,
            "max_category": max([row["count"] for row in stats["top_categories"]] + [1]),
            "max_topic": max([row["count"] for row in stats["top_topics"]] + [1]),
        },
    )


# --------------------------------------------------------------------------- #
# Catalogue
# --------------------------------------------------------------------------- #
@router.get("/catalogue")
def catalogue_page(
    request: Request,
    admin: AdminEmail,
    q: str = "",
    type: str = "",
    category: str = "",
    page: int = 1,
    flash: str = "",
):
    page = max(1, page)
    items = db.list_catalogue(
        search=q,
        type_filter=type,
        category=category,
        include_inactive=True,
        limit=PAGE_SIZE + 1,
        offset=(page - 1) * PAGE_SIZE,
    )
    has_next = len(items) > PAGE_SIZE
    items = items[:PAGE_SIZE]
    categories = sorted({item["category"] for item in db.all_catalogue(include_inactive=True)})
    return render(
        request,
        "admin/catalogue.html",
        {
            "active_page": "catalogue",
            "items": items,
            "categories": categories,
            "q": q,
            "type_filter": type,
            "category_filter": category,
            "page": page,
            "has_next": has_next,
            "flash": flash,
            "total": db.admin_stats()["catalogue_items"],
            "inactive": db.admin_stats()["inactive_items"],
        },
    )


@router.get("/catalogue/new")
def catalogue_new(request: Request, admin: AdminEmail):
    return render(
        request,
        "admin/catalogue_form.html",
        {
            "active_page": "catalogue",
            "mode": "create",
            "item": {
                "id": "",
                "title": "",
                "type": "book",
                "category": "",
                "age_min": 5,
                "age_max": 9,
                "summary": "",
                "tags": [],
                "year": 2024,
                "publisher": "",
                "language": "English",
                "sensitivity": [],
                "popularity": 50,
                "cover_emoji": "📘",
                "external_links": {},
                "active": True,
            },
            "sensitivity_categories": SENSITIVITY_CATEGORIES,
            "categories": sorted({item["category"] for item in db.all_catalogue(include_inactive=True)}),
            "error": "",
        },
    )


@router.get("/catalogue/{item_id}/edit")
def catalogue_edit(item_id: str, request: Request, admin: AdminEmail):
    item = db.get_catalogue_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Catalogue item not found")
    return render(
        request,
        "admin/catalogue_form.html",
        {
            "active_page": "catalogue",
            "mode": "edit",
            "item": item,
            "sensitivity_categories": SENSITIVITY_CATEGORIES,
            "categories": sorted({item["category"] for item in db.all_catalogue(include_inactive=True)}),
            "error": "",
        },
    )


async def _form_to_item(request: Request) -> tuple[dict, str]:
    form = await request.form()
    try:
        age_min = int(str(form.get("age_min", "")).strip())
        age_max = int(str(form.get("age_max", "")).strip())
        year = int(str(form.get("year", "")).strip())
        popularity = int(str(form.get("popularity", "50")).strip() or 50)
    except ValueError:
        return {}, "Age, year and popularity must be numbers."
    if age_max < age_min:
        return {}, "Maximum age must be greater than or equal to minimum age."
    title = str(form.get("title", "")).strip()
    category = str(form.get("category", "")).strip()
    if not title or not category:
        return {}, "Title and category are required."
    tags = [tag.strip() for tag in str(form.get("tags", "")).split(",") if tag.strip()]
    links: dict[str, str] = {}
    nlb = str(form.get("link_nlb", "")).strip()
    openlibrary = str(form.get("link_open_library", "")).strip()
    if nlb:
        links["nlb"] = nlb
    if openlibrary:
        links["open_library"] = openlibrary
    if not links:
        from ..seed import _links  # local import keeps seed helpers private

        links = _links(title)
    payload = {
        "title": title,
        "type": str(form.get("type", "book")),
        "category": category,
        "age_min": age_min,
        "age_max": age_max,
        "summary": str(form.get("summary", "")).strip(),
        "tags": tags,
        "year": year,
        "publisher": str(form.get("publisher", "")).strip(),
        "language": str(form.get("language", "English")).strip() or "English",
        "sensitivity": list(form.getlist("sensitivity")),
        "popularity": max(0, min(100, popularity)),
        "cover_emoji": str(form.get("cover_emoji", "📘")).strip() or "📘",
        "external_links": links,
        "active": form.get("active") is not None,
    }
    return payload, ""


@router.post("/catalogue/new")
async def catalogue_create(request: Request, admin: AdminEmail):
    payload, error = await _form_to_item(request)
    if error:
        return render(
            request,
            "admin/catalogue_form.html",
            {
                "active_page": "catalogue",
                "mode": "create",
                "item": {**payload, "id": "", "tags": [], "external_links": {}},
                "sensitivity_categories": SENSITIVITY_CATEGORIES,
                "categories": sorted({item["category"] for item in db.all_catalogue(include_inactive=True)}),
                "error": error,
            },
        )
    item = db.create_catalogue_item(payload)
    return RedirectResponse(f"/admin/catalogue?flash={quote('Created ' + item['title'])}", status_code=303)


@router.post("/catalogue/{item_id}/edit")
async def catalogue_update(item_id: str, request: Request, admin: AdminEmail):
    existing = db.get_catalogue_item(item_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Catalogue item not found")
    payload, error = await _form_to_item(request)
    if error:
        return render(
            request,
            "admin/catalogue_form.html",
            {
                "active_page": "catalogue",
                "mode": "edit",
                "item": {**existing, **payload, "id": item_id},
                "sensitivity_categories": SENSITIVITY_CATEGORIES,
                "categories": sorted({item["category"] for item in db.all_catalogue(include_inactive=True)}),
                "error": error,
            },
        )
    db.update_catalogue_item(item_id, payload)
    return RedirectResponse(f"/admin/catalogue?flash={quote('Updated ' + payload['title'])}", status_code=303)


@router.post("/catalogue/{item_id}/delete")
def catalogue_delete(item_id: str, admin: AdminEmail):
    db.delete_catalogue_item(item_id)
    return RedirectResponse(f"/admin/catalogue?flash={quote('Item deleted')}", status_code=303)


# --------------------------------------------------------------------------- #
# Users
# --------------------------------------------------------------------------- #
@router.get("/users")
def users_page(request: Request, admin: AdminEmail, q: str = "", children: str = "", flash: str = ""):
    parents = db.list_parents(q)
    counts = db.children_count_by_parent()
    rows = []
    for parent in parents:
        parent_children = db.list_children(parent["id"])
        rows.append({**parent, "children": parent_children, "children_count": counts.get(parent["id"], 0)})
    if children == "with":
        rows = [row for row in rows if row["children_count"] > 0]
    elif children == "without":
        rows = [row for row in rows if row["children_count"] == 0]
    return render(
        request,
        "admin/users.html",
        {
            "active_page": "users",
            "rows": rows,
            "q": q,
            "children_filter": children,
            "flash": flash,
            "totals": {
                "parents": len(parents),
                "children": sum(counts.values()),
                "avg": round(sum(counts.values()) / len(parents), 1) if parents else 0,
            },
            "sensitivity_categories": SENSITIVITY_CATEGORIES,
        },
    )


# --------------------------------------------------------------------------- #
# Model management
# --------------------------------------------------------------------------- #
@router.get("/models")
def models_page(request: Request, admin: AdminEmail, flash: str = ""):
    models = db.list_models()
    active = next((model for model in models if model["status"] == "active"), None)
    return render(
        request,
        "admin/models.html",
        {
            "active_page": "models",
            "models": models,
            "active_model": active,
            "jobs": db.list_retrain_jobs(8),
            "flash": flash,
            "metric_labels": {
                "precision_at_5": "Precision@5",
                "recall_at_10": "Recall@10",
                "ndcg_at_10": "NDCG@10",
                "coverage": "Catalogue coverage",
            },
        },
    )


@router.post("/models/retrain")
async def models_retrain(request: Request, admin: AdminEmail):
    form = await request.form()
    notes = str(form.get("notes", "")).strip()
    job = db.create_retrain_job(admin, notes)
    return RedirectResponse(
        f"/admin/models?flash={quote('Retraining job ' + job['id'] + ' queued')}", status_code=303
    )


@router.post("/models/{version}/activate")
def models_activate(version: str, admin: AdminEmail):
    model = db.activate_model(version)
    if not model:
        raise HTTPException(status_code=404, detail="Model version not found")
    return RedirectResponse(
        f"/admin/models?flash={quote('Activated ' + version)}", status_code=status.HTTP_303_SEE_OTHER
    )


# --------------------------------------------------------------------------- #
# Protected JSON endpoints (used by tests and by the portal's live search)
# --------------------------------------------------------------------------- #
@router.get("/api/stats")
def api_stats(admin: AdminApiEmail) -> dict:
    return db.admin_stats()


@router.get("/api/catalogue")
def api_catalogue(
    admin: AdminApiEmail,
    q: str = "",
    type: str = "",
    category: str = "",
    page: int = 1,
    page_size: int = PAGE_SIZE,
) -> dict:
    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    rows = db.list_catalogue(
        search=q, type_filter=type, category=category, include_inactive=True,
        limit=page_size, offset=(page - 1) * page_size,
    )
    return {"items": rows, "page": page, "page_size": page_size}


@router.post("/api/catalogue", status_code=status.HTTP_201_CREATED)
def api_create_item(body: CatalogueItemIn, admin: AdminApiEmail) -> dict:
    return db.create_catalogue_item(body.model_dump())


@router.patch("/api/catalogue/{item_id}")
def api_update_item(item_id: str, body: CatalogueItemIn, admin: AdminApiEmail) -> dict:
    item = db.update_catalogue_item(item_id, body.model_dump())
    if not item:
        raise HTTPException(status_code=404, detail="Catalogue item not found")
    return item


@router.delete("/api/catalogue/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_item(item_id: str, admin: AdminApiEmail) -> None:
    if not db.delete_catalogue_item(item_id):
        raise HTTPException(status_code=404, detail="Catalogue item not found")


@router.get("/api/users")
def api_users(admin: AdminApiEmail, q: str = "") -> dict:
    parents = db.list_parents(q)
    counts = db.children_count_by_parent()
    return {
        "users": [
            {
                **parent,
                "children_count": counts.get(parent["id"], 0),
                "children": db.list_children(parent["id"]),
            }
            for parent in parents
        ],
        "count": len(parents),
    }


@router.get("/api/models")
def api_models(admin: AdminApiEmail) -> dict:
    return {"models": db.list_models(), "jobs": db.list_retrain_jobs(10)}


@router.post("/api/retrain", status_code=status.HTTP_202_ACCEPTED)
def api_retrain(body: RetrainRequest, admin: AdminApiEmail) -> dict:
    return {"job": db.create_retrain_job(admin, body.notes), "note": "Training runs off-process in the ML service."}


@router.post("/api/models/{version}/activate")
def api_activate(version: str, admin: AdminApiEmail) -> dict:
    model = db.activate_model(version)
    if not model:
        raise HTTPException(status_code=404, detail="Model version not found")
    return {"model": model}
