#!/usr/bin/env bash
# Restore a dump produced by dump-db.sh into the LOCAL Mello Postgres database.
# Run on the server (reads /etc/mello/mello.env) or on Windows via git bash
# (reads ./.env, same as dump-db.sh). DESTRUCTIVE: drops & recreates the DB.
set -euo pipefail

usage() {
  cat <<USAGE
Usage: $0 <dump-file.sql> [--yes]

  <dump-file.sql>   Plain-SQL dump (output of dump-db.sh).
  --yes             Skip the confirmation prompt.

Connection settings are read from (in priority order):
  1. /etc/mello/mello.env  (parses DATABASE_URL — used on the prod server)
  2. ./.env                (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD —
                            same vars dump-db.sh uses on Windows/dev)
USAGE
  exit 1
}

[[ $# -ge 1 ]] || usage
DUMP_FILE="$1"
ASSUME_YES="${2:-}"
[[ -f "$DUMP_FILE" ]] || { echo "Dump file not found: $DUMP_FILE" >&2; exit 1; }

# ── Resolve connection settings ───────────────────────────────────────────────
DB_HOST="" ; DB_PORT="" ; DB_NAME="" ; DB_USER="" ; DB_PASSWORD=""

if [[ -r /etc/mello/mello.env ]]; then
  DB_URL="$(grep -E '^DATABASE_URL=' /etc/mello/mello.env | cut -d= -f2-)"
  re='^postgresql://([^:]+):([^@]+)@([^:/]+):?([0-9]*)/(.+)$'
  if [[ "$DB_URL" =~ $re ]]; then
    DB_USER="${BASH_REMATCH[1]}"
    DB_PASSWORD="${BASH_REMATCH[2]}"
    DB_HOST="${BASH_REMATCH[3]}"
    DB_PORT="${BASH_REMATCH[4]:-5432}"
    DB_NAME="${BASH_REMATCH[5]}"
    SOURCE="/etc/mello/mello.env"
  fi
fi

if [[ -z "$DB_NAME" && -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  . <(grep -v '^#' .env)
  set +a
  SOURCE="./.env"
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-mello}"
DB_USER="${DB_USER:-mello}"
DB_PASSWORD="${DB_PASSWORD:-changeme}"
SOURCE="${SOURCE:-defaults}"

# pg_dump/psql ships with PostgreSQL but may not be on PATH (mirrors dump-db.sh)
if ! command -v psql >/dev/null 2>&1; then
  PG_BIN=$(ls -d /c/Program\ Files/PostgreSQL/*/bin 2>/dev/null | tail -1)
  if [[ -n "$PG_BIN" ]]; then
    export PATH="$PG_BIN:$PATH"
  else
    echo "Error: psql not found. Add your PostgreSQL bin directory to PATH." >&2
    exit 1
  fi
fi

# ── Confirm ───────────────────────────────────────────────────────────────────
if [[ "$ASSUME_YES" != "--yes" ]]; then
  cat <<WARN
About to OVERWRITE database '${DB_NAME}' on ${DB_HOST}:${DB_PORT} as ${DB_USER}.
  Source of creds : ${SOURCE}
  Dump file       : ${DUMP_FILE} ($(wc -c < "$DUMP_FILE") bytes)
WARN
  read -r -p "Type the database name '${DB_NAME}' to proceed: " confirm
  [[ "$confirm" == "$DB_NAME" ]] || { echo "Aborted."; exit 1; }
fi

# ── Drop + recreate via the postgres superuser when available, otherwise via
#    the app role connecting to the 'postgres' maintenance DB. ────────────────
echo "==> Dropping and recreating database ${DB_NAME}"
if command -v sudo >/dev/null 2>&1 && id postgres >/dev/null 2>&1 && [[ $EUID -eq 0 || $(id -un) == "postgres" ]] || sudo -nu postgres true 2>/dev/null; then
  sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DROP DATABASE IF EXISTS ${DB_NAME};
CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};
SQL
else
  PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
    -d postgres -v ON_ERROR_STOP=1 <<SQL
DROP DATABASE IF EXISTS ${DB_NAME};
CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};
SQL
fi

echo "==> Restoring ${DUMP_FILE} into ${DB_NAME}"
PGPASSWORD="$DB_PASSWORD" psql \
  -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -v ON_ERROR_STOP=1 -f "$DUMP_FILE"

echo "Restore complete."
