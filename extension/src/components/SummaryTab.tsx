import React, { useState, useRef, useEffect } from 'react';
import { useStore, GUEST_FREE_LIMIT, UsageStats } from '../store';
import {
  summarizeContent, summarizeContentGuest, summarizeFile,
  subscribe, exportSummary, generateSocialImages, generateSlides, sendChatMessage,
} from '../lib/api';

// ─── Inline SVG Icons ────────────────────────────────────────────────────────
const Ico = ({ d, size = 16 }: { d: string | string[]; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    {(Array.isArray(d) ? d : [d]).map((path, i) => <path key={i} d={path} />)}
  </svg>
);

const Icons = {
  FontMinus: () => <Ico d={["M4 7h16","M4 12h10","M4 17h7","M17 14v7","M14 17.5h6"]} />,
  FontPlus:  () => <Ico d={["M4 7h16","M4 12h10","M4 17h7","M17 12v9","M14 16.5h6"]} />,
  Copy:      () => <Ico d="M8 4H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2M8 4a2 2 0 012-2h4a2 2 0 012 2M8 4h8" />,
  Check:     () => <Ico d="M5 13l4 4L19 7" />,
  Play:      () => <Ico d="M5 3l14 9-14 9V3z" />,
  Pause:     () => <Ico d={["M10 4H6v16h4V4z","M18 4h-4v16h4V4z"]} />,
  Resume:    () => <Ico d="M5 3l14 9-14 9V3z" />,
  Stop:      () => <Ico d="M4 4h16v16H4z" />,
  Download:  () => <Ico d={["M12 3v13","M7.5 11.5L12 16l4.5-4.5","M3 17.5v1A2.5 2.5 0 005.5 21h13a2.5 2.5 0 002.5-2.5v-1"]} />,
  Chat:      () => <Ico d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />,
  Slides:    () => <Ico d={["M2 3h20v14H2z","M8 21h8","M12 17v4","M7 9h.01","M11 9h6","M7 12h.01","M11 12h4"]} />,
  Image:     () => <Ico d={["M4 3h16a1 1 0 011 1v16a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1z","M3 15l5-5 4 4 3-3 6 6","M14.5 8a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"]} />,
  Globe:     () => <Ico d={["M12 2a10 10 0 100 20A10 10 0 0012 2z","M2 12h20","M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"]} />,
  ChevDown:  () => <Ico d="M6 9l6 6 6-6" />,
  Trash:     () => <Ico d={["M3 6h18","M8 6V4h8v2","M19 6l-1 14H6L5 6"]} />,
};

// ─── Tiny inline markdown → HTML converter ───────────────────────────────────
function mdToHtml(md: string): string {
  if (!md) return '';
  const lines = md.split('\n');
  const out: string[] = [];
  let inUL = false, inOL = false;

  const closeList = () => {
    if (inUL) { out.push('</ul>'); inUL = false; }
    if (inOL) { out.push('</ol>'); inOL = false; }
  };

  const inlineFormat = (s: string) =>
    s
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>');

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (/^#{4,}\s/.test(line)) {
      closeList();
      out.push(`<h4>${inlineFormat(line.replace(/^#{4,}\s/, ''))}</h4>`);
    } else if (/^###\s/.test(line)) {
      closeList();
      out.push(`<h3>${inlineFormat(line.replace(/^###\s/, ''))}</h3>`);
    } else if (/^##\s/.test(line)) {
      closeList();
      out.push(`<h2>${inlineFormat(line.replace(/^##\s/, ''))}</h2>`);
    } else if (/^#\s/.test(line)) {
      closeList();
      out.push(`<h1>${inlineFormat(line.replace(/^#\s/, ''))}</h1>`);
    } else if (/^\d+\.\s/.test(line)) {
      if (!inOL) { if (inUL) { out.push('</ul>'); inUL = false; } out.push('<ol>'); inOL = true; }
      out.push(`<li>${inlineFormat(line.replace(/^\d+\.\s/, ''))}</li>`);
    } else if (/^[-*+]\s/.test(line)) {
      if (!inUL) { if (inOL) { out.push('</ol>'); inOL = false; } out.push('<ul>'); inUL = true; }
      out.push(`<li>${inlineFormat(line.replace(/^[-*+]\s/, ''))}</li>`);
    } else if (line === '') {
      closeList();
      out.push('<br>');
    } else {
      closeList();
      out.push(`<p>${inlineFormat(line)}</p>`);
    }
  }
  closeList();
  return out.join('');
}

