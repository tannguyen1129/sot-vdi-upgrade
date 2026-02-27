"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import api from "./../../../utils/axios";
import { useParams } from "next/navigation";
import Link from "next/link";
import * as XLSX from "xlsx"; // Import thư viện Excel
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import { useToast } from "../../../components/ui/ToastProvider";

// --- INTERFACES ---
interface LiveStudent {
  student: {
    id: number;
    fullName: string;
    username: string;
    className: string;
  };
  vm: {
    ip: string;
    username: string;
    port: number;
  } | null;
  runtime: {
    session?: {
      containerName?: string;
      allocatedAt?: string;
      source?: string;
    } | null;
    dispatch?: {
      mode?: 'local' | 'remote';
      workerCode?: string;
      apiBaseUrl?: string;
      allocatedAt?: string;
    } | null;
    workerHost?: string | null;
  };
  client: {
    ip: string;
    lastAction: string;
    lastSeen: string;
    sessionId?: string | null;
  };
  isViolation: boolean;
  riskScore: number;
}

interface ExamLog {
  id: number;
  action: string;
  severity: 'INFO' | 'WARN' | 'CRITICAL';
  source: 'WEB_CLIENT' | 'BEACON' | 'SYSTEM' | 'ADMIN';
  sessionId?: string;
  violationScore?: number;
  details: string;
  clientIp: string;
  createdAt: string;
  user: { fullName: string; username: string; };
}

