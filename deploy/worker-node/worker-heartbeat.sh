#!/usr/bin/env bash
set -euo pipefail

CONTROL_PLANE_API_BASE="${CONTROL_PLANE_API_BASE:-https://sotvdi.umtoj.edu.vn/api}"
WORKER_CODE="${WORKER_CODE:-worker-unknown}"
WORKER_NAME="${WORKER_NAME:-Worker Node}"
WORKER_API_BASE_URL="${WORKER_API_BASE_URL:-}"
WORKER_CLUSTER_TOKEN="${WORKER_CLUSTER_TOKEN:-}"
WORKER_RESERVED_CPUS="${WORKER_RESERVED_CPUS:-1}"
WORKER_RESERVED_MEMORY_MB="${WORKER_RESERVED_MEMORY_MB:-1024}"
VM_CPU_CORES="${VM_CPU_CORES:-1.5}"
VM_MEMORY_MB="${VM_MEMORY_MB:-2048}"
HEARTBEAT_INTERVAL_SEC="${HEARTBEAT_INTERVAL_SEC:-20}"

active_sessions() {
  docker ps --format '{{.Names}}' 2>/dev/null | grep -Ec '^exam_' || true
}

total_cpu_cores() {
  nproc
}

total_memory_mb() {
  awk '/MemTotal:/ { printf "%d", $2/1024 }' /proc/meminfo
}

send_heartbeat() {
  local payload
  payload="$(cat <<JSON
{
  "code": "${WORKER_CODE}",
  "name": "${WORKER_NAME}",
  "apiBaseUrl": "${WORKER_API_BASE_URL}",
  "totalCpuCores": $(total_cpu_cores),
  "totalMemoryMb": $(total_memory_mb),
  "reservedCpuCores": ${WORKER_RESERVED_CPUS},
  "reservedMemoryMb": ${WORKER_RESERVED_MEMORY_MB},
  "vmCpuCores": ${VM_CPU_CORES},
  "vmMemoryMb": ${VM_MEMORY_MB},
  "activeSessions": $(active_sessions),
  "metadata": {
    "source": "deploy/worker-node/worker-heartbeat.sh"
  }
}
JSON
)"

  curl -fsS -X POST \
    "${CONTROL_PLANE_API_BASE}/vdi/workers/heartbeat" \
    -H "Content-Type: application/json" \
    -H "x-worker-token: ${WORKER_CLUSTER_TOKEN}" \
    -d "${payload}" >/dev/null
}

echo "[worker-heartbeat] start -> ${CONTROL_PLANE_API_BASE} code=${WORKER_CODE}"
while true; do
  if ! send_heartbeat; then
    echo "[worker-heartbeat] warning: failed to send heartbeat"
  fi
  sleep "${HEARTBEAT_INTERVAL_SEC}"
done
