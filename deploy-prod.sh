#!/usr/bin/env bash
# Update the Mello prod deploy on the Linode box.
# Installs deps, rebuilds, runs any new migrations, and restarts the
# systemd service. Pull the repo yourself before running this.
# Run as a user that can read /etc/mello/mello.env and restart the service.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/mello-repo}"
ENV_FILE="${ENV_FILE:-/etc/mello/mello.env}"
SERVICE_NAME="${SERVICE_NAME:-mello}"
BACKUP_SCRIPT="${REPO_DIR}/backup-prod.sh"

SKIP_BACKUP=0
SKIP_BUILD=0
SKIP_MIGRATE=0
SKIP_INSTALL=0

usage() {
  cat <<USAGE
Usage: $0 [--skip-backup] [--skip-install] [--skip-build] [--skip-migrate]

Steps (each is idempotent — safe to re-run):
  1. ./backup-prod.sh --db-only   (unless --skip-backup)
  2. npm install                  (unless --skip-install; no-op when lockfile matches)
  3. npm run build                (unless --skip-build)
  4. drizzle-kit migrate          (unless --skip-migrate; only applies new migrations)
  5. systemctl restart \$SERVICE_NAME

Pull the repo before running:
  cd $REPO_DIR && git pull && ./deploy-prod.sh

Env overrides: REPO_DIR, ENV_FILE, SERVICE_NAME
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

CUR_SHA="$(git rev-parse HEAD)"
echo "==> Deploying ${CUR_SHA:0:10}"

if [[ "$SKIP_BACKUP" != "1" ]]; then
  if [[ -x "$BACKUP_SCRIPT" ]]; then
    echo "==> Running pre-deploy DB backup"
    "$BACKUP_SCRIPT" --db-only
  else
    echo "WARN: ${BACKUP_SCRIPT} not executable, skipping backup" >&2
  fi
fi

if [[ "$SKIP_INSTALL" != "1" ]]; then
  echo "==> npm install"
  npm install
fi

if [[ "$SKIP_BUILD" != "1" ]]; then
  echo "==> npm run build"
  npm run build
fi

if [[ "$SKIP_MIGRATE" != "1" ]]; then
  echo "==> drizzle-kit migrate"
  (cd server && npx drizzle-kit migrate)
fi

echo "==> Restarting ${SERVICE_NAME}"
sudo systemctl restart "$SERVICE_NAME"
sleep 2
sudo systemctl --no-pager status "$SERVICE_NAME" | head -n 15

echo "Done. Deployed ${CUR_SHA:0:10}."
