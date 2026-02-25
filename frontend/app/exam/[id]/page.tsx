"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "../../utils/axios"; // Đảm bảo đường dẫn import đúng

import ExamLobby from "./components/ExamLobby";
import ExamInterface from "../../components/ExamInterface";

// Interface cho dữ liệu phiên thi trả về từ Backend API /join
interface ExamSessionData {
  connectionToken: string;
  vmInfo: {
    ip: string;
    username: string;
  };
  wsPath?: string; // Thêm wsPath nếu backend trả về
  monitoringToken?: string;
  monitoringSessionId?: string;
}

export default function ExamPage() {
  const params = useParams();
  const router = useRouter();

  // Lấy Exam ID an toàn từ URL
  const examId = useMemo(() => {
    const raw = (params as any)?.id;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params]);

  // --- STATES ---
  const [user, setUser] = useState<any>(null);
  const [exam, setExam] = useState<any>(null);
  
  // Lưu session gồm Token và Info máy ảo sau khi Join thành công
  // Quan trọng: token chính là chìa khóa để render ExamMachine
  const [token, setToken] = useState<string | null>(null);
  const [vmIp, setVmIp] = useState<string>("");
  const [vmUsername, setVmUsername] = useState<string>("student");
  const [monitoringToken, setMonitoringToken] = useState<string>("");
  const [monitoringSessionId, setMonitoringSessionId] = useState<string>("");
  const [wsPath, setWsPath] = useState<string>("");
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isReady, setIsReady] = useState(false);

  // 1. Bootstrap: Load User & Thông tin kỳ thi
  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      try {
        const userStr = localStorage.getItem("user");
        const accessToken = localStorage.getItem("accessToken") || (userStr ? JSON.parse(userStr).accessToken : null);

        if (!userStr || !accessToken) { 
          console.log("Thiếu User hoặc Token, đá về Login");
          router.push("/login");
          return;
        }
        
        const localUser = JSON.parse(userStr);
        if (!cancelled) setUser(localUser);

        // --- GẮN TOKEN VÀO HEADER ---
        api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;

        if (!examId) {
          router.push("/dashboard");
          return;
        }

        const res = await api.get(`/exams/${examId}`);
        if (!cancelled) {
          setExam(res.data);
          setIsReady(true);
        }
      } catch (err) {
        console.error("Lỗi tải đề thi:", err);
        router.push("/dashboard");
      }
    };
    bootstrap();
    return () => { cancelled = true; };
  }, [examId, router]);

  // 2. Xử lý Join Exam (Gọi API Backend 1 lần duy nhất)
  const handleJoin = async (accessCode: string) => {
    if (!user?.id) return;
    setLoading(true);
    setErrorMsg("");

    try {
        console.log(`[ExamPage] Joining exam ${examId}...`);
        // Gọi API Backend: POST /exams/:id/join
        const res = await api.post(`/exams/${examId}/join`, { 
            userId: user.id, 
            accessCode 
        });

        // Backend trả về: { token: "...", ip: "...", type: "vnc" } hoặc structure cũ
        // Ta map lại cho chuẩn
        const connectionToken = res.data.token || res.data.connectionToken;
        const wsPath = res.data.ws_path || `/guaclite`;
        // Kiểm tra xem wsPath có bị dính 'undefined' không
        console.log("WS Path received:", wsPath); 
        setWsPath(wsPath);

        if (connectionToken) {
            console.log("[ExamPage] Join success! Token received.");
            setWsPath(wsPath);
            setVmIp(res.data.ip || res.data.vmInfo?.ip || '');
            setVmUsername(res.data.vmUsername || res.data.vmInfo?.username || 'student');
            setMonitoringToken(res.data.monitoringToken || '');
            setMonitoringSessionId(res.data.monitoringSessionId || '');
            setToken(connectionToken); // Set token -> Chuyển sang màn hình thi
        } else {
            setErrorMsg("Lỗi: Server không trả về Token kết nối.");
        }
    } catch (err: any) {
        console.error("[ExamPage] Join error:", err);
        const serverMsg = err.response?.data?.message;
        const msg = Array.isArray(serverMsg) ? serverMsg[0] : (serverMsg || "Lỗi kết nối đến máy chủ thi.");
        setErrorMsg(`🛑 ${msg}`);
    } finally {
        setLoading(false);
    }
  };

  // --- RENDER ---

  if (!isReady) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gray-900 text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
        <p>Đang tải dữ liệu phòng thi...</p>
      </div>
    );
  }

  // TRƯỜNG HỢP 1: ĐÃ CÓ TOKEN (Đã Join thành công) -> VÀO MÁY THI
  if (token && user && exam) {
    const now = Date.now();
    const endTimeMs = exam?.endTime ? new Date(exam.endTime).getTime() : NaN;
    const timeLeft = Number.isFinite(endTimeMs)
      ? Math.max(0, Math.floor((endTimeMs - now) / 1000))
      : 3 * 60 * 60;

    return (
      <ExamInterface
        examId={Number(examId)}
        userId={user.id}
        token={token}
        wsPath={wsPath}
        monitoringToken={monitoringToken}
        monitoringSessionId={monitoringSessionId}
        studentInfo={{
          name: user.fullName || user.username,
          username: user.username,
          className: user.className || "N/A",
          department: user.department || "SOT",
          clientIp: "N/A",
          vmIp: vmIp || "N/A",
          vmUsername: vmUsername || "student",
          timeLeft,
        }}
      />
    );
  }

  // TRƯỜNG HỢP 2: CHƯA CÓ TOKEN -> Ở SẢNH CHỜ (LOBBY)
  return (
    <div className="min-h-screen bg-gray-50">
      <ExamLobby
        exam={exam}
        user={user}
        onJoin={handleJoin}
        loading={loading}
        error={errorMsg}
      />
    </div>
  );
}
