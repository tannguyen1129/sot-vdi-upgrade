# Worker Deployment Guide (Example thực tế)

## Bối cảnh
- Main server (Control Plane): `103.151.241.102`
- Worker node: `217.216.33.134`
- Worker cấu hình: `8 vCPU`, `12 GB RAM`

## 1. Capacity khuyến nghị cho máy 8vCPU/12GB

### Cấu hình mặc định hiện tại
- `EXAM_VM_CPUS=1.5`
- `EXAM_VM_MEMORY_MB=2048`
- `WORKER_RESERVED_CPUS=1`
- `WORKER_RESERVED_MEMORY_MB=1024`

### Tính nhanh
- CPU usable: `8 - 1 = 7`
- RAM usable: `12288 - 1024 = 11264 MB`
- By CPU: `floor(7 / 1.5) = 4`
- By RAM: `floor(11264 / 2048) = 5`
- **maxSessions = min(4, 5) = 4**

Kết luận: với profile mặc định, worker này nên đặt mục tiêu **4 thí sinh đồng thời** để mượt.

## 2. Port / kết nối bắt buộc

### Main -> Worker
- Main gọi worker qua `WORKER_API_BASE_URL`.
- Mở inbound trên worker:
  - `3000/tcp` (nếu chạy trực tiếp backend worker)
  - hoặc `443/tcp` nếu bạn có reverse proxy TLS.

### Worker -> Main
- Worker heartbeat/release/allocate call về main qua `CONTROL_PLANE_API_BASE`.
- Cho phép outbound từ worker tới main:
  - `443/tcp` (khuyến nghị HTTPS)
  - hoặc `80/tcp` nếu HTTP nội bộ.

### Worker -> Main DB
- Worker backend dùng chung PostgreSQL trung tâm.
- Cho phép outbound worker -> DB:
  - `5432/tcp`

## 3. Cấu hình `.env.worker` cho case này

Từ thư mục project:
```bash
cp deploy/worker-node/.env.worker.example deploy/worker-node/.env.worker
```

Mở `deploy/worker-node/.env.worker` và điền (ví dụ):

```dotenv
WORKER_CODE=worker-217-216-33-134
WORKER_NAME=Worker 217.216.33.134
WORKER_API_BASE_URL=http://217.216.33.134:3000
WORKER_PUBLIC_PORT=3000
WORKER_CLUSTER_TOKEN=<TRUNG_VOI_MAIN_SERVER>
CONTROL_PLANE_API_BASE=https://103.151.241.102/api
HEARTBEAT_INTERVAL_SEC=20

JWT_SECRET=<TRUNG_VOI_MAIN_SERVER>
GUAC_TOKEN_KEY=<TRUNG_VOI_MAIN_SERVER>

DB_HOST=103.151.241.102
DB_PORT=5432
DB_USER=<db_user>
DB_PASSWORD=<db_password>
DB_NAME=vdi_portal_db
TYPEORM_SYNCHRONIZE=false

EXAM_VM_USERNAME=student
EXAM_VM_PASSWORD=123456
EXAM_BROWSER_URL=https://sot.umtoj.edu.vn
EXAM_IMAGE_NAME=sot-exam-linux:latest
EXAM_IMAGE_CONTEXT=./exam-linux
EXAM_VM_MEMORY_MB=2048
EXAM_VM_CPUS=1.5
EXAM_VM_SHM_MB=512
EXAM_RESTRICT_INTERNET=true
EXAM_ALLOWED_DOMAINS=sot.umtoj.edu.vn
EXAM_ORIGIN_IP=203.210.213.198
EXAM_ALLOWED_CIDRS=103.90.220.0/22,103.151.240.0/23,103.161.22.0/23,103.162.92.0/23,103.183.108.0/23,42.1.71.0/28,42.1.110.0/28,160.19.158.0/23,42.1.76.128/28,1.55.145.0/24,42.114.75.0/24
EXAM_ALLOWED_IPS=
EXAM_FIREWALL_ENFORCE_STRICT=true
VDI_ALLOCATE_TIMEOUT_SEC=90
VDI_PREWARM_CONCURRENCY=4
VDI_PREWARM_MAX=80

WORKER_RESERVED_CPUS=1
WORKER_RESERVED_MEMORY_MB=1024
WORKER_HEARTBEAT_TTL_SEC=120
WORKER_STICKY_EXAM_TTL_SEC=21600
CLUSTER_API_TIMEOUT_MS=15000
WORKER_ALLOCATE_RETRY_COUNT=3
WORKER_DISPATCH_CLEANUP_ENABLED=true
WORKER_DISPATCH_STALE_SEC=21600
WORKER_DISPATCH_SCAN_COUNT=200
```

Ghi chú:
- Nếu `https://103.151.241.102` không có cert hợp lệ cho IP, ưu tiên dùng domain chuẩn TLS.
- Nếu chưa có domain/cert, có thể tạm dùng `http://103.151.241.102/api` trong mạng tin cậy.
- Worker pack đã có sẵn thư mục `deploy/worker-node/exam-linux`, `start.sh` sẽ tự build image nếu chưa có.
- Với `EXAM_RESTRICT_INTERNET=true`, máy thi chỉ cho outbound đến domain/IP/CIDR đã allow.

## 4. Chạy worker (1 lệnh)

Từ root project:
```bash
./bootstrap-worker.sh up
```

Nếu vừa thay đổi rule mạng (EXAM_ALLOWED_*), ép rebuild image rồi chạy lại:
```bash
cd deploy/worker-node
FORCE_REBUILD_EXAM_IMAGE=true ./start.sh
```

Kiểm tra:
```bash
./bootstrap-worker.sh status
./bootstrap-worker.sh logs
```

## 5. Checklist triển khai mượt mà

### A. Trước ngày thi
1. Main server đã chạy backend/frontend ổn định.
2. Main mở endpoint `/api/vdi/workers/heartbeat` và `/api/vdi/cluster/*`.
3. DB trung tâm cho phép kết nối từ IP worker `217.216.33.134`.
4. Worker đã pull sẵn image thi: `sot-exam-linux:latest`.

### B. T-120 phút
1. Chạy worker: `./bootstrap-worker.sh up`.
2. Vào Admin > Exams, kiểm tra worker hiện `Healthy`.
3. Xác nhận `slots available/max` đúng gần `4`.
4. Bấm prewarm theo kế hoạch (ví dụ 3 máy trước, sau đó bơm thêm).

### C. T-15 phút
1. Bấm `Reconcile now`.
2. Kiểm tra không có worker stale/drain nhầm.
3. Kiểm tra `totalAvailableSessions` đủ cho ca thi.

### D. Trong giờ thi
1. Nếu worker quá tải: bật thêm worker mới cùng quy trình.
2. Nếu cần bảo trì worker:
   - Bật `Drain`.
   - Chờ `drainStatus=drained`.
   - Sau đó mới `Disable`.

### E. Sau giờ thi
1. Có thể `./bootstrap-worker.sh down` nếu không dùng tiếp.
2. Lưu log và export dữ liệu monitor nếu cần.