// ─── Constants ────────────────────────────────────────────────────────────────
const SIZE_OPTIONS = [
  { id: 'small',  label: 'Short',  desc: '3–5 sentences' },
  { id: 'medium', label: 'Medium', desc: '2–3 paragraphs' },
  { id: 'large',  label: 'Full',   desc: 'Detailed breakdown' },
] as const;

const LANGUAGES = [
  { value: 'auto',       label: '🌐 Auto (same as source)' },
  { value: 'English',    label: '🇺🇸 English' },
  { value: 'Spanish',    label: '🇪🇸 Spanish' },
  { value: 'French',     label: '🇫🇷 French' },
  { value: 'German',     label: '🇩🇪 German' },
  { value: 'Portuguese', label: '🇧🇷 Portuguese' },
  { value: 'Italian',    label: '🇮🇹 Italian' },
  { value: 'Dutch',      label: '🇳🇱 Dutch' },
  { value: 'Russian',    label: '🇷🇺 Russian' },
  { value: 'Chinese (Simplified)', label: '🇨🇳 Chinese' },
  { value: 'Japanese',   label: '🇯🇵 Japanese' },
  { value: 'Korean',     label: '🇰🇷 Korean' },
  { value: 'Arabic',     label: '🇸🇦 Arabic' },
  { value: 'Hindi',      label: '🇮🇳 Hindi' },
  { value: 'Turkish',    label: '🇹🇷 Turkish' },
];

const THEME_COLORS: Record<string, string> = {
  blue: '#3b82f6', purple: '#8b5cf6', teal: '#14b8a6', coral: '#f97316', amber: '#f59e0b',
};

