import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { getHistory } from '../lib/api';

interface HistoryItem {
  id: string;
  source_url: string | null;
  file_name: string | null;
  size_requested: string;
  summary_word_count: number;
  time_saved_sec: number;
  created_at: string;
}

export default function HistoryTab() {
  const { setCurrentSummary } = useStore();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getHistory()
      .then(data => setItems(data.summaries))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const fmtSaved = (s: number) => s >= 60 ? `${Math.floor(s / 60)}m saved` : `${s}s saved`;
  const getTitle = (item: HistoryItem) => {
    if (item.file_name) return item.file_name;
    if (item.source_url) {
      try { return new URL(item.source_url).hostname; } catch { return item.source_url; }
    }
    return 'Unknown source';
  };

  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>Loading history...</div>;
  if (error) return <div style={{ padding: 16, color: 'var(--danger)', fontSize: 13 }}>{error}</div>;
  if (!items.length) return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>No summaries yet. Go summarize something!</div>;

  return (
    <div style={{ padding: '8px 0' }}>
      {items.map(item => (
        <div
          key={item.id}
          style={{
            padding: '10px 16px', borderBottom: '1px solid var(--border)',
            cursor: 'pointer', transition: 'background 0.1s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg2)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {getTitle(item)}
            </span>
            <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>{fmtSaved(item.time_saved_sec)}</span>
          </div>
          <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--text2)' }}>
            <span>{item.size_requested}</span>
            <span>{item.summary_word_count} words</span>
            <span>{fmtDate(item.created_at)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
