#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [[ ! -f ".env.worker" ]]; then
  echo "[stop] .env.worker not found. Nothing to stop."
  exit 0
fi

set -a
source ./.env.worker
set +a

PROJECT_NAME="${COMPOSE_PROJECT_NAME:-vdi-worker-${WORKER_CODE:-node}}"

docker compose \
  --project-name "${PROJECT_NAME}" \
  --env-file .env.worker \
  -f docker-compose.worker.yml \
  down
