#!/usr/bin/env bash
# Run the Mello server in the foreground as the mello service user.
# Run as root (it drops privileges via runuser).
set -euo pipefail

REPO_DIR="/opt/mello-repo"
SERVICE_USER="mello"
ENV_FILE="/etc/mello/mello.env"

[[ $EUID -eq 0 ]] || { echo "Run as root (will drop to ${SERVICE_USER})." >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "Missing ${ENV_FILE}. Run install-prod.sh first." >&2; exit 1; }
[[ -f "${REPO_DIR}/server/dist/index.js" ]] || { echo "Server not built. Run install-prod.sh first." >&2; exit 1; }

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

cd "${REPO_DIR}/server"

exec runuser -u "$SERVICE_USER" -- env \
    NODE_ENV="${NODE_ENV:-production}" \
    PORT="${PORT}" \
    DATABASE_URL="${DATABASE_URL}" \
    REDIS_URL="${REDIS_URL}" \
    SESSION_SECRET="${SESSION_SECRET}" \
    BASE_URL="${BASE_URL}" \
    STORAGE_PATH="${STORAGE_PATH}" \
    HOME="/var/lib/mello" \
    node dist/index.js
