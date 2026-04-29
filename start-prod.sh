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
[[ -f "${REPO_DIR}/server/dist/index.js" ]] || { echo "Server not built. Run install-prod.sh first." >&2; exit 1; }
command -v systemctl >/dev/null || { echo "systemctl not found." >&2; exit 1; }

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
systemctl restart "$UNIT_NAME"

echo
systemctl --no-pager --full status "$UNIT_NAME" || true

cat <<EOM

Useful commands:
  systemctl status ${UNIT_NAME}
  systemctl restart ${UNIT_NAME}
  systemctl stop ${UNIT_NAME}
  journalctl -u ${UNIT_NAME} -f
EOM