type SourceMode = 'page' | 'document';

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SummaryTab() {
  const {
    user, summarySize, setSummarySize, currentSummary, setCurrentSummary, setAudioPlaying,
    guestSummaryCount, incrementGuestCount, setShowAuthModal,
    chatHistory, addChatMessage, clearChat,
    usage, setUsage, fontSize, increaseFontSize, decreaseFontSize,
  } = useStore();

  // ── Source + Language ─────────────────────────────────────────────
  const [sourceMode, setSourceMode] = useState<SourceMode>('page');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [targetLanguage, setTargetLanguage] = useState('auto');

  // ── Summarize state ───────────────────────────────────────────────
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Audio state ───────────────────────────────────────────────────
  const [audioState, setAudioState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [copied, setCopied] = useState(false);

  // ── Export state ──────────────────────────────────────────────────
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportLoading,  setExportLoading]  = useState<string | null>(null);
  const [exportError,    setExportError]    = useState('');
  const exportRef = useRef<HTMLDivElement>(null);

  // ── Social images state ───────────────────────────────────────────
  const [socialCount,   setSocialCount]   = useState(3);
  const [socialLoading, setSocialLoading] = useState(false);
  const [socialCards,   setSocialCards]   = useState<any[]>([]);
  const [socialError,   setSocialError]   = useState('');

  // ── Slides state ──────────────────────────────────────────────────
  const [slidesLoading, setSlidesLoading] = useState(false);
  const [slidesError,   setSlidesError]   = useState('');

  // ── Chat state ────────────────────────────────────────────────────
  const [showChat,    setShowChat]    = useState(false);
  const [chatInput,   setChatInput]   = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError,   setChatError]   = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const isGuest         = !user;
  const plan            = user?.plan || 'free';
  const allowedSizes    = plan === 'free' ? ['small'] : ['small', 'medium', 'large'];
  const canUpload       = plan !== 'free';
  const canExport       = plan !== 'free';
  const canChat         = plan !== 'free';
  const canSlides       = plan === 'premium';
  const maxSocialImages = plan === 'premium' ? 5 : plan === 'basic' ? 3 : 0;
  const guestLimitReached = isGuest && guestSummaryCount >= GUEST_FREE_LIMIT;

  // Close export menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    if (showChat) chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, showChat]);

  // Reset per-summary UI state
  useEffect(() => {
    setShowExportMenu(false);
    setSocialCards([]);
    setShowChat(false);
    setChatError('');
    setSlidesError('');
    setExportError('');
    setSocialError('');
  }, [currentSummary?.summaryId]);

  // ── Summarize page ────────────────────────────────────────────────
  const summarizePage = async () => {
    if (guestLimitReached) { setShowAuthModal(true); return; }
    setError(''); setLoading(true);
    try {
      const response = await chrome.runtime.sendMessage({ type: 'FETCH_PAGE_CONTENT' });
      if (response?.error) throw new Error(response.error);
      let result;
      if (isGuest) {
        result = await summarizeContentGuest(response.content, response.url, targetLanguage);
        incrementGuestCount();
      } else {
        result = await summarizeContent(response.content, summarySize, response.url, targetLanguage);
        if (usage) setUsage({ ...usage, summariesToday: usage.summariesToday + 1, summariesThisMonth: usage.summariesThisMonth + 1, totalSummaries: usage.totalSummaries + 1 });
      }
      setCurrentSummary(result);
    } catch (e: any) {
      setError(e.message || 'Summarization failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Summarize document ────────────────────────────────────────────
  const summarizeDocument = async () => {
    if (!selectedFile) return;
    setError(''); setLoading(true);
    try {
      const result = await summarizeFile(selectedFile, summarySize, targetLanguage);
      if (usage) setUsage({ ...usage, summariesToday: usage.summariesToday + 1, summariesThisMonth: usage.summariesThisMonth + 1, totalSummaries: usage.totalSummaries + 1 });
      setCurrentSummary(result);
    } catch (e: any) {
      setError(e.message || 'Document summarization failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const onFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setSelectedFile(file); setError(''); }
    e.target.value = '';
  };

  const removeFile = () => { setSelectedFile(null); setError(''); };

  // ── Copy ──────────────────────────────────────────────────────────
  const handleCopy = () => {
    if (!currentSummary) return;
    navigator.clipboard.writeText(currentSummary.summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Audio ─────────────────────────────────────────────────────────
  const handleAudio = () => {
    if (!currentSummary) return;
    if (audioState === 'playing') {
      window.speechSynthesis.pause();
      setAudioState('paused'); setAudioPlaying(false);
    } else if (audioState === 'paused') {
      window.speechSynthesis.resume();
      setAudioState('playing'); setAudioPlaying(true);
    } else {
      const utterance = new SpeechSynthesisUtterance(currentSummary.summary);
      utterance.rate = 0.95;
      utterance.onend = () => { setAudioState('idle'); setAudioPlaying(false); };
      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
      setAudioState('playing'); setAudioPlaying(true);
    }
  };

  const stopAudio = () => { window.speechSynthesis.cancel(); setAudioState('idle'); setAudioPlaying(false); };

  // ── Export ────────────────────────────────────────────────────────
  const handleExport = async (format: 'pdf' | 'docx' | 'txt') => {
    if (!canExport || !currentSummary) return;
    setExportLoading(format); setExportError(''); setShowExportMenu(false);
    try {
      const { downloadUrl } = await exportSummary(currentSummary.summaryId, format);
      chrome.tabs.create({ url: downloadUrl });
    } catch (e: any) {
      setExportError(e.message || 'Export failed');
    } finally {
      setExportLoading(null);
    }
  };

  // ── Social images ─────────────────────────────────────────────────
  const handleSocialImages = async () => {
    if (!currentSummary) return;
    setSocialLoading(true); setSocialError(''); setSocialCards([]);
    try {
      const { cards } = await generateSocialImages(currentSummary.summaryId, socialCount);
      setSocialCards(cards);
    } catch (e: any) {
      setSocialError(e.message || 'Social image generation failed');
    } finally {
      setSocialLoading(false);
    }
  };

  // ── Slides ────────────────────────────────────────────────────────
  const handleSlides = async () => {
    if (!currentSummary || !canSlides) return;
    setSlidesLoading(true); setSlidesError('');
    try {
      const { downloadUrl } = await generateSlides(currentSummary.summaryId, 8);
      chrome.tabs.create({ url: downloadUrl });
    } catch (e: any) {
      setSlidesError(e.message || 'Slide generation failed');
    } finally {
      setSlidesLoading(false);
    }
  };

  // ── Upgrade ───────────────────────────────────────────────────────
  const handleUpgrade = async () => {
    try {
      const { checkoutUrl } = await subscribe('basic');
      if (checkoutUrl) chrome.tabs.create({ url: checkoutUrl });
    } catch (e: any) {
      setError(e.message || 'Could not start checkout. Please try again.');
    }
  };

  // ── Chat ──────────────────────────────────────────────────────────
  const sendChat = async () => {
    if (!chatInput.trim() || !currentSummary || chatLoading) return;
    const msg = chatInput.trim();
    setChatInput(''); setChatError('');
    addChatMessage({ role: 'user', content: msg });
    setChatLoading(true);
    try {
      const { reply } = await sendChatMessage(currentSummary.summaryId, msg, chatHistory);
      addChatMessage({ role: 'assistant', content: reply });
    } catch (e: any) {
      setChatError(e.message || 'Chat failed. Please try again.');
    } finally {
      setChatLoading(false);
    }
  };

  const handleClear = () => {
    setCurrentSummary(null);
    clearChat();
    stopAudio();
    setSelectedFile(null);
    setError('');
  };

  const fmtSeconds = (s: number) => s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 14 }}>

      {/* ══════════════════════════════════════════════════════════════
          ROW 1: Source tabs + Language picker (ALWAYS VISIBLE)
      ══════════════════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>

        {/* Source tabs */}
        <div style={{
          display: 'flex', gap: 3, padding: 3, flex: 1,
          background: 'var(--bg2)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
        }}>
          {(['page', 'document'] as SourceMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => { setSourceMode(mode); setError(''); }}
              style={{
                flex: 1, padding: '7px 4px', fontSize: 12, fontWeight: 600,
                borderRadius: 'var(--radius)',
                border: 'none',
                background: sourceMode === mode ? 'var(--accent)' : 'transparent',
                color: sourceMode === mode ? '#fff' : 'var(--text2)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {mode === 'page' ? '🌐 Webpage' : '📄 Document'}
            </button>
          ))}
        </div>

        {/* Language picker */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '6px 10px',
            background: 'var(--bg2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', cursor: 'pointer',
          }}>
            <span style={{ color: 'var(--text2)', display: 'flex', alignItems: 'center' }}>
              <Icons.Globe />
            </span>
            <select
              value={targetLanguage}
              onChange={e => setTargetLanguage(e.target.value)}
              style={{
                background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--text)', fontSize: 11, fontWeight: 500,
                cursor: 'pointer', appearance: 'none', paddingRight: 2,
                maxWidth: 80,
              }}
            >
              {LANGUAGES.map(l => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          ROW 2: Size picker (ALWAYS VISIBLE)
      ══════════════════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {SIZE_OPTIONS.map(s => {
          const locked = !allowedSizes.includes(s.id);
          return (
            <button
              key={s.id}
              onClick={() => !locked && setSummarySize(s.id)}
              title={locked ? 'Upgrade to unlock' : s.desc}
              style={{
                flex: 1, padding: '7px 4px', borderRadius: 'var(--radius)',
                fontSize: 12, fontWeight: 500,
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

      {/* ══════════════════════════════════════════════════════════════
          ACTION AREA — changes by mode
      ══════════════════════════════════════════════════════════════ */}

      {/* PAGE MODE */}
      {sourceMode === 'page' && !currentSummary && (
        <button
          onClick={summarizePage}
          disabled={loading}
          className="btn"
          style={{ width: '100%', padding: '11px', fontSize: 14, fontWeight: 700, marginBottom: 14 }}
        >
          {loading ? 'Summarizing...' : 'Summarize!!!'}
        </button>
      )}
      {sourceMode === 'page' && currentSummary && (
        <button
          onClick={summarizePage}
          disabled={loading}
          className="btn-ghost"
          style={{ width: '100%', padding: '8px', fontSize: 12, marginBottom: 10 }}
        >
          ↺ Re-summarize this page
        </button>
      )}

      {/* DOCUMENT MODE */}
      {sourceMode === 'document' && (
        <div style={{ marginBottom: 14 }}>
          {!canUpload ? (
            <div style={{
              padding: '16px', borderRadius: 'var(--radius-lg)', textAlign: 'center',
              border: '2px dashed var(--border)', background: 'var(--bg2)',
            }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>📄</div>
              <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
                Document upload requires <strong>Basic</strong> or <strong>Premium</strong>.
              </p>
              <button className="btn" style={{ fontSize: 12, padding: '6px 14px' }} onClick={handleUpgrade}>
                Upgrade to unlock
              </button>
            </div>
          ) : selectedFile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                borderRadius: 'var(--radius-lg)', background: 'var(--bg2)',
                border: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: 18 }}>📄</span>
                <span style={{
                  flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{selectedFile.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text2)', flexShrink: 0 }}>
                  {(selectedFile.size / 1024).toFixed(0)} KB
                </span>
                <button onClick={removeFile}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 16, lineHeight: 1 }}
                  title="Remove file">✕</button>
              </div>
              <button
                onClick={summarizeDocument}
                disabled={loading}
                className="btn"
                style={{ width: '100%', padding: '10px', fontSize: 13, fontWeight: 700 }}
              >
                {loading ? 'Summarizing...' : 'Summarize Document'}
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '100%', padding: '20px 16px', cursor: 'pointer',
                borderRadius: 'var(--radius-lg)', fontSize: 13, textAlign: 'center',
                border: '2px dashed var(--accent)', background: 'var(--bg2)',
                color: 'var(--accent)', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 6, transition: 'all 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(109,74,247,0.06)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg2)')}
            >
              <span style={{ fontSize: 28 }}>📂</span>
              <span style={{ fontWeight: 600 }}>Upload your Document</span>
              <span style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 400 }}>
                PDF, Word (.docx), or plain text · Max 10 MB
              </span>
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt"
            style={{ display: 'none' }}
            onChange={onFileChosen}
          />
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca',
          borderRadius: 'var(--radius)', padding: '9px 12px', fontSize: 12,
          color: 'var(--danger)', marginBottom: 12,
        }}>{error}</div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text2)', fontSize: 13, marginBottom: 8 }}>
          <div style={{ fontSize: 20, marginBottom: 5, animation: 'spin 1s linear infinite' }}>✦</div>
          Analyzing content with AI...
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          FEATURE PANELS: Slides + Social Cards — ALWAYS VISIBLE
      ══════════════════════════════════════════════════════════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>

        {/* ─ Slides panel ─ */}
        <div style={{
          padding: '11px', borderRadius: 'var(--radius-lg)', fontSize: 12,
          border: `1px solid ${canSlides ? 'rgba(124,58,237,0.35)' : 'var(--border)'}`,
          background: canSlides ? 'rgba(124,58,237,0.05)' : 'var(--bg2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 7 }}>
            <span style={{ color: '#7c3aed', display: 'flex' }}><Icons.Slides /></span>
            <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 12 }}>Slides</span>
            {!canSlides && (
              <span style={{
                fontSize: 9, padding: '1px 5px', borderRadius: 99, fontWeight: 700,
                background: 'rgba(124,58,237,0.15)', color: '#7c3aed', marginLeft: 'auto',
              }}>PREMIUM</span>
            )}
          </div>
          {!currentSummary ? (
            <p style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.4, margin: 0 }}>
              Summarize a page or document first
            </p>
          ) : !canSlides ? (
            <button onClick={handleUpgrade}
              style={{ width: '100%', fontSize: 11, padding: '5px 8px', borderRadius: 'var(--radius)', border: '1px solid #7c3aed', background: 'transparent', color: '#7c3aed', cursor: 'pointer', fontWeight: 600 }}>
              Upgrade to unlock
            </button>
          ) : (
            <button onClick={handleSlides} disabled={slidesLoading} className="btn"
              style={{ width: '100%', fontSize: 11, padding: '6px' }}>
              {slidesLoading ? 'Building...' : '⬇ Generate PPTX'}
            </button>
          )}
          {slidesError && <p style={{ fontSize: 10, color: 'var(--danger)', marginTop: 4, margin: '4px 0 0' }}>{slidesError}</p>}
        </div>

        {/* ─ Social Cards panel ─ */}
        <div style={{
          padding: '11px', borderRadius: 'var(--radius-lg)', fontSize: 12,
          border: `1px solid ${maxSocialImages > 0 ? 'rgba(217,119,6,0.35)' : 'var(--border)'}`,
          background: maxSocialImages > 0 ? 'rgba(217,119,6,0.05)' : 'var(--bg2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 7 }}>
            <span style={{ color: '#d97706', display: 'flex' }}><Icons.Image /></span>
            <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 12 }}>Social</span>
            {maxSocialImages === 0 && (
              <span style={{
                fontSize: 9, padding: '1px 5px', borderRadius: 99, fontWeight: 700,
                background: 'rgba(217,119,6,0.15)', color: '#d97706', marginLeft: 'auto',
              }}>BASIC+</span>
            )}
          </div>
          {!currentSummary ? (
            <p style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.4, margin: 0 }}>
              Summarize a page or document first
            </p>
          ) : maxSocialImages === 0 ? (
            <button onClick={handleUpgrade}
              style={{ width: '100%', fontSize: 11, padding: '5px 8px', borderRadius: 'var(--radius)', border: '1px solid #d97706', background: 'transparent', color: '#d97706', cursor: 'pointer', fontWeight: 600 }}>
              Upgrade to unlock
            </button>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 3, marginBottom: 5 }}>
                {[2, 3, 4, 5].filter(n => n <= maxSocialImages).map(n => (
                  <button key={n} onClick={() => setSocialCount(n)} style={{
                    width: 22, height: 22, borderRadius: 5, fontSize: 11, fontWeight: 600,
                    background: socialCount === n ? '#d97706' : 'var(--bg)',
                    color: socialCount === n ? '#fff' : 'var(--text)',
                    border: '1px solid ' + (socialCount === n ? '#d97706' : 'var(--border)'),
                    cursor: 'pointer',
                  }}>{n}</button>
                ))}
              </div>
              <button onClick={handleSocialImages} disabled={socialLoading} className="btn"
                style={{ width: '100%', fontSize: 11, padding: '5px', background: '#d97706', borderColor: '#d97706' }}>
                {socialLoading ? '...' : 'Generate'}
              </button>
            </>
          )}
          {socialError && <p style={{ fontSize: 10, color: 'var(--danger)', marginTop: 4, margin: '4px 0 0' }}>{socialError}</p>}
        </div>
      </div>

      {/* Social cards output */}
      {socialCards.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 12 }}>
          {socialCards.map((card, i) => (
            <div key={i} style={{
              borderRadius: 'var(--radius)', padding: '10px 12px',
              background: (THEME_COLORS[card.theme] || '#6d4af7') + '14',
              border: '1px solid ' + (THEME_COLORS[card.theme] || '#6d4af7') + '35',
            }}>
              <p style={{ fontWeight: 700, fontSize: 13, margin: '0 0 3px', color: 'var(--text)' }}>{card.headline}</p>
              <p style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 4px', lineHeight: 1.5 }}>{card.body}</p>
              <p style={{ fontSize: 11, fontWeight: 600, margin: 0, color: THEME_COLORS[card.theme] || 'var(--accent)' }}>{card.cta}</p>
            </div>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          SUMMARY RESULT
      ══════════════════════════════════════════════════════════════ */}
      {currentSummary && !loading && (
        <div>
          {/* Metrics bar */}
          <div style={{
            display: 'flex', gap: 10, marginBottom: 8, padding: '7px 11px',
            background: 'var(--bg2)', borderRadius: 'var(--radius)', fontSize: 11,
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

          {/* ── Controls bar — ABOVE summary box ── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
            padding: '6px 10px', marginBottom: 6,
            background: 'var(--bg2)', borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
          }}>
            {/* Font size group */}
            <button onClick={decreaseFontSize}
              className="btn-ghost" style={icoBtnStyle} title="Decrease font size">
              <Icons.FontMinus />
            </button>
            <button onClick={increaseFontSize}
              className="btn-ghost" style={icoBtnStyle} title="Increase font size">
              <Icons.FontPlus />
            </button>

            {/* Divider */}
            <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 3px', flexShrink: 0 }} />

            {/* Copy */}
            <button onClick={handleCopy}
              className="btn-ghost" style={{ ...icoBtnStyle, color: copied ? 'var(--success)' : 'inherit' }}
              title={copied ? 'Copied!' : 'Copy to clipboard'}>
              {copied ? <Icons.Check /> : <Icons.Copy />}
            </button>

            {/* Audio */}
            <button onClick={handleAudio}
              className="btn-ghost"
              style={{ ...icoBtnStyle, color: audioState !== 'idle' ? 'var(--accent)' : 'inherit' }}
              title={audioState === 'playing' ? 'Pause audio' : audioState === 'paused' ? 'Resume audio' : 'Listen to summary'}>
              {audioState === 'playing' ? <Icons.Pause /> : <Icons.Play />}
            </button>
            {audioState !== 'idle' && (
              <button onClick={stopAudio}
                className="btn-ghost" style={{ ...icoBtnStyle, color: 'var(--danger)' }} title="Stop audio">
                <Icons.Stop />
              </button>
            )}

            {/* Divider */}
            <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 3px', flexShrink: 0 }} />

            {/* Export dropdown */}
            <div ref={exportRef} style={{ position: 'relative' }}>
              <button onClick={() => canExport && setShowExportMenu(v => !v)}
                disabled={!!exportLoading}
                className="btn-ghost"
                title={canExport ? 'Download/Export' : 'Requires Basic plan'}
                style={{ ...icoBtnStyle, opacity: canExport ? 1 : 0.45 }}>
                {exportLoading ? <span style={{ fontSize: 11 }}>...</span> : <Icons.Download />}
              </button>
              {showExportMenu && (
                <div style={{
                  position: 'absolute', top: '110%', left: 0, zIndex: 50,
                  background: 'var(--bg)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)', boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
                  padding: 5, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 95,
                }}>
                  {(['pdf', 'txt', 'docx'] as const).map(fmt => (
                    <button key={fmt} onClick={() => handleExport(fmt)} style={{
                      padding: '6px 11px', borderRadius: 'var(--radius-sm)', fontSize: 12,
                      fontWeight: 600, background: 'transparent', border: 'none',
                      textAlign: 'left', color: 'var(--text)', cursor: 'pointer',
                    }}
                      onMouseEnter={e => ((e.target as HTMLElement).style.background = 'var(--bg2)')}
                      onMouseLeave={e => ((e.target as HTMLElement).style.background = 'transparent')}>
                      {fmt === 'pdf' ? '📄' : fmt === 'txt' ? '📝' : '📘'} {fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Chat toggle */}
            <button onClick={() => canChat ? setShowChat(v => !v) : null}
              className="btn-ghost"
              title={canChat ? 'Chat about this content' : 'Chat requires Basic plan'}
              style={{ ...icoBtnStyle, color: showChat ? 'var(--accent)' : 'inherit', opacity: canChat ? 1 : 0.45, cursor: canChat ? 'pointer' : 'not-allowed', marginLeft: 2 }}>
              <Icons.Chat />
            </button>

            {/* Spacer + Clear */}
            <button onClick={handleClear}
              className="btn-ghost"
              title="Clear summary"
              style={{ ...icoBtnStyle, color: 'var(--danger)', marginLeft: 'auto' }}>
              <Icons.Trash />
            </button>
          </div>

          {exportError && <p style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 7 }}>{exportError}</p>}

          {/* ── Summary text — markdown rendered ── */}
          <div
            className="summary-content"
            dangerouslySetInnerHTML={{ __html: mdToHtml(currentSummary.summary) }}
            style={{
              background: 'var(--bg2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', padding: 14,
              fontSize: fontSize, lineHeight: 1.7, color: 'var(--text)',
              marginBottom: 10, maxHeight: 280, overflowY: 'auto',
            }}
          />

          {/* ── Usage bar (after summary, logged-in) ── */}
          {!isGuest && usage && (
            <div style={{ marginBottom: 8 }}>
              <UsageBar usage={usage} plan={plan} />
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════
              INLINE CHAT
          ═══════════════════════════════════════════════════════ */}
          {showChat && canChat && (
            <div style={{
              marginTop: 4, border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', overflow: 'hidden',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', background: 'var(--bg2)',
                borderBottom: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                  💬 Ask about this content
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {chatHistory.length > 0 && (
                    <button onClick={clearChat}
                      style={{ fontSize: 11, color: 'var(--text2)', background: 'none', border: 'none', cursor: 'pointer' }}>
                      Clear
                    </button>
                  )}
                  <button onClick={() => setShowChat(false)}
                    style={{ fontSize: 13, color: 'var(--text2)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>
                    ✕
                  </button>
                </div>
              </div>

              <div style={{
                maxHeight: 200, overflowY: 'auto', padding: '10px 12px',
                display: 'flex', flexDirection: 'column', gap: 7, background: 'var(--bg)',
              }}>
                {chatHistory.length === 0 && (
                  <div style={{ color: 'var(--text2)', fontSize: 12, textAlign: 'center', padding: '10px 0' }}>
                    Ask anything about this content...
                  </div>
                )}
                {chatHistory.map((msg, i) => (
                  <div key={i} style={{
                    maxWidth: '85%', padding: '7px 10px', borderRadius: 'var(--radius)',
                    fontSize: 12, lineHeight: 1.5,
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg2)',
                    color: msg.role === 'user' ? '#fff' : 'var(--text)',
                    border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                  }}>
                    {msg.content}
                  </div>
                ))}
                {chatLoading && (
                  <div style={{
                    alignSelf: 'flex-start', padding: '7px 10px', borderRadius: 'var(--radius)',
                    background: 'var(--bg2)', border: '1px solid var(--border)',
                    fontSize: 12, color: 'var(--text2)',
                  }}>Thinking...</div>
                )}
                {chatError && <p style={{ fontSize: 12, color: 'var(--danger)', margin: 0 }}>{chatError}</p>}
                <div ref={chatBottomRef} />
              </div>

              <div style={{
                padding: '7px 10px', borderTop: '1px solid var(--border)',
                display: 'flex', gap: 7, background: 'var(--bg)',
              }}>
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
                  placeholder="Ask a question..."
                  disabled={chatLoading}
                  style={{
                    flex: 1, padding: '6px 10px', fontSize: 12,
                    background: 'var(--bg2)', border: '1px solid var(--border)',
                    color: 'var(--text)', outline: 'none',
                  }}
                />
                <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()}
                  className="btn" style={{ padding: '6px 12px', fontSize: 14 }}>↑</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Usage bar (before summary, logged-in) ── */}
      {!isGuest && usage && !currentSummary && !loading && (
        <div style={{ marginTop: 4 }}>
          <UsageBar usage={usage} plan={plan} />
        </div>
      )}

      {/* ── Guest usage counter ── */}
      {isGuest && (
        <div style={{
          marginTop: 12, padding: '9px 12px', borderRadius: 'var(--radius-lg)', fontSize: 12,
          background: guestLimitReached ? '#fef2f2' : '#f5f3ff',
          border: `1px solid ${guestLimitReached ? '#fecaca' : '#ddd6fe'}`,
          color: guestLimitReached ? '#b91c1c' : '#5b21b6',
        }}>
          {guestLimitReached ? (
            <>
              <strong>You've used all {GUEST_FREE_LIMIT} free summaries.</strong>{' '}
              <span onClick={() => setShowAuthModal(true)}
                style={{ fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
                Sign up free to continue →
              </span>
            </>
          ) : (
            <>
              <strong>{GUEST_FREE_LIMIT - guestSummaryCount} free {GUEST_FREE_LIMIT - guestSummaryCount === 1 ? 'summary' : 'summaries'} left.</strong>{' '}
              <span onClick={() => setShowAuthModal(true)}
                style={{ fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
                Sign up for 3/day →
              </span>
            </>
          )}
        </div>
      )}

      {/* ── Upgrade prompt for free users ── */}
      {!isGuest && plan === 'free' && !currentSummary && (
        <div style={{
          marginTop: 10, padding: '9px 12px', background: '#f5f3ff',
          border: '1px solid #ddd6fe', borderRadius: 'var(--radius-lg)', fontSize: 12, color: '#5b21b6',
        }}>
          <strong>Free plan:</strong> 3 summaries/day, short size only.{' '}
          <span onClick={handleUpgrade}
            style={{ fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
            Upgrade for $4.99/mo →
          </span>
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const icoBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 30, height: 28, padding: 0, borderRadius: 'var(--radius-sm)',
  flexShrink: 0,
};

// ── Usage bar component ───────────────────────────────────────────────────────
function UsageBar({ usage, plan }: { usage: UsageStats; plan: string }) {
  const isUnlimited = usage.dailyLimit === null;
  const pct = isUnlimited ? 100 : Math.min(100, Math.round((usage.summariesToday / usage.dailyLimit!) * 100));
  const remaining = isUnlimited ? null : (usage.dailyLimit! - usage.summariesToday);
  const barColor = isUnlimited ? '#16a34a' : pct >= 90 ? '#dc2626' : pct >= 65 ? '#d97706' : '#6d4af7';
  const monthName = new Date().toLocaleString('default', { month: 'long' });

  return (
    <div style={{
      padding: '8px 11px', background: 'var(--bg2)',
      borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: 11,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontWeight: 600, color: 'var(--text)' }}>
          Today:&nbsp;<span style={{ color: barColor }}>{usage.summariesToday}{isUnlimited ? '' : ` / ${usage.dailyLimit}`}</span>
        </span>
        <span style={{ color: 'var(--text2)' }}>
          {isUnlimited ? 'Unlimited' : remaining === 0
            ? <span style={{ color: '#dc2626', fontWeight: 600 }}>Limit reached</span>
            : `${remaining} left`}
        </span>
      </div>
      {!isUnlimited && (
        <div style={{ height: 3, borderRadius: 'var(--radius-full)', background: 'var(--border)', marginBottom: 5, overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 'var(--radius-full)', width: `${pct}%`, background: barColor, transition: 'width 0.4s ease' }} />
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, color: 'var(--text2)' }}>
        <span>{monthName}: <strong style={{ color: 'var(--text)' }}>{usage.summariesThisMonth}</strong></span>
        <span>All time: <strong style={{ color: 'var(--text)' }}>{usage.totalSummaries}</strong></span>
      </div>
    </div>
  );
}
