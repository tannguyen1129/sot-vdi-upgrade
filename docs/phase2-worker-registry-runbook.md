# Phase 2 Runbook: Worker Registry + Cluster Capacity

## Mục tiêu
- Biết chính xác năng lực toàn cụm theo thời gian thực.
- Cho phép worker node gửi heartbeat để control plane tổng hợp slot.
- Chuẩn bị nền tảng cho scheduler phân tán ở phase kế tiếp.

## API mới
- `POST /api/vdi/workers/heartbeat`
  - Header: `x-worker-token` (nếu cấu hình `WORKER_HEARTBEAT_TOKEN`)
  - Body mẫu:
    ```json
    {
      "code": "worker-node-2",
      "name": "Worker Node 2",
      "apiBaseUrl": "https://worker2.example.edu.vn",
      "totalCpuCores": 32,
      "totalMemoryMb": 65536,
      "reservedCpuCores": 4,
      "reservedMemoryMb": 8192,
      "vmCpuCores": 1.5,
      "vmMemoryMb": 2048,
      "activeSessions": 11
    }
    ```
- `GET /api/vdi/workers` (ADMIN/PROCTOR)
- `GET /api/vdi/workers/summary` (ADMIN/PROCTOR)
- `PATCH /api/vdi/workers/:code` (ADMIN/PROCTOR)
  - Body: `{ "isDraining": true }` hoặc `{ "isEnabled": false }`
- `POST /api/vdi/workers/reconcile` (ADMIN/PROCTOR)
  - Dọn stale dispatch ngay lập tức (manual reconcile).
- `POST /api/vdi/cluster/allocate` (internal worker API)
- `POST /api/vdi/cluster/release` (internal worker API)
- `POST /api/vdi/cluster/prewarm` (internal worker API)

## Cách tính slot
- `maxSessions = min(floor((CPU_total - CPU_reserved) / vmCpu), floor((RAM_total - RAM_reserved) / vmMem))`
- `availableSessions = maxSessions - activeSessions`
- Worker healthy khi heartbeat trong `WORKER_HEARTBEAT_TTL_SEC`.
- Sticky exam TTL mặc định 21600s (`WORKER_STICKY_EXAM_TTL_SEC`).

## Vận hành thực tế
1. Trên từng worker node, chạy cron/service gửi heartbeat mỗi 15-30 giây về control plane.
2. Trên trang Admin Kỳ thi, theo dõi:
   - `workers healthy/total`
   - `slots available/max`
   - `active sessions`
3. Nếu worker mất heartbeat quá TTL:
   - Worker bị đánh unhealthy
   - Slot của node đó không tính vào tổng khả dụng.

## Cài nhanh heartbeat trên worker (khuyến nghị)
```bash
cd /root/vdi-sot/sot-vdi-gateway
CONTROL_PLANE_API_BASE="https://sotvdi.umtoj.edu.vn/api" \
WORKER_CODE="worker-node-2" \
WORKER_NAME="Worker Node 2" \
WORKER_API_BASE_URL="https://worker2.example.edu.vn" \
WORKER_CLUSTER_TOKEN="change-me" \
WORKER_RESERVED_CPUS="4" \
WORKER_RESERVED_MEMORY_MB="8192" \
VM_CPU_CORES="1.5" \
VM_MEMORY_MB="2048" \
HEARTBEAT_INTERVAL_SEC="20" \
./scripts/worker-heartbeat.sh
```

## Cài worker bằng 1 lệnh (khuyến nghị production)
```bash
cp deploy/worker-node/.env.worker.example deploy/worker-node/.env.worker
# sửa deploy/worker-node/.env.worker cho đúng WORKER_CODE / DB / TOKEN
./bootstrap-worker.sh up
```
- Pack worker đã kèm `deploy/worker-node/exam-linux`; `start.sh` tự build `EXAM_IMAGE_NAME` nếu chưa có image.

