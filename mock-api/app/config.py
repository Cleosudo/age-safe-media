"""Application configuration.

Everything is driven by environment variables so the same code runs locally,
on a staging box and in production.  See ``backend/.env.example``.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent                 # mock-api/
PROJECT_ROOT = ROOT_DIR.parent             # repository root


def _load_dotenv() -> None:
    """Minimal .env loader (no extra dependency, never overrides real env vars)."""
    env_file = ROOT_DIR / ".env"
    if not env_file.exists():
        return
    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_dotenv()


def _bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    app_name: str = os.getenv("APP_NAME", "Age-Safe Media Recommender")
    environment: str = os.getenv("ENVIRONMENT", "development")

    # ------------------------------------------------------------------ auth
    # DEMO/DEV MODE.  When true the API also accepts "dev:<email>" bearer
    # tokens so the mobile app can be exercised without a Firebase project.
    # NEVER enable this in production.
    dev_auth: bool = _bool("DEV_AUTH", True)
    dev_admin_email: str = os.getenv("DEV_ADMIN_EMAIL", "admin@agesafe.sg")

    # Real Firebase verification is used when a service-account file is given
    # *and* the firebase-admin package is installed.
    firebase_credentials: str = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
    firebase_project_id: str = os.getenv("FIREBASE_PROJECT_ID", "")

    # --------------------------------------------------------------- storage
    database_path: str = os.getenv("DATABASE_PATH", str(ROOT_DIR / "data" / "agesafe.db"))
    seed_demo_data: bool = _bool("SEED_DEMO_DATA", True)

    # ------------------------------------------------------- admin web portal
    session_secret: str = os.getenv("SESSION_SECRET", "dev-only-change-me")
    admin_email: str = os.getenv("ADMIN_EMAIL", "admin@agesafe.sg")
    admin_password: str = os.getenv("ADMIN_PASSWORD", "Admin123!")
    session_cookie: str = "admin_session"
    session_max_age: int = _int("SESSION_MAX_AGE", 60 * 60 * 8)

    # ---------------------------------------------------------------- portal
    # The Admin Web Portal is a frontend asset: templates + static files live in
    # ``admin-portal/`` and any FastAPI deployment can serve them.  This stub
    # simply points at that folder.
    admin_portal_dir: str = os.getenv("ADMIN_PORTAL_DIR", str(PROJECT_ROOT / "admin-portal"))

    # ------------------------------------------------------------------- api
    # Comma separated list of allowed browser origins (Expo web preview).
    cors_origins: tuple[str, ...] = tuple(
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:8081,http://127.0.0.1:8081,http://localhost:19006,"
            "http://127.0.0.1:19006,http://localhost:3000,http://127.0.0.1:3000",
        ).split(",")
        if origin.strip()
    )

    # --------------------------------------------------------------- content
    max_recommendations: int = _int("MAX_RECOMMENDATIONS", 10)
    default_recommendations: int = _int("DEFAULT_RECOMMENDATIONS", 5)

    @property
    def firebase_ready(self) -> bool:
        return bool(self.firebase_credentials) and Path(self.firebase_credentials).exists()


settings = Settings()
