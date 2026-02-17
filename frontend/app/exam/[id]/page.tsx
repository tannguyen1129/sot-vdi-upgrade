"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "../../utils/axios"; // Đảm bảo đường dẫn import đúng

import ExamLobby from "./components/ExamLobby";
import ExamMachine from "./components/ExamMachine";

// Interface cho dữ liệu phiên thi trả về từ Backend API /join
interface ExamSessionData {
  connectionToken: string;
  vmInfo: {
    ip: string;
    username: string;
  };
  wsPath?: string; // Thêm wsPath nếu backend trả về
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

  const handleExitExam = () => {
      // Xử lý nộp bài hoặc thoát
      if (confirm("Bạn có chắc muốn thoát và nộp bài?")) {
          // Gọi API finish nếu cần
          router.push("/dashboard");
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
    return (
      <ExamMachine 
        examName={exam.name}
        token={token}
        wsPath={wsPath}
        onExit={handleExitExam}
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