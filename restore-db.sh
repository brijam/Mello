#!/usr/bin/env bash
# Upload a dump produced by dump-db.sh to a remote Linode host and restore it
# into the production Mello database. DESTRUCTIVE: drops and recreates the
# target DB. Run from your workstation; needs SSH access as a sudo-capable user.
set -euo pipefail

usage() {
  cat <<USAGE
Usage: $0 <dump-file.sql> <user@host> [--yes]

  <dump-file.sql>   Local plain-SQL dump (output of dump-db.sh).
  <user@host>       SSH target (must be able to sudo without prompting,
                    or you'll be asked for the sudo password interactively).
  --yes             Skip the confirmation prompt.

This script will:
  1. scp the dump to /tmp on the remote host.
  2. Stop the running 'mello' Node process if found (best-effort pkill).
  3. Drop & recreate the 'mello' database (owned by 'mello' role).
  4. psql -f the dump as the 'mello' role (creds read from /etc/mello/mello.env).
  5. Remove the temp file.

It will NOT restart the Mello server — start it manually with start-prod.sh.
USAGE
  exit 1
}

[[ $# -ge 2 ]] || usage
DUMP_FILE="$1"
SSH_TARGET="$2"
ASSUME_YES="${3:-}"

[[ -f "$DUMP_FILE" ]] || { echo "Dump file not found: $DUMP_FILE" >&2; exit 1; }

REMOTE_TMP="/tmp/mello-restore-$(date +%s).sql"

if [[ "$ASSUME_YES" != "--yes" ]]; then
  cat <<WARN
About to OVERWRITE the production Mello database on ${SSH_TARGET}.
  Local dump : ${DUMP_FILE}  ($(wc -c < "$DUMP_FILE") bytes)
  Remote DB  : mello (will be dropped and recreated)
WARN
  read -r -p "Type the database name 'mello' to proceed: " confirm
  [[ "$confirm" == "mello" ]] || { echo "Aborted."; exit 1; }
fi

echo "==> Uploading dump to ${SSH_TARGET}:${REMOTE_TMP}"
scp "$DUMP_FILE" "${SSH_TARGET}:${REMOTE_TMP}"

echo "==> Restoring on remote"
ssh "$SSH_TARGET" "REMOTE_TMP='${REMOTE_TMP}' sudo -E bash -s" <<'REMOTE'
set -euo pipefail

ENV_FILE="/etc/mello/mello.env"
[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE on remote" >&2; exit 1; }

# Parse DATABASE_URL into psql-friendly env vars.
# Expected form: postgresql://USER:PASS@HOST:PORT/DBNAME
DB_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2-)"
[[ -n "$DB_URL" ]] || { echo "DATABASE_URL not in $ENV_FILE" >&2; exit 1; }

re='^postgresql://([^:]+):([^@]+)@([^:/]+):?([0-9]*)/(.+)$'
[[ "$DB_URL" =~ $re ]] || { echo "Could not parse DATABASE_URL" >&2; exit 1; }
DB_USER="${BASH_REMATCH[1]}"
DB_PASS="${BASH_REMATCH[2]}"
DB_HOST="${BASH_REMATCH[3]}"
DB_PORT="${BASH_REMATCH[4]:-5432}"
DB_NAME="${BASH_REMATCH[5]}"

echo "  -> stopping any running mello node process (best effort)"
pkill -u mello -f 'node .*server/dist/index.js' || true
sleep 1

echo "  -> dropping and recreating database ${DB_NAME}"
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DROP DATABASE IF EXISTS ${DB_NAME};
CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};
SQL

echo "  -> restoring dump into ${DB_NAME}"
PGPASSWORD="$DB_PASS" psql \
  -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -v ON_ERROR_STOP=1 -f "$REMOTE_TMP"

echo "  -> cleaning up ${REMOTE_TMP}"
rm -f "$REMOTE_TMP"

echo "  -> done. Start the app with: sudo /opt/mello-repo/start-prod.sh"
REMOTE
