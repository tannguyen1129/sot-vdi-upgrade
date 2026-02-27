#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKER_DIR="${ROOT_DIR}/deploy/worker-node"

if [[ ! -d "${WORKER_DIR}" ]]; then
  echo "[bootstrap-worker] missing directory: ${WORKER_DIR}"
  exit 1
fi

ACTION="${1:-up}"

case "${ACTION}" in
  up|start)
    exec "${WORKER_DIR}/start.sh"
    ;;
  down|stop)
    exec "${WORKER_DIR}/stop.sh"
    ;;
  status|ps)
    exec "${WORKER_DIR}/status.sh"
    ;;
  logs)
    shift || true
    if [[ ! -f "${WORKER_DIR}/.env.worker" ]]; then
      echo "[bootstrap-worker] .env.worker not found at ${WORKER_DIR}"
      exit 1
    fi
    set -a
    source "${WORKER_DIR}/.env.worker"
    set +a
    PROJECT_NAME="${COMPOSE_PROJECT_NAME:-vdi-worker-${WORKER_CODE:-node}}"
    exec docker compose \
      --project-name "${PROJECT_NAME}" \
      --env-file "${WORKER_DIR}/.env.worker" \
      -f "${WORKER_DIR}/docker-compose.worker.yml" \
      logs -f "$@"
    ;;
  *)
    cat <<EOF
Usage:
  ./bootstrap-worker.sh up       # start worker stack
  ./bootstrap-worker.sh down     # stop worker stack
  ./bootstrap-worker.sh status   # show worker stack status
  ./bootstrap-worker.sh logs     # follow worker stack logs

Notes:
  - First run will create deploy/worker-node/.env.worker from template.
  - Edit deploy/worker-node/.env.worker before running again.
EOF
    exit 1
    ;;
esac
