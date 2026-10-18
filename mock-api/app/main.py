"""FastAPI application entry point.

Run locally with::

    cd backend
    ./run.sh                    # http://127.0.0.1:8000
    # or: uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

The same server hosts the JSON API consumed by the Expo mobile app *and* the
Jinja-rendered Admin Web Portal, so both frontends share one backend.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from . import db
from pathlib import Path

from .config import settings
from .routers import account, admin, catalogue, chat, children, favourites, reports

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init_db()
    logging.getLogger(__name__).info("Database ready at %s", settings.database_path)
    yield


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description=(
        "Age-safe conversational media recommendations for children. "
        "Shared REST API for the Expo mobile app and the Admin Web Portal."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount(
    "/static",
    StaticFiles(directory=str(Path(settings.admin_portal_dir) / "static")),
    name="static",
)

app.include_router(account.router)
app.include_router(children.router)
app.include_router(catalogue.router)
app.include_router(chat.router)
app.include_router(reports.router)
app.include_router(favourites.router)
app.include_router(admin.router)


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Return a predictable error envelope the mobile client can display."""
    problems = []
    for error in exc.errors():
        location = ".".join(str(part) for part in error.get("loc", []) if part != "body")
        problems.append({"field": location, "message": error.get("msg", "Invalid value")})
    first = problems[0]["message"] if problems else "Invalid request"
    return JSONResponse(
        status_code=422,
        content={"detail": first, "errors": problems, "path": request.url.path},
    )


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    return RedirectResponse("/admin", status_code=307)


@app.get("/healthz", tags=["meta"])
def healthz() -> dict:
    return {
        "status": "ok",
        "app": settings.app_name,
        "environment": settings.environment,
        "auth_mode": "firebase" if settings.firebase_ready else ("dev" if settings.dev_auth else "closed"),
        "database": settings.database_path,
    }


@app.get("/config", tags=["meta"])
def client_config() -> dict:
    """Non-secret configuration the mobile app reads at boot."""
    return {
        "app_name": settings.app_name,
        "max_recommendations": settings.max_recommendations,
        "default_recommendations": settings.default_recommendations,
        "dev_auth": settings.dev_auth,
        "firebase_configured": settings.firebase_ready,
    }
