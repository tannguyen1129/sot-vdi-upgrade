"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import api from "../utils/axios";
import type { ReactNode } from "react";
import { useToast } from "../components/ui/ToastProvider";

interface Exam {
  id: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

interface ClusterSummary {
  totalWorkers: number;
  healthyWorkers: number;
  drainingWorkers: number;
  drainedWorkers: number;
  totalMaxSessions: number;
  totalActiveSessions: number;
  totalAvailableSessions: number;
}

const emptyCluster: ClusterSummary = {
  totalWorkers: 0,
  healthyWorkers: 0,
  drainingWorkers: 0,
  drainedWorkers: 0,
  totalMaxSessions: 0,
  totalActiveSessions: 0,
  totalAvailableSessions: 0,
};

export default function AdminDashboard() {
  const [cluster, setCluster] = useState<ClusterSummary>(emptyCluster);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const { showToast } = useToast();

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [examRes, clusterRes] = await Promise.allSettled([
        api.get("/exams"),
        api.get("/vdi/workers/summary"),
      ]);

      if (examRes.status === "fulfilled") {
        setExams(Array.isArray(examRes.value.data) ? examRes.value.data : []);
      }
      if (clusterRes.status === "fulfilled") {
        setCluster(clusterRes.value.data || emptyCluster);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const examStats = useMemo(() => {
    const now = Date.now();
    let live = 0;
    let upcoming = 0;

    for (const exam of exams) {
      if (!exam.isActive) continue;
      const start = new Date(exam.startTime).getTime();
      const end = new Date(exam.endTime).getTime();
      if (now >= start && now <= end) {
        live += 1;
      } else if (now < start) {
        upcoming += 1;
      }
    }

    return {
      total: exams.length,
      live,
      upcoming,
      endedOrDisabled: Math.max(0, exams.length - live - upcoming),
    };
  }, [exams]);

  const handleReconcileNow = async () => {
    try {
      setReconciling(true);
      const res = await api.post("/vdi/workers/reconcile");
      const data = res.data || {};
      showToast(
        `Reconcile: cleaned=${data.cleaned ?? 0}, scanned=${data.scanned ?? 0}, stale=${data.staleWithoutSession ?? 0}`,
        "info",
      );
      await fetchDashboardData();
    } catch (error) {
      console.error(error);
      showToast("Không chạy được manual reconcile. Kiểm tra quyền ADMIN/PROCTOR hoặc backend logs.", "error");
    } finally {
      setReconciling(false);
    }
  };

  const DashboardCard = ({
    title,
    subtitle,
    icon,
    colorClass,
    href,
    description,
    meta,
  }: {
    title: string;
    subtitle: string;
    icon: ReactNode;
    colorClass: string;
    href: string;
    description: string;
    meta?: string;
  }) => (
    <Link href={href} className="group relative block h-full">
      <div className={`h-full bg-white border border-slate-200 border-l-4 p-6 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${colorClass}`}>
        <div className="flex justify-between items-start mb-6">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{subtitle}</span>
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight group-hover:text-blue-700 transition-colors">
              {title}
            </h3>
          </div>
          <div className="w-12 h-12 flex items-center justify-center bg-slate-50 border border-slate-100 group-hover:scale-110 transition-transform duration-300">
            {icon}
          </div>
        </div>

        <p className="text-sm text-slate-500 mb-3 leading-relaxed font-medium">{description}</p>
        {meta && <p className="text-xs font-mono text-slate-500 mb-6">{meta}</p>}

        <div className="flex items-center text-sm font-bold uppercase tracking-wider">
          <span className="group-hover:underline decoration-2 underline-offset-4">Truy cập</span>
          <svg className="w-4 h-4 ml-2 transition-transform duration-300 group-hover:translate-x-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </div>
      </div>
    </Link>
  );

  return (
    <div className="min-h-screen bg-slate-50 relative font-sans">
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-12 relative z-10">
        <div className="mb-12 border-b border-slate-200 pb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tighter mb-2">
                Quản trị hệ thống
              </h1>
              <p className="text-slate-500 font-medium max-w-2xl">
                Dashboard vận hành realtime: kỳ thi, worker nodes, slot khả dụng và tác vụ reconcile trước giờ thi.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={fetchDashboardData}
                disabled={loading}
                className="px-4 py-2 text-xs font-bold uppercase border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                {loading ? "Đang tải..." : "Làm mới"}
              </button>
              <button
                onClick={handleReconcileNow}
                disabled={reconciling}
                className="px-4 py-2 text-xs font-bold uppercase border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                {reconciling ? "Reconciling..." : "Reconcile now"}
              </button>
            </div>
          </div>

        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <DashboardCard
            title="Kỳ thi"
            subtitle="Tổ chức & lên lịch"
            href="/admin/exams"
            colorClass="border-amber-500 hover:border-amber-600"
            description="Quản lý kỳ thi, prewarm theo ca, worker drain/reconcile và capacity theo exam."
            meta={`Live=${examStats.live} | Upcoming=${examStats.upcoming} | Total=${examStats.total}`}
            icon={
              <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            }
          />

          <DashboardCard
            title="Sinh viên"
            subtitle="Dữ liệu người dùng"
            href="/admin/students"
            colorClass="border-blue-600 hover:border-blue-700"
            description="Import danh sách sinh viên, quản lý hồ sơ đăng nhập và phân quyền giám thị."
            icon={
              <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            }
          />

          <DashboardCard
            title="Hạ tầng VDI"
            subtitle="Worker cluster"
            href="/admin/exams"
            colorClass="border-indigo-600 hover:border-indigo-700"
            description="Theo dõi workers healthy/draining, slot sử dụng và thao tác disable/drain an toàn."
            meta={`Workers=${cluster.healthyWorkers}/${cluster.totalWorkers} | Slots=${cluster.totalAvailableSessions}/${cluster.totalMaxSessions}`}
            icon={
              <svg className="w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
            }
          />

          <DashboardCard
            title="Giám sát Live"
            subtitle="Realtime monitor"
            href="/admin/monitor"
            colorClass="border-rose-600 hover:border-rose-700"
            description="Theo dõi màn hình thí sinh, sự kiện vi phạm, xuất log và xử lý trong ca thi."
            meta={`Draining=${cluster.drainingWorkers} | Drained=${cluster.drainedWorkers} | Active=${cluster.totalActiveSessions}`}
            icon={
              <svg className="w-6 h-6 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            }
          />

          <DashboardCard
            title="Hướng dẫn Admin"
            subtitle="Vận hành hệ thống"
            href="/admin/guide"
            colorClass="border-emerald-600 hover:border-emerald-700"
            description="Quy trình chuẩn từ trước ca thi đến hậu kiểm: checklist, monitor, worker và xử lý sự cố."
            icon={
              <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.483 9.246 5 7.5 5 4.462 5 2 6.462 2 8.25v11C2 17.462 4.462 16 7.5 16c1.746 0 3.332.483 4.5 1.253m0-11C13.168 5.483 14.754 5 16.5 5c3.038 0 5.5 1.462 5.5 3.25v11C22 17.462 19.538 16 16.5 16c-1.746 0-3.332.483-4.5 1.253" />
              </svg>
            }
          />
        </div>

        <div className="mt-12 pt-8 border-t border-slate-200">
          <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6">Trạng thái hệ thống realtime</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-white border border-slate-200">
              <div className="text-2xl font-black text-slate-800">{cluster.totalActiveSessions}</div>
              <div className="text-xs text-slate-500 font-medium uppercase mt-1">Session đang thi</div>
            </div>
            <div className="p-4 bg-white border border-slate-200">
              <div className="text-2xl font-black text-emerald-600">{cluster.totalAvailableSessions}</div>
              <div className="text-xs text-slate-500 font-medium uppercase mt-1">Máy ảo khả dụng</div>
            </div>
            <div className="p-4 bg-white border border-slate-200">
              <div className="text-2xl font-black text-slate-800">
                {cluster.healthyWorkers}/{cluster.totalWorkers}
              </div>
              <div className="text-xs text-slate-500 font-medium uppercase mt-1">Worker healthy</div>
            </div>
            <div className="p-4 bg-white border border-slate-200">
              <div className="text-2xl font-black text-slate-800">{examStats.live}</div>
              <div className="text-xs text-slate-500 font-medium uppercase mt-1">Kỳ thi đang diễn ra</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
