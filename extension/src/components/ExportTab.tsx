import React, { useState } from 'react';
import { useStore } from '../store';
import { exportSummary, generateSocialImages, generateSlides } from '../lib/api';

export default function ExportTab() {
  const { user, currentSummary } = useStore();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [socialCards, setSocialCards] = useState<any[]>([]);
  const [socialCount, setSocialCount] = useState(3);

  const plan = user?.plan || 'free';
  const canExport = plan !== 'free';
  const canSlides = plan === 'premium';
  const maxImages = plan === 'premium' ? 5 : plan === 'basic' ? 3 : 0;

  if (!currentSummary) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
        Summarize a page first to export it.
      </div>
    );
  }

  const handleExport = async (format: 'pdf' | 'docx' | 'txt') => {
    if (!canExport) return;
    setLoading(format); setError('');
    try {
      const { downloadUrl } = await exportSummary(currentSummary.summaryId, format);
      chrome.tabs.create({ url: downloadUrl });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(null);
    }
  };

  const handleSocialImages = async () => {
    setLoading('social'); setError(''); setSocialCards([]);
    try {
      const { cards } = await generateSocialImages(currentSummary.summaryId, socialCount);
      setSocialCards(cards);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(null);
    }
  };

  const handleSlides = async () => {
    setLoading('slides'); setError('');
    try {
      const { downloadUrl } = await generateSlides(currentSummary.summaryId, 8);
      chrome.tabs.create({ url: downloadUrl });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(null);
    }
  };

  const THEME_COLORS: Record<string, string> = {
    blue: '#3b82f6', purple: '#8b5cf6', teal: '#14b8a6', coral: '#f97316', amber: '#f59e0b',
  };

  return (
    <div style={{ padding: 16 }}>
      {/* Download section */}
      <div style={{ marginBottom: 18 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Download summary
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['pdf', 'docx', 'txt'] as const).map(fmt => (
            <button
              key={fmt}
              onClick={() => handleExport(fmt)}
              disabled={!canExport || !!loading}
              className={canExport ? 'btn-ghost' : 'btn-ghost'}
              style={{
                flex: 1, fontSize: 12, opacity: canExport ? 1 : 0.5,
                cursor: canExport ? 'pointer' : 'not-allowed',
              }}
              title={!canExport ? 'Requires Basic plan' : ''}
            >
              {loading === fmt ? '...' : fmt.toUpperCase()} {!canExport && '🔒'}
            </button>
          ))}
        </div>
      </div>

      {/* Social images */}
      <div style={{ marginBottom: 18 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Social media cards {!canExport && '🔒'}
        </p>
        {canExport && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <label style={{ fontSize: 12, color: 'var(--text2)' }}>Cards:</label>
            {[2, 3, 4, 5].filter(n => n <= maxImages).map(n => (
              <button
                key={n}
                onClick={() => setSocialCount(n)}
                style={{
                  width: 28, height: 28, borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: socialCount === n ? 'var(--accent)' : 'var(--bg2)',
                  color: socialCount === n ? '#fff' : 'var(--text)',
                  border: '1px solid ' + (socialCount === n ? 'var(--accent)' : 'var(--border)'),
                  cursor: 'pointer',
                }}
              >
                {n}
              </button>
            ))}
            <button
              onClick={handleSocialImages}
              disabled={!!loading}
              className="btn"
              style={{ marginLeft: 'auto', fontSize: 12, padding: '6px 12px' }}
            >
              {loading === 'social' ? 'Generating...' : 'Generate'}
            </button>
          </div>
        )}

        {socialCards.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {socialCards.map((card, i) => (
              <div key={i} style={{
                borderRadius: 10, padding: 14,
                background: (THEME_COLORS[card.theme] || '#6d4af7') + '15',
                border: '1px solid ' + (THEME_COLORS[card.theme] || '#6d4af7') + '40',
              }}>
                <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: 'var(--text)' }}>{card.headline}</p>
                <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6, lineHeight: 1.5 }}>{card.body}</p>
                <p style={{ fontSize: 11, fontWeight: 600, color: THEME_COLORS[card.theme] || 'var(--accent)' }}>{card.cta}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Slides */}
      <div style={{ marginBottom: 8 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Presentation slides {!canSlides && '🔒'}
        </p>
        <button
          onClick={canSlides ? handleSlides : undefined}
          disabled={!canSlides || !!loading}
          className={canSlides ? 'btn' : 'btn-ghost'}
          style={{ width: '100%', opacity: canSlides ? 1 : 0.6, cursor: canSlides ? 'pointer' : 'not-allowed' }}
        >
          {loading === 'slides' ? 'Building slides...' : canSlides ? 'Generate PPTX presentation' : 'Premium only — Upgrade to unlock'}
        </button>
      </div>

      {error && <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 10 }}>{error}</p>}
    </div>
  );
}
