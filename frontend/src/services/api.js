import axios from 'axios';

// Get base URL from env, or default to localhost
const API = import.meta.env.VITE_API_URL;

const api = axios.create({
  baseURL: API,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const getWebhooks = async () => {
  const response = await api.get('/api/webhooks');
  return response.data;
};

export const getWebhookDetails = async (id) => {
  const response = await api.get(`/webhooks/${id}`);
  return response.data;
};

export const replayWebhook = async (id) => {
  const response = await api.post(`/api/webhooks/${id}/replay`);
  return response.data;
};

export const getSystemStatus = async () => {
  const response = await api.get('/api/system/status');
  return response.data;
};

export const simulateWebhook = async (provider = 'stripe') => {
  const response = await api.post(`/api/webhooks/simulate?provider=${provider}`);
  return response.data;
};

export const simulateCustom = async (payload, provider = 'custom') => {
  const response = await api.post(`/api/v1/simulate?provider=${provider}`, payload);
  return response.data;
};

export const SSE_URL = `${API}/api/events/stream`;

export default api;
