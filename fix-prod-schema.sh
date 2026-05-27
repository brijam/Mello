#!/usr/bin/env bash
# fix-prod-schema.sh — one-shot remediation for prod schema drift.
#
# SYMPTOM this fixes:
#   The app logs "drizzle query error / column does not exist" and pages like the
#   board/workspace view come up empty (front-end silently shows "Loading…"),
#   while the admin panel still works. Logging out/in and restarting the service
#   do NOT help.
#
# CAUSE:
#   deploy-prod.sh used to run `drizzle-kit migrate` WITHOUT loading the env file,
#   so drizzle-kit fell back to the localhost default baked into drizzle.config.ts
#   and migrated the WRONG database. The real prod DB was left missing columns the
#   deployed code requires, so every `select().from(boards|lists|cards)` (which
#   emits ALL schema columns) throws. The admin panel survives because it selects
#   explicit columns only.
#   Separately, 0001_search_vectors is absent from the Drizzle journal, so
#   `drizzle-kit migrate` never applies it — this script applies it directly.
#
# WHAT IT DOES (against the REAL prod DB from $ENV_FILE):
#   1. optional db-only backup
#   2. applies every migration SQL file (except the 0000 base schema) directly
#      with psql — NOT `drizzle-kit migrate`, because drizzle-kit is a dev
#      dependency that isn't installed on prod ("cannot find drizzle-kit").
#      All post-0000 migrations are additive and idempotent (ADD COLUMN IF NOT
#      EXISTS / DO $$ … EXCEPTION / CREATE OR REPLACE / DROP … IF EXISTS), so
#      re-running them is safe. This also covers 0001_search_vectors, which is
#      missing from the drizzle journal and would never be applied by migrate.
#   3. verifies every column/table the code needs now exists
#   4. restarts the systemd service
#
# Every step is idempotent and safe to re-run. Needs only psql (no node /
# drizzle-kit). Run on the box as a user who can read $ENV_FILE and
# sudo-restart the service.

# Re-exec under bash if started by a non-bash shell (e.g. `sh fix-prod-schema.sh`).
# This script uses bash arrays, [[ ]], and `set -o pipefail`, so it must run in
# bash regardless of how it was invoked. (This guard line is POSIX sh-safe.)
if [ -z "${BASH_VERSION:-}" ]; then exec bash "$0" "$@"; fi

set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/mello-repo}"
ENV_FILE="${ENV_FILE:-/etc/mello/mello.env}"
SERVICE_NAME="${SERVICE_NAME:-mello}"
BACKUP_SCRIPT="${REPO_DIR}/backup-prod.sh"
MIG_DIR="${REPO_DIR}/server/src/db/migrations"

SKIP_BACKUP=0
SKIP_RESTART=0

usage() {
  cat <<USAGE
Usage: $0 [--skip-backup] [--skip-restart]

Applies pending DB migrations to the REAL prod database (from \$ENV_FILE),
applies the un-journaled 0001_search_vectors migration, verifies the required
columns exist, and restarts \$SERVICE_NAME. Idempotent — safe to re-run.

Env overrides: REPO_DIR (${REPO_DIR}), ENV_FILE (${ENV_FILE}), SERVICE_NAME (${SERVICE_NAME})
USAGE
  exit 1
}

for arg in "$@"; do
  case "$arg" in
    -h|--help) usage ;;
    --skip-backup) SKIP_BACKUP=1 ;;
    --skip-restart) SKIP_RESTART=1 ;;
    *) usage ;;
  esac
done

# ── Preconditions ─────────────────────────────────────────────────────────────
[[ -d "$REPO_DIR/.git" ]] || { echo "Not a git repo: ${REPO_DIR}" >&2; exit 1; }
[[ -r "$ENV_FILE" ]]      || { echo "Cannot read ${ENV_FILE}" >&2; exit 1; }
command -v psql >/dev/null || { echo "psql not found (needed to verify + apply 0001)" >&2; exit 1; }

