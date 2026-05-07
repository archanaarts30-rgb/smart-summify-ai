import { getIdToken } from './firebase';

const BASE_URL = import.meta.env.VITE_API_URL;

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

  let data: any = {};
  try {
    data = await res.json();
  } catch {
    throw new Error(`HTTP ${res.status} — response was not JSON`);
  }

  if (!res.ok) {
    const msg = data.error || data.message || data.detail || `HTTP ${res.status}`;
    console.error(`[api] ${options.method || 'GET'} ${path} → ${res.status}`, data);
    throw new Error(msg);
  }
  return data;
}

// ─── Summarize ─────────────────────────────────────────────────────
export const summarizeContent = (content: string, size: string, sourceUrl?: string) =>
  request('/v1/summarize', {
    method: 'POST',
    body: JSON.stringify({ content, size, sourceUrl }),
  });

// Guest summarize — no auth token, short summaries only, not saved to DB
export const summarizeContentGuest = async (content: string, sourceUrl?: string) => {
  const res = await fetch(`${BASE_URL}/v1/summarize/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, sourceUrl }),
  });
  let data: any = {};
  try { data = await res.json(); } catch { throw new Error(`HTTP ${res.status} — response was not JSON`); }
  if (!res.ok) {
    console.error('[api] POST /v1/summarize/guest →', res.status, data);
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
};

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
