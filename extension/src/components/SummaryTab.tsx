import React, { useState, useRef } from 'react';
import { useStore } from '../store';
import { summarizeContent, summarizeFile } from '../lib/api';

const SIZE_OPTIONS = [
  { id: 'small', label: 'Short', desc: '3–5 sentences' },
  { id: 'medium', label: 'Medium', desc: '2–3 paragraphs' },
  { id: 'large', label: 'Full', desc: 'Detailed breakdown' },
] as const;

export default function SummaryTab() {
  const { user, summarySize, setSummarySize, currentSummary, setCurrentSummary, setAudioPlaying } = useStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [audioState, setAudioState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const plan = user?.plan || 'free';
  const allowedSizes = plan === 'free' ? ['small'] : ['small', 'medium', 'large'];
  const canUpload = plan !== 'free';

  const summarizePage = async () => {
    setError(''); setLoading(true);
    try {
      const response = await chrome.runtime.sendMessage({ type: 'FETCH_PAGE_CONTENT' });
      if (response?.error) throw new Error(response.error);
      const result = await summarizeContent(response.content, summarySize, response.url);
      setCurrentSummary(result);
    } catch (e: any) {
      setError(e.message || 'Summarization failed');
    } finally {
      setLoading(false);
    }
  };

  const summarizeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(''); setLoading(true);
    try {
      const result = await summarizeFile(file, summarySize);
      setCurrentSummary(result);
    } catch (e: any) {
      setError(e.message || 'File summarization failed');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleCopy = () => {
    if (!currentSummary) return;
    navigator.clipboard.writeText(currentSummary.summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAudio = () => {
    if (!currentSummary) return;
    if (audioState === 'playing') {
      window.speechSynthesis.pause();
      setAudioState('paused');
      setAudioPlaying(false);
    } else if (audioState === 'paused') {
      window.speechSynthesis.resume();
      setAudioState('playing');
      setAudioPlaying(true);
    } else {
      const utterance = new SpeechSynthesisUtterance(currentSummary.summary);
      utterance.rate = 0.95;
      utterance.onend = () => { setAudioState('idle'); setAudioPlaying(false); };
      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
      setAudioState('playing');
      setAudioPlaying(true);
    }
  };

  const stopAudio = () => {
    window.speechSynthesis.cancel();
    setAudioState('idle');
    setAudioPlaying(false);
  };

  const fmtSeconds = (s: number) => s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;

  return (
    <div style={{ padding: 16 }}>
      {/* Size picker */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {SIZE_OPTIONS.map(s => {
          const locked = !allowedSizes.includes(s.id);
          return (
            <button
              key={s.id}
              onClick={() => !locked && setSummarySize(s.id)}
              title={locked ? 'Upgrade to unlock' : s.desc}
              style={{
                flex: 1, padding: '7px 4px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                background: summarySize === s.id ? 'var(--accent)' : 'var(--bg2)',
                color: summarySize === s.id ? '#fff' : locked ? 'var(--text2)' : 'var(--text)',
                border: '1px solid ' + (summarySize === s.id ? 'var(--accent)' : 'var(--border)'),
                cursor: locked ? 'not-allowed' : 'pointer',
                opacity: locked ? 0.5 : 1,
              }}
            >
              {s.label} {locked ? '🔒' : ''}
            </button>
          );
        })}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button
          onClick={summarizePage}
          disabled={loading}
          className="btn"
          style={{ flex: 1 }}
        >
          {loading ? 'Summarizing...' : 'Summarize this page'}
        </button>

        <button
          onClick={() => canUpload ? fileInputRef.current?.click() : null}
          disabled={loading || !canUpload}
          className="btn-ghost"
          title={canUpload ? 'Upload PDF or Word doc' : 'Upload requires Basic plan'}
          style={{ padding: '8px 12px' }}
        >
          {canUpload ? '⬆ Upload' : '🔒 Upload'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt"
          style={{ display: 'none' }}
          onChange={summarizeUpload}
        />
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: 'var(--danger)', marginBottom: 12 }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text2)', fontSize: 13 }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>✦</div>
          Analyzing content with AI...
        </div>
      )}

      {/* Summary result */}
      {currentSummary && !loading && (
        <div>
          {/* Metrics bar */}
          <div style={{
            display: 'flex', gap: 10, marginBottom: 10, padding: '8px 12px',
            background: 'var(--bg2)', borderRadius: 8, fontSize: 11,
          }}>
            <span style={{ color: 'var(--success)', fontWeight: 600 }}>
              ⏱ {fmtSeconds(currentSummary.metrics.timeSavedSec)} saved
            </span>
            <span style={{ color: 'var(--text2)' }}>
              {currentSummary.metrics.originalWordCount} → {currentSummary.metrics.summaryWordCount} words
            </span>
            <span style={{ color: 'var(--text2)' }}>
              {currentSummary.metrics.compressionRatio}% shorter
            </span>
          </div>

          {/* Summary text */}
          <div style={{
            background: 'var(--bg2)', border: '1px solid var(--border)',
            borderRadius: 10, padding: 14, fontSize: 'var(--font-size-base)',
            lineHeight: 1.65, color: 'var(--text)', marginBottom: 10,
            maxHeight: 280, overflowY: 'auto', whiteSpace: 'pre-wrap',
          }}>
            {currentSummary.summary}
          </div>

          {/* Action toolbar */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={handleCopy} className="btn-ghost" style={{ fontSize: 12 }}>
              {copied ? '✓ Copied' : '⎘ Copy'}
            </button>
            <button onClick={handleAudio} className="btn-ghost" style={{ fontSize: 12 }}>
              {audioState === 'playing' ? '⏸ Pause' : audioState === 'paused' ? '▶ Resume' : '▶ Listen'}
            </button>
            {audioState !== 'idle' && (
              <button onClick={stopAudio} className="btn-ghost" style={{ fontSize: 12 }}>
                ⏹ Stop
              </button>
            )}
            <button
              onClick={() => setCurrentSummary(null)}
              className="btn-ghost"
              style={{ fontSize: 12, marginLeft: 'auto' }}
            >
              ✕ Clear
            </button>
          </div>
        </div>
      )}

      {/* Upgrade prompt for free users */}
      {plan === 'free' && (
        <div style={{
          marginTop: 16, padding: '10px 14px', background: '#f5f3ff',
          border: '1px solid #ddd6fe', borderRadius: 10, fontSize: 12, color: '#5b21b6',
        }}>
          <strong>Free plan:</strong> 5 summaries/day, short size only.{' '}
          <span
            onClick={() => chrome.tabs.create({ url: 'https://smartsummify.app/upgrade' })}
            style={{ fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
          >
            Upgrade for $4.99/mo →
          </span>
        </div>
      )}
    </div>
  );
}
