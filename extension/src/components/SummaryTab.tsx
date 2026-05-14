import React, { useState, useRef, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { useStore, GUEST_FREE_LIMIT, emptyUsageForPlan } from '../store';
import {
  summarizeContent, summarizeContentGuest, summarizeFile,
  exportSummary, generateSocialImages, generateSlides, sendChatMessage,
} from '../lib/api';
import LangIcon from '../icons/LangIcon';

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
  ChevDown:  () => <Ico d="M6 9l6 6 6-6" />,
  Trash:     () => <Ico d={["M3 6h18","M8 6V4h8v2","M19 6l-1 14H6L5 6"]} />,
};

// ─── Inline markdown → HTML converter (with inline styles for reliability) ───
function mdToHtml(md: string): string {
  if (!md) return '';

  const S = {
    h1: 'font-size:1.15em;font-weight:700;margin:0 0 8px;color:inherit;',
    h2: 'font-size:1.05em;font-weight:700;margin:10px 0 5px;border-bottom:1px solid rgba(128,128,128,0.25);padding-bottom:3px;color:inherit;',
    h3: 'font-size:0.97em;font-weight:700;margin:8px 0 4px;color:inherit;',
    h4: 'font-size:0.92em;font-weight:600;margin:6px 0 3px;opacity:0.8;',
    p:  'margin:0 0 7px;line-height:1.65;',
    ul: 'margin:4px 0 8px;padding-left:18px;',
    ol: 'margin:4px 0 8px;padding-left:18px;',
    li: 'margin-bottom:4px;line-height:1.6;',
    code: 'font-family:monospace;font-size:0.88em;padding:1px 4px;border-radius:3px;background:rgba(128,128,128,0.15);',
  };

  const inlineFmt = (s: string) =>
    s
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(?<!\*)\*(?!\*)([^*]+)\*(?!\*)/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, `<code style="${S.code}">$1</code>`);

  const lines = md.split('\n');
  const out: string[] = [];
  let inUL = false, inOL = false;

  const closeList = () => {
    if (inUL) { out.push('</ul>'); inUL = false; }
    if (inOL) { out.push('</ol>'); inOL = false; }
  };

  for (const raw of lines) {
    const line = raw.replace(/\r$/, '').trimEnd();

    if (/^#{4,}\s+/.test(line)) {
      closeList();
      out.push(`<h4 style="${S.h4}">${inlineFmt(line.replace(/^#{4,}\s+/, ''))}</h4>`);
    } else if (/^###\s+/.test(line)) {
      closeList();
      out.push(`<h3 style="${S.h3}">${inlineFmt(line.replace(/^###\s+/, ''))}</h3>`);
    } else if (/^##\s+/.test(line)) {
      closeList();
      out.push(`<h2 style="${S.h2}">${inlineFmt(line.replace(/^##\s+/, ''))}</h2>`);
    } else if (/^#\s+/.test(line)) {
      closeList();
      out.push(`<h1 style="${S.h1}">${inlineFmt(line.replace(/^#\s+/, ''))}</h1>`);
    } else if (/^\d+\.\s+/.test(line)) {
      if (!inOL) { closeList(); out.push(`<ol style="${S.ol}">`); inOL = true; }
      out.push(`<li style="${S.li}">${inlineFmt(line.replace(/^\d+\.\s+/, ''))}</li>`);
    } else if (/^[-*+•·]\s+/.test(line)) {
      if (!inUL) { closeList(); out.push(`<ul style="${S.ul}">`); inUL = true; }
      out.push(`<li style="${S.li}">${inlineFmt(line.replace(/^[-*+•·]\s+/, ''))}</li>`);
    } else if (line === '') {
      closeList();
      out.push('<div style="height:4px"></div>');
    } else {
      closeList();
      out.push(`<p style="${S.p}">${inlineFmt(line)}</p>`);
    }
  }
  closeList();
  return out.join('');
}

// ─── Constants ────────────────────────────────────────────────────────────────
const SIZE_STEPS = ['small', 'medium', 'large'] as const;
const SIZE_LABELS: Record<string, string> = { small: 'Short', medium: 'Medium', large: 'Full' };
const SIZE_DESCS:  Record<string, string> = { small: '3–5 sentences', medium: '2–3 paragraphs', large: 'Detailed breakdown' };

