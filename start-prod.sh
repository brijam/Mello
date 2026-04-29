#!/usr/bin/env bash
# Install (idempotent) and start the Mello systemd service.
# Run as root.
set -euo pipefail

REPO_DIR="/opt/mello-repo"
SERVICE_USER="mello"
SERVICE_GROUP="mello"
SERVICE_HOME="/var/lib/mello"
ENV_FILE="/etc/mello/mello.env"
UNIT_NAME="mello"
UNIT_PATH="/etc/systemd/system/${UNIT_NAME}.service"

[[ $EUID -eq 0 ]] || { echo "Run as root." >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "Missing ${ENV_FILE}. Run install-prod.sh first." >&2; exit 1; }
command -v systemctl >/dev/null || { echo "systemctl not found." >&2; exit 1; }

# ── Build (clean) as the service user ─────────────────────────────────────────
run_as_mello() {
  sudo -u "$SERVICE_USER" \
    HOME="$SERVICE_HOME" \
    npm_config_cache="${SERVICE_HOME}/.npm" \
    PATH="/usr/bin:/usr/local/bin:$PATH" \
    bash -c "cd '${REPO_DIR}' && umask 002 && $*"
}

echo "==> Repo state"
git -C "$REPO_DIR" log -1 --oneline
git -C "$REPO_DIR" status --short || true

echo "==> Repair ownership/perms so the ${SERVICE_USER} user can write"
# git pull (as root) writes files owned by root. Re-establish the mello-group
# ownership and group-rwX perms install-prod.sh originally set, otherwise
# npm install (run as mello) hits EACCES on package-lock.json etc.
chgrp -R "$SERVICE_GROUP" "$REPO_DIR"
chmod -R g+rwX "$REPO_DIR"
find "$REPO_DIR" -type d -exec chmod g+s {} +

echo "==> Nuke build outputs, tsbuildinfo files, and EVERY node_modules/"
rm -rf "${REPO_DIR}/packages/shared/dist" \
       "${REPO_DIR}/server/dist" \
       "${REPO_DIR}/client/dist" \
       "${REPO_DIR}/server/tsconfig.tsbuildinfo" \
       "${REPO_DIR}/packages/shared/tsconfig.tsbuildinfo" \
       "${REPO_DIR}/client/tsconfig.tsbuildinfo"
find "$REPO_DIR" -type d -name node_modules -prune -exec rm -rf {} +

echo "==> Fresh npm install"
run_as_mello "npm install --no-audit --no-fund"

echo "==> Sanity: source admin.ts has the schemas we expect"
for sym in adminCreateUserSchema adminUpdateUserSchema adminResetPasswordSchema \
           adminSetBoardRoleSchema adminSetWorkspaceRoleSchema; do
  if ! grep -q "$sym" "${REPO_DIR}/packages/shared/src/schemas/admin.ts"; then
    echo "ERROR: ${sym} missing from src/schemas/admin.ts — git pull didn't bring in the latest source" >&2
    exit 1
  fi
done

echo "==> Build @mello/shared"
run_as_mello "npm run build --workspace=@mello/shared"
[[ -f "${REPO_DIR}/packages/shared/dist/index.js" ]] \
  || { echo "shared build did not produce dist/index.js" >&2; exit 1; }
[[ -f "${REPO_DIR}/packages/shared/dist/schemas/admin.d.ts" ]] \
  || { echo "shared build did not produce schemas/admin.d.ts" >&2; exit 1; }

# Sanity check: the schemas the server is going to import must be present.
for sym in adminCreateUserSchema adminUpdateUserSchema adminResetPasswordSchema \
           adminSetBoardRoleSchema adminSetWorkspaceRoleSchema; do
  if ! grep -q "$sym" "${REPO_DIR}/packages/shared/dist/schemas/admin.d.ts"; then
    echo "ERROR: ${sym} missing from packages/shared/dist/schemas/admin.d.ts" >&2
    echo "       Source has it? $(grep -c "$sym" "${REPO_DIR}/packages/shared/src/schemas/admin.ts" || true) match(es) in src/schemas/admin.ts" >&2
    exit 1
  fi
done

echo "==> Verify server resolves @mello/shared to the freshly built dist"
SHARED_LINK="${REPO_DIR}/node_modules/@mello/shared"
ls -la "${REPO_DIR}/node_modules/@mello/" || true
if [[ ! -e "${SHARED_LINK}" ]]; then
  echo "ERROR: ${SHARED_LINK} does not exist — npm install did not link the workspace" >&2
  exit 1
