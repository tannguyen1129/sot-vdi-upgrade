import Link from "next/link";

type PageGuide = {
  key: string;
  pageName: string;
  route: string;
  purpose: string;
  features: string[];
  terms: { term: string; meaning: string }[];
  notes: string[];
};

const quickLinks = [
  { label: "Dashboard Admin", href: "/admin" },
  { label: "Kỳ thi", href: "/admin/exams" },
  { label: "Giám sát", href: "/admin/monitor" },
  { label: "Sinh viên", href: "/admin/students" },
  { label: "Máy ảo", href: "/admin/vms" },
];

const pageGuides: PageGuide[] = [
  {
    key: "dashboard",
    pageName: "Dashboard Admin",
    route: "/admin",
    purpose: "Màn hình tổng quan vận hành realtime cho toàn hệ thống.",
    features: [
      "Xem số lượng kỳ thi đang diễn ra, sắp diễn ra và tổng số kỳ thi.",
      "Theo dõi cluster summary: worker healthy, draining, drained, slots active/available.",
      "Thao tác nhanh: refresh dữ liệu và chạy manual reconcile.",
      "Đi tắt đến các module chính: Kỳ thi, Sinh viên, Giám sát, Máy ảo, Hướng dẫn Admin.",
    ],
    terms: [
      { term: "Healthy Worker", meaning: "Worker đang hoạt động bình thường, có thể nhận phiên mới." },
      { term: "Draining", meaning: "Worker đang ngừng nhận phiên mới, chỉ chờ các phiên hiện có kết thúc." },
      { term: "Drained", meaning: "Worker đã rỗng phiên và sẵn sàng bảo trì/tắt." },
      { term: "Available Slots", meaning: "Số phiên máy ảo còn có thể cấp thêm ngay." },
      { term: "Reconcile", meaning: "Tác vụ đối soát để dọn trạng thái/session không nhất quán hoặc bị treo." },
    ],
    notes: [
      "Trước giờ thi: kiểm tra Available Slots phải >= số thí sinh dự kiến vào thi.",
      "Khi chạy Reconcile: theo dõi số cleaned/scanned/stale để đánh giá mức độ bất thường.",
    ],
  },
  {
    key: "exams",
    pageName: "Kỳ thi",
    route: "/admin/exams",
    purpose: "Quản lý cấu hình kỳ thi và năng lực cấp máy ảo theo từng ca.",
    features: [
      "Tạo, chỉnh sửa, bật/tắt kỳ thi theo thời gian cụ thể.",
      "Cấu hình thời lượng làm bài và các tham số vận hành liên quan kỳ thi.",
      "Thực hiện prewarm để chuẩn bị trước máy ảo cho ca thi sắp bắt đầu.",
      "Quan sát trạng thái exam-level để biết ca nào đang active/live.",
    ],
    terms: [
      { term: "isActive", meaning: "Cờ cho phép kỳ thi hoạt động trên hệ thống." },
      { term: "Live Exam", meaning: "Kỳ thi đang nằm trong khung thời gian hiện tại và active." },
      { term: "Upcoming", meaning: "Kỳ thi đã tạo nhưng chưa tới giờ bắt đầu." },
      { term: "Prewarm", meaning: "Chuẩn bị sẵn VM/container trước giờ thi để giảm độ trễ khi thí sinh vào." },
      { term: "Capacity", meaning: "Sức chứa phiên đồng thời mà hệ thống có thể phục vụ." },
    ],
    notes: [
      "Không đổi cấu hình lớn khi kỳ thi đang live nếu không có nhu cầu khẩn cấp.",
      "Nếu prewarm thất bại, kiểm tra lại worker healthy và resource trước khi mở ca.",
    ],
  },
  {
    key: "monitor",
    pageName: "Giám sát",
    route: "/admin/monitor và /admin/monitor/[examId]",
    purpose: "Giám sát hành vi thí sinh theo thời gian thực và truy vết sự kiện thi.",
    features: [
      "Chọn kỳ thi để xem danh sách phiên đang thi của thí sinh.",
      "Quan sát trạng thái hành vi và tiến trình làm bài theo từng session.",
      "Xem log sự kiện theo timeline để hỗ trợ quyết định nghiệp vụ.",
      "Theo dõi chỉ số submit/vi phạm để phát hiện ca cần ưu tiên xử lý.",
    ],
    terms: [
      { term: "JOIN", meaning: "Thí sinh vừa vào phiên thi." },
      { term: "ACTIVE", meaning: "Heartbeat cho thấy thí sinh đang hoạt động." },
      { term: "VIOLATION", meaning: "Sự kiện vi phạm (blur, alt+tab, thoát fullscreen, v.v.)." },
      { term: "SUBMIT", meaning: "Thí sinh đã nộp bài thành công từ giao diện thi." },
      { term: "LEAVE", meaning: "Rời trang thi đột ngột/đóng phiên trước khi hoàn tất." },
    ],
    notes: [
      "Khi có vi phạm lặp lại, đối chiếu chuỗi event thay vì nhìn 1 event đơn lẻ.",
      "Nếu session đứng lâu không ACTIVE, kiểm tra đồng thời monitor và worker status.",
    ],
  },
  {
    key: "students",
    pageName: "Sinh viên",
    route: "/admin/students",
    purpose: "Quản lý danh sách tài khoản dự thi và dữ liệu định danh người học.",
    features: [
      "Import danh sách sinh viên theo file mẫu hệ thống.",
      "Tra cứu nhanh theo MSSV/họ tên/lớp để kiểm tra dữ liệu trước giờ thi.",
      "Quản lý trạng thái tài khoản để đảm bảo thí sinh đăng nhập đúng quyền.",
      "Cập nhật dữ liệu sai lệch trước khi mở ca thi chính thức.",
    ],
    terms: [
      { term: "MSSV", meaning: "Mã số sinh viên dùng để đăng nhập và định danh thí sinh." },
      { term: "Role", meaning: "Quyền tài khoản (ADMIN/STUDENT)." },
      { term: "Import", meaning: "Nạp dữ liệu hàng loạt từ file vào hệ thống." },
    ],
    notes: [
      "Luôn đối chiếu số lượng bản ghi import với danh sách gốc từ phòng đào tạo.",
      "Sau import lớn, nên kiểm tra ngẫu nhiên một số MSSV để tránh lỗi cột dữ liệu.",
    ],
  },
  {
    key: "vms",
    pageName: "Máy ảo",
    route: "/admin/vms",
    purpose: "Theo dõi và điều phối hạ tầng worker node phục vụ thi VDI.",
    features: [
      "Xem danh sách worker và trạng thái realtime từng node.",
      "Theo dõi tải session hiện tại, giới hạn session và tài nguyên khả dụng.",
      "Thực hiện thao tác vận hành node theo chính sách an toàn (enable/drain).",
      "Đánh giá phân bổ tải trước và trong ca thi.",
    ],
    terms: [
      { term: "Worker Node", meaning: "Máy chủ cung cấp phiên máy ảo thi." },
      { term: "Active Sessions", meaning: "Số phiên hiện đang chạy trên worker." },
      { term: "Max Sessions", meaning: "Số phiên tối đa worker được phép phục vụ." },
      { term: "Drain Node", meaning: "Đưa node vào chế độ không nhận phiên mới, giữ phiên cũ chạy đến hết." },
    ],
    notes: [
      "Không drain nhiều node cùng lúc khi kỳ thi đang cao điểm.",
      "Sau thao tác với node, quay lại Dashboard để xác nhận tổng slots không thiếu.",
    ],
  },
];

