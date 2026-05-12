#!/usr/bin/env bash
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: ./dump-db.sh <filename>"
  echo "Example: ./dump-db.sh backup-2026-04-11.sql"
  exit 1
fi

# Load .env if present
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-mello}"
DB_USER="${DB_USER:-mello}"

# pg_dump ships with PostgreSQL but may not be on PATH
if ! command -v pg_dump &>/dev/null; then
  PG_BIN=$(ls -d /c/Program\ Files/PostgreSQL/*/bin 2>/dev/null | tail -1)
  if [ -n "$PG_BIN" ]; then
    export PATH="$PG_BIN:$PATH"
  else
    echo "Error: pg_dump not found. Add your PostgreSQL bin directory to PATH."
    echo "  e.g. export PATH=\"/c/Program Files/PostgreSQL/16/bin:\$PATH\""
    exit 1
  fi
fi

PGPASSWORD="${DB_PASSWORD:-changeme}" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-owner \
  --no-acl \
  -F p \
  -f "$1"

echo "Database dumped to $1"
