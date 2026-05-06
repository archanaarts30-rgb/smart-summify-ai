import { getIdToken } from './firebase';

const BASE_URL = 'https://your-backend.railway.app'; // ← update after deploy

async function request(path: string, options: RequestInit = {}) {
  const token = await getIdToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ─── Summarize ─────────────────────────────────────────────────────
export const summarizeContent = (content: string, size: string, sourceUrl?: string) =>
  request('/v1/summarize', {
    method: 'POST',
    body: JSON.stringify({ content, size, sourceUrl }),
  });

export const summarizeFile = async (file: File, size: string) => {
  const token = await getIdToken();
  const form = new FormData();
  form.append('file', file);
  form.append('size', size);
  const res = await fetch(`${BASE_URL}/v1/summarize/file`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data;
};

// ─── Chat ──────────────────────────────────────────────────────────
export const sendChatMessage = (summaryId: string, message: string, history: any[]) =>
  request('/v1/chat', {
    method: 'POST',
    body: JSON.stringify({ summaryId, message, history }),
  });

export const getChatHistory = (summaryId: string) =>
  request(`/v1/chat/${summaryId}`);

// ─── Export ────────────────────────────────────────────────────────
export const exportSummary = (summaryId: string, format: 'pdf' | 'docx' | 'txt') =>
  request('/v1/export', {
    method: 'POST',
    body: JSON.stringify({ summaryId, format }),
  });

// ─── Social images ─────────────────────────────────────────────────
export const generateSocialImages = (summaryId: string, count: number) =>
  request('/v1/social-images', {
    method: 'POST',
    body: JSON.stringify({ summaryId, count }),
  });

// ─── Slides ────────────────────────────────────────────────────────
export const generateSlides = (summaryId: string, slideCount: number) =>
  request('/v1/slides', {
    method: 'POST',
    body: JSON.stringify({ summaryId, slideCount }),
  });

// ─── User ──────────────────────────────────────────────────────────
export const getMe = () => request('/v1/users/me');
export const updateProfile = (displayName: string) =>
  request('/v1/users/me', { method: 'PATCH', body: JSON.stringify({ displayName }) });
export const subscribe = (plan: 'basic' | 'premium') =>
  request('/v1/users/subscribe', { method: 'POST', body: JSON.stringify({ plan }) });
export const openBillingPortal = () =>
  request('/v1/users/billing-portal', { method: 'POST' });
export const getHistory = (page = 1) =>
  request(`/v1/users/history?page=${page}`);