export default function ExamMonitorDetailPage() {
  const params = useParams<{ examId: string }>();
  const examId = params?.examId;

  // States
  const [liveData, setLiveData] = useState<LiveStudent[]>([]);
  const [logs, setLogs] = useState<ExamLog[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<'GRID' | 'LIST'>('GRID');
  const [searchTerm, setSearchTerm] = useState("");
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'INFO' | 'WARN' | 'CRITICAL'>('ALL');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'WEB_CLIENT' | 'BEACON' | 'SYSTEM' | 'ADMIN'>('ALL');
  const [selectedAction, setSelectedAction] = useState<'ALL' | string>('ALL');
  const [focusedUsername, setFocusedUsername] = useState<string>("");
  const [showOnlyRisks, setShowOnlyRisks] = useState(false);
  
  // Loading states cho buttons
  const [isExporting, setIsExporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const { showToast } = useToast();

  const formatElapsed = (iso?: string | null) => {
    if (!iso) return "---";
    const ts = new Date(iso).getTime();
    if (!Number.isFinite(ts)) return "---";
    const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m`;
    return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  };

  const isRuntimeMismatch = (st: LiveStudent) => {
    const hasDispatch = Boolean(st.runtime?.dispatch?.mode);
    const hasSession = Boolean(st.runtime?.session?.containerName);
    const hasVm = Boolean(st.vm?.ip);
    if (hasDispatch && !hasSession) return true;
    if (hasSession && !hasVm) return true;
    return false;
  };

  const copyText = async (label: string, value?: string | null) => {
    if (!value) {
      showToast(`${label}: không có dữ liệu để copy.`, "info");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      showToast(`Đã copy ${label}.`, "success");
    } catch {
      showToast(`Không thể copy ${label}.`, "error");
    }
  };

  // --- FETCH DATA ---
  const fetchData = useCallback(async () => {
    if (!examId) return;
    try {
      const [resLive, resLogs] = await Promise.all([
        api.get(`/monitoring/${examId}/live`),
        api.get(`/monitoring/${examId}/logs`)
      ]);
      setLiveData(resLive.data);
      setLogs(resLogs.data);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Monitoring Error:", error);
    }
  }, [examId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      if (autoRefresh) fetchData();
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchData, autoRefresh]);

  // --- EXPORT HANDLER ---
  const handleExport = async () => {
    if (logs.length === 0) {
      showToast("Không có dữ liệu để xuất.", "info");
      return;
    }
    setIsExporting(true);

    try {
        // Gọi API lấy toàn bộ logs (không phân trang) để export đầy đủ
        const res = await api.get(`/monitoring/${examId}/all`);
        const fullLogs: ExamLog[] = Array.isArray(res.data) ? res.data : [];

        // Map dữ liệu sang format Excel
        const dataToExport = fullLogs.map((log) => ({
            "Thời gian": new Date(log.createdAt).toLocaleString('vi-VN'),
            "MSSV": log.user?.username || "N/A",
            "Họ tên": log.user?.fullName || "N/A",
            "Hành động": log.action,
            "Chi tiết": log.details,
            "IP Máy": log.clientIp
        }));

        // Tạo Sheet & Workbook
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "SystemLogs");

        // Xuất file
        XLSX.writeFile(workbook, `Logs_KyThi_${examId}_${new Date().getTime()}.xlsx`);
    } catch (err) {
        showToast("Lỗi xuất file excel.", "error");
        console.error(err);
    } finally {
        setIsExporting(false);
    }
  };

  // --- CLEAR LOGS HANDLER ---
  const handleClearLogs = async () => {
    setIsClearing(true);
    try {
        await api.delete(`/monitoring/${examId}/clear`);
        setLogs([]); // Xóa state ngay lập tức
        showToast("Đã xóa sạch nhật ký giám sát.", "success");
    } catch (err) {
        showToast("Lỗi khi xóa logs.", "error");
        console.error(err);
    } finally {
        setIsClearing(false);
        setShowClearConfirm(false);
    }
  };

  // --- HELPER: STATUS STYLES ---
  const getCardStyle = (st: LiveStudent) => {
    if (st.isViolation || st.riskScore >= 4) return "border-red-500 bg-red-950/30 shadow-[0_0_15px_rgba(239,68,68,0.5)]"; 
    if (!st.vm) return "border-slate-700 bg-slate-800/50 opacity-60 grayscale";
    if (st.client.lastAction === 'LEAVE' || st.client.lastAction === 'DISCONNECT') return "border-amber-500 bg-amber-950/30 border-dashed";
    return "border-emerald-500/50 bg-slate-800 hover:border-emerald-400 hover:bg-slate-750 hover:shadow-[0_0_10px_rgba(16,185,129,0.2)]";
  };

  const getStatusBadge = (st: LiveStudent) => {
     if (st.isViolation || st.riskScore >= 4) return <span className="text-red-500 font-bold animate-pulse">⚠️ HIGH RISK</span>;
     if (!st.vm) return <span className="text-slate-500 font-mono">WAITING...</span>;
     if (st.client.lastAction === 'LEAVE') return <span className="text-amber-500 font-bold">⚠️ OFFLINE</span>;
     return <span className="text-emerald-400 font-bold flex items-center gap-1"><span className="w-2 h-2 bg-emerald-400 rounded-full animate-ping"></span> LIVE</span>;
  };

  // --- STATS CALCULATION ---
  const stats = useMemo(() => {
     return {
        total: liveData.length,
        online: liveData.filter(s => s.vm && s.client.lastAction !== 'LEAVE').length,
        violation: liveData.filter(s => s.isViolation).length,
        submitted: liveData.filter(s => s.client.lastAction === 'SUBMIT').length
     };
  }, [liveData]);

  const availableActions = useMemo(() => {
    const actionSet = new Set<string>();
    for (const log of logs) actionSet.add(log.action);
    return ["ALL", ...Array.from(actionSet).sort((a, b) => a.localeCompare(b))];
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (severityFilter !== 'ALL' && log.severity !== severityFilter) return false;
      if (sourceFilter !== 'ALL' && log.source !== sourceFilter) return false;
      if (selectedAction !== 'ALL' && log.action !== selectedAction) return false;

      const username = log.user?.username || "";
      if (focusedUsername && username !== focusedUsername) return false;

      if (searchTerm) {
        const haystack = `${log.action} ${log.details || ""} ${username} ${log.clientIp}`.toLowerCase();
        if (!haystack.includes(searchTerm.toLowerCase())) return false;
      }
      return true;
    });
  }, [logs, severityFilter, sourceFilter, selectedAction, focusedUsername, searchTerm]);

  const riskUsers = useMemo(() => {
    const riskMap = new Map<string, { username: string; count: number; latestAt: string }>();
    for (const log of logs) {
      const isRisk = log.action.startsWith("VIOLATION_") || log.severity === "CRITICAL";
      if (!isRisk) continue;
      const username = log.user?.username || "Unknown";
      const existing = riskMap.get(username);
      if (!existing) {
        riskMap.set(username, { username, count: 1, latestAt: log.createdAt });
      } else {
        riskMap.set(username, {
          username,
          count: existing.count + 1,
          latestAt: existing.latestAt > log.createdAt ? existing.latestAt : log.createdAt,
        });
      }
    }
    return Array.from(riskMap.values()).sort((a, b) => b.count - a.count);
  }, [logs]);

  const smartSignals = useMemo(() => {
    const now = Date.now();
    const recentCritical = logs.filter(
      (log) => log.severity === "CRITICAL" && now - new Date(log.createdAt).getTime() <= 2 * 60 * 1000,
    );
    const unresolvedRisk = liveData.filter((st) => st.isViolation || st.riskScore >= 4);
    return {
      recentCriticalCount: recentCritical.length,
      unresolvedRiskCount: unresolvedRisk.length,
      topRiskUser: riskUsers[0] || null,
    };
  }, [logs, liveData, riskUsers]);

  const visibleLiveData = useMemo(() => {
    return liveData.filter((st) => {
      if (focusedUsername && st.student.username !== focusedUsername) return false;
      if (showOnlyRisks && !(st.isViolation || st.riskScore >= 4)) return false;
      return true;
    });
  }, [liveData, focusedUsername, showOnlyRisks]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-6 font-sans selection:bg-emerald-500/30">
      
      {/* --- HUD HEADER --- */}
      <header className="mb-4 md:mb-6 border-b border-slate-800 pb-4 md:pb-6 sticky top-0 z-30 bg-slate-950/95 backdrop-blur-md">
         <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            
            {/* Title Block */}
            <div>
               <div className="flex items-center gap-3 text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                  <Link href="/admin/monitor" className="hover:text-emerald-400 transition-colors flex items-center gap-1">
                     <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                     Admin Center
                  </Link>
                  <span className="text-slate-700">/</span>
                  <span>Exam Monitor</span>
                  <span className="text-slate-700">/</span>
                  <span className="text-emerald-500">Live Feed</span>
               </div>
               <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight flex items-center gap-3">
                  MONITOR <span className="text-emerald-500">#{examId}</span>
                  {autoRefresh && <span className="flex h-3 w-3 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span></span>}
               </h1>
               <p className="text-[11px] text-slate-500 mt-1 font-mono">
                 Updated: {lastUpdated.toLocaleTimeString('vi-VN')}
               </p>
            </div>

            {/* Quick Stats Widget */}
            <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 w-full md:w-auto">
               <div className="px-3 md:px-4 py-2 text-center border-r border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Online</div>
                  <div className="text-base md:text-xl font-mono font-bold text-emerald-400">{stats.online}/{stats.total}</div>
               </div>
               <div className="px-3 md:px-4 py-2 text-center border-r border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Violations</div>
                  <div className={`text-base md:text-xl font-mono font-bold ${stats.violation > 0 ? 'text-red-500 animate-pulse' : 'text-slate-400'}`}>{stats.violation}</div>
               </div>
               <div className="px-3 md:px-4 py-2 text-center">
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Submitted</div>
                  <div className="text-base md:text-xl font-mono font-bold text-blue-400">{stats.submitted}</div>
               </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2 md:gap-3 w-full md:w-auto">
               <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-800">
                  <button onClick={() => setViewMode('GRID')} className={`p-2 rounded transition-all ${viewMode==='GRID' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}>
                     <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                  </button>
                  <button onClick={() => setViewMode('LIST')} className={`p-2 rounded transition-all ${viewMode==='LIST' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}>
                     <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                  </button>
               </div>
               
               <button
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className={`flex-1 md:flex-none px-3 md:px-4 py-2 rounded-lg font-bold text-[11px] md:text-xs uppercase tracking-wider border transition-all flex items-center justify-center gap-2 ${autoRefresh ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/50 hover:bg-emerald-500/20' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'}`}
               >
                  {autoRefresh ? 'AUTO SYNC: ON' : 'AUTO SYNC: PAUSED'}
               </button>
               <button
                  onClick={() => fetchData()}
                  className="flex-1 md:flex-none px-3 py-2 rounded-lg font-bold text-[11px] md:text-xs uppercase tracking-wider border border-slate-700 text-slate-300 hover:bg-slate-800"
               >
                  Refresh now
               </button>
            </div>
         </div>
      </header>

      <section className="mb-4 grid grid-cols-1 xl:grid-cols-3 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Smart Signals</div>
          <div className="mt-2 text-sm text-slate-300">Critical 2 phút gần nhất: <span className="font-mono text-red-400 font-bold">{smartSignals.recentCriticalCount}</span></div>
          <div className="text-sm text-slate-300">Thí sinh risk chưa xử lý: <span className="font-mono text-amber-300 font-bold">{smartSignals.unresolvedRiskCount}</span></div>
          <div className="text-sm text-slate-300">
            Top risk user:{" "}
            <span className="font-mono text-red-300 font-bold">{smartSignals.topRiskUser?.username || "N/A"}</span>
            {smartSignals.topRiskUser && <span className="text-slate-500"> ({smartSignals.topRiskUser.count} events)</span>}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Focus</div>
          <input
            value={focusedUsername}
            onChange={(e) => setFocusedUsername(e.target.value.trim())}
            placeholder="Lọc theo MSSV (vd: 2504700107)"
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 text-sm font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
          />
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={showOnlyRisks} onChange={(e) => setShowOnlyRisks(e.target.checked)} />
            Chỉ hiện thí sinh risk cao
          </label>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Risk leaderboard</div>
          <div className="space-y-1 max-h-24 overflow-auto">
            {riskUsers.slice(0, 5).map((item) => (
              <button
                key={item.username}
                onClick={() => setFocusedUsername(item.username)}
                className="w-full flex justify-between text-left px-2 py-1 bg-slate-950 border border-slate-800 hover:border-red-700"
              >
                <span className="font-mono text-xs text-slate-300">{item.username}</span>
                <span className="text-xs text-red-400 font-bold">{item.count}</span>
              </button>
            ))}
            {riskUsers.length === 0 && <div className="text-xs text-slate-500">No risk events</div>}
          </div>
        </div>
      </section>

      {/* --- MAIN MONITOR AREA --- */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 md:gap-6 min-h-[calc(100vh-220px)]">
         
         {/* LEFT: LIVE GRID (Chiếm 3/4) */}
         <div className={`xl:col-span-3 overflow-y-auto pr-1 md:pr-2 custom-scrollbar max-h-[55vh] md:max-h-[65vh] xl:max-h-none ${viewMode === 'GRID' ? 'grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3 md:gap-4 auto-rows-min' : 'flex flex-col gap-2'}`}>
            {visibleLiveData.map((st) => (
               <div key={st.student.id} className={`group relative p-4 rounded bg-slate-900 border transition-all duration-200 ${getCardStyle(st)}`}>
                  
                  {/* Status Indicator Line */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l ${st.isViolation ? 'bg-red-500' : st.vm ? 'bg-emerald-500' : 'bg-slate-600'}`}></div>

                  <div className="pl-3">
                     {/* Header */}
                     <div className="flex justify-between items-start mb-3">
                        <div>
                           <div className="font-bold text-slate-200 truncate pr-2 text-sm md:text-base">{st.student.fullName}</div>
                           <div className="flex items-center gap-2 mt-1">
                              <button
                                onClick={() => setFocusedUsername(st.student.username)}
                                className="text-xs font-mono text-slate-500 bg-slate-950 px-1 rounded border border-slate-800 hover:text-blue-300"
                              >
                                {st.student.username}
                              </button>
                              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{st.student.className}</span>
                           </div>
                        </div>
                        <div className="text-[10px]">{getStatusBadge(st)}</div>
                     </div>

                     {/* Network Info (Terminal Style) */}
                     <div className="bg-black/40 rounded p-2 font-mono text-xs space-y-1 border border-slate-800/50 group-hover:border-slate-700 transition-colors">
                        <div className="flex justify-between">
                           <span className="text-slate-500">CLIENT:</span>
                           <span className={st.client.ip ? "text-blue-400" : "text-slate-600"}>{st.client.ip || "---"}</span>
                        </div>
                        <div className="flex justify-between">
                           <span className="text-slate-500">VM IP:</span>
                           <span className={st.vm ? "text-emerald-400" : "text-slate-600"}>{st.vm?.ip || "---"}</span>
                        </div>
                        <div className="flex justify-between">
                           <span className="text-slate-500">VM USER:</span>
                           <span className={st.vm ? "text-emerald-300" : "text-slate-600"}>{st.vm?.username || "---"}</span>
                        </div>
                        <div className="flex justify-between">
                           <span className="text-slate-500">VM PORT:</span>
                           <span className="text-slate-400">{st.vm?.port || "---"}</span>
                        </div>
                        <div className="flex justify-between">
                           <span className="text-slate-500">MODE:</span>
                           <span className="text-cyan-300 uppercase">{st.runtime?.dispatch?.mode || "---"}</span>
                        </div>
                        <div className="flex justify-between">
                           <span className="text-slate-500">WORKER:</span>
                           <span className="text-cyan-400">{st.runtime?.dispatch?.workerCode || st.runtime?.workerHost || "---"}</span>
                        </div>
                        <div className="flex justify-between">
                           <span className="text-slate-500">CONTAINER:</span>
                           <span className="text-slate-400 truncate max-w-[120px]" title={st.runtime?.session?.containerName || ""}>
                             {st.runtime?.session?.containerName || "---"}
                           </span>
                        </div>
                        <div className="flex justify-between">
                           <span className="text-slate-500">SESSION ID:</span>
                           <span className="text-slate-400 truncate max-w-[120px]" title={st.client?.sessionId || ""}>
                             {st.client?.sessionId || "---"}
                           </span>
                        </div>
                        <div className="flex justify-between">
                           <span className="text-slate-500">ALLOCATED:</span>
                           <span className="text-slate-300">{st.runtime?.session?.allocatedAt ? new Date(st.runtime.session.allocatedAt).toLocaleTimeString('vi-VN') : "---"}</span>
                        </div>
                        <div className="flex justify-between">
                           <span className="text-slate-500">SESSION AGE:</span>
                           <span className="text-slate-300">{formatElapsed(st.runtime?.session?.allocatedAt || null)}</span>
                        </div>
                        <div className="flex justify-between">
                           <span className="text-slate-500">SRC:</span>
                           <span className="text-slate-400 uppercase">{st.runtime?.session?.source || "---"}</span>
                        </div>
                        <div className="flex justify-between pt-1 mt-1 border-t border-slate-800/50">
                           <span className="text-slate-500">ACTION:</span>
                           <span className={`uppercase font-bold ${st.isViolation ? 'text-red-500' : 'text-slate-300'}`}>{st.client.lastAction || "NONE"}</span>
                        </div>
                        {isRuntimeMismatch(st) && (
                          <div className="text-[10px] text-amber-300 border border-amber-700 bg-amber-950/20 px-2 py-1 rounded">
                            Runtime mismatch: dispatch/session/vm state chưa đồng bộ.
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-1 pt-1">
                          <button onClick={() => copyText("VM IP", st.vm?.ip)} className="px-1.5 py-1 text-[10px] border border-slate-700 text-slate-300 hover:bg-slate-800">Copy VM IP</button>
                          <button onClick={() => copyText("Client IP", st.client?.ip)} className="px-1.5 py-1 text-[10px] border border-slate-700 text-slate-300 hover:bg-slate-800">Copy Client IP</button>
                          <button onClick={() => copyText("Container", st.runtime?.session?.containerName)} className="px-1.5 py-1 text-[10px] border border-slate-700 text-slate-300 hover:bg-slate-800">Copy Container</button>
                          <button onClick={() => copyText("Session ID", st.client?.sessionId || null)} className="px-1.5 py-1 text-[10px] border border-slate-700 text-slate-300 hover:bg-slate-800">Copy Session</button>
                        </div>
                     </div>
                  </div>
               </div>
            ))}
         </div>

         {/* PANEL BÊN PHẢI: LOG HỆ THỐNG (CONSOLE STYLE) */}
        <div className="xl:col-span-1 bg-[#0f1117] rounded-xl border border-gray-800 flex flex-col overflow-hidden shadow-2xl h-[55vh] md:h-[60vh] xl:h-[calc(100vh-140px)]">
            
            {/* Header Logs */}
            <div className="bg-[#161b22] px-4 py-3 border-b border-gray-800 flex justify-between items-center sticky top-0 z-10 shadow-sm">
               
               {/* Log Title */}
               <span className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 17l6-6-6-6M12 19h8" />
                  </svg>
                  LIVE EVENTS
               </span>

               {/* Action Buttons Group */}
               <div className="flex items-center gap-2">
                  {/* Export Button */}
                  <button 
                    onClick={handleExport}
                    disabled={isExporting || logs.length === 0}
                    title="Export to Excel"
                    className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 border border-transparent hover:border-blue-500/50 rounded transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                     {isExporting ? (
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                     ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                     )}
                  </button>

                  {/* Clear Button */}
                  <button 
                    onClick={() => setShowClearConfirm(true)}
                    disabled={isClearing || logs.length === 0}
                    title="Clear All Logs"
                    className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/50 rounded transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                     {isClearing ? (
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                     ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                     )}
                  </button>

                  {/* Divider */}
                  <div className="w-[1px] h-4 bg-gray-700 mx-1"></div>

                  {/* Counter Badge */}
                  <span className="px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-[10px] font-mono text-blue-400 font-bold min-w-[24px] text-center">
                    {filteredLogs.length}
                  </span>
               </div>
            </div>

            <div className="p-3 border-b border-gray-800 bg-[#121722] grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search logs..."
                className="col-span-2 px-2 py-1.5 bg-[#0d1117] border border-gray-700 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500"
              />
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value as 'ALL' | 'INFO' | 'WARN' | 'CRITICAL')}
                className="px-2 py-1.5 bg-[#0d1117] border border-gray-700 text-xs text-slate-300"
              >
                <option value="ALL">Severity: ALL</option>
                <option value="INFO">INFO</option>
                <option value="WARN">WARN</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value as 'ALL' | 'WEB_CLIENT' | 'BEACON' | 'SYSTEM' | 'ADMIN')}
                className="px-2 py-1.5 bg-[#0d1117] border border-gray-700 text-xs text-slate-300"
              >
                <option value="ALL">Source: ALL</option>
                <option value="WEB_CLIENT">WEB_CLIENT</option>
                <option value="BEACON">BEACON</option>
                <option value="SYSTEM">SYSTEM</option>
                <option value="ADMIN">ADMIN</option>
              </select>
              <select
                value={selectedAction}
                onChange={(e) => setSelectedAction(e.target.value)}
                className="col-span-2 px-2 py-1.5 bg-[#0d1117] border border-gray-700 text-xs text-slate-300"
              >
                {availableActions.map((action) => (
                  <option key={action} value={action}>
                    Action: {action}
                  </option>
                ))}
              </select>
            </div>

            {/* Body Logs */}
            <div className="flex-1 overflow-y-auto p-0 font-mono text-xs custom-scrollbar bg-[#0d1117]">
               {filteredLogs.map((log) => {
                  const isViolation = log.action.startsWith('VIOLATION_') || log.severity !== 'INFO';
                  const isSubmit = log.action === 'SUBMIT';
                  const isJoin = log.action === 'JOIN';
                  
                  // Config màu sắc & Icon
                  let borderClass = 'border-l-2 border-transparent';
                  let bgHoverClass = 'hover:bg-white/5';
                  let badgeClass = 'bg-gray-800 text-gray-400 border-gray-700';
                  let Icon = null;

                  if (log.severity === 'CRITICAL') {
                      borderClass = 'border-l-2 border-red-500 bg-red-950/40';
                      bgHoverClass = 'hover:bg-red-900/30';
                      badgeClass = 'bg-red-950 text-red-300 border-red-700';
                      Icon = (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
                        </svg>
                      );
                  } else if (isViolation) {
                      borderClass = 'border-l-2 border-red-600 bg-red-900/10';
                      bgHoverClass = 'hover:bg-red-900/20';
                      badgeClass = 'bg-red-950 text-red-400 border-red-900';
                      Icon = (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      );
                  } else if (isSubmit) {
                      borderClass = 'border-l-2 border-blue-500 bg-blue-900/10';
                      badgeClass = 'bg-blue-950 text-blue-400 border-blue-900';
                      Icon = (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      );
                  } else if (isJoin) {
                      badgeClass = 'bg-green-950 text-green-400 border-green-900';
                      Icon = (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                        </svg>
                      );
                  } else {
                      Icon = (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      );
                  }

                  return (
                      <div key={log.id} className={`p-3 border-b border-gray-800/50 transition-all ${borderClass} ${bgHoverClass} group`}>
                         
                         {/* Dòng 1: Thời gian & IP */}
                         <div className="flex justify-between items-center mb-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                            <span className="text-[10px] text-gray-500 flex items-center gap-1.5">
                               <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                               </svg>
                               {new Date(log.createdAt).toLocaleString('vi-VN', {
                                  day: '2-digit', month: '2-digit', 
                                  hour: '2-digit', minute: '2-digit', second: '2-digit'
                               })}
                            </span>
                            <span className="text-[10px] text-blue-500/80 font-mono flex items-center gap-1">
                               <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                               </svg>
                               {log.clientIp}
                            </span>
                         </div>

                         {/* Dòng 2: User & Action Badge */}
                         <div className="flex items-center gap-2 mb-1">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border uppercase tracking-wider flex items-center gap-1 ${badgeClass}`}>
                               {Icon}
                               {log.action}
                            </span>
                            <span className={`font-bold text-sm ${isViolation ? 'text-red-200' : 'text-gray-300'}`}>
                               <button
                                 onClick={() => setFocusedUsername(log.user?.username || "")}
                                 className="hover:text-blue-300 transition-colors"
                               >
                                 {log.user?.username || 'Unknown'}
                               </button>
                            </span>
                            <span className="text-[9px] px-1.5 py-0.5 border rounded border-slate-700 text-slate-400">{log.source}</span>
                         </div>

                         {/* Dòng 3: Details */}
                         {log.details && (
                            <div className="text-gray-500 text-[11px] pl-2 ml-1 border-l border-gray-700 leading-tight flex gap-1.5 pt-0.5">
                               <svg className="w-3 h-3 shrink-0 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" transform="scale(-1, 1) translate(-24, 0)" /> 
                               </svg>
                               {log.details}
                            </div>
                         )}
                      </div>
                  );
               })}

               {/* Empty State */}
               {filteredLogs.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-40 text-gray-700 space-y-3 mt-10">
                     <svg className="w-12 h-12 animate-pulse text-gray-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                     </svg>
                     <div className="text-xs italic font-mono">System listening for events...</div>
                  </div>
               )}
               
               <div className="h-4"></div>
            </div>
        </div>

      </div>
      <ConfirmDialog
        open={showClearConfirm}
        title="Xóa toàn bộ logs"
        description="Bạn có chắc chắn muốn xóa toàn bộ logs của kỳ thi này? Hành động này không thể hoàn tác."
        confirmText="Xóa logs"
        cancelText="Hủy"
        danger
        loading={isClearing}
        onCancel={() => setShowClearConfirm(false)}
        onConfirm={handleClearLogs}
      />
    </div>
  );
}