/** `nativeLabel`: shown in the picker so speakers can recognize their language instantly. Values still match Gemini prompt names. */
const LANGUAGES = [
  { value: 'auto',                 nativeLabel: 'Auto' },
  { value: 'English',              nativeLabel: 'English' },
  { value: 'Spanish',              nativeLabel: 'Español' },
  { value: 'French',               nativeLabel: 'Français' },
  { value: 'German',               nativeLabel: 'Deutsch' },
  { value: 'Portuguese',           nativeLabel: 'Português' },
  { value: 'Italian',              nativeLabel: 'Italiano' },
  { value: 'Dutch',                nativeLabel: 'Nederlands' },
  { value: 'Russian',              nativeLabel: 'Русский' },
  { value: 'Chinese (Simplified)', nativeLabel: '简体中文' },
  { value: 'Japanese',             nativeLabel: '日本語' },
  { value: 'Korean',               nativeLabel: '한국어' },
  { value: 'Arabic',               nativeLabel: 'العربية' },
  { value: 'Hindi',                nativeLabel: 'हिन्दी' },
  { value: 'Turkish',              nativeLabel: 'Türkçe' },
];

const THEME_COLORS: Record<string, string> = {
  blue: '#3b82f6', purple: '#8b5cf6', teal: '#14b8a6', coral: '#f97316', amber: '#f59e0b',
};

type SourceMode = 'page' | 'document';

interface SummaryTabProps {
  /** Opens Account → Plan & Billing (signed-in users); guests are sent to sign-in */
  onOpenPlanBilling: () => void;
}

/** Backend `checkSummaryQuota` — keep in sync with `auth.js` error text */
function isDailySummaryLimitError(message: string): boolean {
  return /^Daily limit of \d+ summaries reached\.?$/i.test(String(message).trim());
}

