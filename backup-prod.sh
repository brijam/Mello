#!/usr/bin/env bash
# Back up the Mello prod database (and optionally attachments) on the Linode box.
# Reads DATABASE_URL from /etc/mello/mello.env. Run as root (or any user that
# can read the env file and write the destination dir).
set -euo pipefail

ENV_FILE="/etc/mello/mello.env"
REPO_DIR="/opt/mello-repo"
ATTACHMENTS_DIR="${REPO_DIR}/server/data/attachments"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/mello}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
KEEP_DAYS="${KEEP_DAYS:-14}"
INCLUDE_ATTACHMENTS="${INCLUDE_ATTACHMENTS:-1}"

usage() {
  cat <<USAGE
Usage: $0 [--db-only]

Writes:
  ${BACKUP_DIR}/mello-db-<stamp>.sql.gz
  ${BACKUP_DIR}/mello-attachments-<stamp>.tar.gz   (unless --db-only)

Env overrides: BACKUP_DIR, KEEP_DAYS (default 14), INCLUDE_ATTACHMENTS=0
USAGE
  exit 1
}

case "${1:-}" in
  -h|--help) usage ;;
  --db-only) INCLUDE_ATTACHMENTS=0 ;;
  "") ;;
  *) usage ;;
esac

[[ -r "$ENV_FILE" ]] || { echo "Cannot read ${ENV_FILE}" >&2; exit 1; }

DB_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' )"
re='^postgresql://([^:]+):([^@]+)@([^:/]+):?([0-9]*)/(.+)$'
[[ "$DB_URL" =~ $re ]] || { echo "DATABASE_URL in ${ENV_FILE} not parseable" >&2; exit 1; }
DB_USER="${BASH_REMATCH[1]}"
DB_PASSWORD="${BASH_REMATCH[2]}"
DB_HOST="${BASH_REMATCH[3]}"
DB_PORT="${BASH_REMATCH[4]:-5432}"
DB_NAME="${BASH_REMATCH[5]}"

install -d -m 0750 "$BACKUP_DIR"

DB_OUT="${BACKUP_DIR}/mello-db-${STAMP}.sql.gz"
echo "==> Dumping ${DB_NAME} -> ${DB_OUT}"
PGPASSWORD="$DB_PASSWORD" pg_dump \
  -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  --no-owner --no-acl -F p \
  | gzip -9 > "${DB_OUT}.tmp"
mv "${DB_OUT}.tmp" "$DB_OUT"
chmod 0640 "$DB_OUT"

if [[ "$INCLUDE_ATTACHMENTS" == "1" && -d "$ATTACHMENTS_DIR" ]]; then
  ATT_OUT="${BACKUP_DIR}/mello-attachments-${STAMP}.tar.gz"
  echo "==> Archiving ${ATTACHMENTS_DIR} -> ${ATT_OUT}"
  tar -czf "${ATT_OUT}.tmp" -C "$(dirname "$ATTACHMENTS_DIR")" "$(basename "$ATTACHMENTS_DIR")"
  mv "${ATT_OUT}.tmp" "$ATT_OUT"
  chmod 0640 "$ATT_OUT"
fi

if [[ "$KEEP_DAYS" -gt 0 ]]; then
  echo "==> Pruning backups older than ${KEEP_DAYS} days"
  find "$BACKUP_DIR" -maxdepth 1 -type f \
    \( -name 'mello-db-*.sql.gz' -o -name 'mello-attachments-*.tar.gz' \) \
    -mtime +"$KEEP_DAYS" -print -delete
fi

echo "Done."
ls -lh "$BACKUP_DIR" | tail -n +2