# Load the prod env so we hit the SAME database the systemd service uses.
set -a; . "$ENV_FILE"; set +a
[[ -n "${DATABASE_URL:-}" ]] || { echo "DATABASE_URL not set in ${ENV_FILE}" >&2; exit 1; }

# Show the target with credentials masked.
DB_REDACTED="$(printf '%s' "$DATABASE_URL" | sed -E 's#//[^@]*@#//***@#')"
echo "==> Target database: ${DB_REDACTED}"

# Fail early if we cannot actually reach it.
psql "$DATABASE_URL" -tAc 'select 1' >/dev/null \
  || { echo "ERROR: cannot connect to ${DB_REDACTED}" >&2; exit 1; }

# ── 1. Backup ─────────────────────────────────────────────────────────────────
if [[ "$SKIP_BACKUP" != "1" ]]; then
  if [[ -x "$BACKUP_SCRIPT" ]]; then
    echo "==> Pre-fix db-only backup"
    "$BACKUP_SCRIPT" --db-only
  else
    echo "WARN: ${BACKUP_SCRIPT} not executable — skipping backup" >&2
  fi
fi

# ── 2. Apply migration SQL directly via psql ─────────────────────────────────
# Apply every *.sql except the 0000 base schema (already present — the app runs;
# 0000's CREATE TABLEs are not idempotent and would error). Bash sorts the glob,
# so files apply in 0001,0002,…,NNNN order.
[[ -d "$MIG_DIR" ]] || { echo "Migrations dir not found: ${MIG_DIR}" >&2; exit 1; }
shopt -s nullglob
mig_files=("$MIG_DIR"/*.sql)
(( ${#mig_files[@]} > 0 )) || { echo "No migration .sql files in ${MIG_DIR}" >&2; exit 1; }

echo "==> Applying migrations to ${DB_REDACTED}"
applied=0
for sql in "${mig_files[@]}"; do
  base="$(basename "$sql")"
  if [[ "$base" == 0000_* ]]; then
    echo "    skip ${base} (base schema, already present)"
    continue
  fi
  echo "    apply ${base}"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$sql" >/dev/null
  applied=$((applied + 1))
done
echo "    applied ${applied} migration file(s)"

# ── 3. Verify every column/table the deployed code requires ───────────────────
echo "==> Verifying schema"
missing=()

check_col() { # table column
  local n
  n="$(psql "$DATABASE_URL" -tAc \
    "select count(*) from information_schema.columns
      where table_schema='public' and table_name='$1' and column_name='$2'")"
  [[ "$n" == "1" ]] || missing+=("$1.$2")
}
check_tbl() { # table
  local n
  n="$(psql "$DATABASE_URL" -tAc \
    "select count(*) from information_schema.tables
      where table_schema='public' and table_name='$1'")"
  [[ "$n" == "1" ]] || missing+=("table $1")
}

check_col boards   accent_color          # 0005
check_col lists    color                 # 0005
check_col cards    cover_attachment_id   # 0003
check_col cards    agent_meta            # 0004
check_col cards    search_vector         # 0001
check_col comments search_vector         # 0001
check_tbl api_keys                       # 0004

if (( ${#missing[@]} > 0 )); then
  echo "ERROR: schema still missing after migrate:" >&2
  printf '  - %s\n' "${missing[@]}" >&2
  echo "Service NOT restarted. Investigate the migrate output above." >&2
  exit 1
fi
echo "    all required columns/tables present"

# ── 4. Restart the service ────────────────────────────────────────────────────
if [[ "$SKIP_RESTART" != "1" ]]; then
  echo "==> Restarting ${SERVICE_NAME}"
  sudo systemctl restart "$SERVICE_NAME"
  sleep 2
  sudo systemctl --no-pager status "$SERVICE_NAME" | head -n 12
fi

echo "Done. Prod schema is in sync."
