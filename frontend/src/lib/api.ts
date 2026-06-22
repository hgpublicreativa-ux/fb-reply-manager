import axios from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  register: (email: string, password: string) =>
    api.post('/auth/register', { email, password }),
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  me: () => api.get('/auth/me'),
  getFacebookAuthUrl: () => api.get('/auth/facebook'),
};

export const accountsApi = {
  list: () => api.get('/accounts'),
  disconnect: (id: string) => api.delete(`/accounts/${id}`),
  getSettings: (id: string) => api.get(`/accounts/${id}/settings`),
  updateSettings: (id: string, settings: { tone: string; rules: string[] }) =>
    api.put(`/accounts/${id}/settings`, settings),
  getStats: (id: string) => api.get(`/accounts/${id}/stats`),
  getOverview: () => api.get('/accounts/overview'),
};

export const commentsApi = {
  list: (params: {
    accountId: string;
    filter?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) => api.get('/comments', { params }),
  sync: (accountId: string) => api.post(`/comments/sync/${accountId}`),
};

export const responsesApi = {
  generate: (commentId: string) =>
    api.post('/responses/generate', { commentId }),
  update: (id: string, actualText: string) =>
    api.put(`/responses/${id}`, { actualText }),
  publish: (id: string) => api.post(`/responses/${id}/publish`),
  reject: (id: string) => api.post(`/responses/${id}/reject`),
};
