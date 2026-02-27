#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [[ ! -f ".env.worker" ]]; then
  cp .env.worker.example .env.worker
  echo "[start] Created .env.worker from template."
  echo "[start] Please edit .env.worker, then run ./start.sh again."
  exit 1
fi

set -a
source ./.env.worker
set +a

PROJECT_NAME="${COMPOSE_PROJECT_NAME:-vdi-worker-${WORKER_CODE:-node}}"
EXAM_IMAGE_NAME="${EXAM_IMAGE_NAME:-sot-exam-linux:latest}"
EXAM_IMAGE_CONTEXT="${EXAM_IMAGE_CONTEXT:-./exam-linux}"
FORCE_REBUILD_EXAM_IMAGE="${FORCE_REBUILD_EXAM_IMAGE:-false}"

if [[ ! -f "${EXAM_IMAGE_CONTEXT}/Dockerfile" ]]; then
  echo "[start] missing ${EXAM_IMAGE_CONTEXT}/Dockerfile"
  exit 1
fi

need_build="false"
if [[ "${FORCE_REBUILD_EXAM_IMAGE,,}" == "true" || "${FORCE_REBUILD_EXAM_IMAGE}" == "1" ]]; then
  need_build="true"
elif ! docker image inspect "${EXAM_IMAGE_NAME}" >/dev/null 2>&1; then
  need_build="true"
fi

build_exam_image() {
  local log_file
  log_file="$(mktemp)"

  echo "[start] building exam image (buildkit): ${EXAM_IMAGE_NAME} from ${EXAM_IMAGE_CONTEXT}"
  if docker build -t "${EXAM_IMAGE_NAME}" "${EXAM_IMAGE_CONTEXT}" 2>&1 | tee "${log_file}"; then
    rm -f "${log_file}"
    return 0
  fi

  if grep -qiE "parent snapshot .* does not exist|failed to prepare extraction snapshot|snapshot.*not found" "${log_file}"; then
    echo "[start] detected BuildKit snapshot/cache corruption."
    echo "[start] pruning builder cache and retrying with legacy builder..."
    docker builder prune -af >/dev/null 2>&1 || true
    docker buildx prune -af >/dev/null 2>&1 || true
    DOCKER_BUILDKIT=0 docker build -t "${EXAM_IMAGE_NAME}" "${EXAM_IMAGE_CONTEXT}"
    rm -f "${log_file}"
    return 0
  fi

  rm -f "${log_file}"
  return 1
}

if [[ "${need_build}" == "true" ]]; then
  build_exam_image
else
  echo "[start] exam image exists: ${EXAM_IMAGE_NAME}"
fi

echo "[start] project=${PROJECT_NAME}"
docker compose \
  --project-name "${PROJECT_NAME}" \
  --env-file .env.worker \
  -f docker-compose.worker.yml \
  up -d --build

docker compose \
  --project-name "${PROJECT_NAME}" \
  --env-file .env.worker \
  -f docker-compose.worker.yml \
  ps
