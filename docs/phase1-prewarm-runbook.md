# Phase 1 Runbook: Prewarm Nhanh Trước Giờ Thi

## Mục tiêu
- Chuẩn bị sẵn pool máy thi trong 2 giờ trước giờ thi.
- Giảm thời gian `JOIN` vì ưu tiên dùng máy đã prewarm.
- Theo dõi sức chứa thực tế theo từng kỳ thi.

## API mới
- `POST /api/exams/:id/prewarm` (ADMIN/PROCTOR)
  - Body: `{ "count": 20 }`
  - Tạo trước `count` máy thi và đưa vào pool.
- `GET /api/exams/:id/capacity` (ADMIN/PROCTOR)
  - Trả về:
    - `poolAvailable`: số máy prewarm đang rảnh.
    - `activeSessions`: số phiên thi đang dùng máy.

## Quy trình vận hành (T-120 phút)
1. Kiểm tra image thi đã sẵn sàng (`EXAM_IMAGE_NAME`).
2. Chọn số lượng prewarm theo kế hoạch:
   - Ví dụ 100 thí sinh, prewarm 70-80%.
3. Gọi API prewarm theo đợt:
   - Đợt 1: 50 máy.
   - Đợt 2: 20 máy sau 5-10 phút.
4. Theo dõi `capacity` đến khi pool ổn định.
5. Trước giờ thi 15 phút, bơm nốt phần thiếu (nếu có).

## Biến môi trường gợi ý
- `VDI_PREWARM_CONCURRENCY=5`
- `VDI_PREWARM_MAX=200`
- `VDI_ALLOCATE_TIMEOUT_SEC=90`

## Ghi chú
- Luồng `join` sẽ lấy máy trong pool trước, nếu hết pool mới tạo on-demand.
- Khi thí sinh nộp bài, máy được hủy và session redis được dọn dẹp.
