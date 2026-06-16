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
  2. npm ci                       (unless --skip-install; clean install from committed lockfile)
  3. wipe dist + npm run build    (unless --skip-build; clean rebuild, asserts client bundle emitted)
  4. npm run migrate:apply --all  (unless --skip-migrate; applies pending migrations, tracked in _manual_migrations)
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

# Load the prod env (DATABASE_URL, etc.) so the backup and migrate steps target
# the SAME database the systemd service uses. Without this, drizzle-kit falls
# back to the localhost default baked into drizzle.config.ts/config.ts and would
# "successfully" migrate the wrong database, leaving prod's schema stale.
set -a; . "$ENV_FILE"; set +a
[[ -n "${DATABASE_URL:-}" ]] || { echo "DATABASE_URL not set in ${ENV_FILE}" >&2; exit 1; }

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
  echo "==> npm ci --include=dev"
  # Clean install from the committed lockfile — never mutates package*.json,
  # so the deployed tree can't drift from the repo (and never auto-"fixes" audits).
  # --include=dev: the migrate step below needs drizzle-kit, which is a devDep;
  # since we source the prod env above (which may set NODE_ENV=production), npm
  # would otherwise omit devDependencies and leave "cannot find drizzle-kit".
  npm ci --include=dev
fi

if [[ "$SKIP_BUILD" != "1" ]]; then
  # Wipe previous build output BEFORE building. Apache's DocumentRoot is
  # client/dist, so without this a failed/partial/skipped client build would
  # silently keep serving the OLD bundle (vite only re-emits when it actually
  # runs). Clearing first means a broken build fails loudly instead of shipping
  # stale JS. Mirrors install-prod.sh.
  echo "==> Cleaning previous build output (packages/shared, server, client)"
  rm -rf packages/shared/dist server/dist client/dist

  echo "==> npm run build"
  npm run build

  # Assert the client actually re-emitted a bundle. If the client build was
  # skipped or produced nothing, fail rather than leave an empty DocumentRoot.
  if ! ls client/dist/assets/*.js >/dev/null 2>&1; then
    echo "ERROR: build finished but client/dist/assets has no JS — client bundle was not emitted. Aborting." >&2
    exit 1
  fi
  echo "==> Built client bundle (${CUR_SHA:0:10}):"
  ls -1 client/dist/assets/*.js | sed 's#^.*/#    #'
fi

if [[ "$SKIP_MIGRATE" != "1" ]]; then
  # Mask credentials when echoing the target so the journal/log shows host+db
  # but not the password.
  DB_REDACTED="$(printf '%s' "$DATABASE_URL" | sed -E 's#//[^@]*@#//***@#')"
  echo "==> apply pending migrations -> ${DB_REDACTED}"
  # NOT drizzle-kit migrate: its journal (db/migrations/meta/_journal.json) is
  # out of sync with the SQL files (0001 missing, idx gaps), so it silently
  # skips migrations — that is how prod ended up missing 0006_per_user_colors
  # and serving zero boards. apply-migration.ts ignores that journal and tracks
  # applied migrations in its own _manual_migrations table. --all is safe on a
  # fresh OR already-populated DB with no baseline step (it auto-reconciles
  # already-existing objects and aborts on any genuine error). Pass DATABASE_URL
  # explicitly so the runner can't fall back to its localhost default even if
  # the subshell loses the exported env.
  (cd server && DATABASE_URL="$DATABASE_URL" npm run migrate:apply -- --all)
fi

echo "==> Restarting ${SERVICE_NAME}"
sudo systemctl restart "$SERVICE_NAME"
sleep 2
sudo systemctl --no-pager status "$SERVICE_NAME" | head -n 15

echo "Done. Deployed ${CUR_SHA:0:10}."
