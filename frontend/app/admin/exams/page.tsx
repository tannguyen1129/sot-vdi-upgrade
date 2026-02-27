"use client";

import { useEffect, useState } from "react";
import axios from './../../utils/axios';
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import InputDialog from "../../components/ui/InputDialog";
import { useToast } from "../../components/ui/ToastProvider";

// --- DEFINITIONS ---
interface ExamForm {
  name: string;
  description: string;
  accessCode: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

interface ExamCapacity {
  examId: number;
  poolAvailable: number;
  activeSessions: number;
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

interface WorkerNode {
  code: string;
  name: string;
  isEnabled: boolean;
  isDraining: boolean;
  healthy: boolean;
  activeSessions: number;
  maxSessions: number;
  availableSessions: number;
  drainStatus?: 'serving' | 'draining' | 'drained';
  lastHeartbeatAt?: string | null;
}

interface ExamItem {
  id: number;
  name: string;
  description?: string;
  accessCode?: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

export default function ExamsPage() {
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [capacityByExam, setCapacityByExam] = useState<Record<number, ExamCapacity>>({});
  const [clusterSummary, setClusterSummary] = useState<ClusterSummary | null>(null);
  const [workers, setWorkers] = useState<WorkerNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  // Toast State (Thông báo đẹp)
  const [deleteExamId, setDeleteExamId] = useState<number | null>(null);
  const [prewarmExamId, setPrewarmExamId] = useState<number | null>(null);
  const [prewarmCount, setPrewarmCount] = useState("20");
  const [forceDisableWorker, setForceDisableWorker] = useState<WorkerNode | null>(null);
  const { showToast } = useToast();

  // Form State
  const [formData, setFormData] = useState<ExamForm>({
    name: '', description: '', accessCode: '', startTime: '', endTime: '', isActive: true
  });

  // --- HELPER: TOAST NOTIFICATION ---
  // --- HELPER: DATE FORMATTING ---
  const formatDateForInput = (isoString: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
    return localDate.toISOString().slice(0, 16);
  };

  const formatDisplayDate = (isoString: string) => {
    if (!isoString) return '---';
    return new Date(isoString).toLocaleString('vi-VN', {
      hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
    });
  };

  // --- API ACTIONS ---
  const fetchExams = async () => {
    try {
      const res = await axios.get('/exams');
      const examList: ExamItem[] = Array.isArray(res.data) ? res.data : [];
      setExams(examList);

      const capacityResults = await Promise.allSettled(
        examList.map(async (exam) => {
          const capRes = await axios.get(`/exams/${exam.id}/capacity`);
          return { examId: exam.id, ...capRes.data } as ExamCapacity;
        }),
      );

      const mapped: Record<number, ExamCapacity> = {};
      for (const result of capacityResults) {
        if (result.status === 'fulfilled') {
          mapped[result.value.examId] = result.value;
        }
      }
      setCapacityByExam(mapped);

      try {
        const clusterRes = await axios.get('/vdi/workers/summary');
        setClusterSummary(clusterRes.data);
        setWorkers(clusterRes.data?.workers || []);
      } catch (clusterErr) {
        console.error(clusterErr);
      }
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchExams(); }, []);

  const openModal = (exam?: ExamItem) => {
    if (exam) {
      setEditingId(exam.id);
      setFormData({
        name: exam.name,
        description: exam.description || '',
        accessCode: exam.accessCode || '',
        startTime: exam.startTime ? formatDateForInput(exam.startTime) : '',
        endTime: exam.endTime ? formatDateForInput(exam.endTime) : '',
        isActive: exam.isActive
      });
    } else {
      setEditingId(null);
      setFormData({ name: '', description: '', accessCode: '', startTime: '', endTime: '', isActive: true });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const payload = {
      ...formData,
      startTime: new Date(formData.startTime).toISOString(),
      endTime: new Date(formData.endTime).toISOString(),
    };

    try {
      if (editingId) {
        await axios.patch(`/exams/${editingId}`, payload);
        showToast("Cập nhật kỳ thi thành công!", "success");
      } else {
        await axios.post('/exams', payload);
        showToast("Khởi tạo kỳ thi mới thành công!", "success");
      }
      setIsModalOpen(false);
      fetchExams();
    } catch (err) {
      console.error(err);
      showToast("Có lỗi xảy ra. Vui lòng kiểm tra lại!", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await axios.delete(`/exams/${id}`);
      showToast("Đã xóa kỳ thi.", "info");
      fetchExams();
    } catch {
      showToast("Không thể xóa kỳ thi này!", "error");
    } finally {
      setDeleteExamId(null);
    }
  };

  const toggleStatus = async (exam: ExamItem) => {
    try {
      await axios.patch(`/exams/${exam.id}`, { isActive: !exam.isActive });
      fetchExams();
      showToast(`Đã ${!exam.isActive ? 'KÍCH HOẠT' : 'VÔ HIỆU HÓA'} kỳ thi.`, "info");
    } catch (err) { console.error(err); }
  };

  const runPrewarm = async (examId: number, rawCount: string) => {
    const count = Number(rawCount);
    if (!Number.isFinite(count) || count <= 0) {
      showToast('Số lượng prewarm không hợp lệ.', 'error');
      return;
    }

    try {
      setLoading(true);
      const res = await axios.post(`/exams/${examId}/prewarm`, { count: Math.floor(count) });
      showToast(
        `Prewarm xong: created=${res.data.created}, failed=${res.data.failed}, available=${res.data.poolAvailable}`,
        res.data.failed > 0 ? 'info' : 'success',
      );

      const capRes = await axios.get(`/exams/${examId}/capacity`);
      setCapacityByExam((prev) => ({ ...prev, [examId]: capRes.data }));
    } catch (err) {
      console.error(err);
      showToast('Prewarm thất bại. Kiểm tra backend/worker logs.', 'error');
    } finally {
      setLoading(false);
      setPrewarmExamId(null);
    }
  };

  const handlePrewarm = (examId: number) => {
    setPrewarmExamId(examId);
  };

  const handleWorkerStatus = async (
    worker: WorkerNode,
    patch: Partial<Pick<WorkerNode, 'isEnabled' | 'isDraining'>>,
    force = false,
  ) => {
    try {
      await axios.patch(`/vdi/workers/${worker.code}`, { ...patch, force });
      await fetchExams();
      showToast(`Đã cập nhật worker ${worker.code}.`, 'success');
    } catch (err) {
      console.error(err);
      showToast(`Không thể cập nhật worker ${worker.code}.`, 'error');
    }
  };

  const handleManualReconcile = async () => {
    try {
      setReconciling(true);
      const res = await axios.post('/vdi/workers/reconcile');
      const data = res.data || {};
      showToast(
        `Reconcile xong: cleaned=${data.cleaned ?? 0}, scanned=${data.scanned ?? 0}, stale=${data.staleWithoutSession ?? 0}`,
        'info',
      );
      await fetchExams();
    } catch (err) {
      console.error(err);
      showToast('Reconcile thất bại. Kiểm tra backend logs.', 'error');
    } finally {
      setReconciling(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12 font-sans relative">
      
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        
        {/* --- HEADER --- */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4 border-b border-slate-200 pb-6">
          <div>
             <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-3">
                <span className="w-2 h-8 bg-amber-500 block"></span>
                Quản Lý Kỳ Thi
             </h1>
             <p className="text-slate-500 mt-1 pl-5 text-sm font-medium">Thiết lập lịch thi, mã truy cập và trạng thái.</p>
             {clusterSummary && (
               <p className="text-slate-500 mt-1 pl-5 text-xs font-mono">
                 Cluster: workers {clusterSummary.healthyWorkers}/{clusterSummary.totalWorkers}
                 {' | '}slots {clusterSummary.totalAvailableSessions}/{clusterSummary.totalMaxSessions}
                 {' | '}active {clusterSummary.totalActiveSessions}
                 {' | '}drain {clusterSummary.drainedWorkers}/{clusterSummary.drainingWorkers}
               </p>
             )}
          </div>
          <button 
            onClick={() => openModal()}
            className="group relative bg-slate-900 hover:bg-amber-600 text-white px-6 py-3 font-bold uppercase text-sm tracking-wider transition-all duration-200 shadow-lg shadow-slate-900/20 hover:shadow-amber-600/20 flex items-center gap-2"
          >
            <span>+ Tạo Mới</span>
          </button>
        </div>

        {/* --- TABLE --- */}
        <div className="bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider border-b border-slate-200">
                  <th className="p-5 w-1/4">Thông tin Kỳ thi</th>
                  <th className="p-5 w-1/4">Thời gian (Local)</th>
                  <th className="p-5 w-1/6 text-center">Mã Access</th>
                  <th className="p-5 w-1/6 text-center">Trạng thái</th>
                  <th className="p-5 w-1/6 text-right">Tác vụ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {exams.map((exam) => (
                  <tr key={exam.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="p-5 align-top">
                      <div className="font-bold text-slate-800 text-lg leading-tight group-hover:text-blue-700 transition">
                        {exam.name}
                      </div>
                      <div className="text-xs font-mono text-slate-400 mt-1">ID: #{exam.id}</div>
                      {exam.description && (
                        <p className="text-sm text-slate-500 mt-2 line-clamp-2 border-l-2 border-slate-200 pl-2 italic">
                          {exam.description}
                        </p>
                      )}
                      <div className="mt-3 text-[11px] text-slate-500 font-mono">
                        Pool: <span className="font-bold text-emerald-700">{capacityByExam[exam.id]?.poolAvailable ?? 0}</span>
                        {' | '}
                        Active: <span className="font-bold text-blue-700">{capacityByExam[exam.id]?.activeSessions ?? 0}</span>
                      </div>
                    </td>
                    
                    <td className="p-5 align-top">
                       <div className="space-y-3">
                          <div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase">Bắt đầu</div>
                            <div className="text-sm font-mono font-medium text-slate-700">
                                {formatDisplayDate(exam.startTime)}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase">Kết thúc</div>
                            <div className="text-sm font-mono font-medium text-slate-700">
                                {formatDisplayDate(exam.endTime)}
                            </div>
                          </div>
                       </div>
                    </td>

                    <td className="p-5 align-middle text-center">
                       {exam.accessCode ? (
                         <span className="inline-block bg-slate-100 border border-slate-200 text-slate-600 px-3 py-1 font-mono text-sm font-bold">
                           {exam.accessCode}
                         </span>
                       ) : (
                         <span className="text-slate-300 text-xs italic">Không có</span>
                       )}
                    </td>

                    <td className="p-5 align-middle text-center">
                      <button 
                        onClick={() => toggleStatus(exam)}
                        className={`inline-flex items-center px-3 py-1 text-xs font-bold uppercase tracking-wide border transition-all ${
                          exam.isActive 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' 
                            : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                         <span className={`w-1.5 h-1.5 mr-2 rounded-full ${exam.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                         {exam.isActive ? 'Active' : 'Disabled'}
                      </button>
                    </td>

                    <td className="p-5 align-middle text-right">
                       <div className="flex items-center justify-end gap-2">
                          <button 
                             onClick={() => openModal(exam)}
                             className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-100 transition-all"
                             title="Chỉnh sửa"
                          >
                             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button 
                             onClick={() => setDeleteExamId(exam.id)}
                             className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 transition-all"
                             title="Xóa"
                          >
                             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                          <button
                             onClick={() => handlePrewarm(exam.id)}
                             className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 border border-transparent hover:border-emerald-100 transition-all"
                             title="Prewarm máy thi"
                             disabled={loading}
                          >
                             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                          </button>
                       </div>
                    </td>
                  </tr>
                ))}
                
                {exams.length === 0 && (
                   <tr>
                     <td colSpan={5} className="p-12 text-center">
                        <div className="flex flex-col items-center justify-center text-slate-400">
                           <svg className="w-12 h-12 mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                           <p className="text-sm font-medium">Chưa có dữ liệu kỳ thi.</p>
                        </div>
                     </td>
                   </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* --- WORKER CONTROL --- */}
        <div className="mt-8 bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Worker Cluster Control</h2>
            <button
              onClick={handleManualReconcile}
              disabled={reconciling}
              className="px-3 py-1.5 text-xs font-bold uppercase border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {reconciling ? 'Reconciling...' : 'Reconcile now'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider border-b border-slate-200">
                  <th className="p-4">Worker</th>
                  <th className="p-4 text-center">Health</th>
                  <th className="p-4 text-center">Mode</th>
                  <th className="p-4 text-center">Slots</th>
                  <th className="p-4 text-right">Tác vụ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {workers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-400 text-sm">
                      Chưa có worker nào gửi heartbeat.
                    </td>
                  </tr>
                ) : (
                  workers.map((worker) => (
                    <tr key={worker.code} className="hover:bg-slate-50">
                      <td className="p-4">
                        <div className="font-mono font-bold text-slate-700">{worker.code}</div>
                        <div className="text-xs text-slate-500">{worker.name}</div>
                      </td>
                      <td className="p-4 text-center">
                        <span
                          className={`inline-flex px-2 py-1 text-[10px] font-bold uppercase border ${
                            worker.healthy
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-red-50 text-red-700 border-red-200'
                          }`}
                        >
                          {worker.healthy ? 'Healthy' : 'Stale'}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span
                          className={`inline-flex px-2 py-1 text-[10px] font-bold uppercase border ${
                            worker.drainStatus === 'drained'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : worker.isDraining
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}
                        >
                          {worker.drainStatus === 'drained'
                            ? 'Drained'
                            : worker.isDraining
                            ? 'Draining'
                            : 'Serving'}
                        </span>
                      </td>
                      <td className="p-4 text-center text-xs font-mono text-slate-600">
                        {worker.availableSessions}/{worker.maxSessions} (active {worker.activeSessions})
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleWorkerStatus(worker, { isDraining: !worker.isDraining })}
                            className="px-3 py-1.5 text-xs font-bold uppercase border border-slate-300 text-slate-600 hover:bg-slate-100"
                          >
                            {worker.isDraining ? 'Resume' : 'Drain'}
                          </button>
                          <button
                            onClick={async () => {
                              if (worker.isEnabled && worker.activeSessions > 0) {
                                setForceDisableWorker(worker);
                                return;
                              }
                              await handleWorkerStatus(worker, { isEnabled: !worker.isEnabled });
                            }}
                            className={`px-3 py-1.5 text-xs font-bold uppercase border ${
                              worker.isEnabled
                                ? 'border-red-200 text-red-600 hover:bg-red-50'
                                : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                            }`}
                          >
                            {worker.isEnabled ? 'Disable' : 'Enable'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* --- MODAL (TECHNICAL STYLE) --- */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
             {/* Backdrop */}
             <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
             
             {/* Modal Content */}
             <div className="relative bg-white w-full max-w-lg shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-200">
                
                {/* Header */}
                <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center border-b border-slate-700">
                   <h2 className="text-lg font-bold uppercase tracking-wide">
                      {editingId ? 'Cập Nhật Kỳ Thi' : 'Khởi Tạo Kỳ Thi'}
                   </h2>
                   <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white transition">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                   </button>
                </div>

                {/* Form Body */}
                <form onSubmit={handleSubmit} className="p-8 space-y-5">
                   {/* Name */}
                   <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tên Kỳ Thi <span className="text-red-500">*</span></label>
                      <input 
                         type="text" required
                         value={formData.name}
                         onChange={e => setFormData({...formData, name: e.target.value})}
                         className="w-full bg-slate-50 border border-slate-300 p-3 text-slate-800 focus:ring-0 focus:border-blue-600 focus:bg-white transition-colors outline-none font-medium"
                         placeholder="Nhập tên kỳ thi..."
                      />
                   </div>

                   {/* Description */}
                   <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Mô tả</label>
                      <textarea 
                         value={formData.description}
                         onChange={e => setFormData({...formData, description: e.target.value})}
                         className="w-full bg-slate-50 border border-slate-300 p-3 text-slate-800 focus:ring-0 focus:border-blue-600 focus:bg-white transition-colors outline-none"
                         rows={2}
                      ></textarea>
                   </div>

                   {/* Access Code */}
                   <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Mã Truy Cập</label>
                      <input 
                         type="text"
                         value={formData.accessCode}
                         onChange={e => setFormData({...formData, accessCode: e.target.value})}
                         className="w-full bg-slate-50 border border-slate-300 p-3 text-blue-700 font-mono font-bold focus:ring-0 focus:border-blue-600 focus:bg-white transition-colors outline-none"
                         placeholder="VD: SECRET_CODE_2026"
                      />
                   </div>

                   {/* Time Grid */}
                   <div className="grid grid-cols-2 gap-4">
                      <div>
                         <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Bắt đầu</label>
                         <input 
                            type="datetime-local"
                            value={formData.startTime}
                            onChange={e => setFormData({...formData, startTime: e.target.value})}
                            className="w-full bg-slate-50 border border-slate-300 p-2 text-sm focus:border-blue-600 outline-none"
                         />
                      </div>
                      <div>
                         <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Kết thúc</label>
                         <input 
                            type="datetime-local"
                            value={formData.endTime}
                            onChange={e => setFormData({...formData, endTime: e.target.value})}
                            className="w-full bg-slate-50 border border-slate-300 p-2 text-sm focus:border-blue-600 outline-none"
                         />
                      </div>
                   </div>

                   {/* Checkbox */}
                   <div className="flex items-center gap-3 py-2">
                      <input 
                        type="checkbox" id="isActive"
                        checked={formData.isActive}
                        onChange={e => setFormData({...formData, isActive: e.target.checked})}
                        className="w-5 h-5 text-blue-600 border-slate-300 focus:ring-0 cursor-pointer"
                      />
                      <label htmlFor="isActive" className="text-sm font-bold text-slate-700 cursor-pointer select-none">
                         Kích hoạt ngay lập tức
                      </label>
                   </div>

                   {/* Footer Actions */}
                   <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-2">
                      <button 
                         type="button"
                         onClick={() => setIsModalOpen(false)}
                         className="px-5 py-2.5 text-slate-600 font-bold uppercase text-xs tracking-wider hover:bg-slate-100 transition-colors"
                      >
                         Hủy bỏ
                      </button>
                      <button 
                         type="submit"
                         disabled={loading}
                         className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold uppercase text-xs tracking-wider shadow-md hover:shadow-lg transition-all"
                      >
                         {loading ? 'Processing...' : 'Lưu Thay Đổi'}
                      </button>
                   </div>
                </form>
             </div>
          </div>
        )}

        <ConfirmDialog
          open={deleteExamId !== null}
          title="Xóa kỳ thi"
          description="Hành động này sẽ xóa vĩnh viễn kỳ thi và dữ liệu liên quan. Tiếp tục?"
          confirmText="Xóa kỳ thi"
          cancelText="Hủy"
          danger
          onCancel={() => setDeleteExamId(null)}
          onConfirm={() => {
            if (deleteExamId === null) return;
            handleDelete(deleteExamId);
          }}
        />
        <InputDialog
          open={prewarmExamId !== null}
          title="Prewarm máy thi"
          description="Nhập số máy cần prewarm cho kỳ thi."
          label="Số lượng máy"
          defaultValue={prewarmCount}
          confirmText="Chạy prewarm"
          cancelText="Hủy"
          loading={loading}
          onCancel={() => setPrewarmExamId(null)}
          onConfirm={(value) => {
            if (prewarmExamId === null) return;
            setPrewarmCount(value);
            runPrewarm(prewarmExamId, value);
          }}
        />
        <ConfirmDialog
          open={Boolean(forceDisableWorker)}
          title="Force Disable Worker"
          description={
            forceDisableWorker
              ? `Worker ${forceDisableWorker.code} còn ${forceDisableWorker.activeSessions} session. Force disable có thể làm gián đoạn thí sinh. Bạn có chắc chắn tiếp tục?`
              : ""
          }
          confirmText="Force Disable"
          cancelText="Hủy"
          danger
          onCancel={() => setForceDisableWorker(null)}
          onConfirm={async () => {
            if (!forceDisableWorker) return;
            await handleWorkerStatus(forceDisableWorker, { isEnabled: false }, true);
            setForceDisableWorker(null);
          }}
        />
      </div>
    </div>
  );
}
