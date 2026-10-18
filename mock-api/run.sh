#!/usr/bin/env bash
# Start the development mock API. It also serves the admin-portal frontend
# files so the portal can be opened at /admin without a real backend.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  echo "Creating virtualenv..."
  python3 -m venv .venv
  .venv/bin/pip install --upgrade pip
  .venv/bin/pip install -r requirements.txt
fi

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"
exec .venv/bin/uvicorn app.main:app --host "$HOST" --port "$PORT" ${RELOAD:+--reload}
