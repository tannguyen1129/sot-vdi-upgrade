import axios from 'axios';

const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
const normalizedApiBase = configuredApiUrl
  ? `${configuredApiUrl.replace(/\/+$/, '').replace(/\/api$/, '')}/api`
  : '/api';

const api = axios.create({
  baseURL: normalizedApiBase,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      // 1. Thử lấy token trực tiếp
      let token = localStorage.getItem('accessToken') || localStorage.getItem('access_token');

      // 2. Nếu không có, thử tìm trong object 'user'
      if (!token) {
        const userStr = localStorage.getItem('user');
        if (userStr) {
          try {
            const user = JSON.parse(userStr);
            // Kiểm tra các trường hợp tên biến phổ biến
            token = user.accessToken || user.access_token || user.token;
          } catch (e) {
            console.error("Lỗi parse user từ localStorage", e);
          }
        }
      }

      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export default api;

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (typeof window !== 'undefined' && error?.response?.status === 401) {
      // Token hết hạn / không hợp lệ -> reset session để tránh vòng lặp 401 khó hiểu.
      localStorage.removeItem('accessToken');
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      window.dispatchEvent(new Event('auth-change'));
    }
    return Promise.reject(error);
  },
);
