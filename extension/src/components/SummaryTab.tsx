import React, { useState, useRef, useEffect } from 'react';
import { useStore, GUEST_FREE_LIMIT, UsageStats } from '../store';
import {
  summarizeContent, summarizeContentGuest, summarizeFile,
  subscribe, exportSummary, generateSocialImages, generateSlides, sendChatMessage,
} from '../lib/api';

const SIZE_OPTIONS = [
  { id: 'small',  label: 'Short',  desc: '3–5 sentences' },
  { id: 'medium', label: 'Medium', desc: '2–3 paragraphs' },
  { id: 'large',  label: 'Full',   desc: 'Detailed breakdown' },
] as const;

const THEME_COLORS: Record<string, string> = {
  blue: '#3b82f6', purple: '#8b5cf6', teal: '#14b8a6', coral: '#f97316', amber: '#f59e0b',
};

type SourceMode = 'page' | 'document';

export default function SummaryTab() {
  const {
    user, summarySize, setSummarySize, currentSummary, setCurrentSummary, setAudioPlaying,
    guestSummaryCount, incrementGuestCount, setShowAuthModal,
    chatHistory, addChatMessage, clearChat,
    usage, setUsage,
  } = useStore();

  // ── Source mode ──────────────────────────────────────────────────
  const [sourceMode, setSourceMode] = useState<SourceMode>('page');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // ── Summarize state ──────────────────────────────────────────────
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Audio state ──────────────────────────────────────────────────
  const [audioState, setAudioState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [copied, setCopied] = useState(false);

  // ── Export state ─────────────────────────────────────────────────
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportLoading,  setExportLoading]  = useState<string | null>(null);
  const [exportError,    setExportError]    = useState('');
  const exportRef = useRef<HTMLDivElement>(null);

  // ── Social images state ──────────────────────────────────────────
  const [showSocialPanel, setShowSocialPanel] = useState(false);
  const [socialCount,     setSocialCount]     = useState(3);
  const [socialLoading,   setSocialLoading]   = useState(false);
  const [socialCards,     setSocialCards]     = useState<any[]>([]);
  const [socialError,     setSocialError]     = useState('');

  // ── Slides state ─────────────────────────────────────────────────
  const [slidesLoading, setSlidesLoading] = useState(false);
  const [slidesError,   setSlidesError]   = useState('');

  // ── Chat state ───────────────────────────────────────────────────
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

  // Close export menu when clicking outside
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

  // Reset per-summary UI state when summary changes
  useEffect(() => {
    setShowExportMenu(false);
    setShowSocialPanel(false);
    setSocialCards([]);
    setShowChat(false);
    setChatError('');
    setSlidesError('');
    setExportError('');
  }, [currentSummary?.summaryId]);

  // ── Summarize page ───────────────────────────────────────────────
  const summarizePage = async () => {
    if (guestLimitReached) { setShowAuthModal(true); return; }
    setError(''); setLoading(true);
    try {
      const response = await chrome.runtime.sendMessage({ type: 'FETCH_PAGE_CONTENT' });
      if (response?.error) throw new Error(response.error);
      let result;
      if (isGuest) {
        result = await summarizeContentGuest(response.content, response.url);
        incrementGuestCount();
      } else {
        result = await summarizeContent(response.content, summarySize, response.url);
        if (usage) setUsage({ ...usage, summariesToday: usage.summariesToday + 1, summariesThisMonth: usage.summariesThisMonth + 1, totalSummaries: usage.totalSummaries + 1 });
      }
      setCurrentSummary(result);
    } catch (e: any) {
      setError(e.message || 'Summarization failed');
    } finally {
      setLoading(false);
    }
  };

  // ── Summarize uploaded doc ───────────────────────────────────────
  const summarizeDocument = async () => {
    if (!selectedFile) return;
    setError(''); setLoading(true);
    try {
      const result = await summarizeFile(selectedFile, summarySize);
      if (usage) setUsage({ ...usage, summariesToday: usage.summariesToday + 1, summariesThisMonth: usage.summariesThisMonth + 1, totalSummaries: usage.totalSummaries + 1 });
      setCurrentSummary(result);
    } catch (e: any) {
      setError(e.message || 'Document summarization failed');
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

  // ── Copy / Audio ─────────────────────────────────────────────────
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

  const stopAudio = () => {
    window.speechSynthesis.cancel();
    setAudioState('idle'); setAudioPlaying(false);
  };

  // ── Export ───────────────────────────────────────────────────────
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

  // ── Social images ────────────────────────────────────────────────
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

  // ── Slides ───────────────────────────────────────────────────────
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

  // ── Upgrade ──────────────────────────────────────────────────────
  const handleUpgrade = async () => {
    try {
      const { checkoutUrl } = await subscribe('basic');
      if (checkoutUrl) chrome.tabs.create({ url: checkoutUrl });
    } catch (e: any) {
      setError(e.message || 'Could not start checkout. Please try again.');
    }
  };

  // ── Chat ─────────────────────────────────────────────────────────
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
      setChatError(e.message || 'Chat failed');
    } finally {
      setChatLoading(false);
    }
  };

  const fmtSeconds = (s: number) => s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;

  // ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 14 }}>

      {/* ── Source mode toggle ── */}
      {!currentSummary && (
        <div style={{
          display: 'flex', gap: 4, padding: 4, marginBottom: 14,
          background: 'var(--bg2)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
        }}>
          {(['page', 'document'] as SourceMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => { setSourceMode(mode); setError(''); }}
              style={{
                flex: 1, padding: '8px 6px', fontSize: 13, fontWeight: 600,
                borderRadius: 'var(--radius)',
                border: 'none',
                background: sourceMode === mode ? 'var(--accent)' : 'transparent',
                color: sourceMode === mode ? '#fff' : 'var(--text2)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {mode === 'page' ? '🌐 This Page' : '📄 Document'}
            </button>
          ))}
        </div>
      )}

      {/* ── Size picker ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {SIZE_OPTIONS.map(s => {
          const locked = !allowedSizes.includes(s.id);
          return (
            <button
              key={s.id}
              onClick={() => !locked && setSummarySize(s.id)}
              title={locked ? 'Upgrade to unlock' : s.desc}
              style={{
                flex: 1, padding: '7px 4px', borderRadius: 'var(--radius)', fontSize: 12, fontWeight: 500,
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

      {/* ═══════════════════════════════════════════════════════════
          PAGE MODE — action button
      ═══════════════════════════════════════════════════════════ */}
      {!currentSummary && sourceMode === 'page' && (
        <button
          onClick={summarizePage}
          disabled={loading}
          className="btn"
          style={{ width: '100%', padding: '11px', fontSize: 14, fontWeight: 700, letterSpacing: '0.01em' }}
        >
          {loading ? 'Summarizing...' : 'Summarize!!!'}
        </button>
      )}

      {/* ═══════════════════════════════════════════════════════════
          DOCUMENT MODE — upload area
      ═══════════════════════════════════════════════════════════ */}
      {!currentSummary && sourceMode === 'document' && (
        <div>
          {!canUpload ? (
            /* Free plan gate */
            <div style={{
              padding: '20px 16px', borderRadius: 'var(--radius-lg)', textAlign: 'center',
              border: '2px dashed var(--border)', background: 'var(--bg2)',
            }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
              <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
                Document upload requires <strong>Basic</strong> or <strong>Premium</strong> plan.
              </p>
              <button className="btn" style={{ fontSize: 12 }} onClick={handleUpgrade}>
                Upgrade to unlock
              </button>
            </div>
          ) : selectedFile ? (
            /* File selected state */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px',
                borderRadius: 'var(--radius-lg)', background: '#f0fdf4',
                border: '1px solid #bbf7d0',
              }}>
                <span style={{ fontSize: 20 }}>📄</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: '#15803d',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedFile.name}
                </span>
                <span style={{ fontSize: 11, color: '#6b7280', flexShrink: 0 }}>
                  {(selectedFile.size / 1024).toFixed(0)} KB
                </span>
                <button
                  onClick={removeFile}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#9ca3af', fontSize: 16, lineHeight: 1, flexShrink: 0,
                  }}
                  title="Remove file"
                >✕</button>
              </div>
              <button
                onClick={summarizeDocument}
                disabled={loading}
                className="btn"
                style={{ width: '100%', padding: '11px', fontSize: 14, fontWeight: 700 }}
              >
                {loading ? 'Summarizing...' : 'Summarize Document'}
              </button>
              <button
                onClick={() => { setSourceMode('page'); setSelectedFile(null); }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text2)', fontSize: 12, textAlign: 'center', padding: '2px',
                }}
              >
                ← Switch to page summarization
              </button>
            </div>
          ) : (
            /* Drop zone */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: '100%', padding: '28px 16px', cursor: 'pointer',
                  borderRadius: 'var(--radius-lg)', fontSize: 13, textAlign: 'center',
                  border: '2px dashed var(--accent)', background: '#f5f3ff',
                  color: 'var(--accent)', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: 8, transition: 'all 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#ede9fe')}
                onMouseLeave={e => (e.currentTarget.style.background = '#f5f3ff')}
              >
                <span style={{ fontSize: 32 }}>📂</span>
                <span style={{ fontWeight: 600 }}>Click to upload your document</span>
                <span style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 400 }}>
                  PDF, Word (.docx), or plain text • Max 10 MB
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                style={{ display: 'none' }}
                onChange={onFileChosen}
              />
              <button
                onClick={() => setSourceMode('page')}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text2)', fontSize: 12, textAlign: 'center', padding: '2px',
                }}
              >
                ← Back to page summarization
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca',
          borderRadius: 'var(--radius)', padding: '10px 12px', fontSize: 13,
          color: 'var(--danger)', marginTop: 12,
        }}>
          {error}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>
          <div style={{ fontSize: 22, marginBottom: 6 }}>✦</div>
          Analyzing content with AI...
        </div>
      )}

      {/* ── Usage bar (logged-in, before summary) ── */}
      {!isGuest && usage && !currentSummary && !loading && (
        <div style={{ marginTop: 12 }}>
          <UsageBar usage={usage} plan={plan} />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          SUMMARY RESULT
      ═══════════════════════════════════════════════════════════ */}
      {currentSummary && !loading && (
        <div>
          {/* Metrics bar */}
          <div style={{
            display: 'flex', gap: 10, marginBottom: 10, padding: '8px 12px',
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

          {/* Summary text */}
          <div style={{
            background: 'var(--bg2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', padding: 14, fontSize: 'var(--font-size-base)',
            lineHeight: 1.65, color: 'var(--text)', marginBottom: 10,
            maxHeight: 240, overflowY: 'auto', whiteSpace: 'pre-wrap',
          }}>
            {currentSummary.summary}
          </div>

          {/* ── Action toolbar ── */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6, alignItems: 'center' }}>

            <button onClick={handleCopy} className="btn-ghost" style={toolbarBtn}>
              {copied ? '✓ Copied' : '⎘ Copy'}
            </button>

            <button onClick={handleAudio} className="btn-ghost" style={toolbarBtn}>
              {audioState === 'playing' ? '⏸ Pause' : audioState === 'paused' ? '▶ Resume' : '▶ Listen'}
            </button>
            {audioState !== 'idle' && (
              <button onClick={stopAudio} className="btn-ghost" style={toolbarBtn}>⏹</button>
            )}

            {/* Export dropdown */}
            <div ref={exportRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setShowExportMenu(v => !v)}
                disabled={!!exportLoading}
                className="btn-ghost"
                title={canExport ? 'Download summary' : 'Requires Basic plan'}
                style={{ ...toolbarBtn, opacity: canExport ? 1 : 0.55 }}
              >
                {exportLoading ? '...' : `⬇ Export${canExport ? '' : ' 🔒'}`}
              </button>
              {showExportMenu && (
                <div style={{
                  position: 'absolute', top: '110%', left: 0, zIndex: 50,
                  background: 'var(--bg)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
                  padding: 6, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 90,
                }}>
                  {(['pdf', 'txt', 'docx'] as const).map(fmt => (
                    <button
                      key={fmt}
                      onClick={() => canExport ? handleExport(fmt) : null}
                      style={{
                        padding: '7px 12px', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 600,
                        background: 'transparent', border: 'none', textAlign: 'left',
                        color: canExport ? 'var(--text)' : 'var(--text2)',
                        cursor: canExport ? 'pointer' : 'not-allowed', opacity: canExport ? 1 : 0.5,
                      }}
                      onMouseEnter={e => canExport && ((e.target as HTMLElement).style.background = 'var(--bg2)')}
                      onMouseLeave={e => ((e.target as HTMLElement).style.background = 'transparent')}
                    >
                      {fmt.toUpperCase()} {!canExport && '🔒'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Social images */}
            {maxSocialImages > 0 ? (
              <button
                onClick={() => setShowSocialPanel(v => !v)}
                className="btn-ghost"
                style={{ ...toolbarBtn, color: showSocialPanel ? 'var(--accent)' : 'var(--text2)' }}
              >🖼 Social</button>
            ) : (
              <button className="btn-ghost" style={{ ...toolbarBtn, opacity: 0.5 }} title="Requires Basic plan">
                🖼 Social 🔒
              </button>
            )}

            {/* Slides */}
            <button
              onClick={canSlides ? handleSlides : undefined}
              disabled={slidesLoading}
              className="btn-ghost"
              title={canSlides ? 'Generate PPTX' : 'Requires Premium plan'}
              style={{ ...toolbarBtn, opacity: canSlides ? 1 : 0.5, cursor: canSlides ? 'pointer' : 'not-allowed' }}
            >
              {slidesLoading ? '...' : `📊 Slides${canSlides ? '' : ' 🔒'}`}
            </button>

            {/* Chat */}
            <button
              onClick={() => canChat ? setShowChat(v => !v) : null}
              className="btn-ghost"
              title={canChat ? 'Ask about this content' : 'Chat requires Basic plan'}
              style={{
                ...toolbarBtn,
                color: showChat ? 'var(--accent)' : canChat ? 'var(--text2)' : 'var(--text2)',
                opacity: canChat ? 1 : 0.5, cursor: canChat ? 'pointer' : 'not-allowed',
              }}
            >
              💬 Chat{!canChat && ' 🔒'}
            </button>

            {/* Clear */}
            <button
              onClick={() => { setCurrentSummary(null); clearChat(); stopAudio(); setSelectedFile(null); }}
              className="btn-ghost"
              style={{ ...toolbarBtn, marginLeft: 'auto' }}
            >✕ Clear</button>
          </div>

          {exportError && <p style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 8 }}>{exportError}</p>}

          {/* ── Social image panel ── */}
          {showSocialPanel && maxSocialImages > 0 && (
            <div style={{
              marginBottom: 12, padding: '12px 14px', background: 'var(--bg2)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>Cards:</span>
                {[2, 3, 4, 5].filter(n => n <= maxSocialImages).map(n => (
                  <button key={n} onClick={() => setSocialCount(n)} style={{
                    width: 26, height: 26, borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 600,
                    background: socialCount === n ? 'var(--accent)' : 'var(--bg)',
                    color: socialCount === n ? '#fff' : 'var(--text)',
                    border: '1px solid ' + (socialCount === n ? 'var(--accent)' : 'var(--border)'),
                    cursor: 'pointer',
                  }}>{n}</button>
                ))}
                <button onClick={handleSocialImages} disabled={socialLoading} className="btn"
                  style={{ marginLeft: 'auto', fontSize: 12, padding: '5px 12px' }}>
                  {socialLoading ? 'Generating...' : 'Generate'}
                </button>
              </div>
              {socialError && <p style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 8 }}>{socialError}</p>}
              {socialCards.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {socialCards.map((card, i) => (
                    <div key={i} style={{
                      borderRadius: 'var(--radius)', padding: 12,
                      background: (THEME_COLORS[card.theme] || '#6d4af7') + '15',
                      border: '1px solid ' + (THEME_COLORS[card.theme] || '#6d4af7') + '40',
                    }}>
                      <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 3, color: 'var(--text)' }}>{card.headline}</p>
                      <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 5, lineHeight: 1.5 }}>{card.body}</p>
                      <p style={{ fontSize: 11, fontWeight: 600, color: THEME_COLORS[card.theme] || 'var(--accent)' }}>{card.cta}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {slidesError && <p style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 8 }}>{slidesError}</p>}

          {/* ── Usage bar (after summary) ── */}
          {!isGuest && usage && (
            <div style={{ marginTop: 6 }}>
              <UsageBar usage={usage} plan={plan} />
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════
              INLINE CHAT
          ═══════════════════════════════════════════════════════ */}
          {showChat && canChat && (
            <div style={{
              marginTop: 8, border: '1px solid var(--border)',
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
                maxHeight: 220, overflowY: 'auto', padding: '10px 12px',
                display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg)',
              }}>
                {chatHistory.length === 0 && (
                  <div style={{ color: 'var(--text2)', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>
                    Ask anything about this content...
                  </div>
                )}
                {chatHistory.map((msg, i) => (
                  <div key={i} style={{
                    maxWidth: '85%', padding: '8px 11px', borderRadius: 'var(--radius)',
                    fontSize: 13, lineHeight: 1.5,
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
                    alignSelf: 'flex-start', padding: '8px 11px', borderRadius: 'var(--radius)',
                    background: 'var(--bg2)', border: '1px solid var(--border)',
                    fontSize: 13, color: 'var(--text2)',
                  }}>
                    Thinking...
                  </div>
                )}
                {chatError && <p style={{ fontSize: 12, color: 'var(--danger)' }}>{chatError}</p>}
                <div ref={chatBottomRef} />
              </div>

              <div style={{
                padding: '8px 10px', borderTop: '1px solid var(--border)',
                display: 'flex', gap: 7, background: 'var(--bg)',
              }}>
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
                  placeholder="Ask a question..."
                  disabled={chatLoading}
                  style={{
                    flex: 1, padding: '7px 11px', fontSize: 13,
                    background: 'var(--bg2)', border: '1px solid var(--border)',
                    color: 'var(--text)', outline: 'none',
                  }}
                />
                <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()}
                  className="btn" style={{ padding: '7px 13px', fontSize: 14 }}>
                  ↑
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Guest usage counter ── */}
      {isGuest && (
        <div style={{
          marginTop: 14, padding: '10px 14px', borderRadius: 'var(--radius-lg)', fontSize: 12,
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
                Sign up free for 3/day →
              </span>
            </>
          )}
        </div>
      )}

      {/* ── Upgrade prompt for logged-in free users ── */}
      {!isGuest && plan === 'free' && !currentSummary && (
        <div style={{
          marginTop: 14, padding: '10px 14px', background: '#f5f3ff',
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

const toolbarBtn: React.CSSProperties = { fontSize: 12, padding: '5px 9px' };

// ── Usage bar component ──────────────────────────────────────────────
function UsageBar({ usage, plan }: { usage: UsageStats; plan: string }) {
  const isUnlimited = usage.dailyLimit === null;
  const pct = isUnlimited ? 100 : Math.min(100, Math.round((usage.summariesToday / usage.dailyLimit!) * 100));
  const remaining = isUnlimited ? null : (usage.dailyLimit! - usage.summariesToday);
  const barColor = isUnlimited ? '#16a34a' : pct >= 90 ? '#dc2626' : pct >= 65 ? '#d97706' : '#6d4af7';
  const monthName = new Date().toLocaleString('default', { month: 'long' });

  return (
    <div style={{
      padding: '9px 12px', background: 'var(--bg2)',
      borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <span style={{ fontWeight: 600, color: 'var(--text)' }}>
          Today:&nbsp;<span style={{ color: barColor }}>{usage.summariesToday}{isUnlimited ? '' : ` / ${usage.dailyLimit}`}</span>
          {!isUnlimited && <span style={{ color: 'var(--text2)', fontWeight: 400 }}>&nbsp;used</span>}
        </span>
        <span style={{ color: 'var(--text2)' }}>
          {isUnlimited ? 'Unlimited' : remaining === 0
            ? <span style={{ color: '#dc2626', fontWeight: 600 }}>Limit reached</span>
            : `${remaining} left today`}
        </span>
      </div>
      {!isUnlimited && (
        <div style={{ height: 4, borderRadius: 'var(--radius-full)', background: 'var(--border)', marginBottom: 6, overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 'var(--radius-full)', width: `${pct}%`, background: barColor, transition: 'width 0.4s ease' }} />
        </div>
      )}
      <div style={{ display: 'flex', gap: 14, color: 'var(--text2)' }}>
        <span>{monthName}: <strong style={{ color: 'var(--text)' }}>{usage.summariesThisMonth}</strong></span>
        <span>All time: <strong style={{ color: 'var(--text)' }}>{usage.totalSummaries}</strong></span>
      </div>
    </div>
  );
}
