"""Supervisor wrapper: boots the existing FastAPI backend from services/backend.

The preview environment expects `uvicorn server:app` from `/app/backend` on port
8001. The real code lives in `/app/services/backend/app`. We reuse that in-place
and just expose `app` here.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

_SERVICES_BACKEND = Path(__file__).resolve().parent.parent / "services" / "backend"
if str(_SERVICES_BACKEND) not in sys.path:
    sys.path.insert(0, str(_SERVICES_BACKEND))

# Ensure SQLite DB writes to a stable absolute location (default in config is
# a relative path resolved against cwd, which is fine, but we make it explicit
# so tests and supervisor start behave identically).
os.environ.setdefault(
    "DATABASE_URL", f"sqlite+pysqlite:///{_SERVICES_BACKEND}/mma.db"
)
os.environ.setdefault("JWT_SECRET", "medmove-ai-preview-jwt-secret-please-change")
os.environ.setdefault(
    "CORS_ORIGINS",
    '["http://localhost:3000","http://localhost:19006","http://localhost:8081","*"]',
)
os.environ.setdefault(
    "ALLOWED_HOSTS",
    '["localhost","127.0.0.1","testserver","*"]',
)

from app.main import create_app  # noqa: E402

app = create_app()