const glossary = [
  { term: "Session", meaning: "Một phiên làm bài của một thí sinh trên một máy ảo cụ thể." },
  { term: "Cluster", meaning: "Tập hợp nhiều worker node cùng phục vụ hệ thống thi." },
  { term: "Sticky", meaning: "Cơ chế ưu tiên phân bổ phiên theo quy tắc để giảm dao động tải." },
  { term: "VM Revoke/Finish", meaning: "Thu hồi phiên máy ảo khi thí sinh nộp bài hoặc hết giờ." },
  { term: "Exam Window", meaning: "Khung thời gian hợp lệ để kỳ thi được phép diễn ra." },
];

export default function AdminGuidePage() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <div className="mb-3 inline-flex items-center rounded border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-700">
            Admin Handbook
          </div>
          <h1 className="text-4xl font-black uppercase tracking-tight text-slate-900">Hướng dẫn chi tiết cho Admin theo từng trang</h1>
          <p className="mt-3 max-w-4xl text-sm leading-relaxed text-slate-600">
            Tài liệu này diễn giải cụ thể từng màn hình trong khu quản trị: trang đó dùng để làm gì, có thao tác nào chính,
            và thuật ngữ nào cần hiểu đúng để vận hành kỳ thi ổn định.
          </p>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-10 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">Điều hướng nhanh</h2>
            <div className="space-y-2">
              {quickLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-amber-700">Nguyên tắc vận hành</h3>
            <p className="text-sm leading-relaxed text-amber-800">
              Trong giờ thi, ưu tiên ổn định. Luôn áp dụng thay đổi nhỏ nhất có thể, sau đó kiểm tra lại số liệu realtime trên Dashboard.
            </p>
          </div>
        </aside>

        <main className="space-y-6">
          {pageGuides.map((page) => (
            <section key={page.key} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-black tracking-tight text-slate-900">{page.pageName}</h2>
                <span className="rounded bg-slate-100 px-2 py-1 text-xs font-mono text-slate-600">{page.route}</span>
              </div>

              <p className="text-sm text-slate-700">{page.purpose}</p>

              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Có gì trong trang này</h3>
                  <ul className="space-y-2 text-sm text-slate-700">
                    {page.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-blue-600" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 lg:col-span-2">
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Thuật ngữ và diễn giải</h3>
                  <div className="space-y-2 text-sm">
                    {page.terms.map((item) => (
                      <div key={item.term} className="rounded border border-slate-200 bg-white px-3 py-2">
                        <p className="font-semibold text-slate-800">{item.term}</p>
                        <p className="text-slate-600">{item.meaning}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-emerald-700">Lưu ý thao tác</h3>
                <ul className="space-y-1 text-sm text-emerald-900">
                  {page.notes.map((note) => (
                    <li key={note} className="flex items-start gap-2">
                      <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-emerald-700" />
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ))}

          <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-6">
            <h2 className="text-xl font-black tracking-tight text-indigo-900">Thuật ngữ chung toàn hệ thống</h2>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {glossary.map((item) => (
                <div key={item.term} className="rounded border border-indigo-200 bg-white px-3 py-2 text-sm">
                  <p className="font-semibold text-indigo-900">{item.term}</p>
                  <p className="text-slate-700">{item.meaning}</p>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
