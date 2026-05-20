#!/usr/bin/env bash
# Update the Mello prod deploy on the Linode box.
# Pulls latest master, installs deps if the lockfile changed, rebuilds,
# runs new migrations, and restarts the systemd service.
# Run as a user that can read /etc/mello/mello.env and restart the service.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/mello-repo}"
ENV_FILE="${ENV_FILE:-/etc/mello/mello.env}"
SERVICE_NAME="${SERVICE_NAME:-mello}"
BRANCH="${BRANCH:-master}"
BACKUP_SCRIPT="${REPO_DIR}/backup-prod.sh"

SKIP_BACKUP=0
SKIP_BUILD=0
SKIP_MIGRATE=0
SKIP_INSTALL=0

usage() {
  cat <<USAGE
Usage: $0 [--skip-backup] [--skip-install] [--skip-build] [--skip-migrate]

Steps:
  1. ./backup-prod.sh --db-only   (unless --skip-backup)
  2. git fetch && git reset --hard origin/\$BRANCH
  3. npm install                  (only if package-lock.json changed)
  4. npm run build                (unless --skip-build)
  5. drizzle-kit migrate          (only if new migration files appeared)
  6. systemctl restart \$SERVICE_NAME

Env overrides: REPO_DIR, ENV_FILE, SERVICE_NAME, BRANCH
USAGE
  exit 1
}

for arg in "$@"; do
  case "$arg" in
    -h|--help) usage ;;
    --skip-backup) SKIP_BACKUP=1 ;;
    --skip-install) SKIP_INSTALL=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --skip-migrate) SKIP_MIGRATE=1 ;;
    *) usage ;;
  esac
done

[[ -d "$REPO_DIR/.git" ]] || { echo "Not a git repo: ${REPO_DIR}" >&2; exit 1; }
[[ -r "$ENV_FILE" ]] || { echo "Cannot read ${ENV_FILE}" >&2; exit 1; }

cd "$REPO_DIR"

OLD_SHA="$(git rev-parse HEAD)"
OLD_LOCK_HASH="$(sha1sum package-lock.json 2>/dev/null | awk '{print $1}' || echo none)"
OLD_MIGRATIONS="$(ls server/src/db/migrations/*.sql 2>/dev/null | wc -l)"

if [[ "$SKIP_BACKUP" != "1" ]]; then
  if [[ -x "$BACKUP_SCRIPT" ]]; then
    echo "==> Running pre-deploy DB backup"
    "$BACKUP_SCRIPT" --db-only
  else
    echo "WARN: ${BACKUP_SCRIPT} not executable, skipping backup" >&2
  fi
fi

echo "==> Fetching origin/${BRANCH}"
git fetch origin "$BRANCH"
NEW_SHA="$(git rev-parse "origin/${BRANCH}")"

if [[ "$OLD_SHA" == "$NEW_SHA" ]]; then
  echo "Already at ${NEW_SHA}. Nothing to deploy."
  exit 0
fi

echo "==> Updating ${OLD_SHA:0:10} -> ${NEW_SHA:0:10}"
git reset --hard "origin/${BRANCH}"

NEW_LOCK_HASH="$(sha1sum package-lock.json 2>/dev/null | awk '{print $1}' || echo none)"
NEW_MIGRATIONS="$(ls server/src/db/migrations/*.sql 2>/dev/null | wc -l)"

if [[ "$SKIP_INSTALL" != "1" && "$OLD_LOCK_HASH" != "$NEW_LOCK_HASH" ]]; then
  echo "==> package-lock.json changed; running npm install"
  npm install
else
  echo "==> Skipping npm install (lockfile unchanged)"
fi

if [[ "$SKIP_BUILD" != "1" ]]; then
  echo "==> npm run build"
  npm run build
fi

if [[ "$SKIP_MIGRATE" != "1" && "$NEW_MIGRATIONS" -gt "$OLD_MIGRATIONS" ]]; then
  echo "==> New migrations detected (${OLD_MIGRATIONS} -> ${NEW_MIGRATIONS}); running drizzle-kit migrate"
  (cd server && npx drizzle-kit migrate)
else
  echo "==> Skipping migrations (no new files)"
fi

echo "==> Restarting ${SERVICE_NAME}"
sudo systemctl restart "$SERVICE_NAME"
sleep 2
sudo systemctl --no-pager status "$SERVICE_NAME" | head -n 15

echo "Done. Deployed ${NEW_SHA:0:10}."
