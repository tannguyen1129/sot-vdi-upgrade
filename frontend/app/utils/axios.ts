import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'https://sotvdi.umtoj.edu.vn/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// --- [THÊM ĐOẠN NÀY] INTERCEPTOR TỰ ĐỘNG GẮN TOKEN ---
api.interceptors.request.use(
  (config) => {
    // Luôn luôn lấy token mới nhất từ kho
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);
// -----------------------------------------------------

export default api;