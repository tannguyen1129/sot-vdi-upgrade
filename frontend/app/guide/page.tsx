"use client";

import React, { useState } from "react";
import Link from "next/link";

type GuideSection = {
  id: string;
  order: string;
  title: string;
};

const sections: GuideSection[] = [
  { id: "overview", order: "01", title: "Tổng quan kỳ thi VDI" },
  { id: "before-exam", order: "02", title: "Chuẩn bị trước khi thi" },
  { id: "start-exam", order: "03", title: "Đăng nhập và bắt đầu phiên thi" },
  { id: "vm-tools", order: "04", title: "Công cụ có sẵn trên máy ảo" },
  { id: "coding-editor", order: "05", title: "Làm bài bằng Editor" },
  { id: "coding-terminal", order: "06", title: "Compile/Run bằng Terminal" },
  { id: "anticheat", order: "07", title: "Quy chế và cảnh báo vi phạm" },
  { id: "submission", order: "08", title: "Quy trình nộp bài" },
  { id: "checklist", order: "09", title: "Checklist trước khi rời phòng thi" },
];

function GuideCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h4 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-800">{title}</h4>
      <div className="text-sm leading-relaxed text-slate-600">{children}</div>
    </div>
  );
}

export default function StudentGuidePage() {
  const [activeSection, setActiveSection] = useState("overview");

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      <div className="border-b border-slate-800 bg-[#0f1117] px-6 py-12 text-white">
        <div className="mx-auto max-w-6xl">
          <div className="mb-4 flex items-center gap-3 text-sm font-bold uppercase tracking-widest text-emerald-400">
            <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1">Hệ thống thi VDI</span>
            <span>•</span>
            <span>Hướng dẫn thí sinh (bản cập nhật)</span>
          </div>
          <h1 className="mb-4 text-4xl font-black tracking-tight md:text-5xl">Hướng Dẫn Làm Bài Trên Máy Ảo</h1>
          <p className="max-w-3xl text-lg leading-relaxed text-slate-300">
            Tài liệu này hướng dẫn chi tiết toàn bộ quy trình thi: vào phòng thi, thao tác chuột/phím,
            sử dụng editor, compile code bằng terminal và nộp bài đúng quy định.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="rounded-lg bg-blue-600 px-6 py-3 font-bold text-white transition-all hover:bg-blue-500"
            >
              Vào trang Đăng nhập
            </Link>
            <button
              onClick={() => scrollToSection("coding-terminal")}
              className="rounded-lg border border-slate-600 px-6 py-3 font-bold text-slate-200 transition-all hover:border-slate-400 hover:text-white"
            >
              Xem nhanh lệnh compile/run
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-12 md:flex-row">
        <aside className="md:w-72 md:flex-shrink-0">
          <div className="sticky top-6 space-y-1 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="mb-3 px-2 text-xs font-bold uppercase tracking-wider text-slate-400">Nội dung</p>
            {sections.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollToSection(item.id)}
                className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  activeSection === item.id
                    ? "border-l-2 border-blue-600 bg-blue-50 font-semibold text-blue-700"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {item.order}. {item.title}
              </button>
            ))}
          </div>
        </aside>

        <div className="flex-1 space-y-16">
          <section id="overview" className="scroll-mt-24">
            <h2 className="mb-4 flex items-center gap-3 text-2xl font-bold text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm text-white">01</span>
              Tổng quan kỳ thi VDI
            </h2>
            <div className="space-y-3 text-slate-700">
              <p>
                Mỗi thí sinh làm bài trên một máy ảo độc lập. Mọi thao tác (soạn code, chạy chương trình,
                dùng trình duyệt web) đều thực hiện bên trong máy ảo và được ghi nhận trong phiên thi.
              </p>
              <p>
                Màn hình thi sẽ chạy ở chế độ toàn màn hình và khóa chuột để đảm bảo tập trung và an toàn
                giám sát.
              </p>
            </div>
          </section>

          <section id="before-exam" className="scroll-mt-24">
            <h2 className="mb-4 flex items-center gap-3 text-2xl font-bold text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm text-white">02</span>
              Chuẩn bị trước khi thi
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <GuideCard title="Thiết bị và mạng">
                Dùng laptop/PC ổn định, ưu tiên mạng dây hoặc Wi-Fi mạnh. Không chạy ứng dụng nặng nền để
                tránh giật, mất focus trong lúc thi.
              </GuideCard>
              <GuideCard title="Trình duyệt truy cập hệ thống thi">
                Khuyến nghị Google Chrome hoặc Microsoft Edge bản mới. Bật sẵn quyền Fullscreen khi trình
                duyệt hỏi.
              </GuideCard>
              <GuideCard title="Tài khoản thi">
                Chuẩn bị sẵn MSSV, mật khẩu, và Access Code (nếu giám thị yêu cầu).
              </GuideCard>
              <GuideCard title="Nguyên tắc làm bài">
                Chỉ thao tác trong cửa sổ thi. Không chuyển tab/cửa sổ khác trong suốt thời gian làm bài.
              </GuideCard>
            </div>
          </section>

          <section id="start-exam" className="scroll-mt-24">
            <h2 className="mb-4 flex items-center gap-3 text-2xl font-bold text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm text-white">03</span>
              Đăng nhập và bắt đầu phiên thi
            </h2>
            <ol className="list-decimal space-y-2 rounded-xl border border-slate-200 bg-white p-6 pl-10 text-slate-700">
              <li>Đăng nhập hệ thống bằng tài khoản được cấp.</li>
              <li>Vào đúng kỳ thi đang mở.</li>
              <li>Nhập Access Code (nếu có) rồi bấm <strong>VÀO THI</strong>.</li>
              <li>Tại màn hình máy ảo, bấm <strong>BẮT ĐẦU NGAY</strong> để vào chế độ thi.</li>
              <li>Hệ thống sẽ tự bật fullscreen và khóa chuột.</li>
            </ol>
            <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              Nếu trình duyệt chặn fullscreen, bạn cần cho phép ngay để có thể bắt đầu làm bài.
            </p>
          </section>

          <section id="vm-tools" className="scroll-mt-24">
            <h2 className="mb-4 flex items-center gap-3 text-2xl font-bold text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm text-white">04</span>
              Công cụ có sẵn trên máy ảo
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <GuideCard title="Workspace mặc định">
                Thư mục làm bài: <code>/home/student/workspace</code>. Nên lưu toàn bộ mã nguồn tại đây.
              </GuideCard>
              <GuideCard title="Editor">
                Có sẵn <strong>Geany</strong> và <strong>Code::Blocks</strong> trên Desktop để viết/chạy code.
              </GuideCard>
              <GuideCard title="Terminal">
                Có <strong>xfce4-terminal/xterm</strong> để compile và run thủ công bằng lệnh.
              </GuideCard>
              <GuideCard title="Web Browser">
                Có icon <strong>Web Browser</strong> để mở trang web được phép theo cấu hình kỳ thi.
              </GuideCard>
            </div>
          </section>

          <section id="coding-editor" className="scroll-mt-24">
            <h2 className="mb-4 flex items-center gap-3 text-2xl font-bold text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm text-white">05</span>
              Làm bài bằng Editor
            </h2>
            <div className="space-y-4 text-slate-700">
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="mb-2 font-bold text-slate-900">Geany (khuyến nghị nhanh gọn)</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  <li>Mở icon <strong>Geany</strong> trên Desktop (đã trỏ sẵn vào workspace).</li>
                  <li>Tạo/mở file trong <code>/home/student/workspace</code>.</li>
                  <li>Lưu file trước khi chạy.</li>
                  <li>Dùng menu <strong>Build</strong> để Compile/Execute theo ngôn ngữ.</li>
                  <li>Với Python/Java, Geany đã có cấu hình chạy mặc định.</li>
                </ul>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="mb-2 font-bold text-slate-900">Code::Blocks (phù hợp C/C++)</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  <li>Mở icon <strong>CodeBlocks</strong> trên Desktop.</li>
                  <li>Tạo project hoặc mở file nguồn C/C++.</li>
                  <li>Dùng chức năng Build/Run trong IDE để biên dịch và kiểm tra kết quả.</li>
                  <li>Đảm bảo thư mục output nằm trong workspace theo yêu cầu đề.</li>
                </ul>
              </div>
            </div>
          </section>

          <section id="coding-terminal" className="scroll-mt-24">
            <h2 className="mb-4 flex items-center gap-3 text-2xl font-bold text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm text-white">06</span>
              Compile/Run bằng Terminal
            </h2>
            <div className="rounded-xl border border-slate-200 bg-[#0b1220] p-5 text-slate-200 shadow-sm">
              <p className="mb-3 text-sm text-slate-300">
                Mở Terminal, chạy <code>cd /home/student/workspace</code> trước khi compile/run.
              </p>
              <div className="space-y-4 text-sm">
                <div>
                  <p className="mb-1 font-bold text-cyan-300">C</p>
                  <pre className="overflow-x-auto rounded bg-black/40 p-3"><code>gcc main.c -o main\n./main</code></pre>
                </div>
                <div>
                  <p className="mb-1 font-bold text-cyan-300">C++</p>
                  <pre className="overflow-x-auto rounded bg-black/40 p-3"><code>g++ main.cpp -o main\n./main</code></pre>
                </div>
                <div>
                  <p className="mb-1 font-bold text-cyan-300">Python</p>
                  <pre className="overflow-x-auto rounded bg-black/40 p-3"><code>python3 main.py</code></pre>
                </div>
                <div>
                  <p className="mb-1 font-bold text-cyan-300">Java</p>
                  <pre className="overflow-x-auto rounded bg-black/40 p-3"><code>javac Main.java\njava Main</code></pre>
                </div>
              </div>
            </div>
          </section>

          <section id="anticheat" className="scroll-mt-24">
            <h2 className="mb-4 flex items-center gap-3 text-2xl font-bold text-red-600">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-sm text-white">07</span>
              Quy chế và cảnh báo vi phạm
            </h2>
            <div className="overflow-hidden rounded-xl border border-red-200 bg-red-50">
              <table className="w-full text-left text-sm">
                <thead className="bg-red-100 text-red-800">
                  <tr>
                    <th className="p-4">Hành động</th>
                    <th className="p-4">Kết quả</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-100 text-slate-700">
                  <tr>
                    <td className="p-4">Thoát fullscreen (Esc/F11) hoặc làm mất focus cửa sổ thi</td>
                    <td className="p-4 font-semibold text-red-700">Ghi nhận vi phạm và hiện cảnh báo</td>
                  </tr>
                  <tr>
                    <td className="p-4">Alt + Tab, bấm phím Windows/Menu hệ thống</td>
                    <td className="p-4 font-semibold text-red-700">Ghi log vi phạm</td>
                  </tr>
                  <tr>
                    <td className="p-4">Thoát khóa chuột không đúng cách</td>
                    <td className="p-4 font-semibold text-red-700">Ghi log vi phạm</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-3 rounded-lg bg-slate-100 p-4 text-sm text-slate-700">
              Mở khóa chuột hợp lệ bằng <kbd className="rounded border border-slate-300 bg-slate-200 px-1">Alt</kbd> +{" "}
              <kbd className="rounded border border-slate-300 bg-slate-200 px-1">Enter</kbd> để vào menu tạm dừng.
            </div>
          </section>

          <section id="submission" className="scroll-mt-24">
            <h2 className="mb-4 flex items-center gap-3 text-2xl font-bold text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm text-white">08</span>
              Quy trình nộp bài
            </h2>
            <ol className="list-decimal space-y-3 rounded-xl border border-slate-200 bg-white p-6 pl-10 text-sm text-slate-700">
              <li>Lưu tất cả file bài làm vào đúng thư mục yêu cầu.</li>
              <li>Kiểm tra chạy lại lần cuối bằng Editor hoặc Terminal.</li>
              <li>Nhấn nút <strong>Nộp Bài</strong> màu đỏ ở góc trên phải màn hình thi.</li>
              <li>Xác nhận tại hộp thoại <strong>NỘP BÀI NGAY</strong>.</li>
              <li>Chờ hệ thống kết thúc phiên thi và chuyển về Dashboard.</li>
            </ol>
            <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              Nếu bạn đang ở menu tạm dừng (mở bằng Alt+Enter), hãy bấm <strong>Quay lại làm bài</strong> trước,
              rồi dùng nút <strong>Nộp Bài</strong> trên thanh trên cùng.
            </p>
          </section>

          <section id="checklist" className="scroll-mt-24">
            <h2 className="mb-4 flex items-center gap-3 text-2xl font-bold text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm text-white">09</span>
              Checklist trước khi rời phòng thi
            </h2>
            <ul className="space-y-2 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
              <li>1. Đã lưu đủ file mã nguồn theo yêu cầu đề.</li>
              <li>2. Đã chạy kiểm thử cơ bản ít nhất một lần.</li>
              <li>3. Đã nộp bài thành công trên hệ thống.</li>
              <li>4. Không tự ý đóng tab trước khi hệ thống trả về Dashboard.</li>
            </ul>
          </section>

          <div className="h-10" />
        </div>
      </div>
    </div>
  );
}