/** Backend `checkFileUploadDailyQuota` */
function isDailyDocumentUploadLimitError(message: string): boolean {
  return /^Daily limit of \d+ document uploads? reached\.?$/i.test(String(message).trim());
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SummaryTab({ onOpenPlanBilling }: SummaryTabProps) {
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
  const maxUploadMb     = plan === 'premium' ? 50 : 10;
  const canExport       = plan !== 'free';
  const canChat         = plan !== 'free';
  const canSlides       = plan === 'premium';
  const maxSocialImages = plan === 'premium' ? 6 : plan === 'basic' ? 3 : 0;

  useEffect(() => {
    if (maxSocialImages <= 0) return;
    setSocialCount((c) => Math.min(Math.max(c, 1), maxSocialImages));
  }, [maxSocialImages]);
  const guestLimitReached = isGuest && guestSummaryCount >= GUEST_FREE_LIMIT;

  // Store clamps `summarySize` to small for authenticated free tier; guard still matches guest UI (`plan`).
  const effectiveSummarySize = (plan === 'free' ? 'small' : summarySize) as typeof SIZE_STEPS[number];

  const usageForQuota = usage ?? emptyUsageForPlan(plan);
  const dailyLimitReached =
    !isGuest &&
    usageForQuota.dailyLimit !== null &&
    usageForQuota.summariesToday >= usageForQuota.dailyLimit;

  const uploadCap = usageForQuota.fileUploadDailyLimit ?? null;
  const fileUploadLimitReached =
    !isGuest &&
    uploadCap != null &&
    uploadCap > 0 &&
    (usageForQuota.fileUploadsToday ?? 0) >= uploadCap;

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
    if (dailyLimitReached) return;
    setError(''); setLoading(true);
    try {
      const response = await chrome.runtime.sendMessage({ type: 'FETCH_PAGE_CONTENT' });
      if (response?.error) throw new Error(response.error);
      let result;
      if (isGuest) {
        result = await summarizeContentGuest(response.content, response.url, targetLanguage);
        incrementGuestCount();
      } else {
        result = await summarizeContent(response.content, effectiveSummarySize, response.url, targetLanguage);
        const d = Number(result.metrics?.timeSavedSec) || 0;
        const base = usage ?? emptyUsageForPlan(plan);
        setUsage({
          ...base,
          summariesToday: base.summariesToday + 1,
          summariesThisMonth: base.summariesThisMonth + 1,
          totalSummaries: base.totalSummaries + 1,
          timeSavedTodaySec: (base.timeSavedTodaySec ?? 0) + d,
          timeSavedThisMonthSec: (base.timeSavedThisMonthSec ?? 0) + d,
          timeSavedTotalSec: (base.timeSavedTotalSec ?? 0) + d,
        });
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
    if (dailyLimitReached) return;
    if (fileUploadLimitReached) return;
    setError(''); setLoading(true);
    try {
      const result = await summarizeFile(selectedFile, effectiveSummarySize, targetLanguage);
      const d = Number(result.metrics?.timeSavedSec) || 0;
      const base = usage ?? emptyUsageForPlan(plan);
      setUsage({
        ...base,
        summariesToday: base.summariesToday + 1,
        summariesThisMonth: base.summariesThisMonth + 1,
        totalSummaries: base.totalSummaries + 1,
        fileUploadsToday: (base.fileUploadsToday ?? 0) + 1,
        timeSavedTodaySec: (base.timeSavedTodaySec ?? 0) + d,
        timeSavedThisMonthSec: (base.timeSavedThisMonthSec ?? 0) + d,
        timeSavedTotalSec: (base.timeSavedTotalSec ?? 0) + d,
      });
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

  // ── Plan / billing ────────────────────────────────────────────────
  const handleUpgrade = () => {
    if (isGuest) {
      setShowAuthModal(true);
      return;
    }
    onOpenPlanBilling();
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
      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', marginBottom: 12 }}>

        {/* Source tabs — same outer height as language row */}
        <div style={{
          display: 'flex', gap: 2, padding: 2, flex: 1,
          minHeight: 28,
          background: 'var(--bg2)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          alignItems: 'stretch',
        }}>
          {(['page', 'document'] as SourceMode[]).map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => { setSourceMode(mode); setError(''); }}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 5px',
                fontSize: 11,
                fontWeight: 600,
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
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
          minHeight: 28,
          padding: '0 7px',
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
        }}>
          <span title="Summary language" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <LangIcon size={18} />
          </span>
          <select
            value={targetLanguage}
            onChange={e => setTargetLanguage(e.target.value)}
            style={{
              background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text)', fontSize: 11, fontWeight: 500,
              cursor: 'pointer', maxWidth: 100,
              height: 22, lineHeight: '22px', padding: '0 2px',
            }}
          >
            {LANGUAGES.map(l => (
              <option key={l.value} value={l.value} style={{ background: 'var(--bg)', color: 'var(--text)' }}>
                {l.nativeLabel}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          ROW 2: Summary length slider (ALWAYS VISIBLE)
      ══════════════════════════════════════════════════════════════ */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
          <span style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 500 }}>Summary length</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)' }}>
            {SIZE_LABELS[effectiveSummarySize]}
            <span style={{ fontWeight: 400, color: 'var(--text2)', marginLeft: 5 }}>
              {SIZE_DESCS[effectiveSummarySize]}
            </span>
          </span>
        </div>
        <input
          type="range"
          min={0} max={2} step={1}
          value={SIZE_STEPS.indexOf(effectiveSummarySize)}
          disabled={plan === 'free'}
          onChange={e => { if (plan !== 'free') setSummarySize(SIZE_STEPS[+e.target.value]); }}
          title={plan === 'free' ? 'Upgrade to unlock longer summaries' : SIZE_DESCS[effectiveSummarySize]}
          style={{ width: '100%', opacity: plan === 'free' ? 0.55 : 1 }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text2)', marginTop: 3 }}>
          <span>Short</span>
          <span>Medium{plan === 'free' ? ' 🔒' : ''}</span>
          <span>Full{plan === 'free' ? ' 🔒' : ''}</span>
        </div>
      </div>

      {dailyLimitReached && (
        <div style={{
          marginBottom: 12, padding: '9px 12px', borderRadius: 'var(--radius-lg)', fontSize: 12,
          background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412',
        }}>
          Daily limit of {usageForQuota.dailyLimit} summaries reached.{' '}
          <span
            role="button"
            tabIndex={0}
            onClick={handleUpgrade}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleUpgrade(); } }}
            style={{ fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
          >
            Upgrade for more
          </span>
        </div>
      )}
      {fileUploadLimitReached && !dailyLimitReached && uploadCap != null && (
        <div style={{
          marginBottom: 12, padding: '8px 10px', borderRadius: 'var(--radius-lg)', fontSize: 9.6,
          background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412',
        }}>
          Daily limit of {uploadCap} document upload{uploadCap === 1 ? '' : 's'} reached.{' '}
          <span
            role="button"
            tabIndex={0}
            onClick={handleUpgrade}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleUpgrade(); } }}
            style={{ fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
          >
            Upgrade for more
          </span>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          ACTION AREA — changes by mode
      ══════════════════════════════════════════════════════════════ */}

      {/* PAGE MODE */}
      {sourceMode === 'page' && !currentSummary && (
        <button
          onClick={summarizePage}
          disabled={loading || dailyLimitReached}
          className="btn"
          style={{ width: '100%', padding: '6px 8px', fontSize: 13, fontWeight: 700, marginBottom: 14 }}
        >
          {loading ? 'Summarizing...' : 'Summarize!!!'}
        </button>
      )}
      {sourceMode === 'page' && currentSummary && (
        <button
          onClick={summarizePage}
          disabled={loading || dailyLimitReached}
          className="btn"
          style={{ width: '100%', padding: '6px 8px', fontSize: 13, fontWeight: 700, marginBottom: 14 }}
        >
          {loading ? 'Summarizing...' : '↺ Re-summarize'}
        </button>
      )}

      {/* DOCUMENT MODE */}
      {sourceMode === 'document' && (
        <div style={{ marginBottom: 14 }}>
          {isGuest ? (
            <div style={{
              padding: '16px', borderRadius: 'var(--radius-lg)', textAlign: 'center',
              border: '2px dashed var(--border)', background: 'var(--bg2)',
            }}>
              <div style={{ fontSize:24, marginBottom: 6 }}>📄</div>
              <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
                <strong>Sign in</strong> to upload PDF, Word, or text files and summarize them.
              </p>
              <button className="btn" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => setShowAuthModal(true)}>
                Sign in
              </button>
            </div>
          ) : (
            <>
              {selectedFile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                type="button"
                onClick={summarizeDocument}
                disabled={loading || dailyLimitReached || fileUploadLimitReached}
                className="btn"
                style={{ width: '100%', padding: '7px', fontSize: 12, fontWeight: 700 }}
              >
                {loading ? 'Summarizing...' : 'Summarize Document'}
              </button>
              <button
                type="button"
                onClick={removeFile}
                disabled={loading}
                style={{
                  background: 'none', border: 'none', cursor: loading ? 'wait' : 'pointer',
                  fontSize: 11, color: 'var(--text2)', textDecoration: 'underline', padding: '2px 0',
                  alignSelf: 'center',
                }}
              >
                Choose a different file
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => !dailyLimitReached && !fileUploadLimitReached && fileInputRef.current?.click()}
              disabled={dailyLimitReached || fileUploadLimitReached}
              style={{
                width: '100%', padding: '20px 16px', cursor: (dailyLimitReached || fileUploadLimitReached) ? 'not-allowed' : 'pointer',
                borderRadius: 'var(--radius-lg)', fontSize: 13, textAlign: 'center',
                border: '2px dashed var(--accent)', background: 'var(--bg2)',
                color: 'var(--accent)', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 6, transition: 'all 0.15s',
                opacity: (dailyLimitReached || fileUploadLimitReached) ? 0.55 : 1,
              }}
              onMouseEnter={e => {
                if (dailyLimitReached || fileUploadLimitReached) return;
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(109,74,247,0.06)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg2)';
              }}
            >
              <span style={{ fontSize: 28 }}>📂</span>
              <span style={{ fontWeight: 600 }}>Upload your Document</span>
              <span style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 400 }}>
                PDF, Word (.docx), or plain text · Max {maxUploadMb} MB
              </span>
            </button>
          )}
            </>
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
        }}>
          {error}
          {!isGuest && (isDailySummaryLimitError(error) || isDailyDocumentUploadLimitError(error)) && (
            <>
              {' '}
              <span
                role="button"
                tabIndex={0}
                onClick={handleUpgrade}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleUpgrade(); } }}
                style={{ fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
              >
                Upgrade for more
              </span>
            </>
          )}
        </div>
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
          padding: '9px', borderRadius: 'var(--radius-lg)', fontSize: 12,
          border: `1px solid ${canSlides ? 'rgba(124,58,237,0.35)' : 'var(--border)'}`,
          background: canSlides ? 'rgba(124,58,237,0.05)' : 'var(--bg2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
            <span style={{ color: '#7c3aed', display: 'flex' }}><Icons.Slides /></span>
            <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 12 }}>PPT Slides</span>
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
              style={{ width: '100%', fontSize: 11, padding: '4px 8px', borderRadius: 'var(--radius)', border: '1px solid #7c3aed', background: 'transparent', color: '#7c3aed', cursor: 'pointer', fontWeight: 600 }}>
              Upgrade to unlock
            </button>
          ) : (
            <button onClick={handleSlides} disabled={slidesLoading} className="btn"
              style={{ width: '100%', fontSize: 11, padding: '5px' }}>
              {slidesLoading ? 'Building...' : '⬇ Generate PPTX'}
            </button>
          )}
          {slidesError && <p style={{ fontSize: 10, color: 'var(--danger)', margin: '4px 0 0' }}>{slidesError}</p>}
        </div>

        {/* ─ Social Posts panel ─ */}
        <div style={{
          padding: '9px', borderRadius: 'var(--radius-lg)', fontSize: 12,
          border: `1px solid ${maxSocialImages > 0 ? 'rgba(124,58,237,0.35)' : 'var(--border)'}`,
          background: maxSocialImages > 0 ? 'rgba(124,58,237,0.05)' : 'var(--bg2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'nowrap' }}>
            <span style={{ color: '#7c3aed', display: 'flex', flexShrink: 0 }}><Icons.Image /></span>
            <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 12, flexShrink: 0 }}>Social Posts</span>
            {maxSocialImages === 0 ? (
              <span style={{
                fontSize: 9, padding: '1px 5px', borderRadius: 99, fontWeight: 700,
                background: 'rgba(124,58,237,0.15)', color: '#7c3aed', marginLeft: 'auto',
              }}>BASIC+</span>
            ) : (
              <select
                value={socialCount}
                onChange={(e) => setSocialCount(Number(e.target.value))}
                disabled={!currentSummary}
                style={{
                  marginLeft: 'auto',
                  minWidth: 44,
                  height: 26,
                  fontSize: 11,
                  fontWeight: 400,
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  padding: '0 6px',
                  cursor: currentSummary ? 'pointer' : 'not-allowed',
                  opacity: currentSummary ? 1 : 0.65,
                }}
              >
                {Array.from({ length: maxSocialImages }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{i + 1}</option>
                ))}
              </select>
            )}
          </div>
          {!currentSummary ? (
            <p style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.4, margin: 0 }}>
              Summarize a page or document first
            </p>
          ) : maxSocialImages === 0 ? (
            <button onClick={handleUpgrade}
              style={{ width: '100%', fontSize: 11, padding: '4px 8px', borderRadius: 'var(--radius)', border: '1px solid #7c3aed', background: 'transparent', color: '#7c3aed', cursor: 'pointer', fontWeight: 600 }}>
              Upgrade to unlock
            </button>
          ) : (
            <button onClick={handleSocialImages} disabled={socialLoading || !currentSummary} className="btn"
              style={{ width: '100%', fontSize: 11, padding: '5px' }}>
              {socialLoading ? '...' : 'Generate'}
            </button>
          )}
          {socialError && <p style={{ fontSize: 10, color: 'var(--danger)', margin: '4px 0 0' }}>{socialError}</p>}
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
            color: 'var(--text)',
          }}>
            {/* Font size group */}
            <button onClick={decreaseFontSize}
              className="btn-ghost" title="Decrease font size"
              style={{ ...icoBtnStyle, fontSize: 13, fontWeight: 400, minWidth: 30, color: 'var(--text)' }}>
              A−
            </button>
            <button onClick={increaseFontSize}
              className="btn-ghost" title="Increase font size"
              style={{ ...icoBtnStyle, fontSize: 13, fontWeight: 400, minWidth: 30, color: 'var(--text)' }}>
              A+
            </button>

            {/* Divider */}
            <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 3px', flexShrink: 0 }} />

            {/* Copy */}
            <button onClick={handleCopy}
              className="btn-ghost" style={{ ...icoBtnStyle, color: copied ? 'var(--success)' : 'var(--text)' }}
              title={copied ? 'Copied!' : 'Copy to clipboard'}>
              {copied ? <Icons.Check /> : <Icons.Copy />}
            </button>

            {/* Audio */}
            <button onClick={handleAudio}
              className="btn-ghost"
              style={{ ...icoBtnStyle, color: audioState !== 'idle' ? 'var(--accent)' : 'var(--text)' }}
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
                style={{ ...icoBtnStyle, color: 'var(--text)', opacity: canExport ? 1 : 0.45 }}>
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
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(mdToHtml(currentSummary.summary), { USE_PROFILES: { html: true } }) }}
            style={{
              background: 'var(--bg2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', padding: 14,
              fontSize: fontSize, lineHeight: 1.7, color: 'var(--text)',
              marginBottom: 10, maxHeight: 280, overflowY: 'auto',
            }}
          />

          {/* ── Chat button — below summary box ── */}
          <div style={{ marginBottom: 8 }}>
            {canChat ? (
              showChat ? (
                <button
                  type="button"
                  onClick={() => setShowChat(false)}
                  className="btn-ghost"
                  style={{
                    width: '100%', padding: '6px 10px', fontSize: 12, fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    color: 'var(--accent)',
                    borderColor: 'var(--accent)',
                    background: 'rgba(109, 74, 247, 0.08)',
                  }}
                >
                  <Icons.Chat />
                  Close chat
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowChat(true)}
                  className="btn"
                  style={{
                    width: '100%', padding: '7px 11px', fontSize: 13, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    boxShadow: '0 3px 12px rgba(109, 74, 247, 0.35)',
                  }}
                  title="Open chat about this summary"
                >
                  <Ico d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" size={16} />
                  Ask a question
                </button>
              )
            ) : (
              <button
                type="button"
                className="btn-ghost"
                onClick={handleUpgrade}
                style={{
                  width: '100%', padding: '7px 11px', fontSize: 13, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  color: 'var(--text)',
                  borderWidth: 2,
                  borderStyle: 'solid',
                  borderColor: '#d97706',
                  background: 'rgba(217, 119, 6, 0.08)',
                  opacity: 1,
                }}
              >
                <Icons.Chat />
                <span>
                  Ask a question — <span style={{ color: '#d97706' }}>Upgrade to Basic</span>
                </span>
              </button>
            )}
          </div>


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
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
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
                  <div style={{
                    color: 'var(--text2)', fontSize: 12, textAlign: 'center', padding: '12px 8px',
                    fontWeight: 500, border: '1px dashed var(--border)', borderRadius: 'var(--radius-sm)',
                    marginBottom: 4, background: 'var(--bg)',
                  }}>
                    Type a question below about this summary…
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
                  placeholder="Type your question..."
                  disabled={chatLoading}
                  style={{
                    flex: 1, padding: '8px 11px', fontSize: 13,
                    background: 'var(--bg2)', border: '2px solid var(--accent)',
                    color: 'var(--text)', outline: 'none', borderRadius: 'var(--radius-sm)',
                  }}
                />
                <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()}
                  className="btn" style={{ padding: '6px 12px', fontSize: 14 }}>↑</button>
              </div>
            </div>
          )}
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
      {!isGuest && plan === 'free' && !currentSummary && !dailyLimitReached && (
        <div style={{
          marginTop: 10, padding: '9px 12px', background: '#f5f3ff',
          border: '1px solid #ddd6fe', borderRadius: 'var(--radius-lg)', fontSize: 12, color: '#5b21b6',
        }}>
          3 summaries per day,{' '}
          <span onClick={handleUpgrade}
            style={{ fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
            Upgrade for more
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