### Port/IP checklist khi nối với Main Server
- `WORKER_API_BASE_URL`: URL main server gọi vào worker (phải reachable từ main).
  - Ví dụ: `http://203.0.113.20:3000` hoặc `https://worker2.example.edu.vn`
- `CONTROL_PLANE_API_BASE`: URL worker gọi ngược về main.
  - Ví dụ: `https://sotvdi.umtoj.edu.vn/api` (port 443)
- `DB_HOST`: IP/hostname PostgreSQL trung tâm.
  - Ví dụ private IP: `10.10.10.10` (port 5432)
- Mở firewall:
  - Main -> Worker: `3000/tcp` (hoặc `443/tcp` nếu dùng reverse proxy TLS)
  - Worker -> Main API: `443/tcp`
  - Worker -> DB: `5432/tcp`

## Phase 2.1: Remote Dispatch
- Control plane chọn worker theo `availableSessions` cao nhất.
- Sticky scheduling theo exam:
  - Redis key `vdi:sticky:exam:{examId}:worker` giữ worker ưu tiên cho kỳ thi.
  - Redis hash `vdi:sticky:exam:{examId}:affinity` theo dõi số session của exam trên từng worker để ưu tiên gom cùng node.
- Worker `isDraining=true` sẽ bị scheduler bỏ qua cho session mới.
- Worker `isEnabled=false` sẽ bị bỏ qua hoàn toàn.
- Nếu worker được chọn là remote:
  - Gọi `POST /api/vdi/cluster/allocate` với `x-cluster-token`.
  - Khi nộp bài, gọi `POST /api/vdi/cluster/release` đúng worker đã cấp.
- Khi prewarm kỳ thi:
  - Control plane tự chia số lượng prewarm theo `availableSessions` của từng worker.
  - Gọi `POST /api/vdi/cluster/prewarm` trên worker remote.
- Metadata dispatch được lưu trong Redis theo key:
  - `vdi:dispatch:exam:{examId}:user:{userId}`

## Drain graceful (khuyến nghị vận hành)
1. Bật drain:
   - `PATCH /api/vdi/workers/:code` body `{ "isDraining": true }`
2. Worker vẫn giữ session hiện tại; chỉ ngừng nhận session mới.
3. Theo dõi `activeSessions` đến khi về `0` (`drainStatus=drained` trên API workers).
4. Sau khi drain xong mới disable để bảo trì:
   - `PATCH /api/vdi/workers/:code` body `{ "isEnabled": false }`
5. Nếu cần ép tắt khẩn cấp (có thể làm rớt phiên thi):
   - `PATCH /api/vdi/workers/:code` body `{ "isEnabled": false, "force": true }`

## Phase 2.2: Health-aware failover + stale dispatch cleanup
- Khi allocate remote bị timeout/lỗi, control plane retry worker khác trong danh sách healthy.
  - Số lần retry cấu hình bằng `WORKER_ALLOCATE_RETRY_COUNT` (mặc định `3`).
- Sticky exam sẽ tự chuyển sang worker retry thành công.
- Job cleanup chạy định kỳ mỗi 60 giây:
  - Quét key `vdi:dispatch:exam:*:user:*`
  - Xóa dispatch không còn session thật (`vdi:session:*`) và đã stale theo `WORKER_DISPATCH_STALE_SEC`
  - Tự giảm affinity/session-counter tương ứng để không giữ số liệu ảo.

### Biến môi trường mới (khuyến nghị)
- `WORKER_ALLOCATE_RETRY_COUNT=3`
- `WORKER_DISPATCH_CLEANUP_ENABLED=true`
- `WORKER_DISPATCH_STALE_SEC=21600`
- `WORKER_DISPATCH_SCAN_COUNT=200`

### Command chạy tay trước giờ thi
```bash
curl -X POST "https://sotvdi.umtoj.edu.vn/api/vdi/workers/reconcile" \
  -H "Authorization: Bearer <ADMIN_JWT>"
```

### Deployment mẫu (Main/Worker IP cụ thể)
- Xem file: `docs/worker-deployment-217.216.33.134.md`
