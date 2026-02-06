"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "./../../utils/axios";

import ExamLobby from "./components/ExamLobby";
// Import Interface StudentInfo để đảm bảo type-safe
import ExamInterface, { StudentInfo } from "../../components/ExamInterface"; 

// Interface cho dữ liệu phiên thi trả về từ Backend API /join
interface ExamSessionData {
  connectionToken: string;
  vmInfo: {
    ip: string;
    username: string; // [MỚI] Tên user của máy ảo (vd: Administrator, Lab01)
  };
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
  const [examSession, setExamSession] = useState<ExamSessionData | null>(null);
  const [wsPath, setWsPath] = useState<string>("");
  
  const [clientIp, setClientIp] = useState<string>("Đang lấy IP...");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isReady, setIsReady] = useState(false);

  // 1. Lấy IP thực của máy thí sinh (Client IP)
  useEffect(() => {
    const fetchClientIp = async () => {
      try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        setClientIp(data.ip);
      } catch (err) {
        console.error("Failed to fetch Client IP:", err);
        setClientIp("Unknown IP");
      }
    };
    fetchClientIp();
  }, []);

  // 2. Bootstrap: Load User & Thông tin kỳ thi
  useEffect(() => {
  let cancelled = false;
  const bootstrap = async () => {
    try {
      const userStr = localStorage.getItem("user");
      
      // [QUAN TRỌNG] Lấy token từ localStorage (hoặc từ object user nếu bác lưu trong đó)
      // Bác kiểm tra lại lúc Login bác lưu token tên là gì nhé (thường là accessToken hoặc access_token)
      const token = localStorage.getItem("accessToken") || (userStr ? JSON.parse(userStr).accessToken : null);

      if (!userStr || !token) { 
        console.log("Thiếu User hoặc Token, đá về Login");
        router.push("/login");
        return;
      }
      
      const localUser = JSON.parse(userStr);
      if (!cancelled) setUser(localUser);

      // --- [FIX CHÍNH] GẮN TOKEN VÀO ĐẦU MỌI REQUEST ---
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      // -------------------------------------------------

      if (!examId) {
        router.push("/dashboard");
        return;
      }

      // Giờ gọi API mới không bị 401
      const res = await api.get(`/exams/${examId}`);
      if (!cancelled) {
        setExam(res.data);
        setIsReady(true);
      }
    } catch (err) {
      console.error("Lỗi tải đề thi:", err);
      // Nếu lỗi quá nặng thì mới về dashboard
      router.push("/dashboard");
    }
  };
  bootstrap();
  return () => { cancelled = true; };
}, [examId, router]);

  // 3. Xử lý Join Exam (Gọi API Backend)
  const handleJoin = async (accessCode: string) => {
    if (!user?.id) return;
    setLoading(true);
    setErrorMsg("");

    try {
        // Gọi API Backend: POST /exams/:id/join
        const res = await api.post(`/exams/${examId}/join`, { 
            userId: user.id, 
            accessCode 
        });

        if (res.data?.connectionToken) {
            setExamSession({
                connectionToken: res.data.connectionToken,
                vmInfo: res.data.vmInfo || { ip: "Unknown", username: "Unknown" }
            });

            const path = res.data.ws_path || `/guaclite`;
            setWsPath(path);
        }
    } catch (err: any) {
        const msg = err.response?.data?.message || "Lỗi kết nối đến máy chủ thi.";
        setErrorMsg(msg);
    } finally {
        setLoading(false);
    }
  };

  // Helper tính thời gian còn lại (seconds)
  const calculateTimeLeft = (endTimeStr: string) => {
    if (!endTimeStr) return 0;
    const now = new Date().getTime();
    const end = new Date(endTimeStr).getTime();
    const diff = Math.floor((end - now) / 1000);
    return diff > 0 ? diff : 0;
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

  // TRƯỜNG HỢP 1: ĐÃ CÓ SESSION (Đã Join thành công) -> VÀO GIAO DIỆN THI
  if (examSession && user && exam) {

    const rawEndTime = exam.endTime || exam.end_time || exam.endDate;

    console.log("DEBUG TIME:", {
        raw: rawEndTime,
        parsed: new Date(rawEndTime).getTime(),
        now: new Date().getTime()
    });
    
    // Tạo object StudentInfo đầy đủ các trường mới
    const studentInfo: StudentInfo = {
        name: user.fullName || user.username,
        username: user.username, // MSSV
        className: user.className || "N/A", // Lớp
        department: user.department || "Khoa Công Nghệ", 
        
        clientIp: clientIp,
        
        vmIp: examSession.vmInfo.ip,
        
        // [MỚI] Username máy ảo (Lấy từ kết quả Join)
        vmUsername: examSession.vmInfo.username,
        
        timeLeft: calculateTimeLeft(rawEndTime)
    };

    return (
      <ExamInterface 
        token={examSession.connectionToken} 
        studentInfo={studentInfo}
        examId={exam.id}
        userId={user.id}
        wsPath={wsPath}
      />
    );
  }

  // TRƯỜNG HỢP 2: CHƯA CÓ SESSION -> Ở SẢNH CHỜ (LOBBY)
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
