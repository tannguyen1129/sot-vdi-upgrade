# Worker Node Pack (1 lệnh chạy)

## Mục tiêu
- Khởi chạy nhanh 1 VDI Worker Node bằng `docker compose`.
- Không cần chạy thủ công nhiều `docker run`.
- Tự có heartbeat gửi về control-plane.

## Thành phần
- `worker_backend`: API nhận lệnh `allocate/release/prewarm` từ control-plane.
- `worker_guacd`: kết nối RDP vào exam containers.
- `worker_redis`: session cache nội bộ worker.
- `worker_heartbeat`: gửi heartbeat định kỳ về control-plane.
- `exam-linux/`: Dockerfile image máy thi đi kèm ngay trong pack worker.

## Yêu cầu
- Docker + Docker Compose plugin.
- Worker host truy cập được:
  - Control-plane API (`CONTROL_PLANE_API_BASE`)
  - Central PostgreSQL của hệ thống (`DB_HOST`)
- Không bắt buộc có sẵn image máy thi.
  - `start.sh` sẽ tự build `EXAM_IMAGE_NAME` từ `EXAM_IMAGE_CONTEXT` nếu chưa có.

## Cách chạy nhanh
1. Vào thư mục pack:
```bash
cd deploy/worker-node
```

2. Tạo file env:
```bash
cp .env.worker.example .env.worker
```

3. Sửa `.env.worker` (bắt buộc):
- `WORKER_CODE`, `WORKER_NAME`
- `WORKER_API_BASE_URL` (URL control-plane sẽ gọi tới worker này)
- `WORKER_CLUSTER_TOKEN` (phải khớp control-plane)
- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `JWT_SECRET`, `GUAC_TOKEN_KEY` (phải khớp control-plane)

4. Khóa Internet cho máy thi (khuyến nghị bật):
- `EXAM_RESTRICT_INTERNET=true`
- `EXAM_ALLOWED_DOMAINS=sot.umtoj.edu.vn`
- `EXAM_BROWSER_URL=https://sot.umtoj.edu.vn` (mở sẵn trang này khi click Web Browser)
- `EXAM_BROWSER_AUTOSTART=true` (vào desktop sẽ tự mở sẵn trang thi)
- `EXAM_BROWSER_PREWARM=true` (pre-warm DNS/HTTP khi VM boot)
- `EXAM_ORIGIN_IP=203.210.213.198`
- `EXAM_ALLOWED_CIDRS=...` (danh sách WAF/CD)
- `EXAM_FIREWALL_ENFORCE_STRICT=true` (fail container nếu không áp được firewall)

5. Chạy worker (1 lệnh):
```bash
./start.sh
```

Ghi chú build image:
- Mặc định build từ `./exam-linux` trong chính thư mục worker pack.
- Muốn ép build lại image mỗi lần chạy:
```bash
FORCE_REBUILD_EXAM_IMAGE=true ./start.sh
```
Khi thay đổi chính sách firewall internet, nên ép rebuild image và restart worker.

## Chạy 1 lệnh từ root project
Từ thư mục `sot-vdi-gateway`, không cần `cd`:
```bash
./bootstrap-worker.sh up
```

Lệnh tương ứng:
```bash
./bootstrap-worker.sh status
./bootstrap-worker.sh logs
./bootstrap-worker.sh down
```

## Kết nối Main Server <-> Worker (rất quan trọng)
Bạn cần điền đúng IP/domain trong `.env.worker` và mở đúng port theo chiều:

1. Main Server -> Worker API
- Dùng biến: `WORKER_API_BASE_URL`
- Ví dụ: `http://203.0.113.20:3000` hoặc `https://worker2.example.edu.vn`
- Port worker mở inbound:
  - Mặc định `WORKER_PUBLIC_PORT=3000`
  - Nếu chạy HTTPS qua reverse proxy thì mở `443` và trỏ URL HTTPS.

2. Worker -> Main Server (Control Plane)
- Dùng biến: `CONTROL_PLANE_API_BASE`
- Ví dụ: `https://sotvdi.umtoj.edu.vn/api`
- Worker phải outbound được tới port:
  - `443` (HTTPS khuyến nghị)
  - hoặc `80` nếu dùng HTTP nội bộ.

3. Worker -> Main Database
- Dùng biến: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- Thường `DB_PORT=5432`
- `DB_HOST` nên là private IP/VPN IP của DB server, ví dụ `10.10.10.10`.

4. Token và key phải đồng bộ
- `WORKER_CLUSTER_TOKEN` phải khớp control-plane (`WORKER_CLUSTER_TOKEN` hoặc `WORKER_HEARTBEAT_TOKEN` phía main).
- `JWT_SECRET` và `GUAC_TOKEN_KEY` phải giống main server.

## Gợi ý network/firewall
- Mở inbound vào worker: `3000/tcp` (hoặc `443/tcp` nếu có reverse proxy TLS).
- Cho phép outbound từ worker:
  - đến Main API `443/tcp`
  - đến DB `5432/tcp`
- Không cần public Redis/Guacd của worker ra Internet.

## Lệnh vận hành
- Xem trạng thái:
```bash
./status.sh
```

- Dừng worker:
```bash
./stop.sh
```

## Troubleshooting build image
- Nếu build lỗi kiểu `parent snapshot ... does not exist` hoặc `failed to prepare extraction snapshot`:
  - `start.sh` đã tự retry (prune builder cache + fallback `DOCKER_BUILDKIT=0`).
  - Chỉ cần chạy lại:
```bash
FORCE_REBUILD_EXAM_IMAGE=true ./start.sh
```

## Checklist trước giờ thi (T-120 phút)
1. `./start.sh`
2. Vào Admin > Exams:
- Kiểm tra worker đã `Healthy`.
- Kiểm tra slots hiển thị đúng.
3. Bấm `Prewarm` cho kỳ thi.
4. Trước giờ thi, bấm `Reconcile now` để dọn stale dispatch.

## Tài liệu mẫu theo IP thực tế
- Xem guide đầy đủ cho case:
  - Worker: `217.216.33.134`
  - Main: `103.151.241.102`
- File: [`docs/worker-deployment-217.216.33.134.md`](../../docs/worker-deployment-217.216.33.134.md)