fi
RESOLVED_ADMIN="$(readlink -f "${SHARED_LINK}")/dist/schemas/admin.d.ts"
echo "    server will read: ${RESOLVED_ADMIN}"
if ! grep -q adminSetWorkspaceRoleSchema "${RESOLVED_ADMIN}"; then
  echo "ERROR: ${RESOLVED_ADMIN} does not contain adminSetWorkspaceRoleSchema" >&2
  echo "       readlink target: $(readlink -f "${SHARED_LINK}")" >&2
  echo "       contents:"  >&2
  ls -la "$(readlink -f "${SHARED_LINK}")/dist/schemas/" >&2
  exit 1
fi

echo "==> Build @mello/server"
run_as_mello "npm run build --workspace=@mello/server"
[[ -f "${REPO_DIR}/server/dist/index.js" ]] \
  || { echo "server build did not produce dist/index.js" >&2; exit 1; }

echo "==> Build @mello/client"
run_as_mello "npm run build --workspace=@mello/client"
[[ -f "${REPO_DIR}/client/dist/index.html" ]] \
  || { echo "client build did not produce dist/index.html" >&2; exit 1; }

echo "==> Running database migrations"
set -a; . "$ENV_FILE"; set +a
run_as_mello "cd server && DATABASE_URL='${DATABASE_URL}' npx drizzle-kit migrate"

NEW_UNIT="$(mktemp)"
cat > "$NEW_UNIT" <<EOF
[Unit]
Description=Mello server
After=network-online.target postgresql.service redis-server.service
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_GROUP}
WorkingDirectory=${REPO_DIR}/server
EnvironmentFile=${ENV_FILE}
Environment=NODE_ENV=production
Environment=HOME=${SERVICE_HOME}
ExecStart=/usr/bin/node ${REPO_DIR}/server/dist/index.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${UNIT_NAME}

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=${REPO_DIR}/server/data ${REPO_DIR}/server/uploads ${SERVICE_HOME}

[Install]
WantedBy=multi-user.target
EOF

if ! cmp -s "$NEW_UNIT" "$UNIT_PATH" 2>/dev/null; then
  echo "==> Installing ${UNIT_PATH}"
  install -m 0644 "$NEW_UNIT" "$UNIT_PATH"
  systemctl daemon-reload
else
  echo "==> ${UNIT_PATH} already up to date"
fi
rm -f "$NEW_UNIT"

echo "==> Enabling and (re)starting ${UNIT_NAME}"
systemctl enable "$UNIT_NAME" >/dev/null
if ! systemctl restart "$UNIT_NAME"; then
  echo "ERROR: systemctl restart ${UNIT_NAME} failed" >&2
  systemctl --no-pager --full status "$UNIT_NAME" >&2 || true
  echo "---- last 60 journal lines ----" >&2
  journalctl -u "$UNIT_NAME" --no-pager -n 60 >&2 || true
  exit 1
fi

# Give it a moment to either come up or crash.
for _ in 1 2 3 4 5 6 7 8 9 10; do
  STATE="$(systemctl is-active "$UNIT_NAME" || true)"
  case "$STATE" in
    active) break ;;
    failed)
      echo "ERROR: ${UNIT_NAME} entered failed state" >&2
      systemctl --no-pager --full status "$UNIT_NAME" >&2
      echo "---- last 60 journal lines ----" >&2
      journalctl -u "$UNIT_NAME" --no-pager -n 60 >&2
      exit 1
      ;;
    *) sleep 1 ;;
  esac
done

if [[ "$(systemctl is-active "$UNIT_NAME")" != "active" ]]; then
  echo "ERROR: ${UNIT_NAME} never reached 'active' state (currently: $(systemctl is-active "$UNIT_NAME"))" >&2
  systemctl --no-pager --full status "$UNIT_NAME" >&2
  echo "---- last 60 journal lines ----" >&2
  journalctl -u "$UNIT_NAME" --no-pager -n 60 >&2
  exit 1
fi

echo
systemctl --no-pager --full status "$UNIT_NAME"

cat <<EOM

Useful commands:
  systemctl status ${UNIT_NAME}
  systemctl restart ${UNIT_NAME}
  systemctl stop ${UNIT_NAME}
  journalctl -u ${UNIT_NAME} -f
EOM
